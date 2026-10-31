const el=id=>document.getElementById(id);
async function call(path,body){const r=await fetch('/api/'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(r.status===401){location.replace('/login?next='+encodeURIComponent(location.pathname+location.search));throw Error('Please sign in to continue.');}if(!r.ok)throw Error(d.error);return d;}
async function load(){try{const [p,s]=await Promise.all([call('profile'),call('state')]);el('account-info').textContent=`Email: ${p.email} · Role: ${p.role==='worker'?'member':p.role} · Joined: ${p.joined} UTC`;el('profile-name').value=p.username;el('profile-currency').replaceChildren(...Object.keys(s.currencies).sort().map(code=>{const o=document.createElement('option');o.value=code;o.textContent=code;return o;}));el('profile-currency').value=p.preferredCurrency;el('profile-referral').value=location.origin+(p.shortCode?'/r/'+encodeURIComponent(p.shortCode):'/?ref='+encodeURIComponent(p.referralCode));}catch(e){el('profile-notice').textContent=e.message;}}
el('profile-form').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{const body=Object.fromEntries(new FormData(e.target));await call('profile',body);localStorage.setItem('currency',body.currency);el('profile-notice').textContent='Profile saved.';}catch(e){el('profile-notice').textContent=e.message;}finally{button.disabled=false;}};
el('password-form').onsubmit=async e=>{e.preventDefault();if(el('new-password').value!==el('confirm-password').value){el('profile-notice').textContent='New passwords do not match.';return;}const button=e.target.querySelector('button');button.disabled=true;try{await call('password',Object.fromEntries(new FormData(e.target)));e.target.reset();el('profile-notice').textContent='Password changed. Other sessions have been signed out.';}catch(e){el('profile-notice').textContent=e.message;}finally{button.disabled=false;}};
load();

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
