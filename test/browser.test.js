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
