import { randomUUID } from 'node:crypto';

import {
  wallet,
  entry
} from './store-postgres.js';

import {
  postgresAtomic
} from './db-postgres.js';

import {
  workflow,
  history
} from './workflow-postgres.js';

import { quickTask } from './quick-task.js';

import {
  communityState
} from './community-postgres.js';

export const currencies = {
  USD: 2,
  UGX: 0,
  KES: 2,
  TZS: 2,
  NGN: 2,
  GHS: 2,
  EUR: 2,
  GBP: 2
};

const error = message => {
  throw new Error(message);
};

const text = (
  value,
  max = 10000
) => {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max
  ) {
    error(
      'Invalid or missing text'
    );
  }

  return value.trim();
};

export function minor(
  value,
  currency = 'USD'
) {
  if (
    !(currency in currencies)
  ) {
    error(
      'Unsupported currency'
    );
  }

  const string =
    String(value);

  const digits =
    currencies[currency];

  if (
    !/^\d+(\.\d+)?$/.test(
      string
    )
  ) {
    error(
      'Enter a positive currency amount'
    );
  }

  const [
    whole,
    fraction = ''
  ] = string.split('.');

  if (
    fraction.length >
    digits
  ) {
    error(
      `Use at most ${digits} decimal places for ${currency}`
    );
  }

  const amount =
    BigInt(whole) *
      10n **
        BigInt(digits) +
    BigInt(
      fraction.padEnd(
        digits,
        '0'
      ) || '0'
    );

  if (
    amount <= 0n ||
    amount >
      100000000000n
  ) {
    error(
      'Amount out of range'
    );
  }

  return Number(amount);
}

export function convert(
  cents,
  currency,
  rate
) {
  return Number(
    (
      BigInt(cents) *
        BigInt(rate) *
        10n **
          BigInt(
            currencies[currency]
          ) +
      50000000n
    ) /
      100000000n
  );
}

async function access(
  db,
  user,
  id
) {
  const task =
    await db.get(
      `
      SELECT *
      FROM tasks
      WHERE id=?
      `,
      id
    );

  if (
    !task ||
    (
      user.role !== 'admin' &&
      task.worker_id !== user.id
    )
  ) {
    error(
      'Task access denied'
    );
  }

  return task;
}

async function upload(
  db,
  user,
  taskId,
  kind,
  images = []
) {
  if (
    !Array.isArray(images) ||
    images.length > 6
  ) {
    error(
      'Attach up to 6 images'
    );
  }

  for (const image of images) {
    const data =
      Buffer.from(
        String(
          image.data || ''
        ),
        'base64'
      );

    if (
      !data.length ||
      data.length >
        3 * 1024 * 1024
    ) {
      error(
        'Each image must be under 3 MB'
      );
    }

    const mime =
      data
        .subarray(0, 8)
        .equals(
          Buffer.from([
            137,
            80,
            78,
            71,
            13,
            10,
            26,
            10
          ])
        )
        ? 'image/png'
        : data[0] === 255 &&
            data[1] === 216 &&
            data[2] === 255
          ? 'image/jpeg'
          : data
                .toString(
                  'ascii',
                  0,
                  4
                ) ===
                'RIFF' &&
              data.toString(
                'ascii',
                8,
                12
              ) === 'WEBP'
            ? 'image/webp'
            : null;

    if (!mime) {
      error(
        'Use PNG, JPEG or WebP images'
      );
    }

    await db.run(
      `
      INSERT INTO images(
        id,
        task_id,
        owner_id,
        kind,
        mime,
        data
      )
      VALUES(?,?,?,?,?,?)
      `,
      randomUUID(),
      taskId,
      user.id,
      kind,
      mime,
      data
    );
  }
}

