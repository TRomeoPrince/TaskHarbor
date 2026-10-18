import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
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
 vm.runInContext('state.wallet.available=0;render();',context);assert.match(get('withdraw-error').textContent,/No available balance/);
});
