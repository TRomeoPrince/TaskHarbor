import {atomic} from './store.js';
import {currencies} from './features.js';
export const SOURCE='https://www.exchangerate-api.com';
export function restoreCurrencies(db){
 if(!db.prepare('SELECT id FROM exchange_sync WHERE id=1').get())return;
 for(const {currency} of db.prepare('SELECT currency FROM rates').all()){
 if(/^[A-Z]{3}$/.test(currency))currencies[currency]=new Intl.NumberFormat('en',{style:'currency',currency}).resolvedOptions().maximumFractionDigits;
 }
}
export async function refreshRates(db,fetcher=fetch,now=Date.now(),apiKey=process.env.EXCHANGE_RATE_API_KEY||''){
 const source=apiKey?SOURCE+'/docs/standard-requests':SOURCE;
 const endpoint=apiKey?`https://v6.exchangerate-api.com/v6/${encodeURIComponent(apiKey)}/latest/USD`:'https://open.er-api.com/v6/latest/USD';
 const prior=db.prepare('SELECT * FROM exchange_sync WHERE id=1').get();
 if(prior&&prior.next_check>now&&(prior.source===source||prior.last_error))return false;
 try{
 const response=await fetcher(endpoint,{signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('Exchange provider unavailable');const data=await response.json();
 const updated=data.time_last_update_unix*1000,next=data.time_next_update_unix*1000;
 const rates=apiKey?data.conversion_rates:data.rates;
 if(data.result!=='success'||data.base_code!=='USD'||rates?.USD!==1||!Number.isFinite(updated)||updated>now+300000||updated<now-7*86400000||!Number.isFinite(next)||next<=updated)throw Error('Invalid exchange response');
 const rows=Object.entries(rates).filter(([c])=>/^[A-Z]{3}$/.test(c)&&c!=='USD').map(([c,v])=>{
 const n=Math.round(v*1000000);if(typeof v!=='number'||!Number.isSafeInteger(n)||n<=0)throw Error('Invalid exchange rate');return [c,n,updated];
 });
 if(rows.length<5)throw Error('Incomplete exchange response');
 atomic(db,()=>{
 db.prepare('DELETE FROM rates').run();
 const insert=db.prepare('INSERT INTO rates VALUES(?,?,?)');for(const row of rows)insert.run(...row);
 db.prepare("INSERT INTO exchange_sync(id,source,updated_at,next_check,last_error) VALUES(1,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET source=excluded.source,updated_at=excluded.updated_at,next_check=excluded.next_check,last_error=NULL").run(source,updated,Math.max(now+3600000,next+60000));
 });restoreCurrencies(db);return true;
 }catch(e){
 db.prepare('INSERT INTO exchange_sync(id,source,updated_at,next_check,last_error) VALUES(1,?,0,?,?) ON CONFLICT(id) DO UPDATE SET next_check=excluded.next_check,last_error=excluded.last_error').run(source,now+3600000,'Automatic rate refresh failed; retrying.');
 return false;
 }
}
