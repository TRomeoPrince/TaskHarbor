/* Theme Studio: real theme selection + representative mini dashboard palettes. */
(function(){
 'use strict';
 const api=window.TaskHarborTheme;
 const palettes={
  light:['#F6F8F5','#FFFFFF','#EDF6EF','#183C32','#176F56','#506F5D','#DCE8DF','#FFFFFF'],
  dark:['#0E1916','#192B24','#263D31','#EBF7EF','#74D4A8','#C3D8CA','#365448','#10221A'],
  eden:['#F3F6EE','#FFFEF9','#E2EDDF','#213B2C','#296448','#456551','#CADBCC','#FFFFFF'],
  sunrise:['#FFF4E9','#FFFDF8','#FBE0C0','#4B3022','#A74B28','#75533E','#E9CAAA','#FFFFFF'],
  ocean:['#EAF6F9','#FAFFFF','#D8EEF5','#173F4A','#176A83','#476C79','#C0DFE8','#FFFFFF'],
  orchid:['#F7F0FB','#FFFAFF','#EBDDF6','#392748','#754C9D','#675778','#DDCCE9','#FFFFFF'],
  aurora:['#081B21','#123038','#20525A','#E6FAF4','#7AF5CD','#B8DCD7','#3B6670','#08291F'],
  velvet:['#1E1422','#322238','#523650','#FFF0F7','#FFB8C5','#E5CADE','#70476A','#472035'],
  cosmos:['#0E1530','#192542','#2B4165','#F1F7FF','#83E6FF','#CADCF3','#445778','#092338']
 };
 const grid=document.getElementById('theme-studio-grid');
 const cards=new Map();
 const node=(tag,cls,content)=>{
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(content!==undefined)el.textContent=content;
  return el;
 };
 function refresh(){
  const selected=api.get();
  const theme=api.available().find(t=>t.id===selected);
  document.getElementById('theme-current-name').textContent=theme?.label||'Harbor Light';
  for(const [id,card] of cards){
   const chosen=id===selected;
   card.setAttribute('aria-pressed',String(chosen));
   card.querySelector('.theme-card-check').textContent=chosen?'✓ Selected':'Choose theme';
  }
 }
 for(const theme of api.available()){
  const colors=palettes[theme.id];
  if(!colors)continue;
  const card=node('button','theme-card theme-button');
  card.type='button';card.dataset.theme=theme.id;
  card.setAttribute('aria-label','Use '+theme.label+' theme');
  const preview=node('div','theme-card-mini');
  for(const [name,value] of [
    ['--sample-bg',colors[0]],['--sample-surface',colors[1]],
    ['--sample-panel',colors[2]],['--sample-ink',colors[3]],
    ['--sample-accent',colors[4]],['--sample-muted',colors[5]],
    ['--sample-border',colors[6]],['--sample-contrast',colors[7]]
  ])preview.style.setProperty(name,value);
  const nav=node('div','theme-mini-nav');
  const brand=node('div','theme-mini-brand','TaskHarbor.');
  const dots=node('span','theme-mini-dots');
  for(let i=0;i<3;i++)dots.append(node('i'));
  nav.append(brand,dots);
  const headline=node('div','theme-mini-heading','Your work. In motion.');
  headline.prepend(node('small','','YOUR DASHBOARD'));
  const row=node('div','theme-mini-row');
  for(const [label,value] of [['Available','$12.45'],['In review','04 tasks']]){
   const metric=node('div','theme-mini-metric');
   metric.append(node('small','',label),node('strong','',value));row.append(metric);
  }
  const action=node('div','theme-mini-action','AI image review');
  action.append(node('b','','Explore →'));
  preview.append(nav,headline,row,action);
  const info=node('div','theme-card-info');
  const header=node('div','theme-card-info-head');
  header.append(node('span','theme-card-title',theme.label),node('span','theme-card-check','Choose theme'));
  const tagline=node('div','theme-card-desc',theme.description);
  const palette=node('div','theme-card-palette');
  for(const color of colors.slice(0,5)){
   const dot=node('i');
   dot.style.backgroundColor=color;
   dot.title=color;palette.append(dot);
  }
  info.append(header,tagline,palette);
  card.append(preview,info);
  card.addEventListener('click',()=>{
    api.set(theme.id);
    refresh();
  });
  grid.append(card);cards.set(theme.id,card);
 }
 refresh();
 window.addEventListener('storage',e=>{
  if(e.key===api.storageKey)refresh();
 });
})();