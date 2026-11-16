/* Worker qualification visibility, and admin-only qualification UI. */
(function(root){
 'use strict';
 let bound=false,current=null;
 const get=id=>root.document.getElementById(id);
 const readable={ai_evaluation:'AI evaluation',transcription:'Transcription',annotation:'Data annotation',
  research:'Research',software:'Software engineering',design:'Design',data_entry:'Data entry'};
 function label(entry){
  const levels={1:'Beginner',2:'Intermediate',3:'Advanced'};
  return (readable[entry.skill]||entry.skill)+' — '+(levels[entry.minimum_level]||entry.minimum_level);
 }
 function markWorker(snapshot){
  for(const task of snapshot.tasks||[]){
   if(task.qualified!==false)continue;
   const card=get('task-'+task.id);
   if(!card)continue;
   const claim=card.querySelector('[data-action="claim"]');
   if(claim){claim.disabled=true;claim.textContent='Qualification required';}
   const detail=card.querySelector('.task-detail');
   if(detail&&!detail.querySelector('.qualification-required')){
    const note=root.document.createElement('p');
    note.className='qualification-required';
    note.textContent='Required verified skill: '+(task.required_qualifications||[]).map(label).join('; ')+
      '. Contact support about becoming qualified.';
    detail.prepend(note);
   }
  }
 }
 async function post(path,body){
  const res=await fetch(path,{method:'POST',credentials:'same-origin',
   headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const json=await res.json();
  if(!res.ok)throw Error(json.error||'Could not save qualification');
  return json;
 }
 function adminView(snapshot){
  const form=get('qualification-requirement-form'),grant=get('qualification-grant-form');
  if(!form||!grant)return;
  const select=get('qualification-task');
  const selected=select.value;
  const tasks=snapshot.tasks||[];
  const keys=tasks.map(t=>t.id).join('|');
  if(select.dataset.keys!==keys){
   select.replaceChildren(...tasks.map(task=>{
    const option=root.document.createElement('option');
    option.value=task.id;
    option.textContent=task.title+' · '+task.id.slice(0,8);
    return option;
   }));
   select.dataset.keys=keys;
   if(tasks.some(t=>t.id===selected))select.value=selected;
  }
  const status=get('qualification-admin-status');
  const installed=snapshot.qualificationsReady===true;
  if(!installed)status.textContent='Qualification tables are not installed in this database yet. Apply the additive migration after a verified backup.';
  form.querySelector('button[type=submit]').disabled=!installed;
  grant.querySelector('button[type=submit]').disabled=!installed;
  if(bound)return;
  bound=true;
  for(const [element,path] of [[form,'/api/qualification/requirement'],[grant,'/api/qualification/grant']]){
   element.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!current?.qualificationsReady){status.textContent='Qualification schema not installed';return;}
    const button=element.querySelector('button[type=submit]');
    if(button)button.disabled=true;
    status.textContent='Verifying and saving…';
    try{
     await post(path,Object.fromEntries(new FormData(element)));
     status.textContent='Verified qualification updated. Refreshing task eligibility…';
     get('refresh')?.click?.();
    }catch(error){status.textContent=error.message;}
    finally{if(button)button.disabled=false;}
   });
  }
 }
 function mount(snapshot){
  if(!snapshot?.user)return;
  current=snapshot;
  if(snapshot.user.role==='admin')adminView(snapshot);
  else markWorker(snapshot);
 }
 root.TaskHarborQualifications={mount,label};
})(globalThis);
