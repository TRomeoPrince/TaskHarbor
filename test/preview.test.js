import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {server} from '../preview/server.mjs';

test('public preview is isolated, role-gated and synthetic end-to-end',async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const get=async(path,cookie='')=>fetch(base+path,{headers:cookie?{Cookie:cookie}:{}});
  const post=async(path,data,cookie)=>fetch(base+path,{
    method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},
    body:JSON.stringify(data)
  });
  try{
    const first=await get('/api/state');
    assert.equal(first.status,200);
    assert.match(first.headers.get('x-robots-tag'),/noindex/);
    const cookie=first.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie?.startsWith('th_preview='));
    const initial=await first.json();
    assert.equal(initial.user.role,'worker');
    assert.equal(initial.wallet.available,510);
    assert.equal(initial.catalogReady,true);
    assert.ok(initial.tasks.some(t=>t.category==='ai'&&t.status==='available'));
    assert.ok(initial.tasks.every(t=>t.provider==='TaskHarbor PREVIEW'));
    assert.equal((await get('/api/admin-finances',cookie)).status,403);
    assert.equal((await post('/api/claim',{taskId:'demo-project-01'},cookie)).status,403,'Unqualified worker cannot claim the project');
    assert.equal((await get('/health')).status,200);
    assert.equal((await get('/preview/server.mjs',cookie)).status,404,'Never serve private server source');
    assert.equal((await get('/.env',cookie)).status,404);
    assert.equal((await get('/_preview/status.js',cookie)).status,200);
    assert.equal((await get('/_preview/status.css',cookie)).status,200);
    const progress=await (await get('/api/preview/status',cookie)).json();
    assert.ok(progress.milestones.length>=8);
    assert.equal(progress.data,'100% synthetic');
    const landing=await (await get('/dashboard',cookie)).text();
    assert.match(landing,/src="\/_preview\/toolbar.js"/);
    assert.match(landing,/href="\/theme.css"/);
    const page=await (await get('/status',cookie)).text();
    assert.match(page,/TaskHarbor build status/);

    const role=await get('/_preview/role?as=admin',cookie);
    assert.equal(role.status,200);
    const admin=await (await get('/api/state',cookie)).json();
    assert.equal(admin.user.role,'admin');
    assert.equal(admin.wallet.available,0,'Admin view must not see worker wallet as own');
    const finance=await (await get('/api/admin-finances',cookie)).json();
    assert.equal(finance.rows[0].email,'worker@example.test');
    assert.equal(finance.rows[0].requested,300);
    const granted=await post('/api/qualification/grant',{workerEmail:'worker@example.test',skill:'software',level:'intermediate'},cookie);
    assert.equal(granted.status,200);
    const paid=await post('/api/payout',{id:'demo-request-01',decision:'paid',reference:'PREVIEW-TEST'},cookie);
    assert.equal(paid.status,200);
    const after=await (await get('/api/state',cookie)).json();
    assert.equal(after.withdrawals.find(w=>w.id==='demo-request-01').status,'paid');
    assert.equal(after.wallet.available,0,'No actual finance credit');

    await get('/_preview/role?as=worker',cookie);
    const worker=await (await get('/api/state',cookie)).json();
    assert.equal(worker.user.role,'worker');
    assert.equal(worker.wallet.withdrawn,480);
    assert.equal(worker.tasks.find(t=>t.id==='demo-project-01').qualified,true);
    assert.equal((await post('/api/claim',{taskId:'demo-project-01'},cookie)).status,200);
    assert.equal((await post('/api/claim',{taskId:'demo-ai-01'},cookie)).status,200);
    assert.equal((await post('/api/submit',{taskId:'demo-ai-01',content:'Synthetic AI evaluation response'},cookie)).status,200);
    const updated=await (await get('/api/state',cookie)).json();
    assert.equal(updated.tasks.find(t=>t.id==='demo-ai-01').status,'submitted');
    assert.ok(updated.submissions.some(s=>s.task_id==='demo-ai-01'));
    assert.equal(updated.wallet.pending,260);

    // Quote/withdraw follows the same front-end interaction but never touches real payment rails.
    const quoteResponse=await post('/api/quote',{amount:'1.00',currency:'USD'},cookie);
    assert.equal(quoteResponse.status,200);
    const quote=await quoteResponse.json();
    assert.equal(quote.usd_cents,100);
    const demoWithdraw=await post('/api/withdraw',{quoteId:quote.id,destination:'sample-destination'},cookie);
    assert.equal(demoWithdraw.status,200);
    assert.equal((await (await get('/api/state',cookie)).json()).wallet.available,410);
    assert.equal((await post('/api/withdraw',{quoteId:quote.id,destination:'duplicate'},cookie)).status,400);

    const threadRequest=await post('/api/support',{subject:'Preview support question',content:'Synthetic help request'},cookie);
    assert.equal(threadRequest.status,200);
    const {threadId}=await threadRequest.json();
    assert.ok(threadId);
    const support=(await (await get('/api/support?threadId='+threadId,cookie)).json());
    assert.equal(support.messages.length,1);
    await get('/_preview/role?as=admin',cookie);
    assert.equal((await post('/api/support-message',{threadId,content:'Synthetic administrator answer'},cookie)).status,200);
    assert.equal((await post('/api/support-status',{threadId,status:'closed'},cookie)).status,200);
    await get('/_preview/role?as=worker',cookie);
    const answered=(await (await get('/api/support?threadId='+threadId,cookie)).json());
    assert.equal(answered.messages.length,2);
    assert.equal(answered.thread.status,'closed');
    assert.equal((await post('/api/member-contacts',{phone:'000-demo'},cookie)).status,200);
    assert.equal((await (await get('/api/contact',cookie)).json()).contacts.phone,'000-demo');

    const second=await get('/api/state');
    assert.notEqual(second.headers.get('set-cookie')?.split(';')[0],cookie);
    const other=await second.json();
    assert.equal(other.user.role,'worker');
    assert.equal(other.tasks.find(t=>t.id==='demo-ai-01').status,'available','Other visitors get isolated fixtures');
  } finally {
    server.closeAllConnections?.();
    await new Promise(resolve=>server.close(resolve));
  }
});
test('preview server contains no live database imports or secrets',()=>{
  const source=readFileSync(new URL('../preview/server.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/from ['"]\.\.\/(postgres|db-postgres|server-postgres|store-postgres)\.js/);
  assert.doesNotMatch(source,/process\.env\.DATABASE_URL/);
  assert.match(source,/SYNTHETIC EXAMPLE/);
});
