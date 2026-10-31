import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const asset = name => readFileSync(new URL('../public/' + name, import.meta.url), 'utf8');

test('TaskHarbor V2 is linked and served on every public workspace page', () => {
 const style = asset('dashboard-v2.css');
 assert.match(style, /\.workspace-hero\s*\{/);
 assert.match(style, /#tasks \.task-listing/);
 assert.match(style, /@media\(max-width:720px\)/);
 for (const page of ['index.html', 'profile.html', 'payouts.html', 'contact.html']) {
   assert.match(asset(page), /href="\/dashboard-v2\.css"/, page);
 }
 for (const server of ['server-postgres.js', 'server.js']) {
   const src = readFileSync(new URL('../' + server, import.meta.url), 'utf8');
   assert.match(src, /'\/dashboard-v2\.css'\s*:\s*'dashboard-v2\.css'/, server);
 }
});

test('Dashboard preserves wallet IDs, actions and accessible task preview layout', () => {
 const html = asset('index.html');
 for (const id of ['balances','tasks','task-filter','submissions','withdrawals','transactions','withdrawBox','admin','currency','action-confirm']) {
   assert.match(html, new RegExp('id="' + id + '"'), id);
 }
 assert.match(html, /<section class="workspace-section" id="tasks-section"/);
 assert.match(html, /id="task-filter"/);
 const script = asset('app.js');
 assert.doesNotThrow(() => new vm.Script(script));
 assert.match(script, /<details class="task-disclosure">/);
 assert.match(script, /<div class="task-detail"><p class="task-detail-lead">/);
 assert.match(script, /button\('claim',t\.id,'Claim task'\)/);
 assert.match(script, /applyTaskFilter\(\)/);
});

test('Available tasks render as collapsible cards; claiming remains inside task details', async () => {
 const els = new Map();
 function el(){return {innerHTML:'',textContent:'',hidden:false,value:'',dataset:{},querySelector(){return el()},scrollIntoView(){},focus(){},setCustomValidity(){},reportValidity(){},addEventListener(){}}}
 const get=id=>{if(!els.has(id))els.set(id,el());return els.get(id)};
 const state={user:{id:'worker',email:'worker@example.test',role:'worker'},
   currencies:{USD:2},rates:[{currency:'USD',rate:1000000,updated_at:Date.now()}],
   wallet:{available:0,pending:0,earned:0,withdrawn:0},
   tasks:[{id:'t-1',title:'Research sample',description:'Read brief before claiming',provider:'manual',
    status:'available',reward:150,worker_id:null,steps:[],images:[],fields:[],messages:[],history:[]}],
   submissions:[],withdrawals:[],transactions:[]};
 const env=vm.createContext({
    document:{getElementById:get,querySelectorAll(){return []},createElement:el,addEventListener(){}},
    localStorage:{getItem(){return 'USD'},setItem(){}},location:{search:'',origin:'http://localhost',hash:''},
    URLSearchParams,Intl,Date,Number,String,Object,Array,Promise,setTimeout,
    fetch:async()=>({ok:true,json:async()=>state}),EventSource:class{addEventListener(){}close(){}},
    console
 });
 vm.runInContext(asset('app.js'),env);
 await new Promise(resolve=>setTimeout(resolve,15));
 const tasks=get('tasks').innerHTML;
 assert.match(tasks, /class="task-listing"/);
 assert.match(tasks, /<summary class="task-summary">/);
 assert.match(tasks, /Research sample/);
 assert.match(tasks, /\$1\.50/);
 assert.match(tasks, /<div class="task-detail"><p class="task-detail-lead">Read brief before claiming<\/p>/);
 assert.match(tasks, /data-action="claim"/);
 assert.match(get('balances').innerHTML, /wallet-card wallet-available/);
 assert.equal(get('notice').textContent,'');
});
