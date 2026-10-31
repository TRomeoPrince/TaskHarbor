import test from 'node:test';
import assert from 'node:assert/strict';
test('HTTP authentication, origin checks, live admin notifications and submissions',async()=>{
 process.env.NO_LISTEN='1';process.env.DB_PATH=':memory:';process.env.ADMIN_PASSWORD='IntegrationTestOnly123';
 const {server,db}=await import('../server.js');
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const base='http://127.0.0.1:'+server.address().port;
 for(const page of ['/payouts','/payouts/','/profile','/profile/']){const response=await fetch(base+page);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/);}
 let reader;
 try{
 async function post(path,data,cookie=''){const r=await fetch(base+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,Origin:base},body:JSON.stringify(data)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const admin=await post('login',{email:'admin@local.test',password:'IntegrationTestOnly123'});assert.equal(admin.status,200);
 const referrer=await post('register',{email:'referrer@test.local',password:'ReferrerPassword123'});assert.equal(referrer.status,200);
 const referrerState=()=>fetch(base+'/api/state',{headers:{Cookie:referrer.cookie}}).then(r=>r.json());
 const referralCode=(await referrerState()).profile.short_code;
 const worker=await post('register',{email:'worker@test.local',password:'WorkerPassword123',referralCode});assert.equal(worker.status,200);
 // Navigation must never destroy or replace a valid session cookie.
 assert.deepEqual(await (await fetch(base+'/api/session')).json(),{user:null});
 for(const page of ['/','/dashboard','/dashboard/','/login','/signup','/profile','/payouts','/dashboard']){
  const response=await fetch(base+page,{headers:{Cookie:worker.cookie}});
  assert.equal(response.status,200,page);assert.equal(response.headers.get('set-cookie'),null);
  const session=await (await fetch(base+'/api/session',{headers:{Cookie:worker.cookie}})).json();
  assert.equal(session.user.role,'worker');assert.equal(session.user.email,'worker@test.local');
  assert.equal((await fetch(base+'/api/state',{headers:{Cookie:worker.cookie}})).status,200);
 }
 const stream=await fetch(base+'/api/events',{headers:{Cookie:admin.cookie}});assert.match(stream.headers.get('content-type'),/text\/event-stream/);reader=stream.body.getReader();assert.match(new TextDecoder().decode((await reader.read()).value),/event: change/);
 const event=reader.read();
 const created=await post('tasks',{title:'HTTP test',description:'Instructions',rewardAmount:'2.50',provider:'manual-telegram',externalId:'referral-http-test'},admin.cookie);assert.equal(created.status,200);
 const change=await Promise.race([event,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Live notification timed out')),3000);timer.unref();})]);assert.match(new TextDecoder().decode(change.value),/event: change/);
 const state=await (await fetch(base+'/api/state',{headers:{Cookie:worker.cookie}})).json();assert.equal(state.tasks[0].reward,250);const id=state.tasks[0].id;
 assert.equal((await post('claim',{taskId:id},worker.cookie)).status,200);
 assert.equal((await post('submit',{taskId:id,content:'Evidence'},worker.cookie)).status,200);
 const reviewed=await (await fetch(base+'/api/state',{headers:{Cookie:admin.cookie}})).json();assert.equal(reviewed.submissions[0].content,'Evidence');
 assert.equal((await post('review',{id:reviewed.submissions[0].id,decision:'approved',note:'Checked'},admin.cookie)).status,200);
 assert.equal((await referrerState()).wallet.available,0);
 assert.equal((await post('moderation',{taskId:id,decision:'approved',note:'Too early'},admin.cookie)).status,400);
 assert.equal((await referrerState()).wallet.available,0);
 db.prepare('UPDATE moderation SET hold_until=0 WHERE task_id=?').run(id);assert.equal((await post('moderation',{taskId:id,decision:'approved',note:'Upstream approved'},admin.cookie)).status,200);
 assert.equal((await referrerState()).wallet.available,1);
 assert.notEqual((await post('moderation',{taskId:id,decision:'approved',note:'Duplicate'},admin.cookie)).status,200);
 assert.equal((await referrerState()).wallet.available,1);
 const paid=await (await fetch(base+'/api/state',{headers:{Cookie:worker.cookie}})).json();assert.equal(paid.wallet.available,250);
 const blocked=await fetch(base+'/api/claim',{method:'POST',headers:{Origin:'https://untrusted.example',Cookie:worker.cookie,'Content-Type':'application/json'},body:JSON.stringify({taskId:id})});assert.equal(blocked.status,403);
 assert.equal((await fetch(base+'/api/state')).status,401);
 }finally{await reader?.cancel();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();}
});
