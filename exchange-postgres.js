import {
  postgresAtomic
} from './db-postgres.js';

import {
  currencies
} from './features-postgres.js';

export const SOURCE =
  'https://www.exchangerate-api.com';

export async function restoreCurrencies(
  db
) {
  const sync =
    await db.get(
      `
      SELECT id
      FROM exchange_sync
      WHERE id=1
      `
    );

  if (!sync) {
    return;
  }

  const rows =
    await db.all(
      `
      SELECT currency
      FROM rates
      `
    );

  for (
    const { currency } of rows
  ) {
    if (
      /^[A-Z]{3}$/.test(
        currency
      )
    ) {
      currencies[currency] =
        new Intl.NumberFormat(
          'en',
          {
            style:
              'currency',
            currency
          }
        ).resolvedOptions()
          .maximumFractionDigits;
    }
  }
}

export async function refreshRates(
  db,
  fetcher = fetch,
  now = Date.now(),
  apiKey =
    process.env
      .EXCHANGE_RATE_API_KEY ||
    ''
) {
  const source =
    apiKey
      ? SOURCE +
        '/docs/standard-requests'
      : SOURCE;

  const endpoint =
    apiKey
      ? `https://v6.exchangerate-api.com/v6/${encodeURIComponent(apiKey)}/latest/USD`
      : 'https://open.er-api.com/v6/latest/USD';

  const prior =
    await db.get(
      `
      SELECT *
      FROM exchange_sync
      WHERE id=1
      `
    );

  if (
    prior &&
    Number(
      prior.next_check
    ) > now &&
    (
      prior.source ===
        source ||
      prior.last_error
    )
  ) {
    return false;
  }

  try {
    const response =
      await fetcher(
        endpoint,
        {
          signal:
            AbortSignal.timeout(
              12000
            )
        }
      );

    if (!response.ok) {
      throw Error(
        'Exchange provider unavailable'
      );
    }

    const data =
      await response.json();

    const updated =
      data.time_last_update_unix *
      1000;

    const next =
      data.time_next_update_unix *
      1000;

    const rates =
      apiKey
        ? data.conversion_rates
        : data.rates;

    if (
      data.result !==
        'success' ||
      data.base_code !==
        'USD' ||
      rates?.USD !== 1 ||
      !Number.isFinite(
        updated
      ) ||
      updated >
        now + 300000 ||
      updated <
        now -
          7 * 86400000 ||
      !Number.isFinite(
        next
      ) ||
      next <= updated
    ) {
      throw Error(
        'Invalid exchange response'
      );
    }

    const rows =
      Object.entries(
        rates
      )
        .filter(
          ([currency]) =>
            /^[A-Z]{3}$/.test(
              currency
            ) &&
            currency !==
              'USD'
        )
        .map(
          ([
            currency,
            value
          ]) => {
            const number =
              Math.round(
                value *
                  1000000
              );

            if (
              typeof value !==
                'number' ||
              !Number.isSafeInteger(
                number
              ) ||
              number <= 0
            ) {
              throw Error(
                'Invalid exchange rate'
              );
            }

            return [
              currency,
              number,
              updated
            ];
          }
        );

    if (
      rows.length < 5
    ) {
      throw Error(
        'Incomplete exchange response'
      );
    }

    await postgresAtomic(
      async tx => {
        await tx.run(
          'DELETE FROM rates'
        );

        for (
          const row of rows
        ) {
          await tx.run(
            `
            INSERT INTO rates(
              currency,
              rate,
              updated_at
            )
            VALUES(?,?,?)
            `,
            ...row
          );
        }

        await tx.run(
          `
          INSERT INTO exchange_sync(
            id,
            source,
            updated_at,
            next_check,
            last_error
          )
          VALUES(
            1,?,?,?,NULL
          )
          ON CONFLICT(id)
          DO UPDATE SET
            source=
              EXCLUDED.source,
            updated_at=
              EXCLUDED.updated_at,
            next_check=
              EXCLUDED.next_check,
            last_error=NULL
          `,
          source,
          updated,
          Math.max(
            now +
              3600000,
            next +
              60000
          )
        );
      }
    );

    await restoreCurrencies(
      db
    );

    return true;
  } catch {
    await db.run(
      `
      INSERT INTO exchange_sync(
        id,
        source,
        updated_at,
        next_check,
        last_error
      )
      VALUES(
        1,?,0,?,?
      )
      ON CONFLICT(id)
      DO UPDATE SET
        next_check=
          EXCLUDED.next_check,
        last_error=
          EXCLUDED.last_error
      `,
      source,
      now + 3600000,
      'Automatic rate refresh failed; retrying.'
    );

    return false;
  }
}