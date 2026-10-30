import './config.js';
import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
  types: {
    getTypeParser(oid, format) {
      if (oid === 20 && format !== 'binary') return value => {
        const number = Number(value);
        if (!Number.isSafeInteger(number)) throw Error('Database integer exceeds safe range');
        return number;
      };
      return pg.types.getTypeParser(oid, format);
    }
  }
});

// SQLite serialized writes. Retry conflicting PostgreSQL transactions so claims,
// reservations and referral credits retain the same behavior across instances.
export async function transaction(fn) {
  for (let attempt = 0; ; attempt++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      if (attempt >= 3 || !['40001', '40P01'].includes(error.code)) throw error;
    } finally {
      client.release();
    }
  }
}

export async function testPostgres() {
  const result = await pool.query('SELECT NOW() AS now');
  return result.rows[0];
}
