import './config.js';
import {hash,verify} from './auth.js';
import {profileRoute} from './profile.js';
import http from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {randomUUID,randomBytes} from 'node:crypto';
import {openStore,atomic,wallet,claim,entry,expireClaims} from './store.js';
import {initialize,enrich,route} from './features.js';
import {fileURLToPath} from 'node:url';
import {provisionProfiles,registerProfile,payoutFeed} from './community.js';
import {refreshRates,restoreCurrencies} from './exchange.js';

mkdirSync(new URL('./data/',import.meta.url),{recursive:true});

const db=openStore(
 process.env.DB_PATH ||
 fileURLToPath(new URL('./data/app.sqlite',import.meta.url))
);

initialize(db);
provisionProfiles(db);
restoreCurrencies(db);

const clients=new Set();

const expiryTimer=setInterval(()=>{
 if(expireClaims(db))broadcast();
},15000);

expiryTimer.unref();

function broadcast(){
 for(const client of clients){
  client.res.write('event: change\ndata: {}\n\n');
 }
}

if(process.env.NO_LISTEN!=='1'){
 const update=()=>refreshRates(db).then(changed=>{
  if(changed)broadcast();
 });

 update();

 const exchangeTimer=setInterval(update,30*60000);
 exchangeTimer.unref();
}

const heartbeat=setInterval(()=>{
 for(const client of clients){
  if(
   client.expires<Date.now() ||
   !db.prepare('SELECT token FROM sessions WHERE token=?').get(client.token)
  ){
   client.res.end();
   clients.delete(client);
  }else{
   client.res.write(': heartbeat\n\n');
  }
 }
},15000);

heartbeat.unref();

if(!db.prepare("SELECT id FROM users WHERE role='admin'").get()){
 const password=
  process.env.ADMIN_PASSWORD ||
  randomBytes(15).toString('base64url');

 db.prepare(
  'INSERT INTO users(id,email,password_hash,role) VALUES(?,?,?,?)'
 ).run(
  randomUUID(),
  process.env.ADMIN_EMAIL||'admin@local.test',
  hash(password),
  'admin'
 );

 console.log(
  'Initial admin:',
  process.env.ADMIN_EMAIL||'admin@local.test',
  'Password:',
  password
 );
}

const fail=(message,status=400)=>{
 throw Object.assign(new Error(message),{status});
};

const str=(v,max=10000)=>{
 if(
  typeof v!=='string' ||
  !v.trim() ||
  v.length>max
 )fail('Invalid or missing text field');

 return v.trim();
};

const amount=v=>{
 if(
  !Number.isSafeInteger(v) ||
  v<=0 ||
  v>100000000
 )fail('Amount must be positive integer cents');

 return v;
};

const attempts=new Map();

