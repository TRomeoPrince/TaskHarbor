import {readFileSync} from 'node:fs';
import {pool} from '../postgres.js';

// Deliberate schema action, never run by server startup or a deployment hook.
try {
  if (!process.argv.includes('--apply')) {
    throw Error('Schema changes require --apply. Back up the target database first.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(readFileSync(new URL('../neon-schema.sql',import.meta.url),'utf8'));
    for (const [table,column] of [['rates','rate'],['tasks','reward'],['withdrawals','amount'],['ledger','amount'],['quotes','usd_cents'],['referral_transfers','credited_cents']]) {
      await client.query(`ALTER TABLE ${table} ALTER COLUMN ${column} TYPE BIGINT`);
    }
    await client.query('COMMIT');
    console.log('PostgreSQL schema ready. Existing rows preserved.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
} finally { await pool.end(); }
