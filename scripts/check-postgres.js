import {readFileSync} from 'node:fs';
import {pool} from '../postgres.js';
try {
  const tables=[...readFileSync(new URL('../neon-schema.sql',import.meta.url),'utf8').matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m=>m[1]);
  for (const table of tables) {
    const result=await pool.query(`SELECT COUNT(*) AS n FROM "${table}"`);
    console.log(`${table}: ${result.rows[0].n} rows`);
  }
  const rate=await pool.query("SELECT data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='rates' AND column_name='rate'");
  if (rate.rows[0]?.data_type!=='bigint') throw Error('rates.rate must be BIGINT; schema upgrade needed');
  console.log('Database checks passed. No data changed.');
} finally { await pool.end(); }
