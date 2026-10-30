import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {pool} from '../postgres.js';

// Use a frozen backup for cutover. Dry-run by default; never merge or overwrite.
const source=process.argv.find(arg=>arg.startsWith('--source='))?.slice(9);
if (!source) { await pool.end(); throw Error('Pass --source=PATH to a SQLite backup'); }
const sqlite=new DatabaseSync(source,{readOnly:true});
let client;
try {
  sqlite.exec('BEGIN');
  const tables=[...readFileSync(new URL('../neon-schema.sql',import.meta.url),'utf8').matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m=>m[1]);
  const sourceTables=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name);
  if (sourceTables.some(name=>!tables.includes(name))) throw Error('Unrecognized source tables; stop and review the source schema');
  client=await pool.connect();
  await client.query('BEGIN');
  // Block application writes to the destination during inspection and import.
  await client.query('LOCK TABLE '+tables.map(t=>'"'+t+'"').join(',')+' IN ACCESS EXCLUSIVE MODE');
  const columns=(await client.query('SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema=current_schema()')).rows;
  let total=0;
  for (const table of tables) {
    const targetCount=Number((await client.query(`SELECT COUNT(*) AS n FROM "${table}"`)).rows[0].n);
    if (targetCount) throw Error(`Destination ${table} is not empty. Refusing to merge or overwrite.`);
  }
  for (const table of tables) {
    const rows=sourceTables.includes(table)?sqlite.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all():[];
    console.log(`${table}: ${rows.length} rows`);
    if (!process.argv.includes('--apply')) continue;
    for (const row of rows) {
      const keys=Object.keys(row);
      const values=keys.map(key=>{
        const column=columns.find(c=>c.table_name===table&&c.column_name===key);
        if (!column) throw Error(`Destination is missing ${table}.${key}`);
        const value=row[key];
        // SQLite CURRENT_TIMESTAMP is UTC but has no explicit timezone suffix.
        return value && column.data_type==='timestamp with time zone' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value)
          ? value.replace(' ','T')+'Z' : value;
      });
      await client.query(`INSERT INTO "${table}" (${keys.map(k=>'"'+k+'"').join(',')}) VALUES (${keys.map((_,i)=>'$'+(i+1)).join(',')})`,values);
    }
    const count=Number((await client.query(`SELECT COUNT(*) AS n FROM "${table}"`)).rows[0].n);
    if (count!==rows.length) throw Error(`Row count mismatch for ${table}`);
    total+=count;
  }
  if (process.argv.includes('--apply')) {
    await client.query('COMMIT');
    console.log(`Imported and verified ${total} rows. Source unchanged.`);
  } else {
    await client.query('ROLLBACK');
    console.log('Dry run only. Source and destination unchanged. Add --apply after reviewing counts.');
  }
} catch (error) {
  if (client) await client.query('ROLLBACK');
  throw error;
} finally {
  client?.release();
  sqlite.close();
  await pool.end();
}
