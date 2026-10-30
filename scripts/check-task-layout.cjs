// Synthetic browser fixtures only. Never loads a live account or database.
const {createServer}=require('node:http');
const {readFile,mkdir}=require('node:fs/promises');
const {resolve}=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
let role='worker';
const tasks=Array.from({length:7},(_,i)=>({id:'fixture-'+i,title:i===0?'CREATE GMAIL':i===1?'TRAINING AI MODULES':'Review product information '+i,provider:i===1?'vetella-faceatlas':'manual-telegram',description:i===1?'Help improve an AI dataset by contributing a complete video set.\n\nELIGIBILITY: Follow the official contributor requirements.\n\nPAYMENT: The full set requires contractor approval and payment eligibility.':'Claim this task to view its private instructions.',reward:i===1?700:12,status:i===0?'claimed':'available',worker_id:i===0?'fixture-worker':null,policy:{public_description:i===1?1:0},steps:[],fields:i===0?[{label:'Synthetic private value',value:'FIXTURE ONLY',copy:true}]:[],images:[],messages:[],history:[]}));
function state(){return {user:{id:role==='admin'?'fixture-admin':'fixture-worker',email:role+'@example.test',role},currencies:{USD:2,UGX:0},rates:[{currency:'USD',rate:1000000,updated_at:Date.now()},{currency:'UGX',rate:3700000000,updated_at:Date.now()}],wallet:{available:24,earned:24,pending:12,held:0,withdrawn:0},tasks,submissions:role==='admin'?[{id:'fixture-submission',task_id:'fixture-2',worker_id:'other',status:'pending',content:'Synthetic submission evidence'}]:[],withdrawals:[],transactions:[]};}
const files={'/':'public/index.html','/app.js':'public/app.js','/style.css':'public/style.css'};
const server=createServer(async(req,res)=>{
 if(req.url==='/api/state'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(state()));}
 const file=files[new URL(req.url,'http://localhost').pathname];if(!file){res.writeHead(404);return res.end('Fixture route not found');}
 res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html');res.end(await readFile(resolve(file)));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const out=process.env.UI_SCREENSHOT_DIR||'/tmp/taskharbor-layout';await mkdir(out,{recursive:true});
 try{
  for(const size of [{name:'desktop',width:1440,height:1000},{name:'phone',width:390,height:844}]){
   for(const currentRole of ['worker','admin']){
    role=currentRole;const page=await browser.newPage({viewport:{width:size.width,height:size.height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{window.EventSource=class{constructor(){setTimeout(()=>this.onopen?.(),0);}addEventListener(){}close(){}};});
    await page.goto(base);await page.locator('#tasks .task-row').first().waitFor();
    assert.equal(await page.locator('#tasks .task-row').count(),7);
    assert.equal(await page.locator('#admin').isVisible(),false);
    assert.equal(await page.locator('#tasks [data-action="claim"]').count(),0);
    const boxes=await page.locator('#tasks .task-row').evaluateAll(rows=>rows.map(e=>({x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,bottom:e.getBoundingClientRect().bottom})));for(let i=1;i<boxes.length;i++){assert.equal(boxes[i].x,boxes[0].x);assert.ok(boxes[i].y>=boxes[i-1].bottom+10);}
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Task list must fit the viewport');
    await page.screenshot({path:out+'/'+currentRole+'-'+size.name+'-tasks.png',fullPage:true});
    await page.locator('#tasks .task-row').nth(1).click();await page.locator('#task-detail').waitFor({state:'visible'});
    assert.equal(await page.locator('#view-tasks').isVisible(),false);assert.ok((await page.locator('#task-detail').innerText()).includes('Overview'));
    if(currentRole==='worker')assert.equal(await page.getByRole('button',{name:'Claim this task',exact:true}).isVisible(),true);
    await page.screenshot({path:out+'/'+currentRole+'-'+size.name+'-overview.png',fullPage:true});
    await page.goBack();await page.locator('#view-tasks').waitFor({state:'visible'});await page.goForward();await page.locator('#task-detail').waitFor({state:'visible'});
    await page.getByRole('link',{name:'Back to tasks'}).click();await page.locator('#view-tasks').waitFor({state:'visible'});
    await page.locator('#tasks .task-row').first().click();await page.locator('#task-detail').waitFor({state:'visible'});
    if(currentRole==='worker'){
     await page.getByRole('button',{name:'Submit result',exact:true}).click();assert.equal(await page.locator('dialog.action-panel').isVisible(),true);
     await page.locator('#action-value').fill('Preserve this draft');await page.evaluate(()=>render());assert.equal(await page.locator('#action-value').inputValue(),'Preserve this draft');
     await page.keyboard.press('Escape');assert.equal(await page.locator('dialog.action-panel').isVisible(),false);
     await page.getByRole('link',{name:'My work',exact:true}).click();await page.locator('#view-tasks').waitFor({state:'visible'});assert.equal(await page.locator('#tasks .task-row').count(),1);
    }else{
     await page.getByRole('link',{name:'Create tasks',exact:true}).click();await page.locator('#admin').waitFor({state:'visible'});
     await page.getByRole('link',{name:'Submissions',exact:true}).click();await page.locator('#view-submissions').waitFor({state:'visible'});assert.equal(await page.locator('#submissions .task-row').count(),1);
     await page.locator('#submissions .task-row').click();await page.getByText('Synthetic submission evidence',{exact:true}).waitFor();assert.ok((await page.locator('#task-detail').innerText()).includes('Synthetic submission evidence'));
     await page.screenshot({path:out+'/admin-'+size.name+'-review.png',fullPage:true});
    }
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Detail navigation must fit the viewport');assert.deepEqual(errors,[]);await page.close();
   }
  }
  console.log('PASS: desktop and phone task rows, overview, Back/Forward, member/admin sections, private detail, modal and draft preservation.');
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
