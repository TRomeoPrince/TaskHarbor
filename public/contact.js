const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state,threadId,threadStatus;
async function api(path,body){const r=await fetch('/api/'+path,body===undefined?{credentials:'same-origin',cache:'no-store'}:{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');return data;}
async function act(fn){try{$('notice').textContent='';await fn();}catch(e){$('notice').textContent=e.message;}}
const formData=f=>Object.fromEntries(new FormData(f));
function empty(title,detail){return '<div class="empty-state"><strong>'+esc(title)+'</strong>'+esc(detail)+'</div>';}
function relativePath(value){const url=String(value||'');return url.startsWith('/')&&!url.startsWith('//')?url:'/';}
async function inbox(){
 const data=await api('notifications');const items=data.notifications||[];
 $('inbox-summary').textContent=items.length?items.filter(n=>!n.read_at).length+' unread':'All caught up';
 $('alerts').innerHTML=items.length?items.map(n=>`<div class="alert-row"><h3>${esc(n.title)}</h3><p>${esc(n.body)}</p><a href="${esc(relativePath(n.url))}">Open update</a> <button type="button" data-read="${esc(n.id)}" ${n.read_at?'disabled':''}>${n.read_at?'Read':'Mark read'}</button></div>`).join(''):empty('No new activity','Task and support updates will appear here when available.');
}
async function load(){
 state=await api('contact');const admin=state.user.role==='admin';
 $('content').hidden=false;
 $('support-eyebrow').textContent=admin?'TASKHARBOR · ADMIN CONSOLE':'TASKHARBOR · SUPPORT';
 $('support-heading').textContent=admin?'Support center.':'Help is right here.';
 $('support-description').textContent=admin?'Review member questions, reply securely and monitor operational alerts.':'Talk privately with our team, check replies and manage your alerts in one organized space.';
 $('support-threads-title').textContent=admin?'Member conversations':'My conversations';
 $('thread-caption').textContent=admin?'Questions from members, ordered by recent activity.':'Your messages and replies are private to you and the support team.';
 $('user-contact').hidden=admin;
 $('support-compose').hidden=admin;
 $('help-contacts').hidden=admin;
 $('directory').hidden=!admin;
 $('contacts').elements.phone.value=state.contacts?.phone||'';
 const emailReady=!!state.config.emailReady,pushReady=!!state.config.pushReady;
 const showSettings=!admin&&(emailReady||pushReady);
 $('notification-settings').hidden=!showSettings;
 $('email-preference').hidden=!emailReady;$('push-preference').hidden=!pushReady;
 $('preferences').elements.email.checked=!!state.prefs.email_enabled;
 $('preferences').elements.push.checked=!!state.prefs.push_enabled;
 $('preferences').elements.email.disabled=!emailReady;
 $('preferences').elements.push.disabled=!pushReady;
 $('configuration').textContent='Choose how TaskHarbor should deliver optional account updates.';
 $('audience').textContent=admin?'New submissions, support messages and administrative events appear here.':'Find task updates and replies to your support requests.';
 $('device-note').textContent=pushReady?'Device alerts require browser permission. On iPhone, install TaskHarbor to your Home Screen first.':'';
 $('enable-push').hidden=!pushReady;$('disable-push').hidden=!pushReady;
 $('enable-push').disabled=!pushReady||!('serviceWorker' in navigator)||!('PushManager' in window);
 $('public-contacts').replaceChildren();
 if(state.config.supportEmail){const email=document.createElement('a');email.href='mailto:'+state.config.supportEmail;email.textContent=state.config.supportEmail;$('public-contacts').append(email);}
 if(state.config.supportTelegram){const telegram=document.createElement('a');telegram.href=state.config.supportTelegram;telegram.textContent='TaskHarbor Telegram';telegram.target='_blank';telegram.rel='noopener noreferrer';$('public-contacts').append(telegram);}
 $('thread-count').textContent=(state.threads||[]).length+' conversations';
 $('threads').innerHTML=state.threads.length?state.threads.map(t=>`<button class="thread-row" type="button" data-thread="${esc(t.id)}"><span><span class="thread-title">${esc(t.subject)}</span><span class="thread-meta">${admin?esc(t.email)+' · ':''}${esc(t.updated_at?new Date(t.updated_at).toLocaleString():'Conversation')}</span></span><span class="thread-status ${t.status==='closed'?'closed':''}">${esc(t.status)}</span></button>`).join(''):empty(admin?'No support requests yet':'No conversations yet',admin?'Incoming member questions will be listed here.':'Start a conversation below whenever you need help.');
 $('members').innerHTML=(state.members||[]).length?state.members.map(m=>`<div class="member-row"><strong>${esc(m.email)}</strong><p>Phone: ${esc(m.phone||'Not provided')}</p></div>`).join(''):empty('No contact numbers','Members who choose to save contact details will appear here.');
 await inbox();
}
async function conversation(id){
 const d=await api('support?threadId='+encodeURIComponent(id));threadId=id;threadStatus=d.thread.status;
 $('conversation').hidden=false;$('thread-title').textContent=d.thread.subject;$('thread-status').textContent='Status: '+threadStatus;
 $('messages').innerHTML=d.messages.map(m=>`<article class="${m.role==='admin'?'from-admin':'from-member'}"><strong>${m.role==='admin'?'TaskHarbor support':'Member'}</strong><p>${esc(m.content)}</p><small>${esc(new Date(m.created_at).toLocaleString())}</small></article>`).join('');
 $('reply').hidden=threadStatus==='closed';$('toggle-thread').hidden=state.user.role!=='admin';$('toggle-thread').textContent=threadStatus==='open'?'Close conversation':'Reopen conversation';
}
$('contacts').onsubmit=e=>{e.preventDefault();act(async()=>{await api('member-contacts',formData(e.target));$('notice').textContent='Contact details saved.';});};
$('new-thread').onsubmit=e=>{e.preventDefault();act(async()=>{const d=await api('support',formData(e.target));e.target.reset();await load();await conversation(d.threadId);$('notice').textContent='Message sent to TaskHarbor support.';});};
$('reply').onsubmit=e=>{e.preventDefault();act(async()=>{await api('support-message',{...formData(e.target),threadId});e.target.reset();await conversation(threadId);});};
$('toggle-thread').onclick=()=>act(async()=>{await api('support-status',{threadId,status:threadStatus==='open'?'closed':'open'});await load();await conversation(threadId);});
$('threads').onclick=e=>{const b=e.target.closest('[data-thread]');if(b)act(()=>conversation(b.dataset.thread));};
$('alerts').onclick=e=>{const b=e.target.closest('[data-read]');if(b)act(async()=>{await api('notification-read',{id:b.dataset.read});await inbox();});};
$('refresh-alerts').onclick=()=>act(inbox);
$('preferences').onsubmit=e=>{e.preventDefault();act(async()=>{const d=await api('notification-preferences',{emailEnabled:e.target.elements.email.checked,pushEnabled:e.target.elements.push.checked});await load();$('notice').textContent=d.confirmationRequired?'Check your account email and confirm to enable email alerts.':'Preferences saved.';});};
function keyBytes(key){const s=atob(key.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(key.length/4)*4,'='));return Uint8Array.from(s,c=>c.charCodeAt(0));}
$('enable-push').onclick=()=>act(async()=>{
 const registration=await navigator.serviceWorker.register('/notifications-sw.js');await navigator.serviceWorker.ready;
 const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Notification permission was not granted. You can change it in browser settings.');
 const sub=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(state.config.publicKey)});
 await api('push-subscription',{subscription:sub.toJSON()});await load();$('notice').textContent='This device is subscribed.';
});
$('disable-push').onclick=()=>act(async()=>{const r=await navigator.serviceWorker?.getRegistration('/');const sub=await r?.pushManager.getSubscription();if(sub){await api('push-unsubscribe',{endpoint:sub.endpoint});await sub.unsubscribe();}$('notice').textContent='This device was removed.';});
const params=new URLSearchParams(location.search);
$('confirm-email').hidden=!params.has('confirm');
$('confirm-email').onclick=()=>act(async()=>{await api('notification-confirm',{token:params.get('confirm')});history.replaceState(null,'','/contact');$('confirm-email').hidden=true;await load();$('notice').textContent='Email alerts enabled.';});
act(async()=>{try{await load();if(params.has('thread'))await conversation(params.get('thread'));}catch(e){if(e.message==='Please log in'){$('notice').innerHTML='Your session is not available. <a href="/#sign-in">Sign in to continue</a>.';}else throw e;}});
// In-app refresh only; it does not ask for notification permission automatically.
let stream;
if('EventSource' in window){stream=new EventSource('/api/events');stream.addEventListener('change',()=>{if(state)act(async()=>{await inbox();if(threadId)await conversation(threadId);});});}
