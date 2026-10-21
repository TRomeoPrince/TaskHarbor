import { pool, transaction } from './postgres.js';

function convertPlaceholders(sql) {
  let index = 0;

  return sql.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
}

function makeDb(client) {
  return {
    async query(sql, params = []) {
      return client.query(
        convertPlaceholders(sql),
        params
      );
    },

    async get(sql, ...params) {
      const result = await client.query(
        convertPlaceholders(sql),
        params
      );

      return result.rows[0];
    },

    async all(sql, ...params) {
      const result = await client.query(
        convertPlaceholders(sql),
        params
      );

      return result.rows;
    },

    async run(sql, ...params) {
      const result = await client.query(
        convertPlaceholders(sql),
        params
      );

      return {
        changes: result.rowCount || 0,
        rows: result.rows
      };
    },

    async exec(sql) {
      return client.query(sql);
    }
  };
}

export const postgresDb = makeDb(pool);

export async function postgresAtomic(fn) {
  return transaction(client => fn(makeDb(client)));
}
