(async function(){
 const section=document.getElementById('status-grid');
 try{
  const response=await fetch('/api/preview/status',{cache:'no-store'});
  if(!response.ok)throw Error('Status request failed');
  const status=await response.json();
  document.getElementById('preview-sha').textContent='Deployed version: '+String(status.version||'not set').slice(0,40);
  document.getElementById('preview-data').textContent=status.data+' · '+status.payments;
  section.replaceChildren();
  for(const item of status.milestones||[]){
   const card=document.createElement('article');card.className='status-card';
   const heading=document.createElement('h2');heading.textContent=item.name;
   const badge=document.createElement('span');badge.className='phase-status';
   badge.dataset.status=item.status;badge.textContent=item.status.replaceAll('-',' ');
   const detail=document.createElement('p');detail.textContent=item.detail;
   card.append(heading,badge,detail);section.append(card);
  }
  for(const test of status.tests||[]){
   const link=document.createElement('a');link.href=test.url;link.textContent=test.name;
   link.target='_blank';link.rel='noopener noreferrer';
   document.getElementById('test-links').append(link);
  }
 }catch(error){section.textContent='The build-status service could not be reached. '+error.message}
})();