export async function enrich(
  db,
  user,
  state
) {
  Object.assign(
    state,
    await communityState(
      db,
      user
    )
  );

  const sync =
    await db.get(
      `
      SELECT *
      FROM exchange_sync
      WHERE id=1
      `
    );

  state.currencies =
    currencies;

  state.exchange =
    sync || {
      updated_at: 0,
      last_error:
        'Automatic rates are loading.'
    };

  const rateRows =
    sync?.updated_at
      ? await db.all(
          `
          SELECT *
          FROM rates
          `
        )
      : [];

  state.rates = [
    {
      currency: 'USD',
      rate: 1000000,
      updated_at:
        Date.now()
    },
    ...rateRows
  ];

  const enrichedTasks = [];

  for (
    const task of state.tasks
  ) {
    const allowed =
      user.role === 'admin' ||
      task.worker_id ===
        user.id;

    const steps =
      await db.all(
        `
        SELECT *
        FROM task_steps
        WHERE task_id=?
        ORDER BY position
        `,
        task.id
      );

    const nextStep =
      steps.find(
        step =>
          !Number(
            step.completed
          )
      );

    const shown =
      nextStep?.position;

    const visible =
      step =>
        allowed &&
        (
          user.role ===
            'admin' ||
          (
            task.status !==
              'claimed' &&
            (
              Number(
                step.completed
              ) ||
              step.position ===
                shown
            )
          )
        );

    let attachments = [];

    if (allowed) {
      const images =
        await db.all(
          `
          SELECT id,kind
          FROM images
          WHERE task_id=?
          `,
          task.id
        );

      attachments =
        images.filter(
          image =>
            !image.kind.startsWith(
              'instruction:'
            ) ||
            steps.some(
              step =>
                image.kind ===
                  'instruction:' +
                    step.id &&
                visible(step)
            )
        );
    }

    const policy = await db.get('SELECT * FROM task_policies WHERE task_id=?',task.id);
    const compensation = allowed ? await db.get('SELECT amount,reason,created_at FROM task_compensations WHERE task_id=?',task.id) : null;
    const lease =
      allowed
        ? await db.get(
            `
            SELECT expires
            FROM leases
            WHERE task_id=?
            `,
            task.id
          )
        : null;

    const moderation =
      allowed
        ? await db.get(
            `
            SELECT *
            FROM moderation
            WHERE task_id=?
            `,
            task.id
          )
        : null;

    const correction =
      allowed
        ? await db.get(
            `
            SELECT *
            FROM corrections
            WHERE task_id=?
              AND pending=1
            `,
            task.id
          )
        : null;

    const historyRows =
      allowed
        ? await db.all(
            `
            SELECT *
            FROM evidence_history
            WHERE task_id=?
            ORDER BY created_at,id
            `,
            task.id
          )
        : [];

    const details =
      allowed
        ? await db.get(
            `
            SELECT fields
            FROM task_details
            WHERE task_id=?
            `,
            task.id
          )
        : null;

    const messages =
      allowed
        ? await db.all(
            `
            SELECT
              m.*,
              u.role
            FROM messages m
            JOIN users u
              ON u.id=m.sender_id
            WHERE task_id=?
            ORDER BY
              m.created_at,
              m.id
            `,
            task.id
          )
        : [];

    const assignee = user.role === 'admin' && task.worker_id
      ? await db.get('SELECT u.id,u.email,p.username FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id=?',task.worker_id)
      : null;
    enrichedTasks.push({
      ...task,
      assignee,
      policy,
      compensation,

      followup_overdue:
        Boolean(
          allowed &&
          task.status ===
            'submitted' &&
          shown !==
            undefined &&
          Number(
            lease?.expires ??
              Infinity
          ) <= Date.now()
        ),

      claim_expires:
        allowed
          ? lease?.expires ??
            null
          : null,

      moderation:
        allowed
          ? moderation
          : null,

      correction:
        allowed
          ? correction
          : null,

      history:
        allowed
          ? historyRows
          : [],

      ...(
        !allowed && !policy?.public_description
          ? {
              description:
                'Claim this task to view its private instructions.'
            }
          : {}
      ),

      fields:
        allowed
          ? JSON.parse(
              details?.fields ||
                '[]'
            )
          : [],

      steps:
        steps.map(
          step => ({
            ...step,
            instruction:
              visible(step)
                ? step.instruction
                : '',
            evidence:
              allowed
                ? step.evidence
                : null
          })
        ),

      images:
        attachments,

      messages
    });
  }

  state.tasks =
    enrichedTasks;

  const withdrawals = [];

  for (
    const withdrawal of
      state.withdrawals
  ) {
    const detail =
      await db.get(
        `
        SELECT
          currency,
          local_minor,
          rate,
          rate_time,
          fee_minor,
          settlement
        FROM withdrawal_details
        WHERE withdrawal_id=?
        `,
        withdrawal.id
      );

    withdrawals.push({
      ...withdrawal,
      ...(detail || {})
    });
  }

  state.withdrawals =
    withdrawals;

  return state;
}

