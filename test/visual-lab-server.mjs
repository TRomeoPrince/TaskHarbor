/* Local-only visual verification server. Synthetic fixtures, never production data. */
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const dir = fileURLToPath(new URL('../public/',import.meta.url));
const pages = {
  '/':'index.html','/dashboard':'index.html',
  '/payouts':'payouts.html','/profile':'profile.html','/contact':'contact.html'
};
const types = {'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.png':'image/png','.html':'text/html; charset=utf-8'};
const today=Date.now();
const task=(id,title,status,reward,extra={})=>({
  id,title,status,reward,provider:'demo-fixture',description:'Synthetic task for visual testing. No real work is offered.',
  fields:[],steps:[],images:[],history:[],messages:[],moderation:null,correction:null,
  worker_id:status==='available'?null:'worker-fixture',policy:null,category:'general',...extra
});
const state={
  user:{id:'worker-fixture',email:'worker@example.test',role:'worker'},
  wallet:{available:520,pending:150,earned:900,withdrawn:380,held:0},
  profile:{preferred_currency:'USD'},
  currencies:{USD:2},
  rates:[{currency:'USD',rate:1000000,updated_at:today}],
  exchange:{updated_at:today,last_error:''},
  tasks:[
    task('work-example-1','Evaluate a sample AI response','available',150,
      {category:'ai',reward_unit:'task',public_summary:'Demo: assess sample responses.'}),
    task('work-example-2','Transcribe an example clip','claimed',280,
      {category:'transcription',reward_unit:'clip',expected_minutes:20}),
    task('work-example-3','Annotate an image sample','submitted',90,
      {category:'annotation'})
  ],
  withdrawals:[{id:'withdraw-example',user_id:'worker-fixture',amount:380,
    status:'paid',destination:'masked demo destination',created_at:new Date(today).toISOString()}],
  submissions:[],transactions:[]
};
const json=(res,obj)=>{res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(obj));};
export const server=http.createServer((req,res)=>{
  const pathName=new URL(req.url,'http://localhost').pathname;
  if(pathName==='/api/events'){
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
    res.write('retry: 30000\n\n');return;
  }
  if(pathName==='/api/state')return json(res,state);
  if(pathName==='/api/profile')return json(res,{email:'worker@example.test',role:'worker',
    joined:'2026-11-01',username:'worker',currency:'USD',referralLink:'https://taskharbor.test/r/demo'});
  if(pathName==='/api/payout-feed')return json(res,[{
    username:'synthetic-worker',amount:120,destination:'07xxxxxxx42',created_at:'2026-11-01T12:00:00Z'
  }]);
  if(pathName==='/api/contact')return json(res,{user:state.user,contacts:{phone:''},
    prefs:{email_enabled:false,push_enabled:false},threads:[],members:[],
    config:{emailReady:false,pushReady:false,supportEmail:'support@invalid.test',supportTelegram:'',publicKey:''}});
  if(pathName==='/api/notifications')return json(res,{notifications:[]});
  if(pathName.startsWith('/api/')){res.writeHead(404);return res.end('Synthetic lab endpoint not implemented');}
  const source=pages[pathName] || (pathName.startsWith('/')?pathName.slice(1):'');
  if(!/^[a-z0-9][a-z0-9.\-]*$/i.test(source)){res.writeHead(404);return res.end('Not found');}
  try{
    const file=path.join(dir,source);
    const value=readFileSync(file);
    res.writeHead(200,{'Content-Type':types[path.extname(source)] || 'application/octet-stream',
      'Cache-Control':'no-store',
      'Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'"});
    res.end(value);
  } catch{
    res.writeHead(404);res.end('Not found');
  }
});
if(process.argv[1]===fileURLToPath(import.meta.url)){
  server.listen(Number(process.env.PORT || 4777),'127.0.0.1',()=>{
    console.log('Synthetic TaskHarbor visual lab listening on '+server.address().port);
  });
}
