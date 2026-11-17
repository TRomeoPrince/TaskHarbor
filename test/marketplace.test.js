import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const base = new URL('../public/', import.meta.url);
const source = file => readFileSync(new URL(file, base), 'utf8');

function market() {
  const sandbox = vm.createContext({});
  vm.runInContext(source('marketplace.js'), sandbox);
  return sandbox.TaskHarborMarketplace;
}
const tasks = [
  {id:'a',title:'Correct image labels',status:'available',reward:125,category:'annotation',provider:'partner'},
  {id:'b',title:'Listen and transcribe',status:'claimed',reward:300,task_type:'transcription',provider:'internal',worker_id:'worker-1'},
  {id:'c',title:'Review short text',status:'submitted',reward:50,category:'AI evaluation',worker_id:'worker-1',correction:{note:'Please redo'}},
  {id:'d',title:'Check short survey',status:'available',reward:20,category:'survey',provider:'partner'},
  {id:'e',title:'Generic assignment',status:'approved',reward:450,worker_id:'worker-1'}
];

test('marketplace metadata classification uses explicit categories only',()=>{
  const m=market();
  assert.equal(m.category(tasks[0]),'annotation');
  assert.equal(m.category(tasks[1]),'transcription');
  assert.equal(m.category(tasks[2]),'ai');
  assert.equal(m.category(tasks[3]),'survey');
  assert.equal(m.category(tasks[4]),'general');
  assert.equal(m.category({title:'AI speech labeling',provider:'unverified'}),'general');
});
test('work availability, review and correction counts describe real API rows',()=>{
  const m=market();
  const c=m.counters(tasks,[], 'worker-1');
  assert.equal(c.available,2);
  assert.equal(c.active,1);
  assert.equal(c.inReview,1);
  assert.equal(c.corrections,1);
  assert.equal(c.complete,1);
});
test('filters apply safely to user-visible title, status, category and integer-cent rewards',()=>{
  const m=market();
  const config={status:'all',category:'all',minimumCents:0,search:'',sort:'newest'};
  assert.equal(m.filterTasks(tasks,config).length,5);
  assert.equal(m.filterTasks(tasks,{...config,search:'  PARTNER  '.trim()}).length,2);
  assert.equal(m.filterTasks(tasks,{...config,category:'annotation'}).map(x=>x.id).join(','),'a');
  assert.equal(m.filterTasks(tasks,{...config,minimumCents:200}).map(x=>x.id).join(','),'b,e');
  assert.equal(m.filterTasks(tasks,{...config,status:'claimed'}).map(x=>x.id).join(','),'b');
  assert.equal(m.filterTasks(tasks,{...config,search:'secret'}).length,0);
});
test('marketplace assets are served by each server and hooked into existing task rendering',()=>{
  const html=source('index.html'),script=source('app.js'),style=source('marketplace.css');
  for(const id of ['marketplace-intro','marketplace-summary','market-search','market-category','market-minimum','market-sort','market-results','market-empty','mobile-work-nav']){
    assert.match(html,new RegExp('id="'+id+'"'),id);
  }
  assert.match(html,/src="\/marketplace\.js"/);
  assert.match(html,/href="\/marketplace\.css"/);
  assert.match(script,/TaskHarborMarketplace\?\.mount\?\.\(s,\{money\}\)/);
  assert.match(style,/\[hidden\]\{display:none!important\}/);
  for(const server of ['server.js','server-postgres.js']){
    const file=readFileSync(new URL('../'+server,import.meta.url),'utf8');
    assert.match(file,/'\/marketplace\.js'\s*:\s*'marketplace\.js'/);
    assert.match(file,/'\/marketplace\.css'\s*:\s*'marketplace\.css'/);
  }
  assert.match(html,/href="\/dashboard"/);
});


test('Find Work never mixes claimed jobs; My Tasks includes only signed-in worker assignments',()=>{
  const m=market();
  const other={id:'worker-other',title:'Other worker task',status:'claimed',reward:900,worker_id:'other'};
  const all=[...tasks,other];
  assert.deepEqual(m.scopeTasks(all,{id:'worker-1',role:'worker'},'discover').map(x=>x.id),['a','d']);
  assert.deepEqual(m.scopeTasks(all,{id:'worker-1',role:'worker'},'mine').map(x=>x.id),['b','c','e']);
  assert.equal(m.scopeTasks(all,{id:'other',role:'worker'},'mine').length,1);
  assert.equal(m.scopeTasks(all,{id:'admin',role:'admin'},'mine').length,6);
});

test('worker discovery and assignments have explicit accessible controls',()=>{
  const html=source('index.html');
  const css=source('marketplace.css');
  assert.match(html,/id="market-view-switch"/);
  assert.match(html,/data-market-view="discover" aria-pressed="true"/);
  assert.match(html,/data-market-view="mine" aria-pressed="false"/);
  assert.match(html,/data-market-view-link="mine"/);
  assert.match(css,/#market-view-switch button\[aria-pressed="true"\]/);
});
