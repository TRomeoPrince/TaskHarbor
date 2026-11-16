/**
 * Administrator-only finance snapshot.
 * Read-only aggregates follow store-postgres.wallet() semantics and never change
 * balances, payout status, holds, tasks, or ledger entries.
 */
const PAGE_SIZE = 100;
const MAX_PAGE = 100000;

export function parseFinanceQuery(input = {}) {
  const rawPage = Number(input.page || 1);
  const page = Number.isSafeInteger(rawPage) && rawPage >= 1 && rawPage <= MAX_PAGE ? rawPage : 1;
  const search = typeof input.search === 'string' ? input.search.trim().slice(0,80) : '';
  return {page, pageSize: PAGE_SIZE, search};
}

export async function adminFinanceSnapshot(db, user, input = {}) {
  if (!user || user.role !== 'admin') {
    const error = new Error('Admin access required');
    error.status = 403;
    throw error;
  }
  const {page,pageSize,search} = parseFinanceQuery(input);
  const pattern = '%' + search + '%';
  const total = await db.get(
    "SELECT COUNT(*)::int AS n FROM users u " +
    "LEFT JOIN profiles p ON p.user_id=u.id " +
    "WHERE u.role='worker' AND (u.email ILIKE ? OR COALESCE(p.username,'') ILIKE ?)",
    pattern, pattern
  );

  // Independent grouped subqueries are important: joining individual ledger,
  // task and withdrawal rows directly would multiply amounts across joins.
  const rows = await db.all(
    `WITH selected AS (
      SELECT u.id,u.email,COALESCE(p.username,'') AS username
      FROM users u
      LEFT JOIN profiles p ON p.user_id=u.id
      WHERE u.role='worker'
        AND (u.email ILIKE ? OR COALESCE(p.username,'') ILIKE ?)
      ORDER BY u.email,u.id LIMIT ? OFFSET ?
    ), ledger_rollup AS (
      SELECT l.user_id,
        COALESCE(SUM(l.amount),0)::bigint AS available,
        COALESCE(SUM(CASE WHEN l.kind IN ('earning','referral','compensation')
                          THEN l.amount ELSE 0 END),0)::bigint AS earned
      FROM ledger l WHERE l.user_id IN (SELECT id FROM selected)
      GROUP BY l.user_id
    ), task_rollup AS (
      SELECT t.worker_id,
        COALESCE(SUM(CASE WHEN t.status='submitted'
                           AND (m.status IS NULL OR m.status<>'hold')
                          THEN t.reward ELSE 0 END),0)::bigint AS pending,
        COALESCE(SUM(CASE WHEN m.status='hold' THEN t.reward ELSE 0 END),0)::bigint AS held
      FROM tasks t LEFT JOIN moderation m ON m.task_id=t.id
      WHERE t.worker_id IN (SELECT id FROM selected)
      GROUP BY t.worker_id
    ), payout_rollup AS (
      SELECT w.user_id,
        COALESCE(SUM(CASE WHEN w.status='paid' THEN w.amount ELSE 0 END),0)::bigint AS withdrawn,
        COALESCE(SUM(CASE WHEN w.status='requested' THEN w.amount ELSE 0 END),0)::bigint AS requested,
        COUNT(*) FILTER (WHERE w.status='requested')::int AS requests
      FROM withdrawals w WHERE w.user_id IN (SELECT id FROM selected)
      GROUP BY w.user_id
    )
    SELECT selected.id, selected.email, selected.username,
      COALESCE(l.available,0)::bigint AS available,
      COALESCE(l.earned,0)::bigint AS earned,
      COALESCE(t.pending,0)::bigint AS pending,
      COALESCE(t.held,0)::bigint AS held,
      COALESCE(p.withdrawn,0)::bigint AS withdrawn,
      COALESCE(p.requested,0)::bigint AS requested,
      COALESCE(p.requests,0)::int AS requests
    FROM selected
    LEFT JOIN ledger_rollup l ON l.user_id=selected.id
    LEFT JOIN task_rollup t ON t.worker_id=selected.id
    LEFT JOIN payout_rollup p ON p.user_id=selected.id
    ORDER BY selected.email,selected.id`,
    pattern,pattern,pageSize,(page-1)*pageSize
  );
  return {
    page,pageSize,total: Number(total?.n || 0),
    rows:rows.map(row=>({
      id:row.id,email:row.email,username:row.username,
      available:Number(row.available),earned:Number(row.earned),
      pending:Number(row.pending),held:Number(row.held),
      withdrawn:Number(row.withdrawn),requested:Number(row.requested),
      requests:Number(row.requests)
    })),
    currency:'USD',
    asOf:new Date().toISOString()
  };
}
