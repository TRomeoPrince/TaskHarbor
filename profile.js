import {atomic} from './store.js';
import {hash,verify} from './auth.js';
import {currencies} from './features.js';
import {provisionProfiles,shortReferral} from './community.js';
const attempts=new Map();
export function profileRoute(db,user,path,body,method,token){
 if(!['/api/profile','/api/password'].includes(path))return null;
 provisionProfiles(db);
 if(path==='/api/profile'&&method==='GET'){
 const p=db.prepare('SELECT p.*,s.chosen_username,s.preferred_currency FROM profiles p JOIN profile_settings s ON s.user_id=p.user_id WHERE p.user_id=?').get(user.id);
 return {...user,username:p.chosen_username?p.username:'',preferredCurrency:p.preferred_currency,referralCode:p.referral_code,shortCode:shortReferral(db,user.id),joined:db.prepare('SELECT created_at FROM users WHERE id=?').get(user.id).created_at};
 }
 if(method!=='POST')throw Error('Method not allowed');
 if(path==='/api/profile')return atomic(db,()=>{
 if(body.username!==undefined){
 const name=String(body.username).trim().toLowerCase();if(name&&!/^[a-z0-9_]{3,24}$/.test(name))throw Error('Use 3–24 letters, numbers or underscores');
 try{db.prepare('UPDATE profiles SET username=? WHERE user_id=?').run(name||'worker-'+user.id.replaceAll('-','').slice(0,12),user.id);}catch{throw Error('That username is already in use');}
 db.prepare('UPDATE profile_settings SET chosen_username=? WHERE user_id=?').run(name?1:0,user.id);
 }
 if(body.currency!==undefined){if(!Object.hasOwn(currencies,body.currency))throw Error('Unsupported currency');db.prepare('UPDATE profile_settings SET preferred_currency=? WHERE user_id=?').run(body.currency,user.id);}
 return {ok:true};
 });
 const now=Date.now(),previous=attempts.get(user.id)||{count:0,until:now+60000};if(previous.until<=now){previous.count=0;previous.until=now+60000;}attempts.set(user.id,previous);if(++previous.count>5)throw Error('Too many password attempts; try again in a minute');
 if(typeof body.currentPassword!=='string'||body.currentPassword.length>256||!verify(body.currentPassword,db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id).password_hash))throw Error('Current password is incorrect');
 const password=body.newPassword;if(typeof password!=='string'||password.length<10||password.length>256||password!==password.trim())throw Error('New password must have 10–256 characters without leading or trailing spaces');
 atomic(db,()=>{db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash(password),user.id);db.prepare('DELETE FROM sessions WHERE user_id=? AND token<>?').run(user.id,token);});return {ok:true};
}
