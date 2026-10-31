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

test('dashboard is a real route, and all member pages link to it',()=>{
 const pg=readFileSync(new URL('../server-postgres.js',import.meta.url),'utf8');
 const legacy=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 for(const content of [pg,legacy]){
  assert.match(content,/'\/dashboard'\s*:\s*'index.html'/);
  assert.match(content,/'\/dashboard\/'\s*:\s*'index.html'/);
 }
 for(const page of ['index.html','profile.html','payouts.html','contact.html']){
  const html=source(page);
  assert.match(html,/href="\/dashboard"/,page);
  assert.doesNotMatch(html,/href="\/"[^>]*>Dashboard/,page);
 }
});
test('signed-in page normalizes stale sign-in hash to /dashboard without logging out',async()=>{
 const elements=new Map();
 function element(){return {innerHTML:'',textContent:'',value:'',dataset:{},hidden:false,disabled:false,
  prepend(){},querySelector(){return element()},addEventListener(){},scrollIntoView(){},
  focus(){},setCustomValidity(){},reportValidity(){},toggleAttribute(){},setAttribute(){}};}
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
 const location={pathname:'/',search:'',hash:'#sign-in',origin:'https://www.taskharbor.cc.cd'};
 let replacements=[],getState=0,posts=0;
 const data={user:{id:'worker',email:'test@example.test',role:'worker'},currencies:{USD:2},rates:[{currency:'USD',rate:1000000,updated_at:Date.now()}],
  wallet:{available:0,pending:0,earned:0,withdrawn:0},tasks:[],submissions:[],withdrawals:[],transactions:[]};
 const ctx=vm.createContext({
  document:{getElementById:get,createElement:element,addEventListener(){},querySelectorAll(){return[]},querySelector(){return element()}},
  history:{replaceState(a,b,path){replacements.push(path);location.pathname=path.split('?')[0];location.hash='';}},
  location,localStorage:{getItem(){return 'USD'},setItem(){}},
  fetch:async(url,opts)=>{if(url.includes('/api/login'))posts++;else if(url.includes('/api/state'))getState++;return {ok:true,json:async()=>url.includes('/api/login')?{ok:true}:data};},
  EventSource:class{addEventListener(){}close(){}},URLSearchParams,Intl,Date,Number,String,Object,Array,Promise,setTimeout,console,
  addEventListener(){}
 });
 vm.runInContext(source('app.js'),ctx);
 for(let i=0;i<25;i++)await Promise.resolve();
 assert.equal(get('workspace').hidden,false);
 assert.ok(replacements.includes('/dashboard'));
 assert.equal(posts,0,'existing session must not need to log in again');
 assert.ok(getState>=1);
 assert.equal(location.pathname,'/dashboard');
 assert.equal(location.hash,'');
});
