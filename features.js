import {randomUUID} from 'node:crypto';
import {atomic,wallet,entry} from './store.js';
import {workflow,history} from './workflow.js';
import {quickTask} from './quick-task.js';
import {communityState} from './community.js';
export const currencies={USD:2,UGX:0,KES:2,TZS:2,NGN:2,GHS:2,EUR:2,GBP:2};
const error=m=>{throw new Error(m);};
const text=(s,max=10000)=>{if(typeof s!=='string'||!s.trim()||s.length>max)error('Invalid or missing text');return s.trim();};
export function minor(value,currency='USD'){
 if(!(currency in currencies))error('Unsupported currency');
 const s=String(value),digits=currencies[currency];
 if(!/^\d+(\.\d+)?$/.test(s))error('Enter a positive currency amount');
 const [whole,fraction='']=s.split('.');if(fraction.length>digits)error(`Use at most ${digits} decimal places for ${currency}`);
 const n=BigInt(whole)*10n**BigInt(digits)+BigInt(fraction.padEnd(digits,'0')||'0');
 if(n<=0n||n>100000000000n)error('Amount out of range');return Number(n);
}
export function convert(cents,currency,rate){return Number((BigInt(cents)*BigInt(rate)*10n**BigInt(currencies[currency])+50000000n)/100000000n);}
export function initialize(db){db.exec(`
 CREATE TABLE IF NOT EXISTS task_details(task_id TEXT PRIMARY KEY REFERENCES tasks(id),fields TEXT NOT NULL DEFAULT '[]');
 CREATE TABLE IF NOT EXISTS task_steps(id TEXT PRIMARY KEY,task_id TEXT REFERENCES tasks(id),position INTEGER NOT NULL,title TEXT NOT NULL,instruction TEXT NOT NULL,completed INTEGER NOT NULL DEFAULT 0,evidence TEXT,UNIQUE(task_id,position));
 CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,task_id TEXT REFERENCES tasks(id),sender_id TEXT REFERENCES users(id),content TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS images(id TEXT PRIMARY KEY,task_id TEXT REFERENCES tasks(id),owner_id TEXT REFERENCES users(id),kind TEXT NOT NULL,mime TEXT NOT NULL,data BLOB NOT NULL);
 CREATE TABLE IF NOT EXISTS rates(currency TEXT PRIMARY KEY,rate INTEGER NOT NULL,updated_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS quotes(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),usd_cents INTEGER NOT NULL,currency TEXT NOT NULL,local_minor INTEGER NOT NULL,rate INTEGER NOT NULL,rate_time INTEGER NOT NULL,expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS withdrawal_details(withdrawal_id TEXT PRIMARY KEY REFERENCES withdrawals(id),currency TEXT NOT NULL,local_minor INTEGER NOT NULL,rate INTEGER NOT NULL,rate_time INTEGER NOT NULL,fee_minor INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS exchange_sync(id INTEGER PRIMARY KEY CHECK(id=1),source TEXT NOT NULL,updated_at INTEGER NOT NULL,next_check INTEGER NOT NULL,last_error TEXT);
 `);
 for(const table of ['quotes','withdrawal_details'])if(!db.prepare(`PRAGMA table_info(${table})`).all().some(c=>c.name==='settlement'))db.exec(`ALTER TABLE ${table} ADD COLUMN settlement TEXT NOT NULL DEFAULT 'legacy'`);
}
function access(db,user,id){const task=db.prepare('SELECT * FROM tasks WHERE id=?').get(id);if(!task||(user.role!=='admin'&&task.worker_id!==user.id))error('Task access denied');return task;}
function upload(db,user,taskId,kind,images=[]){
 if(!Array.isArray(images)||images.length>6)error('Attach up to 6 images');
 for(const img of images){
 const data=Buffer.from(String(img.data||''),'base64');if(!data.length||data.length>3*1024*1024)error('Each image must be under 3 MB');
 const mime=data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':data[0]===255&&data[1]===216&&data[2]===255?'image/jpeg':data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP'?'image/webp':null;
 if(!mime)error('Use PNG, JPEG or WebP images');
 db.prepare('INSERT INTO images VALUES(?,?,?,?,?,?)').run(randomUUID(),taskId,user.id,kind,mime,data);
 }
}
export function enrich(db,user,state){
 Object.assign(state,communityState(db,user));
 const sync=db.prepare('SELECT * FROM exchange_sync WHERE id=1').get();
 state.currencies=currencies;state.exchange=sync||{updated_at:0,last_error:'Automatic rates are loading.'};state.rates=[{currency:'USD',rate:1000000,updated_at:Date.now()},...(sync?.updated_at?db.prepare('SELECT * FROM rates').all():[])];
 state.tasks=state.tasks.map(t=>{
 const allowed=user.role==='admin'||t.worker_id===user.id;
 const steps=db.prepare('SELECT * FROM task_steps WHERE task_id=? ORDER BY position').all(t.id);
 const shown=steps.find(s=>!s.completed)?.position;
 const visible=s=>allowed&&(user.role==='admin'||t.status!=='claimed'&&(s.completed||s.position===shown));
 const attachments=allowed?db.prepare('SELECT id,kind FROM images WHERE task_id=?').all(t.id).filter(img=>!img.kind.startsWith('instruction:')||steps.some(s=>img.kind==='instruction:'+s.id&&visible(s))):[];
 return {...t,followup_overdue:allowed&&t.status==='submitted'&&shown!==undefined&&(db.prepare('SELECT expires FROM leases WHERE task_id=?').get(t.id)?.expires||Infinity)<=Date.now(),claim_expires:allowed?db.prepare('SELECT expires FROM leases WHERE task_id=?').get(t.id)?.expires:null,moderation:allowed?db.prepare('SELECT * FROM moderation WHERE task_id=?').get(t.id):null,correction:allowed?db.prepare('SELECT * FROM corrections WHERE task_id=? AND pending=1').get(t.id):null,history:allowed?db.prepare('SELECT * FROM evidence_history WHERE task_id=? ORDER BY rowid').all(t.id):[],...(!allowed?{description:'Claim this task to view its private instructions.'}:{}),fields:allowed?JSON.parse(db.prepare('SELECT fields FROM task_details WHERE task_id=?').get(t.id)?.fields||'[]'):[],steps:steps.map(s=>({...s,instruction:visible(s)?s.instruction:'',evidence:allowed?s.evidence:null})),images:attachments,messages:allowed?db.prepare('SELECT m.*,u.role FROM messages m JOIN users u ON u.id=m.sender_id WHERE task_id=? ORDER BY m.created_at,m.rowid').all(t.id):[]};
 });
 state.withdrawals=state.withdrawals.map(w=>({...w,...db.prepare('SELECT currency,local_minor,rate,rate_time,fee_minor,settlement FROM withdrawal_details WHERE withdrawal_id=?').get(w.id)}));return state;
}
export function route(db,user,path,body,req,res){
 if(req.method==='GET'&&path.startsWith('/api/images/')){
 const img=db.prepare('SELECT * FROM images WHERE id=?').get(path.split('/').pop());if(!img)error('Image not found');const task=access(db,user,img.task_id);
 if(user.role!=='admin'&&img.kind.startsWith('instruction:')){
 const step=db.prepare('SELECT * FROM task_steps WHERE id=? AND task_id=?').get(img.kind.slice(12),task.id);
 const current=db.prepare('SELECT id FROM task_steps WHERE task_id=? AND completed=0 ORDER BY position LIMIT 1').get(task.id);
 if(!step||task.status==='claimed'||!step.completed&&current?.id!==step.id)error('Step images are not yet available');
 }
 res.setHeader('Content-Type',img.mime);res.end(img.data);return 'sent';
 }
 if(req.method!=='POST')return null;
 if(path==='/api/quick-task'){
 if(user.role!=='admin')error('Admin access required');
 const task=quickTask(body);
 const result=route(db,user,'/api/tasks',task,req,res);return {...result,externalId:task.externalId};
 }
 const workflowResult=workflow(db,user,path,body,upload);if(workflowResult!==null)return workflowResult;
 if(path==='/api/rates'){
 error('Exchange rates update automatically; manual rates are disabled');
 }
 if(path==='/api/task-message'){
 const task=access(db,user,text(body.taskId));if(!task.worker_id)error('Task has no assigned worker');
 db.prepare('INSERT INTO messages(id,task_id,sender_id,content) VALUES(?,?,?,?)').run(randomUUID(),task.id,user.id,text(body.content));return {ok:true};
 }
 if(path==='/api/step')return atomic(db,()=>{
 const task=access(db,user,text(body.taskId));if(user.role!=='worker'||task.status!=='submitted')error('Submit the task before completing follow-up steps');
 if(db.prepare("SELECT task_id FROM moderation WHERE task_id=? AND status='hold'").get(task.id))error('Task is held for moderation');
 if(db.prepare('SELECT task_id FROM corrections WHERE task_id=? AND pending=1 AND step_id IS NULL').get(task.id))error('Resubmit the initial result before follow-up steps');
 const step=db.prepare('SELECT * FROM task_steps WHERE task_id=? AND completed=0 ORDER BY position LIMIT 1').get(task.id);if(!step||step.id!==body.id)error('This step is no longer current');
 if(!step.instruction.trim())error('Waiting for admin to provide the step instructions');
 const content=text(body.content);db.prepare('UPDATE task_steps SET completed=1,evidence=? WHERE id=?').run(content,step.id);upload(db,user,task.id,'step',body.images);history(db,task.id,user.id,'step_submission',content,step.id);
 if(!db.prepare('SELECT id FROM task_steps WHERE task_id=? AND completed=0').get(task.id))db.prepare('UPDATE corrections SET pending=0 WHERE task_id=? AND step_id IS NOT NULL').run(task.id);return {ok:true};
 });
 if(path==='/api/release-step')return atomic(db,()=>{
 if(user.role!=='admin')error('Admin access required');
 const task=access(db,user,text(body.taskId));if(task.status!=='submitted')error('Worker must submit the task first');
 const instruction=text(body.content);
 const updated=db.prepare("UPDATE task_steps SET instruction=? WHERE id=? AND task_id=? AND completed=0 AND instruction='' ").run(instruction,text(body.id),task.id);
 if(!updated.changes)error('Step already supplied, completed, or missing');return {ok:true};
 });
 if(path==='/api/tasks'){
 if(user.role!=='admin')error('Admin access required');return atomic(db,()=>{
 const tasks=body.tasks||[body];if(!Array.isArray(tasks)||!tasks.length||tasks.length>100)error('Import 1–100 tasks');
 for(const t of tasks){const id=randomUUID();const reward=t.rewardAmount!==undefined?minor(t.rewardAmount):t.reward;if(!Number.isSafeInteger(reward)||reward<=0||reward>100000000)error('Invalid reward');
 db.prepare('INSERT INTO tasks(id,title,description,reward,provider,external_id) VALUES(?,?,?,?,?,?)').run(id,text(t.title,200),text(t.description),reward,t.provider?text(t.provider,100):'manual',t.externalId?text(t.externalId,200):null);
 const fields=t.fields||[];if(!Array.isArray(fields)||fields.length>30)error('Use up to 30 fields');
 const clean=fields.map(f=>{text(f.value);return {label:text(f.label,100),value:f.value,copy:!!f.copy};});db.prepare('INSERT INTO task_details VALUES(?,?)').run(id,JSON.stringify(clean));
 const steps=t.steps||[];if(!Array.isArray(steps)||steps.length>20)error('Use up to 20 follow-up steps');steps.forEach((s,i)=>{const stepId=randomUUID();db.prepare('INSERT INTO task_steps(id,task_id,position,title,instruction) VALUES(?,?,?,?,?)').run(stepId,id,i,text(s.title,200),s.instruction?.trim()?text(s.instruction):'');upload(db,user,id,'instruction:'+stepId,s.images);});
 upload(db,user,id,'instruction',t.images);
 }return {ok:true};});
 }
 if(path==='/api/submit')return atomic(db,()=>{
 const task=access(db,user,text(body.taskId));if(user.role!=='worker'||task.status!=='claimed')error('Task is not ready for submission');
 db.prepare('INSERT INTO submissions(id,task_id,worker_id,content) VALUES(?,?,?,?)').run(randomUUID(),task.id,user.id,text(body.content));upload(db,user,task.id,'evidence',body.images);db.prepare("UPDATE tasks SET status='submitted' WHERE id=?").run(task.id);return {ok:true};
 });
 if(path==='/api/quote'){
 const currency=body.currency;if(!(currency in currencies))error('Unsupported currency');const local=minor(body.amount,currency);
 const sync=db.prepare('SELECT * FROM exchange_sync WHERE id=1').get();
 const rate=currency==='USD'?{rate:1000000,updated_at:Date.now()}:sync?.updated_at?db.prepare('SELECT * FROM rates WHERE currency=?').get(currency):null;
 if(!rate||Date.now()-rate.updated_at>7*86400000)error('Automatic exchange rate unavailable; choose USD or try again later');
 const cents=Number((BigInt(local)*100000000n+BigInt(rate.rate)*10n**BigInt(currencies[currency])-1n)/(BigInt(rate.rate)*10n**BigInt(currencies[currency])));
 if(cents<=0||cents>wallet(db,user.id).available)error('Insufficient available balance');
 const estimate=convert(cents,currency,rate.rate);
 const id=randomUUID();db.prepare("INSERT INTO quotes(id,user_id,usd_cents,currency,local_minor,rate,rate_time,expires,used,settlement) VALUES(?,?,?,?,?,?,?,?,0,'USD')").run(id,user.id,cents,currency,estimate,rate.rate,rate.updated_at,Date.now()+300000);
 return {id,usd_cents:cents,currency,local_minor:estimate,rate:rate.rate,rate_time:rate.updated_at,fee_minor:0,settlement:'USD'};
 }
 if(path==='/api/withdraw')return atomic(db,()=>{
 const q=db.prepare("SELECT * FROM quotes WHERE id=? AND user_id=? AND used=0 AND expires>? AND settlement='USD'").get(text(body.quoteId),user.id,Date.now());if(!q)error('Quote expired or used; request a new quote');
 if(wallet(db,user.id).available<q.usd_cents)error('Insufficient available balance');const id=randomUUID();
 db.prepare('INSERT INTO withdrawals(id,user_id,amount,destination) VALUES(?,?,?,?)').run(id,user.id,q.usd_cents,text(body.destination,500));
 db.prepare("INSERT INTO withdrawal_details(withdrawal_id,currency,local_minor,rate,rate_time,fee_minor,settlement) VALUES(?,?,?,?,?,0,'USD')").run(id,q.currency,q.local_minor,q.rate,q.rate_time);entry(db,user.id,'withdrawal_reserve',-q.usd_cents,null,id);db.prepare('UPDATE quotes SET used=1 WHERE id=?').run(q.id);return {ok:true};
 });
 return null;
}
