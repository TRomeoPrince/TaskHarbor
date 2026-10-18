import {randomUUID} from 'node:crypto';
import {atomic,entry} from './store.js';
import {awardReferral} from './community.js';
const fail=m=>{throw Error(m);};
function note(v){if(typeof v!=='string'||!v.trim()||v.length>10000)fail('Enter a note or result');return v.trim();}
export function history(db,task,actor,action,content,step=null){db.prepare('INSERT INTO evidence_history(id,task_id,step_id,actor_id,action,content) VALUES(?,?,?,?,?,?)').run(randomUUID(),task,step,actor,action,content);}
export function workflow(db,user,path,body,upload){
 if(!['/api/review','/api/moderation','/api/correction','/api/resubmit'].includes(path))return null;
 return atomic(db,()=>{
 const submission=path==='/api/review'?db.prepare('SELECT * FROM submissions WHERE id=?').get(body.id||''):db.prepare('SELECT * FROM submissions WHERE task_id=?').get(body.taskId||'');
 if(!submission||submission.status!=='pending')fail('Submission is closed or missing');
 const task=db.prepare('SELECT * FROM tasks WHERE id=?').get(submission.task_id);
 const m=db.prepare('SELECT * FROM moderation WHERE task_id=?').get(task.id);
 if(path==='/api/resubmit'){
 if(user.role!=='worker'||task.worker_id!==user.id)fail('Worker access required');
 const correction=db.prepare('SELECT * FROM corrections WHERE task_id=? AND pending=1 AND step_id IS NULL').get(task.id);if(!correction)fail('No submission correction is requested');
 const content=note(body.content);history(db,task.id,user.id,'previous_submission',submission.content);
 db.prepare('UPDATE submissions SET content=?,review_note=NULL WHERE id=?').run(content,submission.id);upload(db,user,task.id,'evidence',body.images);
 db.prepare('UPDATE corrections SET pending=0 WHERE task_id=?').run(task.id);history(db,task.id,user.id,'resubmit',content);return {ok:true};
 }
 if(user.role!=='admin')fail('Admin access required');
 if(path==='/api/correction'){
 const content=note(body.content);let step=null;
 if(body.stepId){step=db.prepare('SELECT * FROM task_steps WHERE id=? AND task_id=?').get(body.stepId,task.id);if(!step)fail('Step not found');}
 const affected=db.prepare('SELECT * FROM task_steps WHERE task_id=? AND position>=?').all(task.id,step?.position??0);
 for(const s of affected)history(db,task.id,user.id,'previous_step_evidence',s.evidence||'',s.id);
 db.prepare('UPDATE task_steps SET completed=0,evidence=NULL WHERE task_id=? AND position>=?').run(task.id,step?.position??0);
 db.prepare('INSERT INTO corrections VALUES(?,?,?,1) ON CONFLICT(task_id) DO UPDATE SET step_id=excluded.step_id,note=excluded.note,pending=1').run(task.id,step?.id||null,content);
 if(m)db.prepare("UPDATE moderation SET status='correction',note=? WHERE task_id=?").run(content,task.id);
 db.prepare('UPDATE submissions SET review_note=? WHERE id=?').run(content,submission.id);
 db.prepare('INSERT INTO messages(id,task_id,sender_id,content) VALUES(?,?,?,?)').run(randomUUID(),task.id,user.id,'Correction requested: '+content);history(db,task.id,user.id,'request_correction',content,step?.id||null);return {ok:true};
 }
 const content=note(body.note||body.content);
 if(path==='/api/review'){
 if(m?.status==='hold')fail('Task is already held for final moderation');
 if(!['approved','rejected'].includes(body.decision))fail('Invalid decision');
 if(body.decision==='rejected'){
 db.prepare("UPDATE submissions SET status='rejected',review_note=? WHERE id=?").run(content,submission.id);db.prepare("UPDATE tasks SET status='rejected' WHERE id=?").run(task.id);
 if(m)db.prepare("UPDATE moderation SET status='denied',note=? WHERE task_id=?").run(content,task.id);history(db,task.id,user.id,'reject',content);return {ok:true};
 }
 if(db.prepare('SELECT id FROM task_steps WHERE task_id=? AND completed=0').get(task.id))fail('Required follow-up steps are incomplete');
 if(db.prepare('SELECT task_id FROM corrections WHERE task_id=? AND pending=1').get(task.id))fail('Correction is awaiting resubmission');
 db.prepare("INSERT INTO moderation VALUES(?,'hold',?,?) ON CONFLICT(task_id) DO UPDATE SET status='hold',hold_until=excluded.hold_until,note=excluded.note").run(task.id,Date.now()+72*3600000,content);
 db.prepare('UPDATE submissions SET review_note=? WHERE id=?').run(content,submission.id);history(db,task.id,user.id,'start_hold',content);return {ok:true};
 }
 if(!m||m.status!=='hold')fail('Task is not awaiting final moderation');
 if(!['approved','rejected'].includes(body.decision))fail('Invalid decision');
 if(body.decision==='approved'&&Date.now()<m.hold_until)fail('Three-day hold has not finished');
 const approved=body.decision==='approved';
 db.prepare('UPDATE moderation SET status=?,note=? WHERE task_id=?').run(approved?'released':'denied',content,task.id);
 db.prepare('UPDATE submissions SET status=?,review_note=? WHERE id=?').run(body.decision,content,submission.id);db.prepare('UPDATE tasks SET status=? WHERE id=?').run(body.decision,task.id);
 if(approved){entry(db,task.worker_id,'earning',task.reward,task.id);awardReferral(db,task);}
 history(db,task.id,user.id,approved?'release_held':'deny_held',content);return {ok:true};
 });
}
