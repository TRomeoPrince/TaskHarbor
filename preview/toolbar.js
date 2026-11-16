/* Preview-only navigation. Never included in production source HTML. */
(function(){
  'use strict';
  const bar=document.createElement('nav');
  bar.className='th-preview-toolbar';
  bar.setAttribute('aria-label','TaskHarbor demo environment');
  const mark=document.createElement('strong');mark.className='th-preview-mark';
  mark.textContent='TASKHARBOR PREVIEW';
  const explanation=document.createElement('span');explanation.className='th-preview-explain';
  explanation.textContent='Demo tasks & balances only · No real payments';
  const links=document.createElement('div');links.className='th-preview-links';
  for(const [title,url] of [
    ['Worker','/_preview/role?as=worker'],
    ['Admin','/_preview/role?as=admin'],
    ['Build status','/status'],
    ['Reset demo','/_preview/reset']
  ]){
    const link=document.createElement('a');link.href=url;link.textContent=title;links.append(link);
  }
  bar.append(mark,explanation,links);
  document.body.prepend(bar);
  document.documentElement.classList.add('th-preview-mode');
  if(location.pathname==='/status'||location.pathname==='/_preview/status'){
    const current=links.querySelector('a[href="/status"]');
    current?.setAttribute('aria-current','page');
  }
})();