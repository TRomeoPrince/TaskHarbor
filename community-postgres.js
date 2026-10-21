import { randomUUID, randomBytes } from 'node:crypto';
import { entry } from './store-postgres.js';

export const referralPolicy = {
  firstMicros: 10000,
  laterMicros: 10000,
  days: 30
};

export async function shortReferral(db, userId) {
  const existing = await db.get(
    'SELECT code FROM referral_links WHERE user_id=?',
    userId
  );

  if (existing) return existing.code;

  for (let i = 0; i < 5; i++) {
    const code = randomBytes(6).toString('base64url');

    try {
      await db.run(
        'INSERT INTO referral_links(code,user_id) VALUES(?,?)',
        code,
        userId
      );

      return code;
    } catch (e) {
      if (!e.message.includes('duplicate key')) throw e;
    }
  }

  throw Error('Unable to generate referral link');
}

export async function provisionProfiles(db) {
  const users = await db.all(`
    SELECT id,created_at
    FROM users
    WHERE id NOT IN (
      SELECT user_id FROM profiles
    )
  `);

  for (const u of users) {
    await db.run(
      `INSERT INTO profiles(
        user_id,
        username,
        referral_code,
        referrer_id,
        registered_at
      )
      VALUES(?,?,?,?,?)`,
      u.id,
      'worker-' + u.id.replaceAll('-', '').slice(0, 12),
      randomUUID(),
      null,
      new Date(u.created_at).getTime()
    );
  }

  await db.run(`
    INSERT INTO leases(task_id,worker_id,expires)
    SELECT id,worker_id,?
    FROM tasks
    WHERE status='claimed'
    ON CONFLICT(task_id) DO NOTHING
  `, Date.now() + 30 * 60000);

  await db.run(`
    INSERT INTO profile_settings(
      user_id,
      chosen_username
    )
    SELECT
      user_id,
      CASE
        WHEN username LIKE 'worker-%'
          OR username LIKE 'worker_%'
        THEN 0
        ELSE 1
      END
    FROM profiles
    ON CONFLICT(user_id) DO NOTHING
  `);
}

export async function registerProfile(
  db,
  userId,
  username,
  code,
  now = Date.now()
) {
  const chosen = !!username;

  if (
    chosen &&
    !/^[a-zA-Z0-9_]{3,24}$/.test(username)
  ) {
    throw Error(
      'Choose a username of 3–24 letters, numbers or underscores'
    );
  }

  let referrer = null;

  if (code) {
    referrer = await db.get(`
      SELECT p.user_id
      FROM profiles p
      JOIN users u ON u.id=p.user_id
      LEFT JOIN referral_links l
        ON l.user_id=p.user_id
      WHERE (
        p.referral_code=?
        OR l.code=?
      )
      AND u.role='worker'
    `, code, code);

    if (!referrer) {
      throw Error('Referral code is invalid');
    }
  }

  await db.run(`
    INSERT INTO profiles(
      user_id,
      username,
      referral_code,
      referrer_id,
      registered_at
    )
    VALUES(?,?,?,?,?)
  `,
    userId,
    chosen
      ? username.toLowerCase()
      : 'worker-' + userId.replaceAll('-', '').slice(0, 12),
    randomUUID(),
    referrer?.user_id || null,
    now
  );

  await db.run(`
    INSERT INTO profile_settings(
      user_id,
      chosen_username
    )
    VALUES(?,?)
  `,
    userId,
    chosen ? 1 : 0
  );
}

