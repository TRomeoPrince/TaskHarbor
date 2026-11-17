/* Administrator finance and payout queue, read-only except existing payout actions. */
(function (root) {
  'use strict';
  const doc = root.document;
  const $ = id => doc?.getElementById(id);
  const money = cents => new Intl.NumberFormat('en-US',{
    style:'currency',currency:'USD'
  }).format(Number(cents || 0)/100);
  const requestFirst = (a,b) =>
    Number(b.status==='requested') - Number(a.status==='requested') ||
    String(b.created_at || '').localeCompare(String(a.created_at || ''));

  let active=false,initialized=false,loading=false,loadedAt=0,query='',page=1;
  let lastSnapshot=null;

  function node(tag, className, text) {
    const element=doc.createElement(tag);
    if (className) element.className=className;
    if (text!==undefined) element.textContent=String(text);
    return element;
  }
  function moneyCell(row, cents, extraClass='') {
    const cell=node('td', 'admin-finances-money '+extraClass, money(cents));
    cell.dataset.cents=String(cents || 0);
    row.append(cell);
  }
  function renderRows(data) {
    const body=$('admin-finances-rows'),status=$('admin-finances-status');
    if(!body) return;
    body.replaceChildren();
    for (const member of data.rows || []) {
      const row=node('tr');
      const memberCell=node('th','admin-finances-member');
      memberCell.scope='row';
      memberCell.append(node('strong','',member.username || 'Member'));
      memberCell.append(node('small','',member.email));
      row.append(memberCell);
      moneyCell(row,member.available,Number(member.available)<0?'admin-finances-negative':'');
      moneyCell(row,member.pending);
      moneyCell(row,member.held);
      moneyCell(row,member.earned);
      moneyCell(row,member.withdrawn);
      moneyCell(row,member.requested,member.requests?'admin-finances-requested':'');
      body.append(row);
    }
    if(!(data.rows || []).length) {
      const row=node('tr');
      const cell=node('td','admin-finances-empty','No members match this search.');
      cell.colSpan=7;row.append(cell);body.append(row);
    }
    const start=(data.page-1)*data.pageSize+1;
    const end=(data.page-1)*data.pageSize+(data.rows || []).length;
    status.textContent=data.total
      ? 'Showing '+start+'–'+end+' of '+data.total+' workers. USD balances.'
      : 'No matching workers.';
    $('admin-finances-page').textContent='Page '+data.page+' / '+Math.max(1,Math.ceil(data.total/data.pageSize));
    $('admin-finances-prev').disabled=data.page<=1;
    $('admin-finances-next').disabled=data.page*data.pageSize>=data.total;
  }

  async function refresh() {
    if (!active || loading) return;
    loading=true;
    const status=$('admin-finances-status');
    if(status) status.textContent='Loading member balances…';
    try {
      const url='/api/admin-finances?page='+encodeURIComponent(page)
        +'&search='+encodeURIComponent(query);
      const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});
      const data=await response.json();
      if (!response.ok) throw Error(data.error || 'Unable to load member balances');
      if(!active) return;
      renderRows(data);
      loadedAt=Date.now();
    } catch(error) {
      if(status) status.textContent='Could not load balances: '+(error.message || 'Try again');
    } finally {loading=false;}
  }

  function filterWithdrawals(snapshot) {
    const admin=snapshot.user.role==='admin';
    const picker=$('withdrawal-filter'),wrapper=$('withdrawal-filter-wrap');
    if(wrapper) wrapper.hidden=!admin;
    const status=admin?(picker?.value || 'requested'):'all';
    let visible=0;
    doc?.querySelectorAll?.('#withdrawals .row')?.forEach(row=>{
      row.hidden=status!=='all' && row.dataset.status!==status;
      if(!row.hidden) visible++;
    });
    const count=$('withdrawals-count');
    if(count){
      const requested=(snapshot.withdrawals || []).filter(w=>w.status==='requested').length;
      count.textContent=admin
        ? requested+' requested payout'+(requested===1?'':'s')+' awaiting processing · '+visible+' shown'
        : (snapshot.withdrawals || []).length+' total withdrawal record(s)';
    }
  }

  function mount(snapshot) {
    if (!snapshot?.user) return;
    lastSnapshot=snapshot;
    active=snapshot.user.role==='admin';
    const section=$('admin-finances');
    if(section) section.hidden=!active;
    filterWithdrawals(snapshot);
    if (!active) return;
    if (!initialized) {
      initialized=true;
      $('withdrawal-filter')?.addEventListener('change',()=>filterWithdrawals(lastSnapshot));
      $('admin-finances-search')?.addEventListener('submit',event=>{
        event.preventDefault();
        query=($('admin-finances-query')?.value||'').trim().slice(0,80);
        page=1;
        refresh();
      });
      $('admin-finances-refresh')?.addEventListener('click',()=>refresh());
      $('admin-finances-prev')?.addEventListener('click',()=>{
        if(page>1){page--;refresh();}
      });
      $('admin-finances-next')?.addEventListener('click',()=>{
        page++;refresh();
      });
    }
    // Piggyback on existing authenticated live updates without polling constantly.
    if(!loadedAt || Date.now()-loadedAt>30000) refresh();
  }
  root.TaskHarborAdminFinances={mount,refresh,money,requestFirst};
})(globalThis);
