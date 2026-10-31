const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state,threadId,threadStatus;
async function api(path,body){const r=await fetch('/api/'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(r.status===401){location.replace('/login?next='+encodeURIComponent(location.pathname+location.search));throw Error('Please sign in to continue.');}if(!r.ok)throw Error(data.error||'Request failed');return data;}
async function act(fn){try{$('notice').textContent='';await fn();}catch(e){$('notice').textContent=e.message;}}
const formData=f=>Object.fromEntries(new FormData(f));
async function inbox(){const data=await api('notifications');$('alerts').innerHTML=data.notifications.length?data.notifications.map(n=>`<article><h3>${esc(n.title)}</h3><p>${esc(n.body)}</p><a href="${esc(n.url)}">Open</a> <button type="button" data-read="${esc(n.id)}" ${n.read_at?'disabled':''}>${n.read_at?'Read':'Mark read'}</button></article>`).join(''):'No notifications yet.';}
async function load(){
 state=await api('contact');$('content').hidden=false;
 $('contacts').elements.phone.value=state.contacts.phone;
 $('preferences').elements.email.checked=state.prefs.email_enabled;$('preferences').elements.push.checked=state.prefs.push_enabled;
 $('preferences').elements.email.disabled=!state.config.emailReady;$('preferences').elements.push.disabled=!state.config.pushReady;
 $('configuration').textContent=[!state.config.emailReady?'Email delivery is awaiting administrator setup.':'',!state.config.pushReady?'Push delivery is awaiting administrator setup.':''].filter(Boolean).join(' ');
 $('audience').textContent=state.user.role==='admin'?'Receive submission and support alerts.':'Receive new-task and support-reply alerts. You can turn either channel off anytime.';
 $('device-note').textContent='Push requires a supported browser and permission on each device. On iPhone or iPad, add TaskHarbor to your Home Screen and open it there first.';
 $('enable-push').disabled=!state.config.pushReady||!('serviceWorker' in navigator)||!('PushManager' in window);
 $('public-contacts').replaceChildren();
 if(state.config.supportEmail){const email=document.createElement('a');email.href='mailto:'+state.config.supportEmail;email.textContent=state.config.supportEmail;$('public-contacts').append(email);}
 if(state.config.supportTelegram){const telegram=document.createElement('a');telegram.href=state.config.supportTelegram;telegram.textContent=' · TaskHarbor Telegram channel';telegram.target='_blank';telegram.rel='noopener noreferrer';$('public-contacts').append(telegram);}
 $('threads').innerHTML=state.threads.map(t=>`<p><button type="button" data-thread="${esc(t.id)}">${esc(t.subject)} · ${esc(t.status)}</button>${state.user.role==='admin'?' '+esc(t.email):''}</p>`).join('')||'No conversations yet.';
 $('directory').hidden=state.user.role!=='admin';
 $('members').innerHTML=state.members.map(m=>`<article><strong>${esc(m.email)}</strong><p>Phone: ${esc(m.phone||'Not provided')}</p></article>`).join('')||'No saved contact numbers.';
 await inbox();
}
async function conversation(id){
 const d=await api('support?threadId='+encodeURIComponent(id));threadId=id;threadStatus=d.thread.status;
 $('conversation').hidden=false;$('thread-title').textContent=d.thread.subject;$('thread-status').textContent='Status: '+threadStatus;
 $('messages').innerHTML=d.messages.map(m=>`<article><strong>${m.role==='admin'?'TaskHarbor support':'Member'}</strong><p style="white-space:pre-wrap">${esc(m.content)}</p><small>${esc(new Date(m.created_at).toLocaleString())}</small></article>`).join('');
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
act(async()=>{await load();if(params.has('thread'))await conversation(params.get('thread'));});
// In-app refresh only; it does not ask for notification permission automatically.
let stream;
if('EventSource' in window){stream=new EventSource('/api/events');stream.addEventListener('change',()=>{if(state)act(async()=>{await inbox();if(threadId)await conversation(threadId);});});}
