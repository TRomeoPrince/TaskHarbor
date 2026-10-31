import {contactRoute,notificationTick} from './contact-notifications.js';
import './config.js';
import { hash, verify } from './auth.js';
import { profileRoute } from './profile-postgres.js';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';

import {
  wallet,
  claim,
  entry,
  expireClaims
} from './store-postgres.js';

import { postgresDb, postgresAtomic } from './db-postgres.js';

import {
  enrich,
  route
} from './features-postgres.js';

import {
  provisionProfiles,
  registerProfile,
  payoutFeed
} from './community-postgres.js';

import {
  refreshRates,
  restoreCurrencies
} from './exchange-postgres.js';

const db = postgresDb;
const notificationTimer = setInterval(()=>notificationTick(db),30000);
notificationTimer.unref();

await provisionProfiles(db);
await restoreCurrencies(db);

const clients = new Set();

function broadcast() {
  for (const client of clients) {
    client.res.write('event: change\ndata: {}\n\n');
  }
}

const expiryTimer = setInterval(async () => {
  try {
    if (await expireClaims()) {
      broadcast();
    }
  } catch (error) {
    console.error('Claim expiry error:', error.message);
  }
}, 15000);

expiryTimer.unref();

if (process.env.NO_LISTEN !== '1') {
  const update = async () => {
    try {
      const changed = await refreshRates(db);

      if (changed) {
        broadcast();
      }
    } catch (error) {
      console.error('Exchange refresh error:', error.message);
    }
  };

  update();

  const exchangeTimer = setInterval(
    update,
    30 * 60000
  );

  exchangeTimer.unref();
}

const heartbeat = setInterval(async () => {
  for (const client of [...clients]) {
    try {
      const session = await db.get(
        'SELECT token FROM sessions WHERE token=?',
        client.token
      );

      if (
        client.expires < Date.now() ||
        !session
      ) {
        client.res.end();
        clients.delete(client);
      } else {
        client.res.write(': heartbeat\n\n');
      }
    } catch {
      client.res.end();
      clients.delete(client);
    }
  }
}, 15000);

heartbeat.unref();

const existingAdmin = await db.get(
  "SELECT id FROM users WHERE role='admin'"
);

if (!existingAdmin) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 10) {
    throw Error('Set ADMIN_PASSWORD (at least 10 characters) before initializing a new PostgreSQL admin');
  }

  await db.run(
    `INSERT INTO users(
      id,
      email,
      password_hash,
      role
    )
    VALUES(?,?,?,?)`,
    randomUUID(),
    process.env.ADMIN_EMAIL || 'admin@local.test',
    hash(password),
    'admin'
  );

  console.log(
    'Initial admin created:',
    process.env.ADMIN_EMAIL || 'admin@local.test'
  );
}

const fail = (message, status = 400) => {
  throw Object.assign(
    new Error(message),
    { status }
  );
};

const str = (value, max = 10000) => {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max
  ) {
    fail('Invalid or missing text field');
  }

  return value.trim();
};

const attempts = new Map();

