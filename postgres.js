import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export async function testPostgres() {
  const result = await pool.query('SELECT NOW() AS now');
  return result.rows[0];
}