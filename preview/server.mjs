/* Safe public TaskHarbor preview: synthetic fixtures, no database or payment rails. */
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PUBLIC=fileURLToPath(new URL('../public/',import.meta.url));
const PREVIEW=fileURLToPath(new URL('./',import.meta.url));
const PAGES={'/':'index.html','/dashboard':'index.html','/payouts':'payouts.html','/profile':'profile.html','/contact':'contact.html'};
const ASSETS=new Set(['app.js','style.css','dashboard-v2.css','marketplace.css','marketplace.js',
 'workspaces.css','workspaces.js','theme.css','theme.js','admin-finances.css','admin-finances.js',
 'profile.js','payouts.js','contact.js','contact-v3.css','clipboard.js','preview.png','notifications-sw.js']);
const MIME={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png'};
const sessions=new Map(), streams=new Set();
const TODAY=Date.now();
const SAMPLE_POLICY={start_mode:'on_claim',claim_minutes:30};
const task=(id,title,status,reward,category,extras={})=>({
 id,title,status,reward,category,provider:'TaskHarbor PREVIEW',
 description:'SYNTHETIC EXAMPLE — do not submit personal information. No real opening or payment exists.',
 reward_unit: category==='transcription'?'clip':category==='annotation'?'item':category==='project'?'milestone':'task',
 expected_minutes:category==='project'?180:20,skill_level:'beginner',
 public_summary:'Demonstration '+category+' assignment. This is not real paid work.',
 worker_id:status==='available'?null:'preview-worker',policy:SAMPLE_POLICY,
 steps:[],fields:[],images:[],history:[],messages:[],correction:null,moderation:null,compensation:null,
 created_at:Date.now(),...extras
});
function fresh(){
 return {id:randomUUID(),role:'worker',last:Date.now(),createdTasks:0,
  tasks:[
   task('demo-ai-01','Evaluate two sample AI responses','available',150,'ai'),
   task('demo-transcript-01','Transcribe a sample recording','available',280,'transcription'),
   task('demo-annotation-01','Label elements in a sample image','available',125,'annotation'),
   task('demo-project-01','Website accessibility milestone','available',900,'project'),
   task('demo-micro-01','Review a product description','available',50,'microtask'),
   task('demo-survey-01','Practice survey screening','available',65,'survey'),
   task('demo-transcript-02','Continue your transcription','claimed',240,'transcription',{claim_expires:Date.now()+1800000}),
   task('demo-annotation-02','Submitted sample annotation','submitted',110,'annotation'),
   task('demo-micro-02','Previously accepted task','approved',90,'microtask')
  ],
  submissions:[{id:'demo-submission-01',task_id:'demo-annotation-02',worker_id:'preview-worker',
    status:'pending',content:'Synthetic example evidence',review_note:''}],
  withdrawals:[{id:'demo-request-01',user_id:'preview-worker',email:'worker@example.test',
      status:'requested',amount:300,destination:'07xxxxxx882',reference:'',settlement:'USD',created_at:new Date().toISOString()},
    {id:'demo-paid-01',user_id:'preview-worker',email:'worker@example.test',
      status:'paid',amount:180,destination:'07xxxxxx882',reference:'DEMO-PAID',settlement:'USD',created_at:new Date().toISOString()}],
  wallet:{available:510,pending:110,held:0,earned:990,withdrawn:180},messages:[],
  profile:{preferred_currency:'USD',username:'previewworker'},
  referrals:{count:0,totalMicros:0,carryMicros:0,policy:{firstMicros:10000,laterMicros:10000}}
 };
}
function session(req,res){
 const cookie=String(req.headers.cookie||'');
 const token=cookie.match(/(?:^|;\s*)th_preview=([0-9a-f-]{36})(?:;|$)/)?.[1];
 let s=token&&sessions.get(token);
 if(!s){
  if(sessions.size>=150){
   for(const [key,value] of sessions)if(Date.now()-value.last>7200000)sessions.delete(key);
   if(sessions.size>=150)sessions.delete(sessions.keys().next().value);
  }
  s=fresh();sessions.set(s.id,s);
  res.setHeader('Set-Cookie','th_preview='+s.id+'; HttpOnly; SameSite=Lax; Path=/; Max-Age=7200');
 }
 s.last=Date.now();return s;
}
function response(res,data,status=200){
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});
 res.end(JSON.stringify(data));
}
function error(res,status,message){response(res,{error:message,preview:true},status)}
function update(){for(const stream of streams)try{stream.write('event: change\ndata: {}\n\n');}catch{streams.delete(stream)}}
function state(s){
 const admin=s.role==='admin';
 return {user:{id:admin?'preview-admin':'preview-worker',role:s.role,
    email:admin?'admin@example.test':'worker@example.test'},
  wallet:admin?{available:0,pending:0,held:0,earned:0,withdrawn:0}:s.wallet,
  currencies:{USD:2,UGX:0},
  rates:[{currency:'USD',rate:1000000,updated_at:Date.now()},
   {currency:'UGX',rate:3700000000,updated_at:Date.now()}],
  exchange:{updated_at:Date.now(),last_error:''},catalogReady:true,
  tasks:admin?s.tasks:s.tasks.filter(t=>t.status==='available'||t.worker_id==='preview-worker'),
  submissions:s.submissions,
  withdrawals:s.withdrawals,transactions:[],profile:s.profile,
  referrals:admin?null:s.referrals
 };
}
function finance(s,search=''){
 const rows=[{id:'preview-worker',email:'worker@example.test',username:'previewworker',
  available:s.wallet.available,pending:s.wallet.pending,held:s.wallet.held,earned:s.wallet.earned,
  withdrawn:s.wallet.withdrawn,requested:s.withdrawals.filter(w=>w.status==='requested').reduce((v,w)=>v+w.amount,0),
  requests:s.withdrawals.filter(w=>w.status==='requested').length},
  {id:'demo-2',email:'example2@example.test',username:'sampleworker',
   available:240,pending:40,held:60,earned:340,withdrawn:100,requested:0,requests:0}]
  .filter(m=>(m.email+' '+m.username).toLowerCase().includes(search.toLowerCase()));
 return {rows,total:rows.length,page:1,pageSize:100,currency:'USD',asOf:new Date().toISOString()};
}
function previewStatus(){
 const info=JSON.parse(readFileSync(path.join(PREVIEW,'status.json'),'utf8'));
 return {...info,version:process.env.RAILWAY_GIT_COMMIT_SHA||'development-branch',
   verifiedAt:new Date().toISOString(),data:'100% synthetic',payments:'disabled'};
}
function publicHtml(file){
 const html=readFileSync(path.join(PUBLIC,file),'utf8');
 return html.replace('</head>','<meta name="robots" content="noindex,nofollow">'+
  '<link rel="stylesheet" href="/_preview/toolbar.css">'+
  '<script src="/_preview/toolbar.js" defer></script></head>');
}
function contacts(s){
 const admin=s.role==='admin';
 return {user:{id:admin?'preview-admin':'preview-worker',role:s.role,
   email:admin?'admin@example.test':'worker@example.test'},
  contacts:{phone:''},prefs:{email_enabled:false,push_enabled:false},
  threads:s.messages.map(t=>({id:t.id,subject:t.subject,status:'open',updated_at:new Date().toISOString(),
   email:'worker@example.test'})),
  members:admin?[{email:'worker@example.test',phone:''}]:[],
  config:{emailReady:false,pushReady:false,supportEmail:'demo@example.test',supportTelegram:'',publicKey:''}};
}
async function handleApi(req,res,url,s){
 const name=url.pathname;
 if(name==='/api/events'){
  res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});
  res.write('retry: 30000\n: TaskHarbor preview\n\n');
  streams.add(res);req.on('close',()=>streams.delete(res));return;
 }
 if(name==='/api/state')return response(res,state(s));
 if(name==='/api/admin-finances')return s.role==='admin'
  ?response(res,finance(s,url.searchParams.get('search')||'')):error(res,403,'Admin demo only');
 if(name==='/api/profile'&&req.method==='GET')return response(res,{
  email:'worker@example.test',role:s.role,joined:'2026-11-16',username:s.profile.username,
  preferredCurrency:'USD',shortCode:'preview',referralCode:'preview'});
 if(name==='/api/payout-feed')return response(res,[{username:'previewworker',amount:180,
  destination:'07xxxxxx882',created_at:'2026-11-16T06:00:00Z'}]);
 if(name==='/api/contact')return response(res,contacts(s));
 if(name==='/api/notifications')return response(res,{notifications:[]});
 if(name==='/api/support'){
  const thread=s.messages.find(t=>t.id===url.searchParams.get('threadId'));
  return thread?response(res,{thread:{id:thread.id,subject:thread.subject,status:'open'},
    messages:thread.messages}):error(res,404,'Sample conversation not found');
 }
 if(req.method!=='POST')return error(res,404,'Preview endpoint unavailable');
 let raw='';
 for await(const chunk of req){
  raw+=chunk;if(raw.length>100000)return error(res,413,'Preview input too large');
 }
 let body;
 try{body=JSON.parse(raw||'{}')}catch{return error(res,400,'Invalid JSON')}
 if(name==='/api/login'||name==='/api/register'||name==='/api/logout')
  return response(res,{ok:true,preview:true});
 if(name==='/api/claim'){
  const item=s.tasks.find(t=>t.id===body.taskId&&t.status==='available');
  if(s.role!=='worker'||!item)return error(res,400,'Choose an available sample task as Worker');
  item.status='claimed';item.worker_id='preview-worker';
  item.claim_expires=Date.now()+1800000;update();return response(res,{ok:true});
 }
 if(name==='/api/submit'){
  const item=s.tasks.find(t=>t.id===body.taskId&&t.status==='claimed');
  if(s.role!=='worker'||!item)return error(res,400,'Claim a sample task first');
  if(typeof body.content!=='string'||!body.content.trim())return error(res,400,'Provide sample evidence');
  item.status='submitted';item.claim_expires=null;
  s.submissions.push({id:randomUUID(),task_id:item.id,worker_id:'preview-worker',
    content:body.content.slice(0,9500),status:'pending',review_note:''});
  s.wallet.pending+=item.reward;update();return response(res,{ok:true});
 }
 if(name==='/api/review'){
  if(s.role!=='admin')return error(res,403,'Switch to Admin demo');
  const sub=s.submissions.find(t=>t.id===body.id&&t.status==='pending');
  if(!sub)return error(res,400,'Sample submission already processed');
  if(!['approved','rejected'].includes(body.decision))return error(res,400,'Choose a valid decision');
  sub.status=body.decision;sub.review_note='Preview-only decision, no payment';
  const item=s.tasks.find(t=>t.id===sub.task_id);
  if(item){item.status=body.decision;
    s.wallet.pending=Math.max(0,s.wallet.pending-item.reward);
    if(body.decision==='approved')s.wallet.held+=item.reward;
  }
  update();return response(res,{ok:true});
 }
 if(name==='/api/payout'){
  const item=s.withdrawals.find(w=>w.id===body.id&&w.status==='requested');
  if(s.role!=='admin'||!item)return error(res,403,'Admin demo requested payout required');
  if(!['paid','rejected'].includes(body.decision))return error(res,400,'Unknown demo decision');
  item.status=body.decision;item.reference=String(body.reference||'DEMO-ONLY').slice(0,100);
  if(body.decision==='paid')s.wallet.withdrawn+=item.amount;
  else s.wallet.available+=item.amount;
  update();return response(res,{ok:true});
 }
 if(name==='/api/task-catalog'){
  const item=s.tasks.find(t=>t.id===body.taskId);
  if(s.role!=='admin'||!item)return error(res,403,'Admin demo only');
  for(const [key,value] of [
   ['category',body.category],['reward_unit',body.rewardUnit],
   ['skill_level',body.skillLevel],['public_summary',body.publicSummary],
   ['expected_minutes',body.expectedMinutes?Number(body.expectedMinutes):null]
  ])if(value!==undefined)item[key]=value;
  update();return response(res,{ok:true});
 }
 if(name==='/api/tasks'||name==='/api/quick-task'){
  if(s.role!=='admin')return error(res,403,'Admin demo only');
  const entries=Array.isArray(body.tasks)?body.tasks:[body];
  if(entries.length>20||s.createdTasks+entries.length>40)return error(res,400,'Preview task limit reached');
  for(const entry of entries){
   const reward=Math.round(Number(entry.rewardAmount||0.5)*100);
   if(!Number.isSafeInteger(reward)||reward<1||reward>100000)return error(res,400,'Invalid demo reward');
   const id='demo-created-'+(++s.createdTasks);
   s.tasks.unshift(task(id,String(entry.title||'Sample work').slice(0,100),'available',
    reward,'general',{public_summary:String(entry.description||'Sample').slice(0,280)}));
  }
  update();return response(res,{ok:true,externalId:'DEMO-'+s.createdTasks});
 }
 if(name==='/api/profile')return response(res,{ok:true,preview:true});
 return error(res,409,'Demonstration only. No live accounts, data or payment processing.');
}
export const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('X-Robots-Tag','noindex, nofollow');
 res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
 const url=new URL(req.url,'http://localhost'),route=url.pathname;
 if(route==='/health')return response(res,{ok:true,preview:true});
 if(route==='/robots.txt'){res.writeHead(200,{'Content-Type':'text/plain'});return res.end('User-agent: *\nDisallow: /\n')}
 if(route==='/api/preview/status')return response(res,previewStatus());
 if(route==='/status'||route==='/_preview/status'){
  res.writeHead(200,{'Content-Type':'text/html'});return res.end(readFileSync(path.join(PREVIEW,'status.html')));
 }
 if(['/_preview/toolbar.js','/_preview/toolbar.css','/_preview/status.js','/_preview/status.css'].includes(route)){
  const file=path.join(PREVIEW,path.basename(route));
  res.writeHead(200,{'Content-Type':MIME[path.extname(file)]});
  return res.end(readFileSync(file));
 }
 const s=session(req,res);
 if(route==='/_preview/role'){
  if(!['worker','admin'].includes(url.searchParams.get('as')))return error(res,400,'Choose a preview role');
  s.role=url.searchParams.get('as');
  res.writeHead(303,{Location:'/dashboard'});return res.end();
 }
 if(route==='/_preview/reset'){sessions.delete(s.id);res.writeHead(303,{Location:'/dashboard'});return res.end()}
 if(route.startsWith('/api/'))return handleApi(req,res,url,s);
 const page=PAGES[route]||(/^[\/][a-z0-9.-]+$/i.test(route)?route.slice(1):null);
 if(!page||(!PAGES[route]&&!ASSETS.has(page)))return error(res,404,'Not found');
 try{
  const body=page.endsWith('.html')?Buffer.from(publicHtml(page)):readFileSync(path.join(PUBLIC,page));
  res.writeHead(200,{'Content-Type':MIME[path.extname(page)]||'application/octet-stream'});
  return res.end(body);
 }catch{return error(res,404,'Preview asset not found')}
});
if(process.argv[1]===fileURLToPath(import.meta.url)){
 server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>{
  console.log('TaskHarbor temporary PREVIEW listening; fake tasks and balances only');
 });
}
