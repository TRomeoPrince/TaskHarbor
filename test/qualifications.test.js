import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {qualificationsRoute,requireQualification,enrichQualifications,qualificationSkills}
  from '../qualifications-postgres.js';

test('only administrators can grant verified skills or set task requirements',async()=>{
 const db={get(){throw Error('Unexpected database access')},run(){throw Error('Unexpected write')}};
 const worker={id:'worker',role:'worker'};
 await assert.rejects(qualificationsRoute(db,worker,'/api/qualification/grant',
  {workerEmail:'worker@example.test',skill:'transcription',level:'advanced'},'POST'),
  e=>e.status===403);
 await assert.rejects(qualificationsRoute(db,worker,'/api/qualification/requirement',
  {taskId:'t',skill:'transcription',minimumLevel:'beginner'},'POST'),e=>e.status===403);
 assert.equal(await qualificationsRoute(db,worker,'/api/unrelated',{},'POST'),null);
 assert.ok(qualificationSkills.includes('annotation'));
});
test('missing-schema compatibility uses a savepoint to keep claim transaction alive',async()=>{
 const ops=[];
 const tx={async query(sql){
  ops.push(sql);
  if(sql.startsWith('SELECT')){const err=new Error('missing table');err.code='42P01';throw err}
  return {rows:[]};
 }};
 await requireQualification(tx,'task','worker');
 assert.deepEqual(ops.map(x=>x.split(' ')[0]),
  ['SAVEPOINT','SELECT','ROLLBACK','RELEASE']);
});
test('task qualification denies missing verified skill before modifying a claim',async()=>{
 const ops=[];
 const tx={async query(sql){
  ops.push(sql);
  if(sql.startsWith('SELECT'))return {rows:[{skill:'transcription',min_level:2}]};
  return {rows:[]};
 }};
 await assert.rejects(requireQualification(tx,'task','worker'),
  e=>e.status===403&&e.message.includes('transcription'));
 assert.equal(ops.filter(x=>x.startsWith('UPDATE')).length,0);
});
test('eligibility data is derived from verified levels and is worker-specific',async()=>{
 const rows=[{task_id:'task',skill:'transcription',min_level:2}];
 const fake={async all(sql){return sql.includes('FROM task_requirements')?rows:
  [{skill:'transcription',level:1}]}};
 const original={tasks:[{id:'task',title:'Audio',status:'available'},{id:'open',status:'available'}]};
 const worker=await enrichQualifications(fake,{id:'u',role:'worker'},original);
 assert.equal(worker.tasks[0].qualified,false);
 assert.equal(worker.tasks[1].qualified,true);
 assert.equal(worker.tasks[0].required_qualifications[0].skill,'transcription');
 const admin=await enrichQualifications(fake,{id:'admin',role:'admin'},original);
 assert.equal(admin.tasks[0].qualified,true);
});
test('live UI can display qualification requirements but cannot waive backend controls',()=>{
 const markup=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const browser=readFileSync(new URL('../public/qualifications.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server-postgres.js',import.meta.url),'utf8');
 const store=readFileSync(new URL('../store-postgres.js',import.meta.url),'utf8');
 assert.match(markup,/id="qualification-grant-form"/);
 assert.match(markup,/id="qualification-requirement-form"/);
 assert.match(browser,/claim\.disabled=true/);
 assert.match(server,/qualificationsRoute\(db,user,path,body,req.method\)/);
 assert.match(store,/await requireQualification\(db,taskId,userId\)/);
});
test('PostgreSQL prerequisites are enforced before claiming with real joins',
  {skip:!process.env.TEST_DATABASE_URL},async()=>{
    const pg=await import('pg');
    const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
    const client=await pool.connect();
    const schema='taskharbor_qual_'+randomUUID().replaceAll('-','');
    let schemaCreated=false;
    const conv=sql=>{let n=0;return sql.replace(/\?/g,()=>'$'+(++n))};
    const db={
      get:async(sql,...vals)=>(await client.query(conv(sql),vals)).rows[0],
      all:async(sql,...vals)=>(await client.query(conv(sql),vals)).rows,
      run:async(sql,...vals)=>client.query(conv(sql),vals)
    };
    try{
      await client.query('CREATE SCHEMA '+schema);schemaCreated=true;
      await client.query('SET search_path TO '+schema);
      await client.query(readFileSync(new URL('../neon-schema.sql',import.meta.url),'utf8'));
      await client.query("INSERT INTO users(id,email,password_hash,role) VALUES " +
       "('admin','admin@example.test','x','admin'),('worker','worker@example.test','x','worker')," +
       "('other','other@example.test','x','worker')");
      await client.query("INSERT INTO tasks(id,title,description,reward,status) VALUES " +
       "('qualified','Audio demo','synthetic',100,'available')");
      const admin={id:'admin',role:'admin'};
      assert.deepEqual(await qualificationsRoute(db,admin,'/api/qualification/requirement',
        {taskId:'qualified',skill:'transcription',minimumLevel:'intermediate'},'POST'),
        {ok:true,skill:'transcription',level:2});
      let annotated=await enrichQualifications(db,{id:'worker',role:'worker'},
        {tasks:[{id:'qualified',status:'available'}]});
      assert.equal(annotated.tasks[0].qualified,false);
      await client.query('BEGIN');
      await assert.rejects(requireQualification(client,'qualified','worker'),e=>e.status===403);
      await client.query('ROLLBACK');
      const grant=await qualificationsRoute(db,admin,'/api/qualification/grant',
        {workerEmail:'worker@example.test',skill:'transcription',level:'intermediate'},'POST');
      assert.equal(grant.ok,true);
      annotated=await enrichQualifications(db,{id:'worker',role:'worker'},
        {tasks:[{id:'qualified',status:'available'}]});
      assert.equal(annotated.tasks[0].qualified,true);
      await client.query('BEGIN');
      await requireQualification(client,'qualified','worker');
      await client.query('ROLLBACK');
      annotated=await enrichQualifications(db,{id:'other',role:'worker'},
        {tasks:[{id:'qualified',status:'available'}]});
      assert.equal(annotated.tasks[0].qualified,false);
      await assert.rejects(qualificationsRoute(db,{id:'worker',role:'worker'},
        '/api/qualification/grant',{workerEmail:'other@example.test',
        skill:'transcription',level:'advanced'},'POST'),e=>e.status===403);
    }finally{
      await client.query('ROLLBACK').catch(()=>{});
      await client.query('RESET search_path').catch(()=>{});
      if(schemaCreated)await client.query('DROP SCHEMA '+schema+' CASCADE').catch(()=>{});
      client.release();await pool.end();
    }
});
