import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function workspaces(){
  const ctx=vm.createContext({URL});
  const source=readFileSync(new URL('../public/workspaces.js',import.meta.url),'utf8');
  vm.runInContext(source,ctx);
  return ctx.TaskHarborWorkspaces;
}
test('structured forms are enabled only for supported, explicitly classified work types',()=>{
  const w=workspaces();
  for(const category of ['ai','transcription','annotation','project']){
    assert.equal(w.supports({category}),true,category);
  }
  for(const category of ['microtask','survey','general','unknown']){
    assert.equal(w.supports({category}),false,category);
  }
});
test('AI evaluation results carry version, rubric decision and explanation',()=>{
  const w=workspaces();
  const content=w.validateResult('ai',{
    reference:'sample-4',decision:'Response A preferred',rating:'4 - Good',reason:'Relevant and well supported.'
  });
  const object=JSON.parse(content);
  assert.equal(object.schema,'taskharbor.work.v1');
  assert.equal(object.category,'ai');
  assert.equal(object.answers.rating,'4 - Good');
  assert.throws(()=>w.validateResult('ai',{
    reference:'sample',decision:'not allowed',rating:'5 - Excellent',reason:'Reason'
  }),/valid evaluation/i);
});
test('transcription and annotation require real structured answers',()=>{
  const w=workspaces();
  const transcription=JSON.parse(w.validateResult('transcription',{
    clip:'clip-12',language:'English',transcript:'Speaker 1: The sample is clear.'
  }));
  assert.match(transcription.answers.transcript,/Speaker 1/);
  assert.throws(()=>w.validateResult('transcription',{clip:'clip',language:'English',transcript:''}),/Transcript/);
  assert.throws(()=>w.validateResult('annotation',{item:'one',labels:''}),/Assigned labels/);
});
test('skilled-project deliverable URLs must be http(s)',()=>{
  const w=workspaces();
  const valid={milestone:'Design review',url:'https://example.test/deliverable',summary:'Reviewed the project.'};
  assert.equal(JSON.parse(w.validateResult('project',valid)).answers.milestone,'Design review');
  assert.throws(()=>w.validateResult('project',{...valid,url:'javascript:alert(1)'}),/http\(s\)/);
});
test('workspace assets are publicly served but actual submission is still authenticated',()=>{
  const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.match(source,/TaskHarborWorkspaces\?\.supports/);
  assert.match(source,/await api\('submit',body\)/);
  for(const server of ['server-postgres.js','server.js']){
    const text=readFileSync(new URL('../'+server,import.meta.url),'utf8');
    assert.match(text,/'\/workspaces\.js'\s*:\s*'workspaces\.js'/);
    assert.match(text,/'\/workspaces\.css'\s*:\s*'workspaces\.css'/);
  }
});
