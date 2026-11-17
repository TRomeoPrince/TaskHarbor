import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore,claim,wallet} from '../store.js';
import {initialize,route,enrich} from '../features.js';
import {registerProfile,shortReferral} from '../community.js';

function fixture(){
 const db=openStore(':memory:');initialize(db);
 const admin={id:'admin',role:'admin'},worker={id:'worker',role:'worker'},other={id:'other',role:'worker'};
 for(const user of [admin,worker,other])db.prepare('INSERT INTO users(id,email,password_hash,role) VALUES(?,?,?,?)').run(user.id,user.id+'@test','x',user.role);
 const post=(user,path,body)=>route(db,user,'/api/'+path,body,{method:'POST'},{});
 return {db,admin,worker,other,post};
}

test('expired bot task: preserve work, credit original reward once, and unblock worker without false provider approval',()=>{
 const {db,admin,worker,other,post}=fixture();
 registerProfile(db,'other','referrer','');
 registerProfile(db,'worker','worker',shortReferral(db,'other'));
 post(admin,'tasks',{title:'CREATE GMAIL',description:'Account task',rewardAmount:'0.12',provider:'manual-telegram',steps:[{title:'Recovery',instruction:''},{title:'Birthday confirmation',instruction:''}]});
 const taskId=db.prepare('SELECT id FROM tasks').get().id;
 claim(db,taskId,worker.id);
 post(worker,'submit',{taskId,content:'Completed the initial account task and submitted evidence'});
 const before=wallet(db,worker.id);
 assert.equal(before.available,0);assert.equal(before.pending,12);
 assert.throws(()=>post(admin,'review',{id:db.prepare('SELECT id FROM submissions').get().id,decision:'approved',note:'Try'}),/follow-up/i);
 assert.throws(()=>post(worker,'compensate-provider-expired',{taskId,reason:'Source expired'}),/Admin access/);
 const result=post(admin,'compensate-provider-expired',{taskId,reason:'The bot source expired before the admin could obtain the follow-up requirements'});
 assert.equal(result.amount,12);
 const balance=wallet(db,worker.id);
 assert.equal(balance.available,12);assert.equal(balance.earned,12);assert.equal(balance.pending,0);assert.equal(balance.held,0);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM ledger WHERE task_id=?').get(taskId).n,1);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM ledger WHERE kind='referral'").get().n,0);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM referral_awards').get().n,0);
 assert.equal(db.prepare("SELECT status FROM tasks WHERE id=?").get(taskId).status,'rejected');
 assert.equal(db.prepare("SELECT status FROM submissions WHERE task_id=?").get(taskId).status,'rejected');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM task_steps WHERE task_id=? AND completed=0').get(taskId).n,2);
 const snapshot=enrich(db,worker,{tasks:db.prepare('SELECT * FROM tasks WHERE id=?').all(taskId),withdrawals:[]});
 assert.equal(snapshot.tasks[0].compensation.amount,12);
 assert.match(snapshot.tasks[0].compensation.reason,/bot source expired/i);
 assert.ok(snapshot.tasks[0].history.some(h=>h.action==='provider_expired_compensation'));
 assert.match(snapshot.tasks[0].messages.at(-1).content,/has NOT approved/i);
 assert.throws(()=>post(admin,'compensate-provider-expired',{taskId,reason:'Again'}),/closed or missing/i);
 assert.throws(()=>post(admin,'moderation',{taskId,decision:'approved',note:'Fake approval'}));
 post(admin,'tasks',{title:'Next independent task',description:'Other task',reward:150});
 const next=db.prepare("SELECT id FROM tasks WHERE title='Next independent task'").get().id;
 claim(db,next,worker.id);
 assert.equal(db.prepare('SELECT worker_id FROM tasks WHERE id=?').get(next).worker_id,worker.id);
 db.close();
});

test('compensation rejects non-Telegram tasks, unsubmitted tasks and tasks already in review hold',()=>{
 const {db,admin,worker,post}=fixture();
 post(admin,'tasks',{title:'Different provider',description:'Other',reward:700,provider:'vetella-faceatlas'});
 let id=db.prepare('SELECT id FROM tasks').get().id;
 claim(db,id,worker.id);
 assert.throws(()=>post(admin,'compensate-provider-expired',{taskId:id,reason:'No evidence'}),/closed or missing/i);
 post(worker,'submit',{taskId:id,content:'Video submission'});
 assert.throws(()=>post(admin,'compensate-provider-expired',{taskId:id,reason:'Not a Gmail task'}),/reserved for expired Telegram-source tasks/);
 assert.equal(wallet(db,worker.id).available,0);
 db.prepare("UPDATE tasks SET status='rejected' WHERE id=?").run(id);
 post(admin,'tasks',{title:'Gmail follow-up complete',description:'Gmail',reward:12,provider:'manual-telegram'});
 id=db.prepare("SELECT id FROM tasks WHERE title='Gmail follow-up complete'").get().id;
 claim(db,id,worker.id);post(worker,'submit',{taskId:id,content:'Proof'});
 const submissionId=db.prepare('SELECT id FROM submissions WHERE task_id=?').get(id).id;
 post(admin,'review',{id:submissionId,decision:'approved',note:'Start standard hold'});
 assert.throws(()=>post(admin,'compensate-provider-expired',{taskId:id,reason:'Do not bypass hold'}),/not eligible/);
 assert.equal(wallet(db,worker.id).available,0);
 assert.equal(wallet(db,worker.id).held,12);
 db.close();
});
