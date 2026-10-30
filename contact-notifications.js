import {randomUUID, randomBytes, createHash} from 'node:crypto';
const postgresAtomic=async fn=>(await import('./db-postgres.js')).postgresAtomic(fn);
const clean=(v,max,optional=false)=>{
 if(typeof v!=='string'||v.length>max||(!optional&&!v.trim()))throw Error('Enter valid text (maximum '+max+' characters)');
 return v.trim();
};
const digest=t=>createHash('sha256').update(t).digest('hex');
const origin=()=>{const u=new URL(process.env.PUBLIC_ORIGIN||'http://localhost:3000');return u.origin;};
export function notificationConfig(){return {
 pushReady:Boolean(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_SUBJECT),
 emailReady:Boolean(process.env.SMTP_HOST&&process.env.MAIL_FROM),
 publicKey:process.env.VAPID_PUBLIC_KEY||'',
 supportEmail:process.env.SUPPORT_EMAIL||'',supportPhone:process.env.SUPPORT_PHONE||''
};}
export function validateSubscription(value){
 if(!value||typeof value!=='object')throw Error('Invalid push subscription');
 const u=new URL(value.endpoint);
 const hosts=['fcm.googleapis.com','updates.push.services.mozilla.com','push.services.mozilla.com','web.push.apple.com','notify.windows.com'];
 if(u.protocol!=='https:'||u.port&&u.port!=='443'||u.username||u.password||u.hash||!hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))throw Error('Unsupported push service');
 if(value.endpoint.length>2048||!/^[-_a-zA-Z0-9]{87}$/.test(value.keys?.p256dh||'')||!/^[-_a-zA-Z0-9]{22}$/.test(value.keys?.auth||''))throw Error('Invalid push keys');
 return {endpoint:value.endpoint,keys:{p256dh:value.keys.p256dh,auth:value.keys.auth}};
}
async function preference(tx,id){await tx.run('INSERT INTO notification_preferences(user_id) VALUES(?) ON CONFLICT DO NOTHING',id);return tx.get('SELECT * FROM notification_preferences WHERE user_id=?',id);}
export async function contactRoute(db,user,path,body,method){
 if(!['/api/contact','/api/member-contacts','/api/support','/api/support-message','/api/support-status','/api/notification-preferences','/api/notification-confirm','/api/push-subscription','/api/push-unsubscribe','/api/notifications','/api/notification-read'].includes(path))return null;
 if(!user)throw Error('Please log in');
 if(path==='/api/contact'&&method==='GET'){
  const contacts=await db.get('SELECT phone,whatsapp FROM member_contacts WHERE user_id=?',user.id)||{phone:'',whatsapp:''};
  const prefs=await db.get('SELECT email_enabled,push_enabled FROM notification_preferences WHERE user_id=?',user.id)||{email_enabled:false,push_enabled:false};
  const threads=user.role==='admin'?await db.all('SELECT t.*,u.email FROM support_threads t JOIN users u ON u.id=t.user_id ORDER BY t.updated_at DESC LIMIT 100'):await db.all('SELECT * FROM support_threads WHERE user_id=? ORDER BY updated_at DESC LIMIT 100',user.id);
  const members=user.role==='admin'?await db.all('SELECT u.id,u.email,c.phone,c.whatsapp FROM users u JOIN member_contacts c ON c.user_id=u.id ORDER BY u.created_at DESC LIMIT 500'):[];
  return {user,contacts,prefs,threads,members,config:notificationConfig()};
 }
 if(path==='/api/notifications'&&method==='GET')return {notifications:await db.all('SELECT id,title,body,url,read_at,created_at FROM notification_inbox WHERE user_id=? ORDER BY created_at DESC LIMIT 100',user.id)};
 if(path==='/api/support'&&method==='GET'){
  const thread=await db.get('SELECT * FROM support_threads WHERE id=?',body.threadId);
  if(!thread||(user.role!=='admin'&&thread.user_id!==user.id))throw Error('Support conversation not found');
  return {thread,messages:await db.all('SELECT m.id,m.content,m.created_at,u.role FROM support_messages m JOIN users u ON u.id=m.sender_id WHERE thread_id=? ORDER BY m.created_at,m.id LIMIT 500',thread.id)};
 }
 if(method!=='POST')throw Error('Method not allowed');
 return postgresAtomic(async tx=>{
  if(path==='/api/member-contacts'){
   const phone=clean(body.phone??'',32,true),whatsapp=clean(body.whatsapp??'',32,true);
   if([phone,whatsapp].some(v=>v&&!/^\+?[0-9 ()-]{5,32}$/.test(v)))throw Error('Enter a valid phone or WhatsApp number');
   await tx.run('INSERT INTO member_contacts(user_id,phone,whatsapp) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET phone=EXCLUDED.phone,whatsapp=EXCLUDED.whatsapp,updated_at=now()',user.id,phone,whatsapp);return {ok:true};
  }
  if(path==='/api/support'||path==='/api/support-message'){
   const content=clean(body.content,5000);let thread;
   if(path==='/api/support'){
    const subject=clean(body.subject,150);
    const recent=await tx.get("SELECT count(*) n FROM support_threads WHERE user_id=? AND created_at>now()-interval '1 hour'",user.id);
    if(Number(recent.n)>=5)throw Error('Please wait before opening another conversation');
    thread={id:randomUUID(),user_id:user.id};await tx.run('INSERT INTO support_threads(id,user_id,subject) VALUES(?,?,?)',thread.id,user.id,subject);
   }else{
    thread=await tx.get('SELECT * FROM support_threads WHERE id=? FOR UPDATE',clean(body.threadId,100));
    if(!thread||(user.role!=='admin'&&thread.user_id!==user.id))throw Error('Support conversation not found');
    if(thread.status==='closed')throw Error('Conversation is closed');
   }
   const recent=await tx.get("SELECT count(*) n FROM support_messages WHERE sender_id=? AND created_at>now()-interval '1 minute'",user.id);
   if(Number(recent.n)>=10)throw Error('Please wait before sending another message');
   await tx.run('INSERT INTO support_messages(id,thread_id,sender_id,content) VALUES(?,?,?,?)',randomUUID(),thread.id,user.id,content);
   await tx.run('UPDATE support_threads SET updated_at=now() WHERE id=?',thread.id);return {ok:true,threadId:thread.id};
  }
  if(path==='/api/support-status'){
   if(user.role!=='admin')throw Error('Admin access required');
   if(!['open','closed'].includes(body.status))throw Error('Invalid conversation status');
   if(!(await tx.run('UPDATE support_threads SET status=?,updated_at=now() WHERE id=?',body.status,clean(body.threadId,100))).changes)throw Error('Conversation not found');return {ok:true};
  }
  if(path==='/api/notification-preferences'){
   const p=await preference(tx,user.id);
   if(typeof body.emailEnabled!=='boolean'||typeof body.pushEnabled!=='boolean')throw Error('Invalid notification preferences');
   if(body.pushEnabled&&!notificationConfig().pushReady)throw Error('Push notifications are not configured yet');
   if(!body.emailEnabled)await tx.run('UPDATE notification_preferences SET email_enabled=false,confirm_hash=NULL,confirm_expires=NULL WHERE user_id=?',user.id);
   else if(!p.email_enabled){
    if(!notificationConfig().emailReady)throw Error('Email notifications are not configured yet');
    if(Date.now()-Number(p.confirm_requested)<600000)throw Error('Check your email or wait ten minutes before requesting another confirmation');
    const token=randomBytes(32).toString('hex'),key='confirm:'+randomUUID();
    await tx.run('UPDATE notification_preferences SET confirm_hash=?,confirm_expires=?,confirm_requested=? WHERE user_id=?',digest(token),Date.now()+86400000,Date.now(),user.id);
    await tx.run("INSERT INTO notification_outbox(id,user_id,event_key,channel,target,payload) VALUES(?,?,?,'email',?,?)",randomUUID(),user.id,key,user.email,JSON.stringify({title:'Confirm TaskHarbor email alerts',body:'You requested email notifications. Confirm to enable them. If this was not you, ignore this email.',url:'/contact?confirm='+token,confirmation:true}));
   }
   await tx.run('UPDATE notification_preferences SET push_enabled=? WHERE user_id=?',body.pushEnabled,user.id);
   // Cancel queued regular alerts on opt-out; confirmation emails are separate.
   if(!body.emailEnabled)await tx.run("UPDATE notification_outbox SET status='cancelled' WHERE user_id=? AND channel='email' AND status='pending'",user.id);
   if(!body.pushEnabled)await tx.run("UPDATE notification_outbox SET status='cancelled' WHERE user_id=? AND channel='push' AND status='pending'",user.id);
   return {ok:true,confirmationRequired:body.emailEnabled&&!p.email_enabled};
  }
  if(path==='/api/notification-confirm'){
   const token=clean(body.token,64);if(!/^[a-f0-9]{64}$/.test(token))throw Error('Invalid confirmation');
   const r=await tx.run('UPDATE notification_preferences SET email_enabled=true,confirm_hash=NULL,confirm_expires=NULL WHERE user_id=? AND confirm_hash=? AND confirm_expires>?',user.id,digest(token),Date.now());
   if(!r.changes)throw Error('Confirmation expired or already used');return {ok:true};
  }
  if(path==='/api/push-subscription'){
   if(!notificationConfig().pushReady)throw Error('Push notifications are not configured yet');
   const sub=validateSubscription(body.subscription);await preference(tx,user.id);
   const count=await tx.get('SELECT count(*) n FROM push_subscriptions WHERE user_id=?',user.id);
   if(Number(count.n)>=10&&!await tx.get('SELECT id FROM push_subscriptions WHERE endpoint=? AND user_id=?',sub.endpoint,user.id))throw Error('Maximum ten subscribed devices');
   const r=await tx.run('INSERT INTO push_subscriptions(id,user_id,endpoint,subscription) VALUES(?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET subscription=EXCLUDED.subscription WHERE push_subscriptions.user_id=EXCLUDED.user_id',randomUUID(),user.id,sub.endpoint,JSON.stringify(sub));
   if(!r.changes)throw Error('This browser subscription belongs to another account; disable it in that account first');
   await tx.run('UPDATE notification_preferences SET push_enabled=true WHERE user_id=?',user.id);return {ok:true};
  }
  if(path==='/api/push-unsubscribe'){
   await tx.run('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?',user.id,clean(body.endpoint,2048));return {ok:true};
  }
  if(path==='/api/notification-read'){
   await tx.run('UPDATE notification_inbox SET read_at=now() WHERE id=? AND user_id=?',clean(body.id,100),user.id);return {ok:true};
  }
  throw Error('Method not allowed');
 });
}