export async function route(
  db,
  user,
  path,
  body,
  req,
  res
) {
  if (
    req.method === 'GET' &&
    path.startsWith(
      '/api/images/'
    )
  ) {
    const image =
      await db.get(
        `
        SELECT *
        FROM images
        WHERE id=?
        `,
        path.split('/').pop()
      );

    if (!image) {
      error(
        'Image not found'
      );
    }

    const task =
      await access(
        db,
        user,
        image.task_id
      );

    if (
      user.role !==
        'admin' &&
      image.kind.startsWith(
        'instruction:'
      )
    ) {
      const step =
        await db.get(
          `
          SELECT *
          FROM task_steps
          WHERE id=?
            AND task_id=?
          `,
          image.kind.slice(12),
          task.id
        );

      const current =
        await db.get(
          `
          SELECT id
          FROM task_steps
          WHERE task_id=?
            AND completed=0
          ORDER BY position
          LIMIT 1
          `,
          task.id
        );

      if (
        !step ||
        task.status ===
          'claimed' ||
        (
          !Number(
            step.completed
          ) &&
          current?.id !==
            step.id
        )
      ) {
        error(
          'Step images are not yet available'
        );
      }
    }

    res.setHeader(
      'Content-Type',
      image.mime
    );

    res.end(image.data);

    return 'sent';
  }

  if (
    req.method !== 'POST'
  ) {
    return null;
  }

  if (
    path ===
    '/api/quick-task'
  ) {
    if (
      user.role !== 'admin'
    ) {
      error(
        'Admin access required'
      );
    }

    const task =
      quickTask(body);

    const result =
      await route(
        db,
        user,
        '/api/tasks',
        task,
        req,
        res
      );

    return {
      ...result,
      externalId:
        task.externalId
    };
  }

  const workflowResult =
    await workflow(
      db,
      user,
      path,
      body,
      upload
    );

  if (
    workflowResult !== null
  ) {
    return workflowResult;
  }

  if (
    path === '/api/rates'
  ) {
    error(
      'Exchange rates update automatically; manual rates are disabled'
    );
  }

  if (
    path ===
    '/api/task-message'
  ) {
    const task =
      await access(
        db,
        user,
        text(body.taskId)
      );

    if (!task.worker_id) {
      error(
        'Task has no assigned worker'
      );
    }

    await db.run(
      `
      INSERT INTO messages(
        id,
        task_id,
        sender_id,
        content
      )
      VALUES(?,?,?,?)
      `,
      randomUUID(),
      task.id,
      user.id,
      text(body.content)
    );

    return { ok: true };
  }

  if (
    path === '/api/step'
  ) {
    return postgresAtomic(
      async tx => {
        const task =
          await access(
            tx,
            user,
            text(body.taskId)
          );

        if (
          user.role !==
            'worker' ||
          task.status !==
            'submitted'
        ) {
          error(
            'Submit the task before completing follow-up steps'
          );
        }

        const held =
          await tx.get(
            `
            SELECT task_id
            FROM moderation
            WHERE task_id=?
              AND status='hold'
            `,
            task.id
          );

        if (held) {
          error(
            'Task is held for moderation'
          );
        }

        const correction =
          await tx.get(
            `
            SELECT task_id
            FROM corrections
            WHERE task_id=?
              AND pending=1
              AND step_id IS NULL
            `,
            task.id
          );

        if (correction) {
          error(
            'Resubmit the initial result before follow-up steps'
          );
        }

        const step =
          await tx.get(
            `
            SELECT *
            FROM task_steps
            WHERE task_id=?
              AND completed=0
            ORDER BY position
            LIMIT 1
            `,
            task.id
          );

        if (
          !step ||
          step.id !== body.id
        ) {
          error(
            'This step is no longer current'
          );
        }

        if (
          !step.instruction.trim()
        ) {
          error(
            'Waiting for admin to provide the step instructions'
          );
        }

        const content =
          text(body.content);

        await tx.run(
          `
          UPDATE task_steps
          SET
            completed=1,
            evidence=?
          WHERE id=?
          `,
          content,
          step.id
        );

        await upload(
          tx,
          user,
          task.id,
          'step',
          body.images
        );

        await history(
          tx,
          task.id,
          user.id,
          'step_submission',
          content,
          step.id
        );

        const remaining =
          await tx.get(
            `
            SELECT id
            FROM task_steps
            WHERE task_id=?
              AND completed=0
            LIMIT 1
            `,
            task.id
          );

        if (!remaining) {
          await tx.run(
            `
            UPDATE corrections
            SET pending=0
            WHERE task_id=?
              AND step_id IS NOT NULL
            `,
            task.id
          );
        }

        return { ok: true };
      }
    );
  }

  if (
    path ===
    '/api/release-step'
  ) {
    return postgresAtomic(
      async tx => {
        if (
          user.role !== 'admin'
        ) {
          error(
            'Admin access required'
          );
        }

        const task =
          await access(
            tx,
            user,
            text(body.taskId)
          );

        if (
          task.status !==
          'submitted'
        ) {
          error(
            'Worker must submit the task first'
          );
        }

        const instruction =
          text(body.content);

        const updated =
          await tx.run(
            `
            UPDATE task_steps
            SET instruction=?
            WHERE id=?
              AND task_id=?
              AND completed=0
              AND instruction=''
            `,
            instruction,
            text(body.id),
            task.id
          );

        if (
          !updated.changes
        ) {
          error(
            'Step already supplied, completed, or missing'
          );
        }

        return { ok: true };
      }
    );
  }

  if(path==='/api/cancel-unfilled-claim')return postgresAtomic(async tx=>{
    const task=await access(tx,user,text(body.taskId));
    const policy=await tx.get('SELECT * FROM task_policies WHERE task_id=?',task.id);
    if(task.status!=='claimed'||policy?.start_mode!=='admin_details'||policy.supplied_at)error('Only unfilled Gmail claims can be released');
    await tx.run("UPDATE tasks SET status='available',worker_id=NULL WHERE id=?",task.id);
    await tx.run('DELETE FROM leases WHERE task_id=?',task.id);
    return {ok:true};
  });
  if(path==='/api/extend-task-time')return postgresAtomic(async tx=>{
    if(user.role!=='admin')error('Admin access required');
    const task=await access(tx,user,text(body.taskId));
    const policy=await tx.get('SELECT * FROM task_policies WHERE task_id=?',task.id);
    if(task.status!=='claimed'||policy?.start_mode!=='admin_details'||!policy.supplied_at)error('Task is not awaiting timed worker submission');
    const minutes=Number(body.minutes);
    if(!Number.isSafeInteger(minutes)||minutes<1||minutes>43200)error('Enter 1–43200 additional minutes');
    const expires=Date.now()+minutes*60000;
    const updated=await tx.run('UPDATE leases SET expires=? WHERE task_id=? AND worker_id=?',expires,task.id,task.worker_id);
    if(!updated.changes)error('Active task timer not found');
    await tx.run('INSERT INTO messages(id,task_id,sender_id,content) VALUES(?,?,?,?)',randomUUID(),task.id,user.id,'Your task work deadline has been extended by '+minutes+' minutes from now.');
    return {ok:true,expiresAt:expires};
  });
  if(path==='/api/supply-gmail-details')return postgresAtomic(async tx=>{
    if(user.role!=='admin')error('Admin access required');
    const task=await access(tx,user,text(body.taskId));
    const policy=await tx.get('SELECT * FROM task_policies WHERE task_id=?',task.id);
    if(task.provider!=='manual-telegram'||task.status!=='claimed'||!task.worker_id||policy?.start_mode!=='admin_details'||policy.supplied_at)error('This task is not awaiting Gmail account details');
    const first=text(body.firstName,100),email=text(body.email,254).toLowerCase();
    if(!/^[a-z0-9.]+(?:\+[^\s@]+)?@gmail\.com$/.test(email))error('Enter the Gmail address supplied by the bot');
    const password=text(body.password,256),last=body.lastName?.trim()||'No last name — Leave blank / empty';
    if(last.length>200)error('Last name instruction is too long');
    const minutes=Number(body.minutes??policy.claim_minutes);
    if(!Number.isSafeInteger(minutes)||minutes<1||minutes>43200)error('Enter a task duration between 1 and 43200 minutes');
    const fields=[{label:'First name',value:first,copy:true},{label:'Last name',value:last,copy:true},{label:'Gmail address (Username)',value:email,copy:true},{label:'Supplied password',value:password,copy:true},{label:'Date of birth',value:'19 May 2000',copy:true}];
    await tx.run('UPDATE task_details SET fields=? WHERE task_id=?',JSON.stringify(fields),task.id);
    const now=Date.now();
    await tx.run('UPDATE task_policies SET supplied_at=?,claim_minutes=? WHERE task_id=?',now,minutes,task.id);
    await tx.run('INSERT INTO leases(task_id,worker_id,expires) VALUES(?,?,?) ON CONFLICT(task_id) DO UPDATE SET worker_id=EXCLUDED.worker_id,expires=EXCLUDED.expires',task.id,task.worker_id,now+minutes*60000);
    await tx.run('INSERT INTO messages(id,task_id,sender_id,content) VALUES(?,?,?,?)',randomUUID(),task.id,user.id,'Your account details are ready. Work time: '+minutes+' minutes from release. Follow the supplied instructions.');
    return {ok:true,expiresAt:now+minutes*60000};
  });
  if (
    path === '/api/tasks'
  ) {
    if (
      user.role !== 'admin'
    ) {
      error(
        'Admin access required'
      );
    }

    return postgresAtomic(
      async tx => {
        const tasks =
          body.tasks ||
          [body];

        if (
          !Array.isArray(
            tasks
          ) ||
          !tasks.length ||
          tasks.length > 100
        ) {
          error(
            'Import 1–100 tasks'
          );
        }

        for (
          const task of tasks
        ) {
          const id =
            randomUUID();

          const reward =
            task.rewardAmount !==
            undefined
              ? minor(
                  task.rewardAmount
                )
              : task.reward;

          if (
            !Number.isSafeInteger(
              reward
            ) ||
            reward <= 0 ||
            reward >
              100000000
          ) {
            error(
              'Invalid reward'
            );
          }

          await tx.run(
            `
            INSERT INTO tasks(
              id,
              title,
              description,
              reward,
              provider,
              external_id
            )
            VALUES(?,?,?,?,?,?)
            `,
            id,
            text(
              task.title,
              200
            ),
            text(
              task.description
            ),
            reward,
            task.provider
              ? text(
                  task.provider,
                  100
                )
              : 'manual',
            task.externalId
              ? text(
                  task.externalId,
                  200
                )
              : null
          );

          if(task.policy!==undefined){
            const p=task.policy;
            if(!p||typeof p!=='object'||Array.isArray(p))error('Invalid task policy');
            const mode=p.startMode||'on_claim';
            if(!['on_claim','admin_details'].includes(mode))error('Unsupported task start mode');
            const value=p.claimMinutes===undefined?(mode==='admin_details'?60:30):p.claimMinutes;
            const minutes=value===null?null:Number(value);
            if(minutes!==null&&(!Number.isSafeInteger(minutes)||minutes<1||minutes>43200))error('Claim minutes must be 1–43200 or null');
            if(mode==='admin_details'&&minutes===null)error('Admin-released tasks need a work duration');
            const deadline=p.deadlineAt?Date.parse(p.deadlineAt):null;
            if(p.deadlineAt&&(!Number.isFinite(deadline)||deadline<=Date.now()))error('Task deadline must be a future date');
            const behavior=mode==='admin_details'?'hold':(p.expiryAction||'recycle');
            if(!['hold','recycle'].includes(behavior))error('Invalid expiry behavior');
            await tx.run('INSERT INTO task_policies(task_id,start_mode,claim_minutes,deadline_at,expiry_action,public_description) VALUES(?,?,?,?,?,?)',id,mode,minutes,deadline,behavior,p.publicDescription?1:0);
          }
          const fields =
            task.fields || [];

          if (
            !Array.isArray(
              fields
            ) ||
            fields.length > 30
          ) {
            error(
              'Use up to 30 fields'
            );
          }

          const clean =
            fields.map(
              field => {
                text(
                  field.value
                );

                return {
                  label:
                    text(
                      field.label,
                      100
                    ),
                  value:
                    field.value,
                  copy:
                    !!field.copy
                };
              }
            );

          await tx.run(
            `
            INSERT INTO task_details(
              task_id,
              fields
            )
            VALUES(?,?)
            `,
            id,
            JSON.stringify(
              clean
            )
          );

          const steps =
            task.steps || [];

          if (
            !Array.isArray(
              steps
            ) ||
            steps.length > 20
          ) {
            error(
              'Use up to 20 follow-up steps'
            );
          }

          for (
            let index = 0;
            index <
            steps.length;
            index++
          ) {
            const step =
              steps[index];

            const stepId =
              randomUUID();

            await tx.run(
              `
              INSERT INTO task_steps(
                id,
                task_id,
                position,
                title,
                instruction
              )
              VALUES(?,?,?,?,?)
              `,
              stepId,
              id,
              index,
              text(
                step.title,
                200
              ),
              step.instruction
                ?.trim()
                ? text(
                    step.instruction
                  )
                : ''
            );

            await upload(
              tx,
              user,
              id,
              'instruction:' +
                stepId,
              step.images
            );
          }

          await upload(
            tx,
            user,
            id,
            'instruction',
            task.images
          );
        }

        return {
          ok: true
        };
      }
    );
  }

  if (
    path === '/api/submit'
  ) {
    return postgresAtomic(
      async tx => {
        const task =
          await access(
            tx,
            user,
            text(body.taskId)
          );

        if (
          user.role !==
            'worker' ||
          task.status !==
            'claimed'
        ) {
          error(
            'Task is not ready for submission'
          );
        }

        const policy=await tx.get('SELECT * FROM task_policies WHERE task_id=?',task.id);
        if(policy?.start_mode==='admin_details'&&!policy.supplied_at)error('Wait for the admin to supply your task details');
        if(policy?.start_mode==='admin_details'&&policy.supplied_at){
          const lease=await tx.get('SELECT expires FROM leases WHERE task_id=?',task.id);
          if(!lease||Date.now()>Number(lease.expires))error('Your work time expired. Ask the admin to extend your deadline.');
        }
        if(policy?.deadline_at&&Date.now()>=Number(policy.deadline_at))error('The task submission deadline has passed');
        await tx.run(
          `
          INSERT INTO submissions(
            id,
            task_id,
            worker_id,
            content
          )
          VALUES(?,?,?,?)
          `,
          randomUUID(),
          task.id,
          user.id,
          text(body.content)
        );

        await upload(
          tx,
          user,
          task.id,
          'evidence',
          body.images
        );

        await tx.run(
          `
          UPDATE tasks
          SET status='submitted'
          WHERE id=?
          `,
          task.id
        );

        return {
          ok: true
        };
      }
    );
  }

  if (
    path === '/api/quote'
  ) {
    const currency =
      body.currency;

    if (
      !(currency in currencies)
    ) {
      error(
        'Unsupported currency'
      );
    }

    const local =
      minor(
        body.amount,
        currency
      );

    const sync =
      await db.get(
        `
        SELECT *
        FROM exchange_sync
        WHERE id=1
        `
      );

    const rate =
      currency === 'USD'
        ? {
            rate: 1000000,
            updated_at:
              Date.now()
          }
        : sync?.updated_at
          ? await db.get(
              `
              SELECT *
              FROM rates
              WHERE currency=?
              `,
              currency
            )
          : null;

    if (
      !rate ||
      Date.now() -
        Number(
          rate.updated_at
        ) >
        7 * 86400000
    ) {
      error(
        'Automatic exchange rate unavailable; choose USD or try again later'
      );
    }

    const cents =
      Number(
        (
          BigInt(local) *
            100000000n +
          BigInt(
            rate.rate
          ) *
            10n **
              BigInt(
                currencies[
                  currency
                ]
              ) -
          1n
        ) /
          (
            BigInt(
              rate.rate
            ) *
            10n **
              BigInt(
                currencies[
                  currency
                ]
              )
          )
      );

    const currentWallet =
      await wallet(
        db,
        user.id
      );

    if (
      cents <= 0 ||
      cents >
        currentWallet.available
    ) {
      error(
        'Insufficient available balance'
      );
    }

    const estimate =
      convert(
        cents,
        currency,
        Number(
          rate.rate
        )
      );

    const id =
      randomUUID();

    await db.run(
      `
      INSERT INTO quotes(
        id,
        user_id,
        usd_cents,
        currency,
        local_minor,
        rate,
        rate_time,
        expires,
        used,
        settlement
      )
      VALUES(
        ?,?,?,?,?,?,?,?,0,'USD'
      )
      `,
      id,
      user.id,
      cents,
      currency,
      estimate,
      Number(
        rate.rate
      ),
      Number(
        rate.updated_at
      ),
      Date.now() +
        300000
    );

    return {
      id,
      usd_cents: cents,
      currency,
      local_minor:
        estimate,
      rate:
        Number(
          rate.rate
        ),
      rate_time:
        Number(
          rate.updated_at
        ),
      fee_minor: 0,
      settlement:
        'USD'
    };
  }

  if (
    path === '/api/withdraw'
  ) {
    return postgresAtomic(
      async tx => {
        const quote =
          await tx.get(
            `
            SELECT *
            FROM quotes
            WHERE id=?
              AND user_id=?
              AND used=0
              AND expires>?
              AND settlement='USD'
            `,
            text(
              body.quoteId
            ),
            user.id,
            Date.now()
          );

        if (!quote) {
          error(
            'Quote expired or used; request a new quote'
          );
        }

        const currentWallet =
          await wallet(
            tx,
            user.id
          );

        if (
          currentWallet.available <
          Number(
            quote.usd_cents
          )
        ) {
          error(
            'Insufficient available balance'
          );
        }

        const id =
          randomUUID();

        await tx.run(
          `
          INSERT INTO withdrawals(
            id,
            user_id,
            amount,
            destination
          )
          VALUES(?,?,?,?)
          `,
          id,
          user.id,
          Number(
            quote.usd_cents
          ),
          text(
            body.destination,
            500
          )
        );

        await tx.run(
          `
          INSERT INTO withdrawal_details(
            withdrawal_id,
            currency,
            local_minor,
            rate,
            rate_time,
            fee_minor,
            settlement
          )
          VALUES(?,?,?,?,?,0,'USD')
          `,
          id,
          quote.currency,
          quote.local_minor,
          quote.rate,
          quote.rate_time
        );

        await entry(
          tx,
          user.id,
          'withdrawal_reserve',
          -Number(
            quote.usd_cents
          ),
          null,
          id
        );

        await tx.run(
          `
          UPDATE quotes
          SET used=1
          WHERE id=?
          `,
          quote.id
        );

        return {
          ok: true
        };
      }
    );
  }

  return null;
}