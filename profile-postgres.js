import {
  postgresAtomic
} from './db-postgres.js';

import {
  hash,
  verify
} from './auth.js';

import {
  currencies
} from './features-postgres.js';

import {
  provisionProfiles,
  shortReferral
} from './community-postgres.js';

const attempts =
  new Map();

export async function profileRoute(
  db,
  user,
  path,
  body,
  method,
  token
) {
  if (
    ![
      '/api/profile',
      '/api/password'
    ].includes(path)
  ) {
    return null;
  }

  await provisionProfiles(db);

  if (
    path ===
      '/api/profile' &&
    method === 'GET'
  ) {
    const profile =
      await db.get(
        `
        SELECT
          p.*,
          s.chosen_username,
          s.preferred_currency
        FROM profiles p
        JOIN profile_settings s
          ON s.user_id=
            p.user_id
        WHERE p.user_id=?
        `,
        user.id
      );

    const account =
      await db.get(
        `
        SELECT created_at
        FROM users
        WHERE id=?
        `,
        user.id
      );

    return {
      ...user,

      username:
        Number(
          profile.chosen_username
        )
          ? profile.username
          : '',

      preferredCurrency:
        profile.preferred_currency,

      referralCode:
        profile.referral_code,

      shortCode:
        await shortReferral(
          db,
          user.id
        ),

      joined:
        account.created_at
    };
  }

  if (
    method !== 'POST'
  ) {
    throw Error(
      'Method not allowed'
    );
  }

  if (
    path ===
    '/api/profile'
  ) {
    return postgresAtomic(
      async tx => {
        if (
          body.username !==
          undefined
        ) {
          const name =
            String(
              body.username
            )
              .trim()
              .toLowerCase();

          if (
            name &&
            !/^[a-z0-9_]{3,24}$/.test(
              name
            )
          ) {
            throw Error(
              'Use 3–24 letters, numbers or underscores'
            );
          }

          try {
            await tx.run(
              `
              UPDATE profiles
              SET username=?
              WHERE user_id=?
              `,
              name ||
                'worker-' +
                  user.id
                    .replaceAll(
                      '-',
                      ''
                    )
                    .slice(
                      0,
                      12
                    ),
              user.id
            );
          } catch (
            error
          ) {
            if (
              error.code ===
                '23505' ||
              error.message
                .toLowerCase()
                .includes(
                  'duplicate'
                )
            ) {
              throw Error(
                'That username is already in use'
              );
            }

            throw error;
          }

          await tx.run(
            `
            UPDATE profile_settings
            SET chosen_username=?
            WHERE user_id=?
            `,
            name ? 1 : 0,
            user.id
          );
        }

        if (
          body.currency !==
          undefined
        ) {
          if (
            !Object.hasOwn(
              currencies,
              body.currency
            )
          ) {
            throw Error(
              'Unsupported currency'
            );
          }

          await tx.run(
            `
            UPDATE profile_settings
            SET preferred_currency=?
            WHERE user_id=?
            `,
            body.currency,
            user.id
          );
        }

        return {
          ok: true
        };
      }
    );
  }

  const now =
    Date.now();

  const previous =
    attempts.get(
      user.id
    ) || {
      count: 0,
      until:
        now + 60000
    };

  if (
    previous.until <= now
  ) {
    previous.count = 0;
    previous.until =
      now + 60000;
  }

  attempts.set(
    user.id,
    previous
  );

  if (
    ++previous.count > 5
  ) {
    throw Error(
      'Too many password attempts; try again in a minute'
    );
  }

  const account =
    await db.get(
      `
      SELECT password_hash
      FROM users
      WHERE id=?
      `,
      user.id
    );

  if (
    typeof body.currentPassword !==
      'string' ||
    body.currentPassword.length >
      256 ||
    !verify(
      body.currentPassword,
      account.password_hash
    )
  ) {
    throw Error(
      'Current password is incorrect'
    );
  }

  const password =
    body.newPassword;

  if (
    typeof password !==
      'string' ||
    password.length < 10 ||
    password.length > 256 ||
    password !==
      password.trim()
  ) {
    throw Error(
      'New password must have 10–256 characters without leading or trailing spaces'
    );
  }

  await postgresAtomic(
    async tx => {
      await tx.run(
        `
        UPDATE users
        SET password_hash=?
        WHERE id=?
        `,
        hash(password),
        user.id
      );

      await tx.run(
        `
        DELETE FROM sessions
        WHERE user_id=?
          AND token<>?
        `,
        user.id,
        token
      );
    }
  );

  return {
    ok: true
  };
}