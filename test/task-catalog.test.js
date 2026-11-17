import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogRoute, catalogState, catalogValues } from '../task-catalog.js';
const TASK_ID = '11111111-2222-4333-8444-555555555555';
const admin = {id:'admin',role:'admin'};
const worker = {id:'worker',role:'worker'};
const valid = {taskId:TASK_ID,category:'transcription',rewardUnit:'clip',
  skillLevel:'intermediate',expectedMinutes:'16',publicSummary:'Transcribe a verified audio clip.'};

test('catalog categories, units, and levels are explicitly allowlisted',()=>{
  assert.ok(catalogValues.categories.includes('transcription'));
  assert.ok(catalogValues.units.includes('recorded_minute'));
  assert.ok(!catalogValues.categories.includes('<script>'));
});
test('only an administrator can classify a published task',async()=>{
  let writes=0;
  const db={get:async()=>({id:TASK_ID}),run:async()=>{writes++}};
  await assert.rejects(catalogRoute(db,worker,'/api/task-catalog',valid,'POST'),/Admin access required/);
  await assert.rejects(catalogRoute(db,admin,'/api/task-catalog',valid,'GET'),/Method not allowed/);
  await assert.rejects(catalogRoute(db,admin,'/api/task-catalog',{...valid,category:'imaginary'},'POST'),/supported category/);
  await assert.rejects(catalogRoute(db,admin,'/api/task-catalog',{...valid,expectedMinutes:'2.5'},'POST'),/Expected duration/);
  await assert.rejects(catalogRoute(db,admin,'/api/task-catalog',{...valid,publicSummary:'x'.repeat(301)},'POST'),/300 characters/);
  assert.equal(writes,0);
});
test('catalog updates only work metadata, never money or claim state',async()=>{
  let query,params;
  const db={get:async()=>({id:TASK_ID}),run:async(q,...p)=>{query=q;params=p}};
  assert.deepEqual(await catalogRoute(db,admin,'/api/task-catalog',valid,'POST'),{ok:true});
  assert.match(query,/ON CONFLICT\(task_id\)/);
  assert.doesNotMatch(query,/\bUPDATE\s+(ledger|withdrawals|tasks)\b/i);
  assert.equal(params[0],TASK_ID);
  assert.equal(params[1],'transcription');
  assert.equal(params[2],'clip');
  assert.equal(params[3],16);
});
test('task catalog merges server-visible rows and tolerates nonmigrated database',async()=>{
  const state={tasks:[{id:TASK_ID,title:'Audio review',reward:250,status:'available'}]};
  const full=await catalogState({all:async()=>[{
    task_id:TASK_ID,category:'transcription',reward_unit:'clip',expected_minutes:16,
    skill_level:'intermediate',public_summary:'Public work summary'
  }]},state);
  assert.equal(full.catalogReady,true);
  assert.equal(full.tasks[0].category,'transcription');
  assert.equal(full.tasks[0].reward,250);
  assert.equal(full.tasks[0].public_summary,'Public work summary');
  const legacy=await catalogState({all:async()=>{const e=new Error('missing');e.code='42P01';throw e;}},state);
  assert.equal(legacy.catalogReady,false);
  assert.equal(legacy.tasks[0].category,'general');
  assert.equal(legacy.tasks[0].reward,250);
});
