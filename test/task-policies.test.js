import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore,claim,expireClaims} from '../store.js';
import {initialize,route,enrich} from '../features.js';
import {quickTask} from '../quick-task.js';

function setup(){
 const db=openStore(':memory:');initialize(db);
 const users=[{id:'admin',role:'admin'},{id:'member',role:'worker'},{id:'other',role:'worker'}];
 for(const u of users)db.prepare('INSERT INTO users(id,email,password_hash,role) VALUES(?,?,?,?)').run(u.id,u.id+'@test','hash',u.role);
 const post=(user,path,body)=>route(db,user,'/api/'+path,body,{method:'POST'},{});
 const state=user=>enrich(db,user,{tasks:db.prepare("SELECT * FROM tasks WHERE status='available' OR worker_id=? OR ?='admin'").all(user.id,user.role),withdrawals:[]});
 return {db,users,post,state};
}

test('Gmail on-demand slot waits for an administrator and starts its timer upon private release',()=>{
 const {db,users,post,state}=setup();
 const [admin,member,other]=users;
 const task=quickTask({onDemand:'1',workMinutes:'60'});
 assert.equal(task.fields.length,0);assert.equal(task.policy.startMode,'admin_details');
 post(admin,'tasks',task);
 const id=db.prepare('SELECT id FROM tasks').get().id;
 assert.match(state(other).tasks[0].description,/Claim the task first/);
 claim(db,id,member.id);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM leases WHERE task_id=?').get(id).n,0);
 assert.equal(state(member).tasks[0].fields.length,0);
 assert.throws(()=>post(member,'submit',{taskId:id,content:'Submitted before details'}),/Wait for the admin/);
 assert.throws(()=>post(member,'supply-gmail-details',{taskId:id,firstName:'Test'}),/Admin access/);
 const before=Date.now();
 post(admin,'supply-gmail-details',{taskId:id,firstName:'Example',lastName:'',email:'example@gmail.com',password:'SyntheticTestPassword',minutes:90});
 const release=state(member).tasks[0];
 assert.equal(release.fields.find(f=>f.label==='First name').value,'Example');
 assert.equal(release.fields.find(f=>f.label==='Date of birth').value,'19 May 2000');
 assert.equal(release.fields.find(f=>f.label==='Gmail address (Username)').value,'example@gmail.com');
 assert.ok(release.claim_expires>=before+90*60000);
 assert.equal(state(other).tasks.length,0);
 assert.throws(()=>post(admin,'supply-gmail-details',{taskId:id,firstName:'Try again',email:'example@gmail.com',password:'A'}),/not awaiting/);
 assert.equal(expireClaims(db,before+100*60000),0,'private account-creation tasks must not automatically recycle after release');
 assert.equal(db.prepare('SELECT worker_id FROM tasks WHERE id=?').get(id).worker_id,member.id);
 db.close();
});

test('custom claims, no-lease tasks, and fixed deadlines behave independently',()=>{
 const {db,users,post,state}=setup();
 const [admin,member]=users;
 post(admin,'tasks',{title:'Short',description:'Short work',reward:100,policy:{claimMinutes:2,startMode:'on_claim'}});
 const first=db.prepare("SELECT id FROM tasks WHERE title='Short'").get().id;
 claim(db,first,member.id);
 assert.equal(expireClaims(db,Date.now()+3*60000),1);
 assert.equal(db.prepare('SELECT status FROM tasks WHERE id=?').get(first).status,'available');
 post(admin,'tasks',{title:'Long project',description:'Complete by due date',reward:700,policy:{claimMinutes:null,deadlineAt:new Date(Date.now()+12*86400000).toISOString(),publicDescription:true}});
 const second=db.prepare("SELECT id FROM tasks WHERE title='Long project'").get().id;
 assert.match(state(member).tasks.find(t=>t.id===second).description,/Complete by due date/);
 claim(db,second,member.id);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM leases WHERE task_id=?').get(second).n,0);
 db.prepare('UPDATE task_policies SET deadline_at=? WHERE task_id=?').run(Date.now()-1,second);
 assert.throws(()=>post(member,'submit',{taskId:second,content:'Too late'}),/deadline has passed/);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM submissions WHERE task_id=?').get(second).n,0);
 db.close();
});
