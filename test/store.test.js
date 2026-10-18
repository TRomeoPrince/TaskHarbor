import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore,atomic,claim,entry,wallet} from '../store.js';
test('claims are exclusive; wallet reservation and rollback preserve money',()=>{
 const db=openStore(':memory:');
 for(const id of ['a','b'])db.prepare('INSERT INTO users(id,email,password_hash,role) VALUES(?,?,?,?)').run(id,id+'@test','x','worker');
 db.prepare('INSERT INTO tasks(id,title,description,reward) VALUES(?,?,?,?)').run('t','Task','Do work',500);
 claim(db,'t','a');assert.throws(()=>claim(db,'t','b'));assert.equal(db.prepare('SELECT worker_id FROM tasks').get().worker_id,'a');
 db.prepare('INSERT INTO tasks(id,title,description,reward) VALUES(?,?,?,?)').run('other','Other','Work',100);
 assert.throws(()=>claim(db,'other','a'),/active task/);assert.equal(db.prepare("SELECT status FROM tasks WHERE id='other'").get().status,'available');
 db.prepare("UPDATE tasks SET status='submitted' WHERE id='t'").run();assert.throws(()=>claim(db,'other','a'),/active task/);
 db.prepare("UPDATE tasks SET status='approved' WHERE id='t'").run();claim(db,'other','a');
 atomic(db,()=>entry(db,'a','earning',500,'t'));assert.equal(wallet(db,'a').available,500);
 assert.throws(()=>atomic(db,()=>entry(db,'a','earning',500,'t')));assert.equal(wallet(db,'a').available,500);
 db.prepare('INSERT INTO withdrawals(id,user_id,amount,destination) VALUES(?,?,?,?)').run('w','a',300,'test');
 atomic(db,()=>entry(db,'a','withdrawal_reserve',-300,null,'w'));assert.equal(wallet(db,'a').available,200);
 atomic(db,()=>entry(db,'a','refund',300,null,'w'));assert.equal(wallet(db,'a').available,500);assert.throws(()=>entry(db,'a','refund',300,null,'w'));
 assert.throws(()=>atomic(db,()=>{entry(db,'b','earning',100);throw Error('rollback');}));assert.equal(wallet(db,'b').available,0);db.close();
});
