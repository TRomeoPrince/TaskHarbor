(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const money=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
 async function api(url,body){
  const opts=body===undefined?{cache:'no-store'}:{method:'POST',
   headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};
  const r=await fetch(url,opts),data=await r.json();
  if(!r.ok)throw Error(data.error||'Preview request failed');
  return data;
 }
 function node(tag,cls,text){
  const n=document.createElement(tag);
  if(cls)n.className=cls;
  if(text!==undefined)n.textContent=String(text);
  return n;
 }
 function estimate(){
  const units=Number($('project-units').value||0);
  const reward=Number($('project-reward').value||0);
  const cents=units*Math.round(reward*100);
  $('business-estimate').textContent=money(Number.isSafeInteger(cents)&&cents>=0?cents:0);
 }
 async function load(){
  try{
   const data=await api('/api/preview/projects');
   const container=$('business-projects-list');
   container.replaceChildren();
   if(!data.projects.length){
    container.append(node('p','business-empty','No sample projects yet. Use the form above to create a draft.'));
    return;
   }
   for(const project of data.projects){
    const card=node('article','business-project');
    const title=node('strong','',project.title);
    const status=node('span','status',project.status.replaceAll('_',' '));
    const details=node('p','',project.units+' accepted units × '+money(project.rewardCents)+
       ' = '+money(project.estimatedBudgetCents)+' estimated worker rewards');
    const note=node('small','',project.fundingStatus==='unfunded'?
       'Unfunded demo • not visible to workers':'Sample project only');
    card.append(title,status,details,note);
    if(project.status==='draft'){
     const button=node('button','secondary','Request sample review');
     button.type='button';
     button.addEventListener('click',async()=>{
      button.disabled=true;
      try{await api('/api/preview/project-review',{projectId:project.id});await load();}
      catch(error){$('business-message').textContent=error.message;button.disabled=false;}
     });
     card.append(button);
    }
    container.append(card);
   }
  }catch(error){$('business-message').textContent=error.message;}
 }
 $('project-units').addEventListener('input',estimate);
 $('project-reward').addEventListener('input',estimate);
 $('business-refresh').addEventListener('click',load);
 $('business-project-create').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=event.target.querySelector('button[type=submit]');button.disabled=true;
  try{
   const data=Object.fromEntries(new FormData(event.target));
   await api('/api/preview/project',data);
   $('business-message').textContent='Sample project saved as an unfunded draft. No work has been published.';
   event.target.reset();estimate();await load();
  }catch(error){$('business-message').textContent=error.message;}
  finally{button.disabled=false;}
 });
 estimate();load();
})();