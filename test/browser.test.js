import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {referralPolicy} from '../community.js';
test('dashboard still renders and connects live updates with an older server response',async()=>{
 const elements=new Map();
 function element(){return {innerHTML:'',textContent:'',hidden:false,value:'',dataset:{},prepend(){},querySelector(){return element();},scrollIntoView(){},focus(){},setCustomValidity(message){this.validationMessage=message;},reportValidity(){}};}
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
 let connected=0;
 const oldState={user:{id:'worker',email:'worker@test',role:'worker'},currencies:{USD:2,UGX:0},rates:[{currency:'USD',rate:1000000,updated_at:Date.now()}],wallet:{available:500,pending:0,earned:500,withdrawn:0},tasks:[],submissions:[],withdrawals:[],transactions:[]};
 const context=vm.createContext({document:{getElementById:get,createElement:element,addEventListener(){}},localStorage:{getItem(){return 'USD';},setItem(){}},location:{search:'',origin:'http://localhost'},URLSearchParams,Intl,Date,Number,String,Object,Array,Promise,setTimeout,fetch:async()=>({ok:true,json:async()=>oldState}),EventSource:class {constructor(){connected++;}addEventListener(){}close(){}},console});
 vm.runInContext(readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),context);
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(get('notice').textContent,'');assert.match(get('balances').innerHTML,/5\.00/);assert.match(get('exchange-status').textContent,/Restart the app server/);assert.equal(connected,1);assert.equal(get('workspace').hidden,false);
 assert.equal(get('withdraw-amount').max,'5');get('withdraw-amount').value='6';get('withdraw-amount').oninput();assert.match(get('withdraw-error').textContent,/exceeds/);
 get('withdraw-amount').value='5';get('withdraw-amount').oninput();assert.equal(get('withdraw-error').textContent,'');
 vm.runInContext("state.wallet.available=12;state.rates.push({currency:'UGX',rate:3987294500,updated_at:Date.now()});currency='UGX';render();",context);
 assert.equal(get('withdraw-amount').max,'478');get('withdraw-amount').value='1000';get('withdraw-amount').oninput();assert.match(get('withdraw-error').textContent,/Maximum: 478 UGX/);
 context.currentReferralPolicy=referralPolicy;
 vm.runInContext("state.profile={short_code:'example',display_name:'member'};state.referrals={policy:currentReferralPolicy,count:0,totalMicros:0,carryMicros:0};render();",context);
 assert.match(get('referral-info').textContent,/USD 0\.01 per approved email task/);
 assert.match(get('referral-info').textContent,/including after their first 30 days/);
 assert.match(get('referral-info').textContent,/72-hour hold and final moderation approval/);
 assert.doesNotMatch(get('referral-info').textContent,/Google|UGX 300|UGX 20/);
 vm.runInContext('state.wallet.available=0;render();',context);assert.match(get('withdraw-error').textContent,/No available balance/);
});

test('guest welcome, separate auth modes and referral code survive navigation',async()=>{
 const elements=new Map();
 const get=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',hidden:false,value:'',dataset:{},prepend(){},focus(){},querySelector(){return {}}});return elements.get(id);};
 let onHashChange;
 const context=vm.createContext({document:{getElementById:get,createElement(){return {querySelector(){return {}}};},addEventListener(){}},localStorage:{getItem(){return null;}},location:{search:'?ref=keep-this-code',hash:''},URLSearchParams,Intl,Date,Number,String,Object,Array,Promise,setTimeout,addEventListener(type,fn){if(type==='hashchange')onHashChange=fn;},fetch:async()=>({ok:false,json:async()=>({error:'Please log in'})}),console});
 vm.runInContext(readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),context);
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(get('landing').hidden,false);assert.equal(get('auth').hidden,true);assert.equal(get('workspace').hidden,true);
 context.location.hash='#sign-up';onHashChange();
 assert.equal(get('landing').hidden,true);assert.equal(get('auth').hidden,false);
 assert.equal(get('register').hidden,false);assert.equal(get('sign-in-submit').hidden,true);
 assert.equal(get('signup-referral').value,'keep-this-code');assert.equal(get('signup-referral').disabled,false);
 assert.equal(get('auth-password').autocomplete,'new-password');
 context.location.hash='#sign-in';onHashChange();
 assert.equal(get('register').hidden,true);assert.equal(get('sign-in-submit').hidden,false);
 assert.equal(get('signup-username').disabled,true);assert.equal(get('signup-referral').disabled,true);
 assert.equal(get('auth-password').autocomplete,'current-password');
 context.location.hash='';onHashChange();assert.equal(get('landing').hidden,false);assert.equal(get('auth').hidden,true);
});

