import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
export function openStore(path) {
 const db = new DatabaseSync(path);
 db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
 db.exec('PRAGMA busy_timeout=5000');
 return db;
}
export function atomic(db, fn) { db.exec('BEGIN IMMEDIATE'); try {const result=fn();db.exec('COMMIT');return result;} catch(e){db.exec('ROLLBACK');throw e;} }
export function wallet(db, id) {
 const totals=db.prepare("SELECT COALESCE(SUM(amount),0) available, COALESCE(SUM(CASE WHEN kind IN ('earning','referral') THEN amount ELSE 0 END),0) earned FROM ledger WHERE user_id=?").get(id);
 return {...totals,pending:db.prepare("SELECT COALESCE(SUM(reward),0) n FROM tasks WHERE worker_id=? AND status='submitted' AND id NOT IN (SELECT task_id FROM moderation WHERE status='hold')").get(id).n,held:db.prepare("SELECT COALESCE(SUM(t.reward),0) n FROM tasks t JOIN moderation m ON m.task_id=t.id WHERE t.worker_id=? AND m.status='hold'").get(id).n,withdrawn:db.prepare("SELECT COALESCE(SUM(amount),0) n FROM withdrawals WHERE user_id=? AND status='paid'").get(id).n};
}
export function claim(db, taskId, userId) {
 return atomic(db,()=>{
 expireInside(db);
 const policy=db.prepare('SELECT * FROM task_policies WHERE task_id=?').get(taskId);
 const now=Date.now();
 if(policy?.deadline_at!=null&&now>=policy.deadline_at)throw new Error('The task deadline has passed');
 if(db.prepare("SELECT id FROM tasks WHERE worker_id=? AND status IN ('claimed','submitted') LIMIT 1").get(userId))throw new Error('You already have an active task. Wait until it is reviewed before claiming another.');
 const result=db.prepare("UPDATE tasks SET status='claimed',worker_id=? WHERE id=? AND status='available' AND worker_id IS NULL").run(userId,taskId);
 if(!result.changes)throw new Error('Task is no longer available');
 // Old tasks keep their 30-minute lease. New tasks use the published policy.
 const minutes=policy?policy.claim_minutes:30;
 const expires=policy?.start_mode==='admin_details'||minutes===null?null:now+minutes*60000;
 if(expires!==null)db.prepare('INSERT INTO leases VALUES(?,?,?) ON CONFLICT(task_id) DO UPDATE SET worker_id=excluded.worker_id,expires=excluded.expires').run(taskId,userId,policy?.deadline_at?Math.min(expires,policy.deadline_at):expires);
 });
}
function expireInside(db,now=Date.now()){
 const expired=db.prepare("SELECT t.id,t.worker_id FROM tasks t JOIN leases l ON l.task_id=t.id LEFT JOIN task_policies p ON p.task_id=t.id WHERE t.status='claimed' AND l.expires<=? AND COALESCE(p.expiry_action,'recycle')='recycle' AND NOT EXISTS(SELECT 1 FROM submissions s WHERE s.task_id=t.id)").all(now);
 for(const t of expired){db.prepare("UPDATE tasks SET status='available',worker_id=NULL WHERE id=?").run(t.id);db.prepare('DELETE FROM leases WHERE task_id=?').run(t.id);db.prepare('INSERT INTO evidence_history(id,task_id,actor_id,action,content) VALUES(?,?,?,?,?)').run(randomUUID(),t.id,t.worker_id,'claim_expired','Unsubmitted claim returned after its configured time limit');}
 return expired.length;
}
export function expireClaims(db,now=Date.now()){return atomic(db,()=>expireInside(db,now));}
export function entry(db,user,kind,amount,task=null,withdrawal=null){db.prepare('INSERT INTO ledger(id,user_id,kind,amount,task_id,withdrawal_id) VALUES(?,?,?,?,?,?)').run(randomUUID(),user,kind,amount,task,withdrawal);}
