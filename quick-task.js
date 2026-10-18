import {readFileSync} from 'node:fs';
export function quickTask(body){
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
