import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const backend=readFileSync(new URL('../server-postgres.js',import.meta.url),'utf8');

test('release serves the new support UI with the shared site header',()=>{
 const html=source('contact.html');
 assert.match(html,/class="site-header"/);
 assert.match(html,/aria-current="page">Support/);
 assert.match(html,/href="\/contact-v3\.css"/);
 assert.match(html,/id="directory"/);
 assert.match(html,/id="support-compose"/);
 assert.match(html,/id="notification-settings" hidden/);
 assert.doesNotMatch(html,/<header><a/);
 for(const server of ['server-postgres.js','server.js']){
  const file=readFileSync(new URL('../'+server,import.meta.url),'utf8');
  assert.match(file,/'\/contact-v3\.css'\s*:\s*'contact-v3\.css'/);
 }
 assert.match(source('contact-v3.css'),/\.support-grid\s*\{/);
 assert.match(source('contact-v3.css'),/@media\(max-width:630px\)/);
});
test('production cookies support apex and www without expanding preview host scope',()=>{
 assert.match(backend,/SameSite=Lax/);
 assert.match(backend,/requestHost === 'taskharbor\.cc\.cd'/);
 assert.match(backend,/requestHost === 'www\.taskharbor\.cc\.cd'/);
 assert.match(backend,/Domain=taskharbor\.cc\.cd/);
 assert.match(backend,/cookieTokens =/);
 assert.match(backend,/for \(const candidate of cookieTokens\)/);
 assert.match(backend,/WHERE token=\? AND user_id=\?/);
});
test('admin dashboard uses operational data rather than member wallet panels',()=>{
 const html=source('index.html'),js=source('app.js');
 for(const id of ['admin-overview','admin-task-count','admin-review-count','admin-withdrawal-count','workspace-hero-title','tasks-section']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(js,/\$\('admin-overview'\)\.hidden=!admin/);
 assert.match(js,/for\(const id of \['balances'\]\)\$\(id\)\.hidden=admin/);
 assert.match(js,/\$\('referral-box'\)\.hidden=admin/);
 assert.match(js,/credentials:'same-origin'/);
});
async function runContact(role,options={}){
 const els=new Map();
 function element(){
  return {innerHTML:'',textContent:'',hidden:false,checked:false,disabled:false,value:'',
    elements:{phone:{value:''},email:{checked:false,disabled:false},push:{checked:false,disabled:false}},
    replaceChildren(){},append(){},focus(){},reset(){},addEventListener(){},
    querySelector(){return element()},closest(){return null},dataset:{}};
 }
 const get=id=>{if(!els.has(id))els.set(id,element());return els.get(id)};
 const payload={user:{id:'example',email:'member@example.test',role},contacts:{phone:''},
   prefs:{email_enabled:false,push_enabled:false},threads:[],members:[],
   config:{emailReady:!!options.ready,pushReady:!!options.ready,
     supportEmail:'support@example.test',supportTelegram:'',publicKey:''}};
 const ctx=vm.createContext({
   document:{getElementById:get,createElement:element},
   fetch:async path=>({ok:true,json:async()=>path.includes('/api/notifications')?{notifications:[]}:payload}),
   navigator:{},window:{},location:{search:''},URLSearchParams,
   FormData:class{},Uint8Array,Math,Promise,setTimeout,Date,console,history:{replaceState(){}}
 });
 vm.runInContext(source('contact.js'),ctx);
 for(let i=0;i<25;i++)await Promise.resolve();
 return get;
}
test('member gets a real support inbox but no unavailable delivery toggles',async()=>{
 const get=await runContact('worker');
 assert.equal(get('content').hidden,false);
 assert.equal(get('user-contact').hidden,false);
 assert.equal(get('support-compose').hidden,false);
 assert.equal(get('directory').hidden,true);
 assert.equal(get('notification-settings').hidden,true);
 assert.match(get('threads').innerHTML,/No conversations yet/);
 assert.match(get('alerts').innerHTML,/No new activity/);
});
test('admin gets member support and private directory, not member contact entry',async()=>{
 const get=await runContact('admin',{ready:true});
 assert.equal(get('content').hidden,false);
 assert.equal(get('support-compose').hidden,true);
 assert.equal(get('user-contact').hidden,true);
 assert.equal(get('directory').hidden,false);
 assert.equal(get('notification-settings').hidden,true);
 assert.match(get('support-heading').textContent,/Support center/);
 assert.match(get('threads').innerHTML,/No support requests yet/);
});
