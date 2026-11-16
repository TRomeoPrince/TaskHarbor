import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const controller=read('theme.js');

function runTheme(initial=null, storageThrows=false) {
  const attrs=new Map(), nodes=new Map(), events=new Map(), io=new Map();
  const header = {children:[],append(node){this.children.push(node);}};
  function element(tag) {
    const obj={tag,children:[],style:{},attributes:{},value:'',
      append(node){this.children.push(node);if(node.id)nodes.set(node.id,node);},
      setAttribute(name,value){this.attributes[name]=value;},
      addEventListener(name,callback){this.events??={};this.events[name]=callback;}
    };
    return obj;
  }
  const doc={
    documentElement:{style:{},getAttribute:name=>attrs.get(name)||null,
      setAttribute:(name,value)=>attrs.set(name,value)},
    readyState:'loading',
    getElementById:id=>nodes.get(id)||null,
    querySelector:selector=>selector==='.site-header'?header:null,
    createElement:element,
    addEventListener:(name,callback)=>events.set(name,callback)
  };
  const stored=new Map(initial?[['taskharbor.theme',initial]]:[]);
  const ls={
    getItem:key=>{if(storageThrows)throw Error('Blocked storage');return stored.get(key)||null;},
    setItem:(key,value)=>{if(storageThrows)throw Error('Blocked storage');stored.set(key,value);}
  };
  const root={
    document:doc,localStorage:ls,
    addEventListener:(name,callback)=>io.set(name,callback)
  };
  root.globalThis=root;
  vm.runInNewContext(controller,root,{filename:'theme.js'});
  return {doc,attrs,stored,header,events,io,root,nodes};
}

test('theme controller reads preference before DOM render and defaults to light',()=>{
  const dark=runTheme('dark');
  assert.equal(dark.attrs.get('data-theme'),'dark');
  assert.equal(dark.doc.documentElement.style.colorScheme,'dark');
  assert.equal(dark.header.children.length,0,'control appears after DOM ready');
  const first=runTheme('random');
  assert.equal(first.attrs.get('data-theme'),'light');
  assert.equal(first.root.TaskHarborTheme.get(),'light');
});

test('switcher exposes exactly Light/Dark, persists selection and does not duplicate',()=>{
  const lab=runTheme('light');
  lab.events.get('DOMContentLoaded')();
  assert.equal(lab.header.children.length,1);
  const label=lab.header.children[0];
  const select=label.children.find(x=>x.tag==='select');
  assert.ok(select);
  assert.equal(select.value,'light');
  assert.deepEqual(select.children.map(option=>option.value),['light','dark']);
  select.value='dark';
  select.events.change();
  assert.equal(lab.root.TaskHarborTheme.get(),'dark');
  assert.equal(lab.stored.get('taskharbor.theme'),'dark');
  assert.throws(()=>lab.root.TaskHarborTheme.set('made-up'),/Unknown/);
  lab.root.TaskHarborTheme.set('light');
  assert.equal(select.value,'light');
  assert.equal(lab.stored.get('taskharbor.theme'),'light');
});

test('theme change in another tab updates this tab but does not write back',()=>{
  const lab=runTheme('dark');
  lab.events.get('DOMContentLoaded')();
  lab.io.get('storage')({key:'taskharbor.theme',newValue:'light'});
  assert.equal(lab.root.TaskHarborTheme.get(),'light');
  assert.equal(lab.stored.get('taskharbor.theme'),'dark');
});

test('private or blocked localStorage never prevents theme rendering',()=>{
  const lab=runTheme(null,true);
  lab.events.get('DOMContentLoaded')();
  assert.equal(lab.root.TaskHarborTheme.get(),'light');
  assert.doesNotThrow(()=>lab.root.TaskHarborTheme.set('dark'));
  assert.equal(lab.attrs.get('data-theme'),'dark');
});

test('theme assets load before layout paint and dark rules apply to all main pages',()=>{
  const css=read('theme.css');
  assert.match(css,/:root\s*\{/);
  assert.match(css,/html\[data-theme="dark"\]/);
  for(const name of ['--theme-bg','--theme-surface','--theme-ink','--theme-border','--theme-accent']) {
    assert.ok(css.includes(name),name);
  }
  for(const selector of ['.workspace-hero','.support-card','.work-dialog','.admin-finances','#mobile-work-nav','#marketplace-summary','#landing .welcome-hero']) {
    assert.ok(css.includes(selector),selector);
  }
  for(const page of ['index.html','profile.html','payouts.html','contact.html']) {
    const html=read(page);
    const control=html.indexOf('src="/theme.js"');
    const style=html.indexOf('href="/theme.css"');
    assert.ok(control>=0 && style>control,page+' control must load before theme stylesheet');
    assert.ok(style<html.indexOf('</head>'),page+' CSS must load in head');
  }
  for(const backend of ['server.js','server-postgres.js']){
    const source=readFileSync(new URL('../'+backend,import.meta.url),'utf8');
    for(const name of ['theme.js','theme.css']) {
      assert.ok(source.includes("'/"+name+"': '"+name+"'"), backend+' must serve '+name);
    }
  }
});
