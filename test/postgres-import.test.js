import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {openStore} from '../store.js';
import {initialize} from '../features.js';

test('PostgreSQL import: dry run, exact data preservation and nonempty-target refusal',
 {skip:!process.env.TEST_DATABASE_URL},async()=>{
 const {Pool}=await import('pg');
 const schema='taskharbor_import_'+crypto.randomUUID().replaceAll('-','');
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,options:'-c search_path='+schema});
 const dir=await mkdtemp(join(tmpdir(),'taskharbor-import-'));
 const path=join(dir,'fixture.sqlite');
 try{
  await pool.query('CREATE SCHEMA '+schema);
  await pool.query(await readFile(new URL('../neon-schema.sql',import.meta.url),'utf8'));
  const db=openStore(path);initialize(db);
  db.prepare("INSERT INTO users(id,email,password_hash,role) VALUES('u','fixture@example.test','fixture-hash','worker')").run();
  db.prepare("INSERT INTO tasks(id,title,description,reward,status,worker_id) VALUES('t','Fixture','Private instructions',12,'approved','u')").run();
  db.prepare("INSERT INTO ledger(id,user_id,kind,amount,task_id) VALUES('l','u','earning',12,'t')").run();
  const png=Buffer.from('89504e470d0a1a0a','hex');
  db.prepare("INSERT INTO images VALUES('i','t','u','instruction','image/png',?)").run(png);
  db.prepare("INSERT INTO rates VALUES('UGX',3700000000,12345)").run();
  const created=db.prepare("SELECT created_at FROM users WHERE id='u'").get().created_at;
  db.close();
  const run=promisify(execFile);
  const script=new URL('../scripts/import-sqlite.js',import.meta.url);
  const {fileURLToPath}=await import('node:url');
  const options={env:{...process.env,DATABASE_URL:process.env.TEST_DATABASE_URL,PGOPTIONS:'-c search_path='+schema},timeout:15000};
  const args=[fileURLToPath(script),'--source='+path];
  const dry=await run(process.execPath,args,options);assert.match(dry.stdout,/Dry run only/);
  assert.equal(Number((await pool.query('SELECT COUNT(*) n FROM users')).rows[0].n),0);
  const applied=await run(process.execPath,[...args,'--apply'],options);assert.match(applied.stdout,/Imported and verified/);
  const user=(await pool.query('SELECT * FROM users')).rows[0];
  assert.equal(user.password_hash,'fixture-hash');assert.equal(user.created_at.toISOString(),created.replace(' ','T')+'.000Z');
  assert.equal(Number((await pool.query('SELECT SUM(amount) n FROM ledger')).rows[0].n),12);
  assert.deepEqual((await pool.query('SELECT data FROM images')).rows[0].data,png);
  assert.equal(Number((await pool.query('SELECT rate FROM rates')).rows[0].rate),3700000000);
  await assert.rejects(run(process.execPath,[...args,'--apply'],options),/not empty/);
  assert.equal(Number((await pool.query('SELECT COUNT(*) n FROM ledger')).rows[0].n),1);
 }finally{
  await pool.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await pool.end();
  await rm(dir,{recursive:true,force:true});
 }
});
