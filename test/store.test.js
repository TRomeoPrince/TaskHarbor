import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore,atomic,claim,entry,wallet} from '../store.js';
import {initialize,route} from '../features.js';
test('claims are exclusive; wallet reservation and rollback preserve money',()=>{
 const db=openStore(':memory:');
 for(const id of ['a','b'])db.prepare('INSERT INTO users(id,email,password_hash,role) VALUES(?,?,?,?)').run(id,id+'@test','x','worker');
 db.prepare('INSERT INTO tasks(id,title,description,reward) VALUES(?,?,?,?)').run('t','Task','Do work',500);
 claim(db,'t','a');assert.throws(()=>claim(db,'t','b'));assert.equal(db.prepare('SELECT worker_id FROM tasks').get().worker_id,'a');
 db.prepare('INSERT INTO tasks(id,title,description,reward) VALUES(?,?,?,?)').run('other','Other','Work',100);
 claim(db,'other','a');
 atomic(db,()=>entry(db,'a','earning',500,'t'));assert.equal(wallet(db,'a').available,500);
 assert.throws(()=>atomic(db,()=>entry(db,'a','earning',500,'t')));assert.equal(wallet(db,'a').available,500);
 db.prepare('INSERT INTO withdrawals(id,user_id,amount,destination) VALUES(?,?,?,?)').run('w','a',300,'test');
 atomic(db,()=>entry(db,'a','withdrawal_reserve',-300,null,'w'));assert.equal(wallet(db,'a').available,200);
 atomic(db,()=>entry(db,'a','refund',300,null,'w'));assert.equal(wallet(db,'a').available,500);assert.throws(()=>entry(db,'a','refund',300,null,'w'));
 assert.throws(()=>atomic(db,()=>{entry(db,'b','earning',100);throw Error('rollback');}));assert.equal(wallet(db,'b').available,0);db.close();
});

test('one worker can claim multiple tasks before and after submitting, with exclusive ownership',()=>{
 const db=openStore(':memory:');initialize(db);
 try{
  for(const id of ['worker','other'])db.prepare('INSERT INTO users(id,email,password_hash,role) VALUES(?,?,?,?)').run(id,id+'@test','x','worker');
  for(const id of ['A','B','C'])db.prepare('INSERT INTO tasks(id,title,description,reward) VALUES(?,?,?,?)').run(id,id,'Instructions',100);
  claim(db,'A','worker');
  claim(db,'B','worker');
  assert.deepEqual(db.prepare("SELECT id FROM tasks WHERE worker_id='worker' AND status='claimed' ORDER BY id").all().map(t=>t.id),['A','B']);
  assert.deepEqual(route(db,{id:'worker',role:'worker'},'/api/submit',{taskId:'A',content:'Evidence'},{method:'POST'},{}),{ok:true});
  claim(db,'C','worker');
  assert.equal(db.prepare("SELECT status FROM tasks WHERE id='A'").get().status,'submitted');
  for(const id of ['A','B','C']){
   assert.throws(()=>claim(db,id,'other'),/Task is no longer available/);
   assert.throws(()=>claim(db,id,'worker'),/Task is no longer available/);
   assert.equal(db.prepare('SELECT worker_id FROM tasks WHERE id=?').get(id).worker_id,'worker');
   assert.equal(db.prepare('SELECT worker_id FROM leases WHERE task_id=?').get(id).worker_id,'worker');
  }
 }finally{db.close();}
});