// Source scanning and delivery are separate from the task/submission transactions.
// A provider outage cannot turn a successful publish/submit into an application error.
export async function scanNotifications(db){
 const events=await db.all(`SELECT * FROM (SELECT 'task:'||id event_key,'task' kind,id ref,created_at FROM tasks WHERE created_at >= (SELECT installed_at FROM notification_installation WHERE id=1)
 UNION ALL SELECT 'submission:'||id,'submission',task_id,created_at FROM submissions WHERE created_at >= (SELECT installed_at FROM notification_installation WHERE id=1)
 UNION ALL SELECT 'support:'||id,'support',thread_id,created_at FROM support_messages WHERE created_at >= (SELECT installed_at FROM notification_installation WHERE id=1)
  ) events WHERE NOT EXISTS (SELECT 1 FROM notification_sources n WHERE n.event_key=events.event_key) ORDER BY created_at,event_key LIMIT 500`);
 for(const event of events){
  await postgresAtomic(async tx=>{
   if(!(await tx.run('INSERT INTO notification_sources(event_key) VALUES(?) ON CONFLICT DO NOTHING',event.event_key)).changes)return;
   let recipients,title,body,url;
   if(event.kind==='task'){
    const task=await tx.get('SELECT status,title FROM tasks WHERE id=?',event.ref);if(!task||task.status!=='available')return;
    recipients=await tx.all("SELECT id,email FROM users WHERE role='worker'");title='New task on TaskHarbor';body='A new task is available. Open TaskHarbor to review the requirements.';url='/?task='+encodeURIComponent(event.ref)+'#task-'+event.ref;
   }else if(event.kind==='submission'){
    recipients=await tx.all("SELECT id,email FROM users WHERE role='admin'");title='Task submission received';body='A member submitted work for review.';url='/?task='+encodeURIComponent(event.ref)+'#task-'+event.ref;
   }else{
    const message=await tx.get('SELECT m.sender_id,u.role,t.user_id FROM support_messages m JOIN users u ON u.id=m.sender_id JOIN support_threads t ON t.id=m.thread_id WHERE m.id=?',event.event_key.slice(8));if(!message)return;
    recipients=message.role==='admin'?await tx.all('SELECT id,email FROM users WHERE id=? AND id<>?',message.user_id,message.sender_id):await tx.all("SELECT id,email FROM users WHERE role='admin' AND id<>?",message.sender_id);
    title='TaskHarbor support reply';body='You have a new message in your support inbox.';url='/contact?thread='+encodeURIComponent(event.ref);
   }
   for(const person of recipients){
    await tx.run('INSERT INTO notification_inbox(id,user_id,event_key,title,body,url) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING',randomUUID(),person.id,event.event_key,title,body,url);
    const prefs=await tx.get('SELECT * FROM notification_preferences WHERE user_id=?',person.id);if(!prefs)continue;
    const payload=JSON.stringify({title,body,url});
    if(prefs.email_enabled)await tx.run("INSERT INTO notification_outbox(id,user_id,event_key,channel,target,payload) VALUES(?,?,?,'email',?,?) ON CONFLICT DO NOTHING",randomUUID(),person.id,event.event_key,person.email,payload);
    if(prefs.push_enabled)for(const sub of await tx.all('SELECT id FROM push_subscriptions WHERE user_id=?',person.id))await tx.run("INSERT INTO notification_outbox(id,user_id,event_key,channel,target,payload) VALUES(?,?,?,'push',?,?) ON CONFLICT DO NOTHING",randomUUID(),person.id,event.event_key,sub.id,payload);
   }
  });
 }
}
let transporter;
async function sendEmail(row,payload){
 const {default:nodemailer}=await import('nodemailer');
 transporter??=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',requireTLS:process.env.SMTP_SECURE!=='true',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined,connectionTimeout:10000,socketTimeout:15000});
 await transporter.sendMail({from:process.env.MAIL_FROM,to:row.target,subject:payload.title,text:payload.body+'\n\n'+new URL(payload.url,origin()).href+'\n\nManage alerts: '+origin()+'/contact',messageId:'<'+row.id+'@'+new URL(origin()).hostname+'>',disableFileAccess:true,disableUrlAccess:true});
}
async function sendPush(row,payload,subscription){
 const {default:webpush}=await import('web-push');
 await webpush.sendNotification(validateSubscription(subscription),JSON.stringify({...payload,tag:row.event_key}),{vapidDetails:{subject:process.env.VAPID_SUBJECT,publicKey:process.env.VAPID_PUBLIC_KEY,privateKey:process.env.VAPID_PRIVATE_KEY},timeout:10000,TTL:3600});
}
export async function deliverNotifications(db,senders={}){
 for(let i=0;i<25;i++){
  const row=await postgresAtomic(async tx=>{
   const r=await tx.get("SELECT * FROM notification_outbox WHERE (status='pending' AND next_attempt<=?) OR (status='sending' AND locked_until<?) ORDER BY next_attempt,id FOR UPDATE SKIP LOCKED LIMIT 1",Date.now(),Date.now());if(!r)return;
   await tx.run("UPDATE notification_outbox SET status='sending',attempts=attempts+1,locked_until=? WHERE id=?",Date.now()+300000,r.id);return {...r,attempts:Number(r.attempts)+1};
  });if(!row)break;
  try{
   const payload=JSON.parse(row.payload),prefs=await db.get('SELECT * FROM notification_preferences WHERE user_id=?',row.user_id);
   if(payload.confirmation){
    const token=new URL(payload.url,origin()).searchParams.get('confirm')||'';
    if(!prefs?.confirm_hash||prefs.confirm_hash!==digest(token)||Number(prefs.confirm_expires)<=Date.now()){
     await db.run("UPDATE notification_outbox SET status='cancelled',locked_until=0,payload='{}' WHERE id=?",row.id);continue;
    }
   }
   let sub;
   if(row.channel==='push')sub=await db.get('SELECT subscription FROM push_subscriptions WHERE id=? AND user_id=?',row.target,row.user_id);
   if((row.channel==='email'&&!payload.confirmation&&!prefs?.email_enabled)||(row.channel==='push'&&(!prefs?.push_enabled||!sub))){await db.run("UPDATE notification_outbox SET status='cancelled',locked_until=0 WHERE id=?",row.id);continue;}
   if(!senders[row.channel]&&!notificationConfig()[row.channel==='push'?'pushReady':'emailReady'])throw Error('Channel not configured');
   if(row.channel==='email')await (senders.email||sendEmail)(row,payload);
   else await (senders.push||sendPush)(row,payload,JSON.parse(sub.subscription));
   await db.run("UPDATE notification_outbox SET status='sent',sent_at=now(),locked_until=0,last_error=NULL,payload='{}' WHERE id=?",row.id);
  }catch(error){
   const permanent=row.channel==='push'&&[404,410].includes(error.statusCode);
   if(permanent)await db.run('DELETE FROM push_subscriptions WHERE id=? AND user_id=?',row.target,row.user_id);
   await db.run('UPDATE notification_outbox SET status=?,next_attempt=?,locked_until=0,last_error=? WHERE id=?',permanent||row.attempts>=5?'failed':'pending',Date.now()+Math.min(3600000,60000*2**row.attempts),permanent?'Push subscription expired':'Delivery failed; retry '+row.attempts,row.id);
  }
 }
}
let working=false;
export async function notificationTick(db){if(working)return;working=true;try{await db.run('INSERT INTO notification_installation(id) VALUES(1) ON CONFLICT DO NOTHING');await scanNotifications(db);await deliverNotifications(db);}catch{console.error('Notification processing failed; will retry');}finally{working=false;}}
