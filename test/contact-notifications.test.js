import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateSubscription} from '../contact-notifications.js';

test('Push destinations reject private/arbitrary hosts and malformed keys',()=>{
 const keys={p256dh:'a'.repeat(87),auth:'b'.repeat(22)};
 for(const endpoint of ['http://fcm.googleapis.com/a','https://127.0.0.1/a','https://fcm.googleapis.com.evil.test/a','https://fcm.googleapis.com:8443/a','https://user:pass@fcm.googleapis.com/a'])assert.throws(()=>validateSubscription({endpoint,keys}));
 assert.equal(validateSubscription({endpoint:'https://fcm.googleapis.com/fcm/send/example',keys}).keys.auth,keys.auth);
 assert.throws(()=>validateSubscription({endpoint:'https://fcm.googleapis.com/a',keys:{auth:'bad',p256dh:'bad'}}));
});

test('PostgreSQL: private contacts/support, opt-in delivery, deduplication and retry isolation',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const {Pool}=await import('pg');const schema='contacts_'+crypto.randomUUID().replaceAll('-','');
 const owner=new Pool({connectionString:process.env.TEST_DATABASE_URL});await owner.query('CREATE SCHEMA '+schema);
 process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;process.env.PGOPTIONS='-c search_path='+schema;
 const {pool}=await import('../postgres.js');const {postgresDb:db}=await import('../db-postgres.js');
 const {contactRoute,scanNotifications,deliverNotifications}=await import('../contact-notifications.js');
 try{
  await db.exec(await readFile(new URL('../neon-schema.sql',import.meta.url),'utf8'));
  await db.run('INSERT INTO notification_installation(id) VALUES(1) ON CONFLICT DO NOTHING');
  const admin={id:'admin',email:'admin@test.invalid',role:'admin'},worker={id:'worker',email:'worker@test.invalid',role:'worker'},other={id:'other',email:'other@test.invalid',role:'worker'};
  for(const u of [admin,worker,other])await db.run('INSERT INTO users(id,email,password_hash,role) VALUES(?,?,?,?)',u.id,u.email,'synthetic',u.role);
  await contactRoute(db,worker,'/api/member-contacts',{phone:'+256 700 000000',whatsapp:''},'POST');
  assert.equal((await contactRoute(db,other,'/api/contact',{},'GET')).contacts.phone,'');
  assert.equal((await contactRoute(db,other,'/api/contact',{},'GET')).members.length,0);
  assert.equal((await contactRoute(db,admin,'/api/contact',{},'GET')).members.length,1);
  const thread=await contactRoute(db,worker,'/api/support',{subject:'A question',content:'Please help'},'POST');
  await assert.rejects(contactRoute(db,other,'/api/support',{threadId:thread.threadId},'GET'),/not found/);
  await assert.rejects(contactRoute(db,other,'/api/support-message',{threadId:thread.threadId,content:'Intrusion'},'POST'),/not found/);
  await contactRoute(db,admin,'/api/support-message',{threadId:thread.threadId,content:'Hello'},'POST');
  assert.equal((await contactRoute(db,worker,'/api/support',{threadId:thread.threadId},'GET')).messages.length,2);
  await assert.rejects(contactRoute(db,worker,'/api/support-status',{threadId:thread.threadId,status:'closed'},'POST'),/Admin/);
  await contactRoute(db,admin,'/api/support-status',{threadId:thread.threadId,status:'closed'},'POST');
  await assert.rejects(contactRoute(db,worker,'/api/support-message',{threadId:thread.threadId,content:'Again'},'POST'),/closed/);
  process.env.SMTP_HOST='synthetic.invalid';process.env.MAIL_FROM='alerts@test.invalid';
  const consent=await contactRoute(db,worker,'/api/notification-preferences',{emailEnabled:true,pushEnabled:false},'POST');assert.equal(consent.confirmationRequired,true);
  assert.equal((await db.get('SELECT email_enabled FROM notification_preferences WHERE user_id=?',worker.id)).email_enabled,false);
  const confirmation=await db.get("SELECT payload FROM notification_outbox WHERE user_id=? AND event_key LIKE 'confirm:%'",worker.id);
  const token=new URL(JSON.parse(confirmation.payload).url,'https://taskharbor.test').searchParams.get('confirm');
  await assert.rejects(contactRoute(db,other,'/api/notification-confirm',{token},'POST'),/expired/);
  await contactRoute(db,worker,'/api/notification-confirm',{token},'POST');
  await assert.rejects(contactRoute(db,worker,'/api/notification-confirm',{token},'POST'),/expired/);
  await db.run("INSERT INTO tasks(id,title,description,reward) VALUES('new-task','New work','Private task details',100)");
  await scanNotifications(db);await scanNotifications(db);
  assert.equal(Number((await db.get("SELECT count(*) n FROM notification_inbox WHERE user_id='worker' AND event_key='task:new-task'")).n),1);
  assert.equal(Number((await db.get("SELECT count(*) n FROM notification_outbox WHERE event_key='task:new-task'")).n),1);
  assert.equal(Number((await db.get("SELECT count(*) n FROM notification_inbox WHERE user_id='admin' AND event_key='task:new-task'")).n),0);
  await deliverNotifications(db,{email:async()=>{throw Error('Synthetic provider failure with private contents');}});
  const queued=await db.get("SELECT status,attempts,last_error FROM notification_outbox WHERE event_key='task:new-task'");assert.equal(queued.status,'pending');assert.equal(Number(queued.attempts),1);assert.doesNotMatch(queued.last_error,/private contents/);
  assert.equal((await db.get("SELECT status FROM tasks WHERE id='new-task'")).status,'available');
  await db.run("UPDATE notification_outbox SET next_attempt=0 WHERE event_key='task:new-task'");let sent=0;
  await deliverNotifications(db,{email:async()=>{sent++;}});await deliverNotifications(db,{email:async()=>{sent++;}});assert.equal(sent,1);
  await db.run("INSERT INTO submissions(id,task_id,worker_id,content) VALUES('submission','new-task','worker','done')");await scanNotifications(db);
  assert.equal(Number((await db.get("SELECT count(*) n FROM notification_inbox WHERE user_id='admin' AND event_key='submission:submission'")).n),1);
  assert.equal(Number((await db.get("SELECT count(*) n FROM notification_inbox WHERE user_id='other' AND event_key='submission:submission'")).n),0);
  await contactRoute(db,worker,'/api/notification-preferences',{emailEnabled:false,pushEnabled:false},'POST');
  await db.run("INSERT INTO tasks(id,title,description,reward) VALUES('after-optout','More work','Details',100)");await scanNotifications(db);
  assert.equal(Number((await db.get("SELECT count(*) n FROM notification_outbox WHERE user_id='worker' AND event_key='task:after-optout'")).n),0);
 }finally{await pool.end();await owner.query('DROP SCHEMA '+schema+' CASCADE');await owner.end();}
});
