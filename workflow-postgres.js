import {
  randomUUID
} from 'node:crypto';

import {
  postgresAtomic
} from './db-postgres.js';

import {
  entry
} from './store-postgres.js';

import {
  awardReferral
} from './community-postgres.js';

const fail = message => {
  throw Error(message);
};

function note(value) {
  if (
    typeof value !==
      'string' ||
    !value.trim() ||
    value.length > 10000
  ) {
    fail(
      'Enter a note or result'
    );
  }

  return value.trim();
}

export async function history(
  db,
  task,
  actor,
  action,
  content,
  step = null
) {
  await db.run(
    `
    INSERT INTO evidence_history(
      id,
      task_id,
      step_id,
      actor_id,
      action,
      content
    )
    VALUES(?,?,?,?,?,?)
    `,
    randomUUID(),
    task,
    step,
    actor,
    action,
    content
  );
}

export async function workflow(
  db,
  user,
  path,
  body,
  upload
) {
  if (
    ![
      '/api/review',
      '/api/moderation',
      '/api/correction',
      '/api/resubmit'
    ].includes(path)
  ) {
    return null;
  }

  return postgresAtomic(
    async tx => {
      const submission =
        path === '/api/review'
          ? await tx.get(
              `
              SELECT *
              FROM submissions
              WHERE id=?
              `,
              body.id || ''
            )
          : await tx.get(
              `
              SELECT *
              FROM submissions
              WHERE task_id=?
              `,
              body.taskId || ''
            );

      if (
        !submission ||
        submission.status !==
          'pending'
      ) {
        fail(
          'Submission is closed or missing'
        );
      }

      const task =
        await tx.get(
          `
          SELECT *
          FROM tasks
          WHERE id=?
          `,
          submission.task_id
        );

      const moderation =
        await tx.get(
          `
          SELECT *
          FROM moderation
          WHERE task_id=?
          `,
          task.id
        );

      if (
        path ===
        '/api/resubmit'
      ) {
        if (
          user.role !==
            'worker' ||
          task.worker_id !==
            user.id
        ) {
          fail(
            'Worker access required'
          );
        }

        const correction =
          await tx.get(
            `
            SELECT *
            FROM corrections
            WHERE task_id=?
              AND pending=1
              AND step_id IS NULL
            `,
            task.id
          );

        if (!correction) {
          fail(
            'No submission correction is requested'
          );
        }

        const content =
          note(
            body.content
          );

        await history(
          tx,
          task.id,
          user.id,
          'previous_submission',
          submission.content
        );

        await tx.run(
          `
          UPDATE submissions
          SET
            content=?,
            review_note=NULL
          WHERE id=?
          `,
          content,
          submission.id
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
          UPDATE corrections
          SET pending=0
          WHERE task_id=?
          `,
          task.id
        );

        await history(
          tx,
          task.id,
          user.id,
          'resubmit',
          content
        );

        return {
          ok: true
        };
      }

      if (
        user.role !==
        'admin'
      ) {
        fail(
          'Admin access required'
        );
      }

      if (
        path ===
        '/api/correction'
      ) {
        const content =
          note(
            body.content
          );

        let step = null;

        if (body.stepId) {
          step =
            await tx.get(
              `
              SELECT *
              FROM task_steps
              WHERE id=?
                AND task_id=?
              `,
              body.stepId,
              task.id
            );

          if (!step) {
            fail(
              'Step not found'
            );
          }
        }

        const startPosition =
          step?.position ?? 0;

        const affected =
          await tx.all(
            `
            SELECT *
            FROM task_steps
            WHERE task_id=?
              AND position>=?
            ORDER BY position
            `,
            task.id,
            startPosition
          );

        for (
          const item of
            affected
        ) {
          await history(
            tx,
            task.id,
            user.id,
            'previous_step_evidence',
            item.evidence || '',
            item.id
          );
        }

        await tx.run(
          `
          UPDATE task_steps
          SET
            completed=0,
            evidence=NULL
          WHERE task_id=?
            AND position>=?
          `,
          task.id,
          startPosition
        );

        await tx.run(
          `
          INSERT INTO corrections(
            task_id,
            step_id,
            note,
            pending
          )
          VALUES(?,?,?,1)
          ON CONFLICT(task_id)
          DO UPDATE SET
            step_id=
              EXCLUDED.step_id,
            note=
              EXCLUDED.note,
            pending=1
          `,
          task.id,
          step?.id || null,
          content
        );

        if (moderation) {
          await tx.run(
            `
            UPDATE moderation
            SET
              status='correction',
              note=?
            WHERE task_id=?
            `,
            content,
            task.id
          );
        }

        await tx.run(
          `
          UPDATE submissions
          SET review_note=?
          WHERE id=?
          `,
          content,
          submission.id
        );

        await tx.run(
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
          'Correction requested: ' +
            content
        );

        await history(
          tx,
          task.id,
          user.id,
          'request_correction',
          content,
          step?.id || null
        );

        return {
          ok: true
        };
      }

      const content =
        note(
          body.note ||
            body.content
        );

      if (
        path ===
        '/api/review'
      ) {
        if (
          moderation?.status ===
          'hold'
        ) {
          fail(
            'Task is already held for final moderation'
          );
        }

        if (
          ![
            'approved',
            'rejected'
          ].includes(
            body.decision
          )
        ) {
          fail(
            'Invalid decision'
          );
        }

        if (
          body.decision ===
          'rejected'
        ) {
          await tx.run(
            `
            UPDATE submissions
            SET
              status='rejected',
              review_note=?
            WHERE id=?
            `,
            content,
            submission.id
          );

          await tx.run(
            `
            UPDATE tasks
            SET status='rejected'
            WHERE id=?
            `,
            task.id
          );

          if (moderation) {
            await tx.run(
              `
              UPDATE moderation
              SET
                status='denied',
                note=?
              WHERE task_id=?
              `,
              content,
              task.id
            );
          }

          await history(
            tx,
            task.id,
            user.id,
            'reject',
            content
          );

          return {
            ok: true
          };
        }

        const incomplete =
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

        if (incomplete) {
          fail(
            'Required follow-up steps are incomplete'
          );
        }

        const correction =
          await tx.get(
            `
            SELECT task_id
            FROM corrections
            WHERE task_id=?
              AND pending=1
            `,
            task.id
          );

        if (correction) {
          fail(
            'Correction is awaiting resubmission'
          );
        }

        await tx.run(
          `
          INSERT INTO moderation(
            task_id,
            status,
            hold_until,
            note
          )
          VALUES(
            ?,
            'hold',
            ?,
            ?
          )
          ON CONFLICT(task_id)
          DO UPDATE SET
            status='hold',
            hold_until=
              EXCLUDED.hold_until,
            note=
              EXCLUDED.note
          `,
          task.id,
          Date.now() +
            72 * 3600000,
          content
        );

        await tx.run(
          `
          UPDATE submissions
          SET review_note=?
          WHERE id=?
          `,
          content,
          submission.id
        );

        await history(
          tx,
          task.id,
          user.id,
          'start_hold',
          content
        );

        return {
          ok: true
        };
      }

      if (
        !moderation ||
        moderation.status !==
          'hold'
      ) {
        fail(
          'Task is not awaiting final moderation'
        );
      }

      if (
        ![
          'approved',
          'rejected'
        ].includes(
          body.decision
        )
      ) {
        fail(
          'Invalid decision'
        );
      }

      if (
        body.decision ===
          'approved' &&
        Date.now() <
          Number(
            moderation.hold_until
          )
      ) {
        fail(
          'Three-day hold has not finished'
        );
      }

      const approved =
        body.decision ===
        'approved';

      await tx.run(
        `
        UPDATE moderation
        SET
          status=?,
          note=?
        WHERE task_id=?
        `,
        approved
          ? 'released'
          : 'denied',
        content,
        task.id
      );

      await tx.run(
        `
        UPDATE submissions
        SET
          status=?,
          review_note=?
        WHERE id=?
        `,
        body.decision,
        content,
        submission.id
      );

      await tx.run(
        `
        UPDATE tasks
        SET status=?
        WHERE id=?
        `,
        body.decision,
        task.id
      );

      if (approved) {
        await entry(
          tx,
          task.worker_id,
          'earning',
          Number(
            task.reward
          ),
          task.id
        );

        await awardReferral(
          tx,
          task
        );
      }

      await history(
        tx,
        task.id,
        user.id,
        approved
          ? 'release_held'
          : 'deny_held',
        content
      );

      return {
        ok: true
      };
    }
  );
}