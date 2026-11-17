import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
export function quickTask(body){
 if(body?.onDemand===true||body?.onDemand==='true'||body?.onDemand==='1'){
 const minutes=Number(body.workMinutes??60);
 if(!Number.isSafeInteger(minutes)||minutes<1||minutes>43200)throw Error('Work duration must be 1–43200 minutes');
 const task=JSON.parse(readFileSync(new URL('./templates/single-account.json',import.meta.url),'utf8'))[0];
 task.title='CREATE GMAIL';
 task.description='Gmail account creation task. Claim the task first. The admin will request fresh instructions from the source and privately release the supplied first name, last name, Gmail username, password, and date of birth. Your work timer starts only when the admin releases those details. Submit your completion evidence, then complete any later recovery-email, birthday-settings and sign-out instructions. Reward: USD 0.12, subject to the three-day hold and final approval. Do not begin before you receive the official details.';
 task.rewardAmount='0.12';
 task.externalId='gmail-slot:'+randomUUID();
 task.fields=[];
 task.policy={startMode:'admin_details',claimMinutes:minutes,expiryAction:'hold',publicDescription:true};
 return task;
 }
 const required=(value,label,max=254)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('Enter '+label);return value.trim();};
 const first=required(body.firstName,'the first name',100);
 const email=required(body.email,'the supplied Gmail address (Username)').toLowerCase();
 if(!/^[a-z0-9.]+(?:\+[^\s@]+)?@gmail\.com$/.test(email))throw Error('Enter the supplied Gmail address (Username)');
 required(body.password,'the supplied password',256);
 const last=body.lastName?.trim()||'No last name — Leave blank / empty';
 if(last.length>200)throw Error('Last name instruction is too long');
 const task=JSON.parse(readFileSync(new URL('./templates/single-account.json',import.meta.url),'utf8'))[0];
 task.title='CREATE GMAIL';
 task.description='Register Gmail account using the information provided below.\n\n🔐 Be sure to use the provided first name, last name (leave it blank when instructed), Gmail username, password, and date of birth exactly as shown below, otherwise the account will not be paid.\n\nRequired follow-ups: add the recovery email supplied after submission, make the full birthday public and enable birthday highlighting, then sign out. Reward: USD 0.12, subject to the three-day hold and final upstream moderation. If a detail cannot be used, message the admin before proceeding.';
 task.rewardAmount='0.12';
 task.externalId='gmail:'+email.split('@')[0].split('+')[0].replaceAll('.','');
 const values=[first,last,email,body.password,'19 May 2000'];task.fields.forEach((f,i)=>f.value=values[i]);
 return task;
}