const server = http.createServer(
  async (req, res) => {
    res.setHeader(
      'X-Content-Type-Options',
      'nosniff'
    );

    res.setHeader(
      'Cache-Control',
      'no-store'
    );

    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'"
    );

    try {
      const path = new URL(
        req.url,
        'http://localhost'
      ).pathname;

      if (
        req.method === 'GET' &&
        path.startsWith('/r/')
      ) {
        const code = path.slice(3);

        const found = await db.get(
          'SELECT code FROM referral_links WHERE code=?',
          code
        );

        if (!found) {
          fail('Referral link not found', 404);
        }

        res.writeHead(
          302,
          {
            Location:
              '/?ref=' +
              encodeURIComponent(code)
          }
        );

        return res.end();
      }

      if (
        req.method === 'GET' &&
        !path.startsWith('/api/')
      ) {
        const file = {
          '/': 'index.html',
          '/app.js': 'app.js',
          '/style.css': 'style.css',
          '/dashboard-v2.css': 'dashboard-v2.css',
          '/contact-v3.css': 'contact-v3.css',
          '/payouts': 'payouts.html',
          '/payouts/': 'payouts.html',
          '/profile': 'profile.html',
          '/profile/': 'profile.html',
          '/profile.js': 'profile.js',
          '/clipboard.js': 'clipboard.js',
          '/payouts.js': 'payouts.js',
          '/preview.png': 'preview.png',
          '/contact':'contact.html',
          '/contact.js':'contact.js',
          '/notifications-sw.js':'notifications-sw.js'
        }[path];

        if (!file) {
          fail('Not found', 404);
        }

        res.setHeader(
          'Content-Type',
          file.endsWith('js')
            ? 'text/javascript'
            : file.endsWith('css')
              ? 'text/css'
              : file.endsWith('png')
                ? 'image/png'
                : 'text/html'
        );

        return res.end(
          readFileSync(
            new URL(
              './public/' + file,
              import.meta.url
            )
          )
        );
      }

      const publicOrigin = process.env.PUBLIC_ORIGIN ? new URL(process.env.PUBLIC_ORIGIN).origin : null;
      // One cookie for the canonical site and its www hostname, without sending
      // production cookies to Catalyst's preview hostname or unrelated domains.
      const requestHost = (req.headers.host || '').split(':')[0].toLowerCase();
      const sharedSite = requestHost === 'taskharbor.cc.cd' || requestHost === 'www.taskharbor.cc.cd';
      const cookieDomain = sharedSite ? '; Domain=taskharbor.cc.cd' : '';
      const cookieSecure = sharedSite || publicOrigin?.startsWith('https:') ? '; Secure' : '';
      const cookieOptions = '; HttpOnly; SameSite=Lax; Path=/' + cookieDomain + cookieSecure;

      const allowedOrigins = new Set([
        `http://${req.headers.host}`,
        `https://${req.headers.host}`,
        ...(publicOrigin
          ? [publicOrigin]
          : [])
      ]);

      if (
        req.method === 'POST' &&
        req.headers.origin &&
        !allowedOrigins.has(
          req.headers.origin
        )
      ) {
        fail('Invalid origin', 403);
      }

      let body = {};

      if (req.method === 'POST') {
        let raw = '';

        for await (const chunk of req) {
          raw += chunk;

          if (raw.length > 14000000) {
            fail(
              'Request too large',
              413
            );
          }
        }

        body = JSON.parse(
          raw || '{}'
        );
      }

      const token =
        (req.headers.cookie || '')
          .match(
            /(?:^|;\s*)session=([^;]+)/
          )?.[1];

      const user = await db.get(
        `
        SELECT
          u.id,
          u.email,
          u.role
        FROM sessions s
        JOIN users u
          ON u.id=s.user_id
        WHERE s.token=?
          AND s.expires>?
        `,
        token || '',
        Date.now()
      );

      let result;

      if (
        path === '/api/register' ||
        path === '/api/login'
      ) {
        if (req.method !== 'POST') {
          fail(
            'Method not allowed',
            405
          );
        }

        const key =
          req.socket.remoteAddress;

        const attempt =
          attempts.get(key) || {
            n: 0,
            until:
              Date.now() + 60000
          };

        if (
          Date.now() >
          attempt.until
        ) {
          attempt.n = 0;
          attempt.until =
            Date.now() + 60000;
        }

        if (++attempt.n > 20) {
          fail(
            'Try again in a minute',
            429
          );
        }

        attempts.set(
          key,
          attempt
        );

        const email =
          str(
            body.email,
            254
          ).toLowerCase();

        const password =
          str(
            body.password,
            256
          );

        if (
          !email.includes('@') ||
          password.length < 10
        ) {
          fail(
            'Use a valid email and a password of at least 10 characters'
          );
        }

        if (
          path === '/api/register'
        ) {
          try {
            await postgresAtomic(
              async tx => {
                const id =
                  randomUUID();

                await tx.run(
                  `
                  INSERT INTO users(
                    id,
                    email,
                    password_hash,
                    role
                  )
                  VALUES(?,?,?,?)
                  `,
                  id,
                  email,
                  hash(password),
                  'worker'
                );

                await registerProfile(
                  tx,
                  id,
                  body.username || '',
                  body.referralCode || ''
                );
              }
            );
          } catch (error) {
            const duplicate =
              error.code === '23505' ||
              error.message
                .toLowerCase()
                .includes(
                  'duplicate'
                );

            fail(
              duplicate
                ? 'Email or username already registered'
                : error.message
            );
          }
        }

        const account =
          await db.get(
            'SELECT * FROM users WHERE email=?',
            email
          );

        if (
          !account ||
          !verify(
            password,
            account.password_hash
          )
        ) {
          fail(
            'Invalid credentials',
            401
          );
        }

        const sessionToken =
          randomBytes(32)
            .toString('hex');

        await db.run(
          `
          INSERT INTO sessions(
            token,
            user_id,
            expires
          )
          VALUES(?,?,?)
          `,
          sessionToken,
          account.id,
          Date.now() +
            86400000
        );

        res.setHeader(
          'Set-Cookie',
          `session=${sessionToken}${cookieOptions}; Max-Age=86400`
        );

        result = { ok: true };
      } else {
        if (!user) {
          fail(
            'Please log in',
            401
          );
        }

        if (
          await expireClaims()
        ) {
          broadcast();
        }

        const profileResult =
          await profileRoute(
            db,
            user,
            path,
            body,
            req.method,
            token
          );

        if (
          profileResult !== null
        ) {
          if (
            req.method === 'POST'
          ) {
            broadcast();
          }

          res.setHeader(
            'Content-Type',
            'application/json'
          );

          return res.end(
            JSON.stringify(
              profileResult
            )
          );
        }

        if (
          req.method === 'GET' &&
          path ===
            '/api/payout-feed'
        ) {
          res.setHeader(
            'Content-Type',
            'application/json'
          );

          return res.end(
            JSON.stringify(
              await payoutFeed(db)
            )
          );
        }

        if (
          req.method === 'GET' &&
          path === '/api/events'
        ) {
          res.writeHead(
            200,
            {
              'Content-Type':
                'text/event-stream',
              'Connection':
                'keep-alive',
              'X-Accel-Buffering':
                'no'
            }
          );

          res.write(
            'retry: 3000\nevent: change\ndata: {}\n\n'
          );

          const session =
            await db.get(
              `
              SELECT expires
              FROM sessions
              WHERE token=?
              `,
              token
            );

          const client = {
            res,
            token,
            expires:
              Number(
                session.expires
              )
          };

          clients.add(client);

          res.on(
            'close',
            () =>
              clients.delete(
                client
              )
          );

          return;
        }

        const contactResult = await contactRoute(db,user,path,req.method==='GET'?Object.fromEntries(new URL(req.url,'http://localhost').searchParams):body,req.method);
        if(contactResult!==null){
          if(req.method==='POST')broadcast();
          res.setHeader('Content-Type','application/json');
          return res.end(JSON.stringify(contactResult));
        }

        const featureResult =
          await route(
            db,
            user,
            path,
            body,
            req,
            res
          );

        if (
          featureResult === 'sent'
        ) {
          return;
        }

        if (
          featureResult !== null
        ) {
          broadcast();

          res.setHeader(
            'Content-Type',
            'application/json'
          );

          return res.end(
            JSON.stringify(
              featureResult
            )
          );
        }

        if (
          req.method === 'GET' &&
          path === '/api/state'
        ) {
          const tasks =
            user.role === 'admin'
              ? await db.all(
                  `
                  SELECT *
                  FROM tasks
                  ORDER BY created_at DESC
                  `
                )
              : await db.all(
                  `
                  SELECT *
                  FROM tasks
                  WHERE status='available'
                    OR worker_id=?
                  ORDER BY created_at DESC
                  `,
                  user.id
                );

          const submissions =
            user.role === 'admin'
              ? await db.all(
                  `
                  SELECT *
                  FROM submissions
                  `
                )
              : await db.all(
                  `
                  SELECT *
                  FROM submissions
                  WHERE worker_id=?
                  `,
                  user.id
                );

          const transactions =
            await db.all(
              `
              SELECT *
              FROM ledger
              WHERE user_id=?
              ORDER BY created_at DESC
              `,
              user.id
            );

          const withdrawals =
            user.role === 'admin'
              ? await db.all(
                  `
                  SELECT
                    w.*,
                    u.email
                  FROM withdrawals w
                  JOIN users u
                    ON u.id=w.user_id
                  `
                )
              : await db.all(
                  `
                  SELECT *
                  FROM withdrawals
                  WHERE user_id=?
                  `,
                  user.id
                );

          result = {
            user,
            wallet:
              await wallet(
                db,
                user.id
              ),
            tasks,
            submissions,
            transactions,
            withdrawals
          };
        } else if (
          req.method === 'POST'
        ) {
          if (
            path === '/api/logout'
          ) {
            await db.run(
              `
              DELETE FROM sessions
              WHERE token=?
              `,
              token
            );

            res.setHeader(
              'Set-Cookie',
              `session=${cookieOptions}; Max-Age=0`
            );
          } else if (
            path === '/api/claim'
          ) {
            if (
              user.role !==
              'worker'
            ) {
              fail(
                'Worker account required'
              );
            }

            await claim(
              str(body.taskId),
              user.id
            );
          } else {
            if (
              user.role !==
              'admin'
            ) {
              fail(
                'Admin access required',
                403
              );
            }

            if (
              path ===
              '/api/payout'
            ) {
              await postgresAtomic(
                async tx => {
                  const withdrawal =
                    await tx.get(
                      `
                      SELECT *
                      FROM withdrawals
                      WHERE id=?
                        AND status='requested'
                      `,
                      str(body.id)
                    );

                  if (!withdrawal) {
                    fail(
                      'Withdrawal already processed or missing'
                    );
                  }

                  if (
                    ![
                      'paid',
                      'rejected'
                    ].includes(
                      body.decision
                    )
                  ) {
                    fail(
                      'Invalid decision'
                    );
                  }

                  const reference =
                    str(
                      body.reference,
                      500
                    );

                  await tx.run(
                    `
                    UPDATE withdrawals
                    SET
                      status=?,
                      reference=?
                    WHERE id=?
                    `,
                    body.decision,
                    reference,
                    withdrawal.id
                  );

                  if (
                    body.decision ===
                    'paid'
                  ) {
                    await tx.run(
                      `
                      INSERT INTO paid_dates(
                        withdrawal_id
                      )
                      VALUES(?)
                      `,
                      withdrawal.id
                    );
                  }

                  if (
                    body.decision ===
                    'rejected'
                  ) {
                    await entry(
                      tx,
                      withdrawal.user_id,
                      'refund',
                      Number(
                        withdrawal.amount
                      ),
                      null,
                      withdrawal.id
                    );
                  }
                }
              );
            } else {
              fail(
                'Not found',
                404
              );
            }
          }

          result = { ok: true };
        } else {
          fail(
            'Not found',
            404
          );
        }
      }

      if (
        path === '/api/state'
      ) {
        result =
          await enrich(
            db,
            user,
            result
          );
      }

      if (
        req.method === 'POST'
      ) {
        broadcast();
      }

      res.setHeader(
        'Content-Type',
        'application/json'
      );

      res.end(
        JSON.stringify(result)
      );
    } catch (error) {
      res.statusCode =
        error.status || 400;

      res.setHeader(
        'Content-Type',
        'application/json'
      );

      const duplicate =
        error.code === '23505' ||
        error.message
          ?.toLowerCase()
          .includes('duplicate');

      res.end(
        JSON.stringify({
          error:
            duplicate
              ? 'Duplicate provider task or record'
              : error.message
        })
      );
    }
  }
);

export { server, db };

if (
  process.env.NO_LISTEN !== '1'
) {
  const port = Number(
    process.env
      .X_ZOHO_CATALYST_LISTEN_PORT ||
    process.env.PORT ||
    3000
  );

  const host =
    process.env
      .X_ZOHO_CATALYST_LISTEN_PORT
      ? '0.0.0.0'
      : '127.0.0.1';

  server.listen(
    port,
    host,
    () => {
      console.log(
        `TaskHarbor PostgreSQL running at http://${host}:${server.address().port}`
      );
    }
  );
}
