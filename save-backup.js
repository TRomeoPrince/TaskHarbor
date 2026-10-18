import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('./data/app.sqlite',import.meta.url));
if(existsSync(source)){
 mkdirSync(new URL('./data/backups/',import.meta.url),{recursive:true});
 const target=fileURLToPath(new URL('./data/backups/before-referrals-'+Date.now()+'.sqlite',import.meta.url));
 const db=new DatabaseSync(source);await backup(db,target);db.close();console.log('Database snapshot saved:',target);
}
