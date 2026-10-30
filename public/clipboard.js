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
