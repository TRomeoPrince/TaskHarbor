import { randomUUID } from 'node:crypto';
import { transaction } from './postgres.js';

const number = value => Number(value || 0);

export async function atomic(fn) {
  return transaction(fn);
}

export async function wallet(db, id) {
  const totals = await db.query(`
    SELECT
      COALESCE(SUM(amount), 0) AS available,
      COALESCE(
        SUM(
          CASE
            WHEN kind IN ('earning', 'referral', 'compensation') THEN amount
            ELSE 0
          END
        ),
        0
      ) AS earned
    FROM ledger
    WHERE user_id = $1
  `, [id]);

  const pending = await db.query(`
    SELECT COALESCE(SUM(reward), 0) AS n
    FROM tasks
    WHERE worker_id = $1
      AND status = 'submitted'
      AND id NOT IN (
        SELECT task_id
        FROM moderation
        WHERE status = 'hold'
      )
  `, [id]);

  const held = await db.query(`
    SELECT COALESCE(SUM(t.reward), 0) AS n
    FROM tasks t
    JOIN moderation m ON m.task_id = t.id
    WHERE t.worker_id = $1
      AND m.status = 'hold'
  `, [id]);

  const withdrawn = await db.query(`
    SELECT COALESCE(SUM(amount), 0) AS n
    FROM withdrawals
    WHERE user_id = $1
      AND status = 'paid'
  `, [id]);

  return {
    available: number(totals.rows[0].available),
    earned: number(totals.rows[0].earned),
    pending: number(pending.rows[0].n),
    held: number(held.rows[0].n),
    withdrawn: number(withdrawn.rows[0].n)
  };
}

async function expireInside(db, now = Date.now()) {
  const result = await db.query(`
    SELECT t.id, t.worker_id
    FROM tasks t
    JOIN leases l ON l.task_id = t.id
    LEFT JOIN task_policies p ON p.task_id = t.id
    WHERE t.status = 'claimed'
      AND l.expires <= $1
      AND COALESCE(p.expiry_action,'recycle')='recycle'
      AND NOT EXISTS (
        SELECT 1
        FROM submissions s
        WHERE s.task_id = t.id
      )
  `, [now]);

  for (const task of result.rows) {
    await db.query(`
      UPDATE tasks
      SET status = 'available',
          worker_id = NULL
      WHERE id = $1
    `, [task.id]);

    await db.query(`
      DELETE FROM leases
      WHERE task_id = $1
    `, [task.id]);

    await db.query(`
      INSERT INTO evidence_history(
        id,
        task_id,
        actor_id,
        action,
        content
      )
      VALUES($1, $2, $3, $4, $5)
    `, [
      randomUUID(),
      task.id,
      task.worker_id,
      'claim_expired',
      'Unsubmitted claim returned after the configured claim time'
    ]);
  }

  return result.rows.length;
}

export async function expireClaims(now = Date.now()) {
  return atomic(db => expireInside(db, now));
}

export async function claim(taskId, userId) {
  return atomic(async db => {
    await expireInside(db);
    const now = Date.now();
    const policy = (await db.query('SELECT * FROM task_policies WHERE task_id=$1', [taskId])).rows[0];
    if (policy?.deadline_at != null && now >= Number(policy.deadline_at)) throw Error('The task deadline has passed');
    const result = await db.query(`
      UPDATE tasks SET status='claimed',worker_id=$1
      WHERE id=$2 AND status='available' AND worker_id IS NULL
      RETURNING id
    `, [userId, taskId]);
    if (!result.rows.length) throw Error('Task is no longer available');
    const minutes = policy ? policy.claim_minutes : 30;
    const expires = policy?.start_mode==='admin_details'||minutes===null ? null : now + Number(minutes)*60000;
    if (expires!==null) await db.query(`
      INSERT INTO leases(task_id,worker_id,expires) VALUES($1,$2,$3)
      ON CONFLICT(task_id) DO UPDATE SET worker_id=EXCLUDED.worker_id,expires=EXCLUDED.expires
    `, [taskId,userId,policy?.deadline_at!=null?Math.min(expires,Number(policy.deadline_at)):expires]);
  });
}

export async function entry(
  db,
  user,
  kind,
  amount,
  task = null,
  withdrawal = null
) {
  await db.query(`
    INSERT INTO ledger(
      id,
      user_id,
      kind,
      amount,
      task_id,
      withdrawal_id
    )
    VALUES($1, $2, $3, $4, $5, $6)
  `, [
    randomUUID(),
    user,
    kind,
    amount,
    task,
    withdrawal
  ]);
}
