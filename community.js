import {randomUUID,randomBytes} from 'node:crypto';
export function shortReferral(db,userId){
 const existing=db.prepare('SELECT code FROM referral_links WHERE user_id=?').get(userId);if(existing)return existing.code;
 for(let i=0;i<5;i++){const code=randomBytes(6).toString('base64url');try{db.prepare('INSERT INTO referral_links VALUES(?,?)').run(code,userId);return code;}catch(e){if(!e.message.includes('UNIQUE'))throw e;}}
 throw Error('Unable to generate referral link');
}
import {entry} from './store.js';
export const referralPolicy={firstMicros:10000,laterMicros:10000,days:30};
export function provisionProfiles(db){
 for(const u of db.prepare('SELECT id,created_at FROM users WHERE id NOT IN (SELECT user_id FROM profiles)').all())db.prepare('INSERT INTO profiles VALUES(?,?,?,?,?)').run(u.id,'worker-'+u.id.replaceAll('-','').slice(0,12),randomUUID(),null,Date.parse(u.created_at+'Z'));
 db.prepare("INSERT OR IGNORE INTO leases SELECT t.id,t.worker_id,? FROM tasks t LEFT JOIN task_policies p ON p.task_id=t.id WHERE t.status='claimed' AND (p.task_id IS NULL OR (p.claim_minutes IS NOT NULL AND (p.start_mode='on_claim' OR p.supplied_at IS NOT NULL)))").run(Date.now()+30*60000);
 db.prepare("INSERT OR IGNORE INTO profile_settings(user_id,chosen_username) SELECT user_id,CASE WHEN username LIKE 'worker-%' OR username LIKE 'worker_%' THEN 0 ELSE 1 END FROM profiles").run();
}
export function registerProfile(db,userId,username,code,now=Date.now()){
 const chosen=!!username;
 if(chosen&&!/^[a-zA-Z0-9_]{3,24}$/.test(username))throw Error('Choose a username of 3–24 letters, numbers or underscores');
 const referrer=code?db.prepare("SELECT p.user_id FROM profiles p JOIN users u ON u.id=p.user_id LEFT JOIN referral_links l ON l.user_id=p.user_id WHERE (p.referral_code=? OR l.code=?) AND u.role='worker'").get(code,code):null;
 if(code&&!referrer)throw Error('Referral code is invalid');
 db.prepare('INSERT INTO profiles VALUES(?,?,?,?,?)').run(userId,chosen?username.toLowerCase():'worker-'+userId.replaceAll('-','').slice(0,12),randomUUID(),referrer?.user_id||null,now);
 db.prepare('INSERT INTO profile_settings(user_id,chosen_username) VALUES(?,?)').run(userId,chosen?1:0);
}
export function awardReferral(db,task,now=Date.now()){
 if(task.provider!=='manual-telegram')return;
 const p=db.prepare('SELECT * FROM profiles WHERE user_id=?').get(task.worker_id);if(!p?.referrer_id)return;
 const submission=db.prepare('SELECT created_at FROM submissions WHERE task_id=?').get(task.id);
 const qualifiedAt=submission?Date.parse(submission.created_at+'Z'):now;
 const amount=qualifiedAt-p.registered_at<30*86400000?referralPolicy.firstMicros:referralPolicy.laterMicros;
 const inserted=db.prepare('INSERT OR IGNORE INTO referral_awards VALUES(?,?,?,?,?)').run(task.id,p.referrer_id,task.worker_id,amount,now);if(!inserted.changes)return;
 const total=db.prepare('SELECT SUM(usd_micros) n FROM referral_awards WHERE referrer_id=?').get(p.referrer_id).n;
 const credited=db.prepare('SELECT credited_cents FROM referral_transfers WHERE user_id=?').get(p.referrer_id)?.credited_cents||0;
 const cents=Math.floor(total/10000);if(cents>credited){entry(db,p.referrer_id,'referral',cents-credited);db.prepare('INSERT INTO referral_transfers VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET credited_cents=excluded.credited_cents').run(p.referrer_id,cents);}
}
export function maskDestination(value){
 const s=String(value).trim();if(s.includes('@')){const [name,domain]=s.split('@');return name.slice(0,1)+'xxxx@'+domain;}
 const digits=s.replace(/\D/g,'');return digits.length>=7?digits.slice(0,3)+'xxxxxx'+digits.slice(-3):'Hidden';
}
export function payoutFeed(db){return db.prepare("SELECT w.id,w.amount,w.destination,COALESCE(d.paid_at,w.created_at) created_at,p.username,u.email,COALESCE(s.chosen_username,0) chosen FROM withdrawals w JOIN users u ON u.id=w.user_id LEFT JOIN profiles p ON p.user_id=w.user_id LEFT JOIN profile_settings s ON s.user_id=w.user_id LEFT JOIN paid_dates d ON d.withdrawal_id=w.id WHERE w.status='paid' ORDER BY w.rowid DESC LIMIT 100").all().map(({destination,email,chosen,username,...w})=>({...w,username:chosen&&username?username:maskDestination(email),destination:maskDestination(destination)}));}
export function communityState(db,user){
 const profile=db.prepare('SELECT p.username,p.referral_code,s.chosen_username,s.preferred_currency FROM profiles p LEFT JOIN profile_settings s ON s.user_id=p.user_id WHERE p.user_id=?').get(user.id);
 if(profile){profile.short_code=shortReferral(db,user.id);profile.display_name=profile.chosen_username?profile.username:maskDestination(user.email);}
 const total=db.prepare('SELECT COALESCE(SUM(usd_micros),0) n FROM referral_awards WHERE referrer_id=?').get(user.id).n;
 const credited=db.prepare('SELECT credited_cents FROM referral_transfers WHERE user_id=?').get(user.id)?.credited_cents||0;
 return {profile,referrals:{policy:referralPolicy,count:db.prepare('SELECT COUNT(*) n FROM profiles WHERE referrer_id=?').get(user.id).n,totalMicros:total,carryMicros:total-credited*10000,creditedCents:credited},payouts:payoutFeed(db)};
}
