import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
export const hash=password=>{const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex');};
export const verify=(password,stored)=>{const [salt,key]=stored.split(':');return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(key,'hex'));};