const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Cache-Control','no-store');
 res.setHeader(
  'Content-Security-Policy',
  "default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'"
 );

 try{
  const path=new URL(req.url,'http://localhost').pathname;

  if(req.method==='GET'&&path.startsWith('/r/')){
   const code=path.slice(3);

   if(
    !db.prepare(
     'SELECT code FROM referral_links WHERE code=?'
    ).get(code)
   ){
    fail('Referral link not found',404);
   }

   res.writeHead(
    302,
    {Location:'/?ref='+encodeURIComponent(code)}
   );

   return res.end();
  }

  if(req.method==='GET'&&!path.startsWith('/api/')){
  const file={
  '/':'index.html',
  '/app.js':'app.js',
  '/style.css':'style.css',
  '/payouts':'payouts.html',
  '/payouts/':'payouts.html',
  '/profile':'profile.html',
  '/profile/':'profile.html',
  '/profile.js':'profile.js',
  '/clipboard.js':'clipboard.js',
  '/payouts.js':'payouts.js',
  '/preview.png':'preview.png'
}[path];

   if(!file)fail('Not found',404);

   res.setHeader(
  'Content-Type',
  file.endsWith('js') ? 'text/javascript' :
  file.endsWith('css') ? 'text/css' :
  file.endsWith('png') ? 'image/png' :
  'text/html'
);

   return res.end(
    readFileSync(
     new URL('./public/'+file,import.meta.url)
    )
   );
  }

  const publicOrigin=
   process.env.PUBLIC_ORIGIN
    ?new URL(process.env.PUBLIC_ORIGIN).origin
    :null;

  const allowedOrigins=new Set([
   `http://${req.headers.host}`,
   ...(publicOrigin?[publicOrigin]:[])
  ]);

  if(
   req.method==='POST' &&
   req.headers.origin &&
   !allowedOrigins.has(req.headers.origin)
  ){
   fail('Invalid origin',403);
  }

  let body={};

  if(req.method==='POST'){
   let raw='';

   for await(const chunk of req){
    raw+=chunk;

    if(raw.length>14000000){
     fail('Request too large',413);
    }
   }

   body=JSON.parse(raw||'{}');
  }

  const token=
   (req.headers.cookie||'')
    .match(/(?:^|;\s*)session=([^;]+)/)?.[1];

  const user=
   db.prepare(
    'SELECT u.id,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?'
   ).get(
    token||'',
    Date.now()
   );

  let result;

  if(path==='/api/register'||path==='/api/login'){
   if(req.method!=='POST'){
    fail('Method not allowed',405);
   }

   const key=req.socket.remoteAddress;
   const a=attempts.get(key)||{
    n:0,
    until:Date.now()+60000
   };

   if(Date.now()>a.until){
    a.n=0;
    a.until=Date.now()+60000;
   }

   if(++a.n>20){
    fail('Try again in a minute',429);
   }

   attempts.set(key,a);

   const email=
    str(body.email,254).toLowerCase();

   const password=
    str(body.password,256);

   if(
    !email.includes('@') ||
    password.length<10
   ){
    fail(
     'Use a valid email and a password of at least 10 characters'
    );
   }

   if(path==='/api/register'){
    try{
     atomic(db,()=>{
      const id=randomUUID();

      db.prepare(
       'INSERT INTO users(id,email,password_hash,role) VALUES(?,?,?,?)'
      ).run(
       id,
       email,
       hash(password),
       'worker'
      );

      registerProfile(
       db,
       id,
       body.username||'',
       body.referralCode||''
      );
     });
    }catch(e){
     fail(
      e.message.includes('UNIQUE')
       ?'Email or username already registered'
       :e.message
     );
    }
   }

   const u=
    db.prepare(
     'SELECT * FROM users WHERE email=?'
    ).get(email);

   if(!u||!verify(password,u.password_hash)){
    fail('Invalid credentials',401);
   }

   const t=randomBytes(32).toString('hex');

   db.prepare(
    'INSERT INTO sessions VALUES(?,?,?)'
   ).run(
    t,
    u.id,
    Date.now()+86400000
   );

   res.setHeader(
    'Set-Cookie',
    `session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${
     publicOrigin?.startsWith('https:')
      ?'; Secure'
      :''
    }`
   );

   result={ok:true};
  }else{
   if(!user){
    fail('Please log in',401);
   }

   if(expireClaims(db)){
    broadcast();
   }

   const profileResult=
    profileRoute(
     db,
     user,
     path,
     body,
     req.method,
     token
    );

   if(profileResult!==null){
    if(req.method==='POST'){
     broadcast();
    }

    res.setHeader(
     'Content-Type',
     'application/json'
    );

    return res.end(
     JSON.stringify(profileResult)
    );
   }

   if(
    req.method==='GET' &&
    path==='/api/payout-feed'
   ){
    res.setHeader(
     'Content-Type',
     'application/json'
    );

    return res.end(
     JSON.stringify(
      payoutFeed(db)
     )
    );
   }

   if(
    req.method==='GET' &&
    path==='/api/events'
   ){
    res.writeHead(
     200,
     {
      'Content-Type':'text/event-stream',
      'Connection':'keep-alive',
      'X-Accel-Buffering':'no'
     }
    );

    res.write(
     'retry: 3000\nevent: change\ndata: {}\n\n'
    );

    const session=
     db.prepare(
      'SELECT expires FROM sessions WHERE token=?'
     ).get(token);

    const client={
     res,
     token,
     expires:session.expires
    };

    clients.add(client);

    res.on(
     'close',
     ()=>clients.delete(client)
    );

    return;
   }

   const featureResult=
    route(
     db,
     user,
     path,
     body,
     req,
     res
    );

   if(featureResult==='sent'){
    return;
   }

   if(featureResult!==null){
    broadcast();

    res.setHeader(
     'Content-Type',
     'application/json'
    );

    return res.end(
     JSON.stringify(featureResult)
    );
   }

   if(
    req.method==='GET' &&
    path==='/api/state'
   ){
    result={
     user,
     wallet:wallet(db,user.id),

     tasks:
      db.prepare(
       user.role==='admin'
        ?'SELECT * FROM tasks ORDER BY created_at DESC'
        :"SELECT * FROM tasks WHERE status='available' OR worker_id=? ORDER BY created_at DESC"
      ).all(
       ...(user.role==='admin'
        ?[]
        :[user.id])
      ),

     submissions:
      db.prepare(
       user.role==='admin'
        ?'SELECT * FROM submissions'
        :'SELECT * FROM submissions WHERE worker_id=?'
      ).all(
       ...(user.role==='admin'
        ?[]
        :[user.id])
      ),

     transactions:
      db.prepare(
       'SELECT * FROM ledger WHERE user_id=? ORDER BY created_at DESC'
      ).all(user.id),

     withdrawals:
      db.prepare(
       user.role==='admin'
        ?'SELECT w.*,u.email FROM withdrawals w JOIN users u ON u.id=w.user_id'
        :'SELECT * FROM withdrawals WHERE user_id=?'
      ).all(
       ...(user.role==='admin'
        ?[]
        :[user.id])
      )
    };
   }else if(req.method==='POST'){
    if(path==='/api/logout'){
     db.prepare(
      'DELETE FROM sessions WHERE token=?'
     ).run(token);

     res.setHeader(
      'Set-Cookie',
      'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'
     );
    }else if(path==='/api/claim'){
     if(user.role!=='worker'){
      fail('Worker account required');
     }

     claim(
      db,
      str(body.taskId),
      user.id
     );
    }else{
     if(user.role!=='admin'){
      fail('Admin access required',403);
     }

     if(path==='/api/payout'){
      atomic(db,()=>{
       const w=
        db.prepare(
         "SELECT * FROM withdrawals WHERE id=? AND status='requested'"
        ).get(
         str(body.id)
        );

       if(!w){
        fail(
         'Withdrawal already processed or missing'
        );
       }

       if(
        !['paid','rejected']
         .includes(body.decision)
       ){
        fail('Invalid decision');
       }

       const ref=
        str(body.reference,500);

       db.prepare(
        'UPDATE withdrawals SET status=?,reference=? WHERE id=?'
       ).run(
        body.decision,
        ref,
        w.id
       );

       if(body.decision==='paid'){
        db.prepare(
         'INSERT INTO paid_dates(withdrawal_id) VALUES(?)'
        ).run(w.id);
       }

       if(body.decision==='rejected'){
        entry(
         db,
         w.user_id,
         'refund',
         w.amount,
         null,
         w.id
        );
       }
      });
     }else{
      fail('Not found',404);
     }
    }

    result={ok:true};
   }else{
    fail('Not found',404);
   }
  }

  if(path==='/api/state'){
   result=enrich(db,user,result);
  }

  if(req.method==='POST'){
   broadcast();
  }

  res.setHeader(
   'Content-Type',
   'application/json'
  );

  res.end(
   JSON.stringify(result)
  );

 }catch(e){
  res.statusCode=e.status||400;

  res.setHeader(
   'Content-Type',
   'application/json'
  );

  res.end(
   JSON.stringify({
    error:
     e.message.includes('UNIQUE')
      ?'Duplicate provider task or record'
      :e.message
   })
  );
 }
});

export {server,db};

if(process.env.NO_LISTEN!=='1'){
 const port=Number(
  process.env.X_ZOHO_CATALYST_LISTEN_PORT ||
  process.env.PORT ||
  3000
 );

 const host=
  process.env.X_ZOHO_CATALYST_LISTEN_PORT
   ?'0.0.0.0'
   :'127.0.0.1';

 server.listen(
  port,
  host,
  ()=>{
   console.log(
    `Microtasks running at http://${host}:${server.address().port}`
   );
  }
 );
}