export async function awardReferral(
  db,
  task,
  now = Date.now()
) {
  if (task.provider !== 'manual-telegram') return;

  const profile = await db.get(
    'SELECT * FROM profiles WHERE user_id=?',
    task.worker_id
  );

  if (!profile?.referrer_id) return;

  const submission = await db.get(
    'SELECT created_at FROM submissions WHERE task_id=?',
    task.id
  );

  const qualifiedAt = submission
    ? new Date(submission.created_at).getTime()
    : now;

  const amount =
    qualifiedAt - Number(profile.registered_at) <
    30 * 86400000
      ? referralPolicy.firstMicros
      : referralPolicy.laterMicros;

  const inserted = await db.run(`
    INSERT INTO referral_awards(
      task_id,
      referrer_id,
      worker_id,
      usd_micros,
      created_at
    )
    VALUES(?,?,?,?,?)
    ON CONFLICT(task_id) DO NOTHING
  `,
    task.id,
    profile.referrer_id,
    task.worker_id,
    amount,
    now
  );

  if (!inserted.changes) return;

  const totalRow = await db.get(
    `SELECT COALESCE(SUM(usd_micros),0) AS n
     FROM referral_awards
     WHERE referrer_id=?`,
    profile.referrer_id
  );

  const creditedRow = await db.get(
    `SELECT credited_cents
     FROM referral_transfers
     WHERE user_id=?`,
    profile.referrer_id
  );

  const total = Number(totalRow?.n || 0);
  const credited = Number(
    creditedRow?.credited_cents || 0
  );

  const cents = Math.floor(total / 10000);

  if (cents > credited) {
    await entry(
      db,
      profile.referrer_id,
      'referral',
      cents - credited
    );

    await db.run(`
      INSERT INTO referral_transfers(
        user_id,
        credited_cents
      )
      VALUES(?,?)
      ON CONFLICT(user_id)
      DO UPDATE SET
        credited_cents=EXCLUDED.credited_cents
    `,
      profile.referrer_id,
      cents
    );
  }
}

export function maskDestination(value) {
  const s = String(value).trim();

  if (s.includes('@')) {
    const [name, domain] = s.split('@');

    return (
      name.slice(0, 1) +
      'xxxx@' +
      domain
    );
  }

  const digits = s.replace(/\D/g, '');

  return digits.length >= 7
    ? digits.slice(0, 3) +
        'xxxxxx' +
        digits.slice(-3)
    : 'Hidden';
}

export async function payoutFeed(db) {
  const rows = await db.all(`
    SELECT
      w.id,
      w.amount,
      w.destination,
      COALESCE(d.paid_at,w.created_at) created_at,
      p.username,
      u.email,
      COALESCE(s.chosen_username,0) chosen
    FROM withdrawals w
    JOIN users u
      ON u.id=w.user_id
    LEFT JOIN profiles p
      ON p.user_id=w.user_id
    LEFT JOIN profile_settings s
      ON s.user_id=w.user_id
    LEFT JOIN paid_dates d
      ON d.withdrawal_id=w.id
    WHERE w.status='paid'
    ORDER BY w.created_at DESC
    LIMIT 100
  `);

  return rows.map(({
    destination,
    email,
    chosen,
    username,
    ...w
  }) => ({
    ...w,
    username:
      chosen && username
        ? username
        : maskDestination(email),
    destination: maskDestination(destination)
  }));
}

export async function communityState(db, user) {
  const profile = await db.get(`
    SELECT
      p.username,
      p.referral_code,
      s.chosen_username,
      s.preferred_currency
    FROM profiles p
    LEFT JOIN profile_settings s
      ON s.user_id=p.user_id
    WHERE p.user_id=?
  `, user.id);

  if (profile) {
    profile.short_code =
      await shortReferral(db, user.id);

    profile.display_name =
      profile.chosen_username
        ? profile.username
        : maskDestination(user.email);
  }

  const totalRow = await db.get(`
    SELECT COALESCE(SUM(usd_micros),0) AS n
    FROM referral_awards
    WHERE referrer_id=?
  `, user.id);

  const creditedRow = await db.get(`
    SELECT credited_cents
    FROM referral_transfers
    WHERE user_id=?
  `, user.id);

  const countRow = await db.get(`
    SELECT COUNT(*) AS n
    FROM profiles
    WHERE referrer_id=?
  `, user.id);

  const total = Number(totalRow?.n || 0);
  const credited = Number(
    creditedRow?.credited_cents || 0
  );

  return {
    profile,
    referrals: {
      policy: referralPolicy,
      count: Number(countRow?.n || 0),
      totalMicros: total,
      carryMicros: total - credited * 10000,
      creditedCents: credited
    },
    payouts: await payoutFeed(db)
  };
}