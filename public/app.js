const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state,events,currency=localStorage.getItem('currency')||'USD',loading=false,reload=false;
const fmt=(n,c='USD',digits=2)=>new Intl.NumberFormat(undefined,{style:'currency',currency:c}).format(n/10**digits);
function rate(){return state?.rates.find(r=>r.currency===currency&&(currency==='USD'||Date.now()-r.updated_at<7*86400000));}
function money(cents){const r=rate();return r?new Intl.NumberFormat(undefined,{style:'currency',currency}).format(cents/100*r.rate/1000000):fmt(cents);}
async function api(path,body){const r=await fetch('/api/'+path,body===undefined?{credentials:'same-origin',cache:'no-store'}:{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok){const error=new Error(data.error||'Unable to reach TaskHarbor');error.status=r.status;throw error;}return data;}
async function act(fn){try{$('notice').textContent='';await fn();}catch(e){$('notice').textContent=e.message;}}
function fields(form){return Object.fromEntries(new FormData(form));}
function button(action,id,label,decision=''){return `<button data-action="${action}" data-id="${esc(id)}" data-decision="${decision}">${label}</button>`;}
async function readImages(input){const files=[...input.files];if(files.length>6)throw Error('Choose up to 6 images');return Promise.all(files.map(file=>{if(file.size>3*1024*1024)throw Error('Each image must be under 3 MB');return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve({data:r.result.split(',')[1]});r.onerror=()=>reject(Error('Unable to read image'));r.readAsDataURL(file);});}));}
function startLive(){if(events)return;events=new EventSource('/api/events');events.onopen=()=>{$('connection').textContent='● Live updates connected';act(load);};events.addEventListener('change',()=>act(load));events.onerror=()=>{$('connection').textContent='Reconnecting live updates…';};}
let authMode='sign-in';
function dashboardLocation(){
 // The hash is an authentication UI mode, not part of the member workspace.
 // Keep a task deep link, but discard #sign-in and signup referral data.
 const params=new URLSearchParams(location.search);
 const task=params.get('task');
 return '/dashboard'+(task?'?task='+encodeURIComponent(task):'');
}
function enterDashboard(){
 globalThis.history?.replaceState?.(null,'',dashboardLocation());
}
async function authenticate(form){
 await api(authMode==='sign-up'?'register':'login',fields(form));
 form.reset();enterDashboard();await load();
}
function showGuestPage(){
 const signup=location.hash==='#sign-up';authMode=signup?'sign-up':'sign-in';
 const showAuth=signup||location.hash==='#sign-in';
 $('landing').hidden=showAuth;$('auth').hidden=!showAuth;$('guest-nav').hidden=false;$('identity').hidden=true;
 $('signup-username-label').hidden=!signup;$('signup-referral-label').hidden=!signup;
 $('signup-username').disabled=!signup;$('signup-referral').disabled=!signup;
 $('auth-title').textContent=signup?'Your next step starts here.':'Welcome back.';
 $('auth-description').textContent=signup?'Create your free account and explore available tasks.':'Sign in to continue to your workspace.';
 $('auth-password').autocomplete=signup?'new-password':'current-password';
 $('register').hidden=!signup;$('sign-in-submit').hidden=signup;
 $('auth-switch').innerHTML=signup?'Already a member? <a href="#sign-in">Sign in</a>':'New to TaskHarbor? <a href="#sign-up">Create an account</a>';
 if(showAuth)$('auth-email').focus();
}
globalThis.addEventListener?.('hashchange',()=>{if(!state)showGuestPage();});
showGuestPage();
$('login').onsubmit=e=>{e.preventDefault();act(()=>authenticate(e.target));};
$('signup-referral').value=new URLSearchParams(location.search).get('ref')||'';
$('register').onclick=()=>act(async()=>{const form=$('login');if(!form.reportValidity())return;await authenticate(form);});
$('logout').onclick=()=>act(async()=>{await api('logout',{});events?.close();globalThis.history?.replaceState?.(null,'','/');location.reload();});
$('refresh').onclick=()=>act(load);
$('quick-create').onsubmit=async e=>{
 e.preventDefault();const form=e.target;if(!form.reportValidity())return;
 $('quick-publish').disabled=true;$('quick-result').textContent='Publishing…';
 try{const response=await api('quick-task',fields(form));form.reset();$('quick-result').textContent='Published successfully. Reference: '+response.externalId;await load();}
 catch(error){$('quick-result').textContent=error.message;}
 finally{$('quick-publish').disabled=false;}
};
function editor(kind){const row=document.createElement('div');row.className='editor-row';row.innerHTML=kind==='field'?'<label>Label<input class="field-label" required maxlength="100"></label><label>Exact value<textarea class="field-value" required></textarea></label><label><input type="checkbox" class="field-copy" checked> Show Copy button</label>':'<label>Step title (visible before claiming)<input class="step-title" required maxlength="200"></label><label>Instructions after submission (optional now; supply later)<textarea class="step-instruction" placeholder="Leave blank if the value arrives after submission"></textarea></label><label>Images for this step only<input class="step-images" type="file" accept="image/png,image/jpeg,image/webp" multiple></label>';const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='Remove';remove.onclick=()=>row.remove();row.append(remove);$(kind==='field'?'field-editor':'step-editor').append(row);}
$('add-field').onclick=()=>editor('field');$('add-step').onclick=()=>editor('step');
$('create').onsubmit=e=>{e.preventDefault();act(async()=>{const b=fields(e.target);b.policy={startMode:'on_claim',claimMinutes:b.claimMinutes===''?null:Number(b.claimMinutes),deadlineAt:b.deadlineAt?new Date(b.deadlineAt).toISOString():null,publicDescription:!!b.publicDescription};delete b.claimMinutes;delete b.deadlineAt;delete b.publicDescription;b.fields=[...$('field-editor').children].map(r=>({label:r.querySelector('.field-label').value,value:r.querySelector('.field-value').value,copy:r.querySelector('.field-copy').checked}));b.steps=await Promise.all([...$('step-editor').children].map(async r=>({title:r.querySelector('.step-title').value,instruction:r.querySelector('.step-instruction').value,images:await readImages(r.querySelector('.step-images'))}))); b.images=await readImages($('task-images'));await api('tasks',b);e.target.reset();$('field-editor').replaceChildren();$('step-editor').replaceChildren();await load();});};
$('import-file').onchange=()=>act(async()=>{const file=$('import-file').files[0];if(file)$('import').querySelector('textarea').value=await file.text();});
$('import').onsubmit=e=>{e.preventDefault();act(async()=>{await api('tasks',{tasks:JSON.parse(fields(e.target).tasks)});e.target.reset();await load();});};
$('currency').onchange=()=>act(async()=>{currency=$('currency').value;await api('profile',{currency});localStorage.setItem('currency',currency);await load();});
function withdrawalLimit(){
 const r=rate();if(!state||!r)return null;
 const digits=state.currencies[currency];
 const units=BigInt(state.wallet.available)*BigInt(r.rate)*10n**BigInt(digits)/100000000n;
 return Number(units)/10**digits;
}
function validateWithdrawal(){
 const input=$('withdraw-amount'),limit=withdrawalLimit();
 const value=Number(input.value);
 const message=limit===null?'Exchange rate unavailable. Select USD or try again later.':limit<=0?'No available balance to withdraw.':input.value&&value>limit?`Amount exceeds your available balance. Maximum: ${limit} ${currency}.`:'';
 input.setCustomValidity(message);$('withdraw-error').textContent=message;
 $('withdraw').querySelector('button').disabled=!!message;
 return !message;
}
$('withdraw-amount').oninput=validateWithdrawal;
const actionPanel=document.createElement('section');actionPanel.hidden=true;actionPanel.className='action-panel';
actionPanel.innerHTML='<form><h2 id="action-title"></h2><p id="action-context"></p><label for="action-value" id="action-label"></label><textarea id="action-value" required></textarea><div id="gmail-fields" hidden><label>First name<input id="gmail-first" maxlength="100"></label><label>Last name (leave blank if none)<input id="gmail-last" maxlength="200"></label><label>Gmail address (username)<input id="gmail-email" type="email" maxlength="254"></label><label>Supplied task password<input id="gmail-password" type="text" maxlength="256" autocomplete="off"></label><label>Work time (minutes)<input id="gmail-minutes" type="number" min="1" max="43200" value="60"></label></div><label id="action-images-label">Evidence images (up to 6, 3 MB each)<input id="action-images" type="file" accept="image/png,image/jpeg,image/webp" multiple></label><p id="action-error" role="alert"></p><div class="actions"><button type="submit" id="action-confirm">Confirm</button><button type="button" class="secondary" id="action-cancel">Cancel</button></div></form>';
$('workspace').prepend(actionPanel);let pendingAction=null;
function closeAction(){actionPanel.hidden=true;pendingAction=null;}
$('action-cancel').onclick=closeAction;
function openAction(action,id,decision,context=''){
 pendingAction={action,id,decision};$('action-title').textContent=action==='compensate-expired'?'Compensate expired Telegram task':action==='extend-time'?'Extend work deadline':action==='supply-gmail'?'Supply fresh Gmail details':action==='moderation'?(decision==='approved'?'Confirm upstream approval and release funds':'Deny held reward'):action==='correction'||action==='correction-step'?'Request correction':action==='resubmit'?'Resubmit corrected result':action==='withdraw'?'Confirm withdrawal':action==='submit'?'Submit result':action==='release-step'?'Provide follow-up instructions':action==='step'?'Complete follow-up step':action==='task-message'?'Task message':action==='review'?(decision==='approved'?'Start three-day hold':'Reject submission'):(decision==='paid'?'Record payment':'Reject withdrawal');
 $('action-context').textContent=context;$('gmail-fields').hidden=action!=='supply-gmail';$('action-value').hidden=action==='supply-gmail';$('action-value').required=action!=='supply-gmail';$('action-label').hidden=action==='supply-gmail';$('action-label').textContent=action==='compensate-expired'?'Explain why the Telegram provider task expired and why TaskHarbor is paying the member':action==='extend-time'?'New work time from now (minutes)':action==='moderation'?'Upstream moderation result / reference':action==='correction'||action==='correction-step'?'Explain what the worker must correct':action==='resubmit'?'Corrected result / evidence':action==='withdraw'?'Payment destination / account details':action==='release-step'?'Instructions and value for the assigned member':action==='submit'||action==='step'?'Result / evidence':action==='task-message'?'Message to assigned member / admin':action==='review'?'Review note':decision==='paid'?'External payment reference — enter only after sending payment':'Rejection reason';
 $('action-value').maxLength=action==='withdraw'||action==='payout'?500:action==='review'?1000:10000;$('action-value').value='';$('action-images').value='';$('action-images-label').hidden=!['submit','step','resubmit'].includes(action);$('action-error').textContent='';actionPanel.hidden=false;actionPanel.scrollIntoView({behavior:'smooth',block:'center'});if(action==='supply-gmail'){$('gmail-minutes').value=String(state.tasks.find(t=>t.id===id)?.policy?.claim_minutes||60);$('gmail-first').value='';$('gmail-last').value='';$('gmail-email').value='';$('gmail-password').value='';$('gmail-first').focus();}else $('action-value').focus();
}
actionPanel.querySelector('form').onsubmit=async e=>{
 e.preventDefault();if(!pendingAction)return;const value=$('action-value').value;if(pendingAction.action!=='supply-gmail'&&!value.trim())return;
 const {action,id,decision}=pendingAction;let body=action==='compensate-expired'?{taskId:id,reason:value}:action==='extend-time'?{taskId:id,minutes:Number(value)}:action==='supply-gmail'?{taskId:id,firstName:$('gmail-first').value,lastName:$('gmail-last').value,email:$('gmail-email').value,password:$('gmail-password').value,minutes:Number($('gmail-minutes').value)}:action==='moderation'?{taskId:id,decision,note:value}:action==='correction'?{taskId:id,content:value}:action==='correction-step'?{taskId:decision,stepId:id,content:value}:action==='resubmit'?{taskId:id,content:value}:action==='submit'?{taskId:id,content:value}:['step','release-step'].includes(action)?{taskId:decision,id,content:value}:action==='task-message'?{taskId:id,content:value}:action==='withdraw'?{quoteId:id,destination:value}:action==='review'?{id,decision,note:value}:{id,decision,reference:value};
 $('action-confirm').disabled=true;$('action-cancel').disabled=true;$('action-error').textContent='';
 try{if(['submit','step','resubmit'].includes(action))body.images=await readImages($('action-images'));await api(action==='correction-step'?'correction':action==='supply-gmail'?'supply-gmail-details':action==='extend-time'?'extend-task-time':action==='compensate-expired'?'compensate-provider-expired':action,body);closeAction();await load();$('notice').textContent='Saved successfully.';}
 catch(error){$('action-error').textContent=error.message;}finally{$('action-confirm').disabled=false;$('action-cancel').disabled=false;}
};
$('withdraw').onsubmit=e=>{e.preventDefault();if(!validateWithdrawal()){ $('withdraw-amount').reportValidity();return;}act(async()=>{const b=fields(e.target);const q=await api('quote',{amount:b.amount,currency});openAction('withdraw',q.id,'',`Payment and wallet debit: ${fmt(q.usd_cents)} USD. Estimated equivalent: ${fmt(q.local_minor,q.currency,state.currencies[q.currency])}. Reference rate: 1 USD = ${q.rate/1000000} ${q.currency}, updated ${new Date(q.rate_time).toLocaleString()}. Platform fee: USD 0.00. Actual local proceeds depend on your payment provider. Confirm within 5 minutes. Manual USD payout.`);$('action-value').value=b.destination;});};
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;const {action,id,decision}=b.dataset;
 if(action==='copy'){act(async()=>{const t=state.tasks.find(t=>t.id===id);const value=t.fields[Number(decision)].value;try{await navigator.clipboard.writeText(value);}catch{const temp=document.createElement('textarea');temp.value=value;document.body.append(temp);temp.select();const copied=document.execCommand('copy');temp.remove();if(!copied)throw Error('Copy unavailable; select the value to copy it.');}b.textContent='Copied';setTimeout(()=>{if(b.isConnected)b.textContent='Copy';},1600);});return;}
 if(action==='claim'){act(async()=>{await api('claim',{taskId:id});await load();});return;}
 if(action==='cancel-unfilled'){act(async()=>{await api('cancel-unfilled-claim',{taskId:id});await load();});return;}
 const t=action==='step'?state.tasks.find(t=>t.id===decision):null;const credited=action==='compensate-expired'?state.tasks.find(t=>t.id===id):null;openAction(action,id,decision,credited?`This closes the submitted task and adds USD ${(credited.reward/100).toFixed(2)} to the member's available balance as TaskHarbor-funded compensation. The Telegram provider did NOT approve the task. Use only after verifying the source expired; the action cannot be repeated.`:t?.steps.find(s=>s.id===id)?.instruction||'');
});
function images(t,kind){return t.images.filter(i=>!kind||i.kind===kind).map(i=>`<a href="/api/images/${esc(i.id)}" target="_blank" rel="noopener"><img class="attachment" src="/api/images/${esc(i.id)}" alt="${esc(i.kind)} image" loading="lazy"></a>`).join('');}
function workflowMarkup(t,admin){
 let html='';
 if(t.correction)html+=`<p class="message">Correction required: ${esc(t.correction.note)}</p>${!admin&&!t.correction.step_id?button('resubmit',t.id,'Resubmit corrected result'):''}`;
 const m=t.moderation;
 if(m?.status==='hold')html+=`<p class="message">${money(t.reward)} held until ${new Date(m.hold_until).toLocaleString()}, then awaiting final upstream moderation. Not withdrawable.</p>${admin?button('moderation',t.id,'Release after upstream approval','approved')+button('moderation',t.id,'Deny held reward','rejected')+button('correction',t.id,'Request correction'):''}`;
 if(m?.status==='denied')html+='<p>Final moderation denied. Held reward was not credited.</p>';
 if(t.history?.length)html+='<details><summary>Evidence and review history</summary>'+t.history.map(h=>`<p>${esc(h.created_at)} UTC · ${esc(h.action)}<br>${esc(h.content)}</p>`).join('')+'</details>';
 return html;
}
function setHTML(id,html){if($(id).innerHTML!==html)$(id).innerHTML=html;}
function applyTaskFilter(){const filter=$('task-filter')?.value||'all';document.querySelectorAll?.('#tasks .task-listing')?.forEach(item=>{item.hidden=filter!=='all'&&item.dataset.status!==filter;});}
$('task-filter')?.addEventListener?.('change',applyTaskFilter);
function render(){if(!state)return;const s=state,admin=s.user.role==='admin';
 if(location.pathname!=='/dashboard'||location.hash==='#sign-in'||location.hash==='#sign-up')enterDashboard();$('main-nav').hidden=false;$('guest-nav').hidden=true;$('landing').hidden=true;$('identity').hidden=false;$('auth').hidden=true;$('workspace').hidden=false;$('logout').hidden=false;$('admin').hidden=!admin;$('withdrawBox').hidden=admin;$('identity').textContent=s.user.email;$('role').textContent=admin?'ADMIN CONSOLE':'MEMBER DASHBOARD';
 $('admin-overview').hidden=!admin;
 for(const id of ['balances'])$(id).hidden=admin;
 document.querySelector?.('.wallet-panel-title')?.toggleAttribute('hidden',admin);
 document.querySelector?.('.wallet-policy')?.toggleAttribute('hidden',admin);
 document.querySelector?.('.workspace-tools')?.toggleAttribute('hidden',admin);
 $('referral-box').hidden=admin;
 $('transactions-section').hidden=admin;
 $('tasks-section').querySelector('h2').textContent=admin?'Task registry':'Find work';
 if(admin){
  $('admin-task-count').textContent=String(s.tasks.filter(t=>t.status==='available').length);
  $('admin-review-count').textContent=String(s.submissions.filter(t=>t.status==='pending').length);
  $('admin-withdrawal-count').textContent=String(s.withdrawals.filter(w=>w.status==='requested').length);
 }
 $('workspace-hero-title').innerHTML=admin?'Keep work <em>moving.</em>':'Every task moves<br>you <em>forward.</em>';
 $('workspace-hero-caption').textContent=admin?'Manage opportunities, review submissions and support your members from one secure workspace.':'Explore opportunities, follow your submissions, and see exactly where your earnings stand. Everything in one clear workspace.';
 $('workspace-hero-links').hidden=admin;
 if(!admin&&s.profile?.preferred_currency)currency=s.profile.preferred_currency;
 if(admin||!(currency in s.currencies))currency='USD';$('currency').disabled=admin;
 const opts=Object.keys(s.currencies).sort().map(c=>`<option value="${c}">${c}${c!=='USD'&&!s.rates.some(r=>r.currency===c&&Date.now()-r.updated_at<7*86400000)?' — rate unavailable':''}</option>`).join('');setHTML('currency',opts);$('currency').value=currency;
 $('rate-info').textContent=rate()?(currency==='USD'?'Rewards, balances and payments are held in USD. Choose a currency for an estimated local view.':`Estimated display: 1 USD = ${rate().rate/1000000} ${currency}. Rate updated ${new Date(rate().updated_at).toLocaleString()}.${Date.now()-rate().updated_at>2*86400000?' Using an older cached rate.':''} All payments remain in USD.`):'Automatic rate unavailable; showing USD balances. Select USD to withdraw or retry later.';
 const exchange=s.exchange||{updated_at:0,last_error:'Restart the app server to enable automatic exchange rates. Your USD balance remains available.'};
 $('exchange-status').textContent=exchange.updated_at?`Automatic reference rates updated ${new Date(exchange.updated_at).toLocaleString()}. ${exchange.last_error||'Updates arrive daily.'}`:exchange.last_error;
 $('withdraw-label').textContent=`Amount (${currency}) — payment is in USD`;$('withdraw-amount').step=String(10**-s.currencies[currency]);$('withdraw-amount').min=$('withdraw-amount').step;
 const limit=withdrawalLimit();$('withdraw-amount').max=String(limit??0);
 $('withdraw-limit').textContent=limit===null?'Available withdrawal: select USD while exchange rates are unavailable.':`Maximum withdrawal: ${new Intl.NumberFormat(undefined,{style:'currency',currency}).format(limit)} (${fmt(s.wallet.available)} USD available).`;
 validateWithdrawal();
 if(!admin&&s.referrals&&s.profile){$('referral-box').hidden=false;$('referral-link').value=location.origin+(s.profile.short_code?'/r/'+encodeURIComponent(s.profile.short_code):'/?ref='+encodeURIComponent(s.profile.referral_code));$('referral-info').textContent=s.referrals.policy.firstMicros===s.referrals.policy.laterMicros?`Earn USD ${(s.referrals.policy.firstMicros/1000000).toFixed(2)} per approved email task completed by a referred member, including after their first 30 days. Rewards are paid after the 72-hour hold and final moderation approval.`:`Earn USD ${(s.referrals.policy.firstMicros/1000000).toFixed(6)} per approved email task submitted during a referred member’s first 30 days, then USD ${(s.referrals.policy.laterMicros/1000000).toFixed(6)}. Rewards are paid after the 72-hour hold and final moderation approval.`;$('referral-stats').textContent=`${s.profile.chosen_username?'Username':'Account'}: ${s.profile.display_name||s.user.email.replace(/^(.).*(@.*)$/,'$1xxxx$2')} · Referred members: ${s.referrals.count} · Total rewards: USD ${(s.referrals.totalMicros/1000000).toFixed(6)} · Fractional remainder: USD ${(s.referrals.carryMicros/1000000).toFixed(6)}.`;}
 const ugx=s.rates.find(r=>r.currency==='UGX'&&Date.now()-r.updated_at<7*86400000);
 $('uganda-payout-policy').textContent=`For Ugandan networks, the minimum mobile money payout is UGX 1,000${ugx?` (approximately ${fmt(Math.round(1000/(ugx.rate/1000000)*100))} USD at the displayed reference rate)` : ''}. Smaller payouts are delivered as airtime.`;
 $('withdraw-unit-hint').textContent=currency==='USD'?'Enter the amount you want to withdraw in USD.':`Enter the amount you want to withdraw in ${currency}${s.currencies[currency]===0?', using whole units':''}. To enter an amount in dollars, select USD. Local equivalents are estimates.`;
 setHTML('balances',Object.entries(s.wallet).map(([k,v])=>`<div class="card wallet-card wallet-${esc(k)}"><div class="wallet-icon" aria-hidden="true">${({available:'↗',pending:'◷',earned:'✓',withdrawn:'↓'})[k]||'•'}</div><span>${esc(k[0].toUpperCase()+k.slice(1))}</span><strong>${money(v)}</strong><small>${({available:'Ready to request',pending:'Awaiting review',earned:'Approved earnings to date',withdrawn:'Recorded paid withdrawals'})[k]||'Account balance'}</small></div>`).join(''));
 setHTML('tasks',s.tasks.map(t=>{const allowed=admin||t.worker_id===s.user.id;const current=t.steps.find(x=>!x.completed);return `<article class="task-listing" id="task-${esc(t.id)}" data-status="${esc(t.status)}"><details class="task-disclosure"><summary class="task-summary"><span class="task-category-icon" aria-hidden="true">✦</span><span class="task-primary"><span class="task-title">${esc(t.title)}</span><span class="task-metadata">${esc(t.provider||'TaskHarbor')} · ${esc(t.compensation?'compensated — provider expired':t.status)}</span></span><span class="task-reward">${money(t.reward)}</span><span class="task-open">View details ▾</span></summary><div class="task-detail"><p class="task-detail-lead">${esc(t.description.replace("Register Gmail account using the specified data.","Register Gmail account using the information provided below.").replace("🔐 Be sure to use the specified data, otherwise the account will not be paid.","🔐 Be sure to use the provided first name, last name (leave it blank when instructed), Gmail username, password, and date of birth exactly as shown below, otherwise the account will not be paid."))}</p>${t.fields.map((f,i)=>`<div class="copy-field"><span>${esc(f.label==='Gmail address'?'Gmail address (Username)':f.label)}</span><code>${esc(f.value==='No last name — follow the source instruction'?'No last name — Leave blank / empty':f.value)}</code>${f.copy?button('copy',t.id,'Copy',String(i)):''}</div>`).join('')}${t.status==='claimed'&&t.claim_expires?`<p class="message">Submit by ${new Date(t.claim_expires).toLocaleString()} (task-specific work deadline).</p>`:''}${admin&&t.followup_overdue?'<p class="message">Follow-up overdue: review this submitted task. It has not been reassigned.</p>':''}${t.policy?.deadline_at?`<p class='message'>Project deadline: ${new Date(Number(t.policy.deadline_at)).toLocaleString()}</p>`:''}${t.status==='claimed'&&t.policy?.start_mode==='admin_details'&&!t.policy.supplied_at?`<p class='message'>Waiting for the admin to supply fresh account details. Your timer has not started.</p>${admin?button('supply-gmail',t.id,'Supply Gmail details'):''}${button('cancel-unfilled',t.id,admin?'Release waiting claim':'Cancel my claim')}`:''}${admin&&t.status==='claimed'&&t.policy?.start_mode==='admin_details'&&t.policy.supplied_at?button('extend-time',t.id,'Extend worker time'):''}${!admin&&t.status==='claimed'&&t.policy?.start_mode==='admin_details'&&t.policy.supplied_at&&t.claim_expires<=Date.now()?`<p class='message'>Work time expired. Contact the admin for an extension.</p>`:''}${t.compensation?`<p class="message">Provider task expired. TaskHarbor compensated you ${money(t.compensation.amount)} for submitted work. This is not provider approval. ${esc(t.compensation.reason)}</p>`:''}${images(t,'instruction')}${workflowMarkup(t,admin)}${t.steps.length?'<h4>Required follow-up steps</h4>'+t.steps.map(st=>`<div class="step"><strong>${st.completed?'✓ ':''}${esc(st.title)}</strong>${st.instruction?`<p>${esc(st.instruction)}</p>`:''}${images(t,'instruction:'+st.id)}${admin&&t.status==='submitted'&&st.completed?button('correction-step',st.id,'Request step correction',t.id):''}${st.evidence?`<p>Evidence: ${esc(st.evidence)}</p>`:''}${t.status==='submitted'&&!st.completed&&!st.instruction&&(admin||current?.id===st.id)?'<p>Waiting for admin to provide instructions.</p>':''}${admin&&t.status==='submitted'&&!st.completed&&!st.instruction?button('release-step',st.id,'Provide instructions',t.id):''}${!admin&&t.status==='submitted'&&current?.id===st.id&&st.instruction&&!(t.correction&&!t.correction.step_id)&&t.moderation?.status!=='hold'?button('step',st.id,'Complete step',t.id):''}</div>`).join(''):''}${!admin&&t.status==='available'&&(!t.policy?.deadline_at||Number(t.policy.deadline_at)>Date.now())?button('claim',t.id,'Claim task'):''}${!admin&&t.status==='claimed'&&(t.policy?.start_mode!=='admin_details'||t.policy.supplied_at)?button('submit',t.id,'Submit result'):''}${allowed&&t.worker_id?'<h4>Task messages</h4>'+t.messages.map(m=>`<p class="message"><strong>${esc(m.role==='worker'?'member':m.role)}</strong> · ${esc(m.created_at)} UTC<br>${esc(m.content)}</p>`).join('')+button('task-message',t.id,admin?'Message member':'Message admin'):''}</div></details></article>`;}).join('')||'<p>No tasks yet.</p>');
 applyTaskFilter();
 setHTML('submissions',s.submissions.map(t=>{const task=s.tasks.find(x=>x.id===t.task_id);const held=task?.moderation?.status==='hold';return `<div class="row"><div class="id">Task ${esc(t.task_id)} · Member ${esc(t.worker_id)}</div><p>${esc(t.content)}</p>${task?images(task,'evidence')+images(task,'step'):''}<span class="badge">${task?.compensation?'compensated — provider expired':held?'held for moderation':esc(t.status)}</span><p>${esc(t.review_note||'Awaiting review')}</p>${task?workflowMarkup(task,admin):''}${admin&&t.status==='pending'&&!held&&task?.provider==='manual-telegram'?button('compensate-expired',t.task_id,'Compensate: expired at source'):''}${admin&&t.status==='pending'&&!held?button('review',t.id,'Start 3-day hold','approved')+button('correction',t.task_id,'Request correction')+button('review',t.id,'Reject permanently','rejected'):''}</div>`;}).join('')||'<p>No submissions yet.</p>');
 setHTML('withdrawals',s.withdrawals.map(w=>`<div class="row"><strong>${fmt(w.amount)} USD</strong> · ${esc(w.status)}<p>${w.settlement==='USD'?'USD payment':w.currency?'Legacy request — original local payout terms retained':'USD payment'}${w.currency?` · ${w.settlement==='USD'?'Estimated equivalent at request':'Original local amount'}: ${fmt(w.local_minor,w.currency,s.currencies[w.currency])} · Reference rate: ${w.rate/1000000} ${esc(w.currency)} / USD`:''}</p><p>${esc(w.email||'')} ${esc(w.destination)}</p><p>${esc(w.reference||'Awaiting processing')}</p><span class="id">${esc(w.id)}</span><br>${admin&&w.status==='requested'?button('payout',w.id,'Record payment','paid')+button('payout',w.id,'Reject & refund','rejected'):''}</div>`).join('')||'<p>No withdrawals yet.</p>');
 setHTML('transactions',s.transactions.map(t=>`<div class="row">${esc(t.kind)} <strong>${money(t.amount)}</strong> <span class="muted">(${fmt(t.amount)} recorded)</span> · ${esc(t.created_at)} UTC<div class="id">${esc(t.id)}</div></div>`).join('')||'<p>No transactions yet.</p>');
}
async function load(){if(loading){reload=true;return;}loading=true;try{state=await api('state');render();startLive();const target=new URLSearchParams(location.search).get('task');if(target)document.getElementById('task-'+target)?.scrollIntoView?.({block:'center'});}catch(e){if(e.status===401||e.message==='Please log in'){events?.close();events=null;state=null;$('main-nav').hidden=true;showGuestPage();$('workspace').hidden=true;$('logout').hidden=true;$('notice').textContent='Your session could not be verified. Please sign in again; your account data is preserved.';}else throw e;}finally{loading=false;if(reload){reload=false;load().catch(e=>$('notice').textContent=e.message);}}}
load().catch(e=>$('notice').textContent=e.message);

// Referral copy controls are bundled into each page's main script.
(()=>{
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-copy-target]');if(!button)return;
 const input=document.getElementById(button.dataset.copyTarget);if(!input?.value)return;
 input.focus();input.select();input.setSelectionRange?.(0,input.value.length);
 let copied=false;
 try{copied=!!document.execCommand?.('copy');}catch{}
 if(!copied){try{if(!navigator.clipboard?.writeText)throw Error('Unavailable');await navigator.clipboard.writeText(input.value);copied=true;}catch{}}
 button.textContent=copied?'Copied!':'Link selected — copy manually';
 if(copied)setTimeout(()=>button.textContent='Copy link',1800);
});
})();
