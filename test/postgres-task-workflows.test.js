import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('PostgreSQL: delayed Gmail instructions and admin compensation for expired provider tasks', {skip:!process.env.TEST_DATABASE_URL}, async()=>{
 const {Pool}=await import('pg');
 const schema='taskharbor_workflows_'+crypto.randomUUID().replaceAll('-','');
 const adminPool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
 await adminPool.query('CREATE SCHEMA '+schema);
 process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
 process.env.PGOPTIONS='-c search_path='+schema;
 const {pool}=await import('../postgres.js');
 let server;
 try {
  assert.equal((await pool.query('SELECT current_schema() name')).rows[0].name,schema);
  await pool.query(await readFile(new URL('../neon-schema.sql',import.meta.url),'utf8'));
  process.env.NO_LISTEN='1';process.env.ADMIN_PASSWORD='TestingOnlyAdminPassword123';
  const service=await import('../server-postgres.js');
  server=service.server;
  const db=service.db;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const base='http://127.0.0.1:'+server.address().port;
  async function post(path,data,cookie=''){
   const r=await fetch(base+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,Origin:base},body:JSON.stringify(data)});
   return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
  }
  async function state(cookie){const r=await fetch(base+'/api/state',{headers:{Cookie:cookie}});assert.equal(r.status,200);return r.json();}
  const admin=await post('login',{email:'admin@local.test',password:'TestingOnlyAdminPassword123'});
  assert.equal(admin.status,200,JSON.stringify(admin.data));
  const worker=await post('register',{email:'worker@test.local',password:'WorkerPassword123'});
  assert.equal(worker.status,200,JSON.stringify(worker.data));
  const publisher=await post('quick-task',{onDemand:'1',workMinutes:'60'},admin.cookie);
  assert.equal(publisher.status,200,JSON.stringify(publisher.data));
  let task=(await state(worker.cookie)).tasks.find(t=>t.title==='CREATE GMAIL');
  assert.ok(task);
  assert.equal(task.fields.length,0);
  assert.match(task.description,/Claim the task first/);
  assert.equal((await post('claim',{taskId:task.id},worker.cookie)).status,200);
  const waiting=(await state(worker.cookie)).tasks.find(t=>t.id===task.id);
  assert.equal(waiting.claim_expires,null);
  assert.equal(waiting.assignee,null,'Members do not receive the admin contact directory');
  const adminTask=(await state(admin.cookie)).tasks.find(t=>t.id===task.id);
  assert.equal(adminTask.assignee.email,'worker@test.local');
  assert.equal((await post('submit',{taskId:task.id,content:'Too soon'},worker.cookie)).status,400);
  const release=await post('supply-gmail-details',{taskId:task.id,firstName:'Example',lastName:'',email:'example@gmail.com',password:'SyntheticOnlyPassword',minutes:60},admin.cookie);
  assert.equal(release.status,200,JSON.stringify(release.data));
  const supplied=(await state(worker.cookie)).tasks.find(t=>t.id===task.id);
  assert.equal(supplied.fields.find(f=>f.label==='Gmail address (Username)').value,'example@gmail.com');
  assert.equal((await post('submit',{taskId:task.id,content:'Created account using provided instructions'},worker.cookie)).status,200);
  const statusBefore=await state(worker.cookie);
  assert.equal(statusBefore.wallet.available,0);
  assert.equal(statusBefore.wallet.pending,12);
  const wrong=await post('compensate-provider-expired',{taskId:task.id,reason:'Not authorized'},worker.cookie);
  assert.equal(wrong.status,400);
  const compensated=await post('compensate-provider-expired',{taskId:task.id,reason:'Telegram task expired before recovery details arrived'},admin.cookie);
  assert.equal(compensated.status,200,JSON.stringify(compensated.data));
  const statusAfter=await state(worker.cookie);
  assert.equal(statusAfter.wallet.available,12);
  assert.equal(statusAfter.wallet.earned,12);
  assert.equal(statusAfter.wallet.pending,0);
  const record=statusAfter.tasks.find(t=>t.id===task.id);
  assert.equal(Number(record.compensation.amount),12);
  assert.equal(record.status,'rejected');
  assert.match(record.compensation.reason,/Telegram task expired/);
  assert.equal((await post('compensate-provider-expired',{taskId:task.id,reason:'Duplicate attempt'},admin.cookie)).status,400);
  assert.equal(Number((await db.get('SELECT COUNT(*) n FROM ledger WHERE task_id=?',task.id)).n),1);
  assert.equal(Number((await db.get('SELECT COUNT(*) n FROM referral_awards WHERE task_id=?',task.id)).n),0);
  const next=await post('tasks',{title:'Another task',description:'Other work',reward:200,policy:{claimMinutes:2}},admin.cookie);
  assert.equal(next.status,200,JSON.stringify(next.data));
  const after=(await state(worker.cookie)).tasks.find(t=>t.title==='Another task');
  assert.equal((await post('claim',{taskId:after.id},worker.cookie)).status,200);
  const noLease=await post('tasks',{title:'Long project',description:'Project deadline controls',reward:700,policy:{claimMinutes:null,deadlineAt:new Date(Date.now()+12*86400000).toISOString(),publicDescription:true}},admin.cookie);
  assert.equal(noLease.status,200,JSON.stringify(noLease.data));
  const long=(await state(worker.cookie)).tasks.find(t=>t.title==='Long project');
  assert.match(long.description,/Project deadline controls/);
  // Existing PostgreSQL behavior permits multiple independent claims by one worker.
  assert.equal((await post('claim',{taskId:long.id},worker.cookie)).status,200);
  assert.equal((await db.get('SELECT expires FROM leases WHERE task_id=?',long.id)),undefined);
 }finally{
  if(server?.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  await pool.end();
  await adminPool.query('DROP SCHEMA '+schema+' CASCADE');
  await adminPool.end();
 }
});