test('compact task browsing preserves navigation, private instructions and review actions',async()=>{
 const elements=new Map(),listeners=new Map();let modals=0;
 function element(){return {innerHTML:'',textContent:'',hidden:false,value:'',dataset:{},prepend(){},querySelector(){return element();},addEventListener(){},scrollIntoView(){},focus(){},setCustomValidity(){},showModal(){this.open=true;modals++;},close(){this.open=false;}};}
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
 const task={id:'gmail-1',title:'CREATE GMAIL',provider:'manual-telegram',description:'Private account instructions',reward:12,status:'claimed',worker_id:'worker',steps:[],fields:[{label:'Supplied password',value:'synthetic-private-value',copy:true}],images:[{id:'synthetic-image',kind:'instruction'}],messages:[],history:[]};
 const second={...task,id:'ai-1',title:'TRAINING AI MODULES',provider:'vetella-faceatlas',description:'A public AI project description.\n\nPAYMENT: Approval required.',reward:700,status:'available',worker_id:null,policy:{public_description:1},fields:[],images:[]};
 const fixture={user:{id:'worker',email:'worker@test',role:'worker'},currencies:{USD:2},rates:[{currency:'USD',rate:1000000,updated_at:Date.now()}],wallet:{available:24,pending:0,earned:24,withdrawn:0},tasks:[task,second],submissions:[],withdrawals:[],transactions:[]};
 const context=vm.createContext({document:{getElementById:get,createElement:element,querySelectorAll(){return [];},addEventListener(){},activeElement:element()},localStorage:{getItem(){return 'USD';},setItem(){}},location:{search:'',hash:'#tasks',origin:'http://localhost'},URLSearchParams,Intl,Date,Number,String,Object,Array,Promise,setTimeout,addEventListener(type,fn){listeners.set(type,fn);},fetch:async()=>({ok:true,json:async()=>fixture}),EventSource:class {addEventListener(){}close(){}},console});
 vm.runInContext(readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),context);await new Promise(r=>setTimeout(r,10));
 assert.match(get('tasks').innerHTML,/CREATE GMAIL/);assert.match(get('tasks').innerHTML,/TRAINING AI MODULES/);assert.match(get('tasks').innerHTML,/7\.00/);
 assert.doesNotMatch(get('tasks').innerHTML,/synthetic-private-value|synthetic-image|data-action="claim"/);
 assert.equal(get('view-tasks').hidden,false);assert.equal(get('admin').hidden,true);assert.equal(get('view-wallet').hidden,true);
 context.location.hash='#task/gmail-1';listeners.get('hashchange')();
 assert.equal(get('task-detail').hidden,false);assert.equal(get('view-tasks').hidden,true);assert.match(get('task-detail').innerHTML,/synthetic-private-value/);assert.match(get('task-detail').innerHTML,/data-action="submit"/);
 context.location.hash='#my-work';listeners.get('hashchange')();assert.equal(get('view-tasks').hidden,false);assert.equal(get('task-detail').hidden,true);assert.doesNotMatch(get('tasks').innerHTML,/TRAINING AI MODULES/);
 context.location.hash='#task/ai-1';listeners.get('hashchange')();assert.match(get('task-detail').innerHTML,/Overview/);assert.match(get('task-detail').innerHTML,/Read full requirements/);assert.match(get('task-detail').innerHTML,/Claim this task/);
 assert.match(get('task-detail').innerHTML,/#my-work/);
 context.location.hash='#tasks';listeners.get('hashchange')();assert.match(get('tasks').innerHTML,/TRAINING AI MODULES/);
 get('task-search').oninput({target:{value:'training'}});assert.doesNotMatch(get('tasks').innerHTML,/CREATE GMAIL/);assert.match(get('tasks').innerHTML,/TRAINING AI MODULES/);
 vm.runInContext("openAction('submit','gmail-1','');",context);assert.equal(modals,1);
 context.location.hash='#wallet';listeners.get('hashchange')();assert.equal(get('view-wallet').hidden,false);assert.equal(get('view-tasks').hidden,true);assert.equal(vm.runInContext('pendingAction',context),null);
 // Refreshes update the selected task without changing the route or an in-progress form.
 vm.runInContext("state.user.role='admin';state.submissions=[{id:'submission-1',task_id:'gmail-1',status:'pending',content:'synthetic proof'}];state.tasks[0].status='submitted';render();",context);
 context.location.hash='#submissions';listeners.get('hashchange')();assert.match(get('submissions').innerHTML,/Review submission/);assert.doesNotMatch(get('submissions').innerHTML,/synthetic proof/);
 context.location.hash='#task/gmail-1';listeners.get('hashchange')();assert.match(get('task-detail').innerHTML,/synthetic proof/);assert.match(get('task-detail').innerHTML,/Start 3-day hold/);assert.match(get('task-detail').innerHTML,/Compensate: expired at source/);
 vm.runInContext("openAction('correction','gmail-1','');",context);get('action-value').value='Keep this draft';vm.runInContext('render();',context);assert.equal(get('action-value').value,'Keep this draft');assert.notEqual(vm.runInContext('pendingAction',context),null);
 context.location.hash='#create';listeners.get('hashchange')();assert.equal(get('admin').hidden,false);assert.equal(get('view-submissions').hidden,true);
});
