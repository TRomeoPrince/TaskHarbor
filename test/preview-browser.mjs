/* Real browser smoke test of the Railway preview server, using synthetic data only. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {server} from '../preview/server.mjs';
const output=new URL('../artifacts/preview-lab/',import.meta.url);
mkdirSync(output,{recursive:true});
const observations=[],errors=[],failures=[];
let browser;
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1366,height:900}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/dashboard',{waitUntil:'domcontentloaded'});
  await page.locator('#workspace:not([hidden])').waitFor({timeout:12000});
  await page.locator('.th-preview-toolbar').waitFor();
  assert.match(await page.locator('.th-preview-toolbar').innerText(),/PREVIEW/);
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  await page.locator('#task-demo-ai-01').waitFor();
  assert.equal(await page.locator('#task-demo-ai-01').isVisible(),true);
  assert.equal(await page.locator('#task-demo-project-01 [data-action="claim"]').isDisabled(),true,'unqualified work is locked');
  await page.locator('#market-view-switch [data-market-view="mine"]').click();
  assert.equal(await page.locator('#task-demo-transcript-02').isVisible(),true);
  await page.screenshot({path:new URL('worker-light-desktop.png',output).pathname,fullPage:true});
  await page.locator('#taskharbor-theme-select').selectOption('dark');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.screenshot({path:new URL('worker-dark-desktop.png',output).pathname,fullPage:true});
  observations.push({route:'/dashboard',theme:'dark',status:'worker loaded'});
  await page.locator('a[href="/_preview/role?as=admin"]').click();
  await page.locator('#admin-overview:not([hidden])').waitFor({timeout:12000});
  await page.locator('#admin-finances:not([hidden])').waitFor();
  await page.locator('#admin-finances-rows tr').first().waitFor({timeout:12000});
  assert.match(await page.locator('#admin-finances-rows').innerText(),/worker@example.test/);
  await page.locator('#admin-qualification-tools summary').click();
  await page.locator('#qualification-grant-form [name="workerEmail"]').fill('worker@example.test');
  await page.locator('#qualification-grant-form [name="skill"]').selectOption('software');
  await page.locator('#qualification-grant-form [name="level"]').selectOption('intermediate');
  await page.locator('#qualification-grant-form button[type="submit"]').click();
  await page.locator('#qualification-admin-status').filter({hasText:'updated'}).waitFor({timeout:12000});
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.screenshot({path:new URL('admin-dark-desktop.png',output).pathname,fullPage:true});
  observations.push({route:'/dashboard',role:'admin',financeRows:await page.locator('#admin-finances-rows tr').count()});
  await page.goto(base+'/payouts',{waitUntil:'domcontentloaded'});
  await page.locator('#payout-feed .row').first().waitFor({timeout:12000});
  assert.match(await page.locator('#payout-feed').innerText(),/previewworker/);
  await page.screenshot({path:new URL('payouts-dark-desktop.png',output).pathname,fullPage:true});
  await page.goto(base+'/status',{waitUntil:'domcontentloaded'});
  await page.locator('#status-grid .status-card').first().waitFor({timeout:12000});
  assert.ok(await page.locator('#status-grid .status-card').count()>=8);
  await page.screenshot({path:new URL('status-dark-desktop.png',output).pathname,fullPage:true});
  await page.goto(base+'/business',{waitUntil:'domcontentloaded'});
  await page.locator('#business-project-create').waitFor({timeout:12000});
  await page.locator('#business-project-create [name="title"]').fill('Synthetic labeling project');
  await page.locator('#business-project-create [name="category"]').selectOption('annotation');
  await page.locator('#project-units').fill('40');
  await page.locator('#project-reward').fill('0.75');
  assert.equal(await page.locator('#business-estimate').innerText(),'$30.00');
  await page.locator('#business-project-create button[type="submit"]').click();
  await page.locator('.business-project').first().waitFor({timeout:12000});
  assert.match(await page.locator('.business-project').first().innerText(),/unfunded/i);
  await page.locator('.business-project button').first().click();
  await page.locator('.business-project .status').first().filter({hasText:'awaiting review'}).waitFor();
  await page.screenshot({path:new URL('business-dark-desktop.png',output).pathname,fullPage:true});
  observations.push({route:'/business',status:'synthetic draft budget and review request passed'});
  // Experience the full nine-theme collection in real Chromium, not flat mockups.
  await page.goto(base+'/themes',{waitUntil:'domcontentloaded'});
  await page.locator('#theme-studio-grid .theme-card').first().waitFor({timeout:12000});
  assert.equal(await page.locator('#theme-studio-grid .theme-card').count(),9);
  await page.screenshot({path:new URL('theme-studio-light-desktop.png',output).pathname,fullPage:true});
  const palettes=['light','dark','eden','sunrise','ocean','orchid','aurora','velvet','cosmos'];
  const tones={light:'light',dark:'dark',eden:'light',sunrise:'light',ocean:'light',orchid:'light',
    aurora:'dark',velvet:'dark',cosmos:'dark'};
  const colors=new Map();
  const contrast=(first,second)=>{
    const lum=hex=>{
      const full=hex.length===4?'#'+[...hex.slice(1)].map(ch=>ch+ch).join(''):hex;
      const vals=full.slice(1).match(/../g).map(bit=>parseInt(bit,16)/255)
        .map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
      return .2126*vals[0]+.7152*vals[1]+.0722*vals[2];
    };
    const a=lum(first),b=lum(second);
    return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  };
  for(const id of palettes){
    await page.locator('.theme-card[data-theme="'+id+'"]').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'),id);
    assert.equal(await page.locator('.theme-card[data-theme="'+id+'"]').getAttribute('aria-pressed'),'true');
    const theme=await page.evaluate(()=>({
      ink:getComputedStyle(document.documentElement).getPropertyValue('--theme-ink').trim(),
      bg:getComputedStyle(document.documentElement).getPropertyValue('--theme-bg').trim(),
      accent:getComputedStyle(document.documentElement).getPropertyValue('--theme-accent').trim(),
      accentText:getComputedStyle(document.documentElement).getPropertyValue('--theme-accent-contrast').trim(),
      scheme:getComputedStyle(document.documentElement).colorScheme
    }));
    assert.equal(theme.scheme,tones[id],id+' native control tone');
    assert.ok(contrast(theme.ink,theme.bg)>=7.0,id+' body text contrast is too weak');
    assert.ok(contrast(theme.accent,theme.accentText)>=4.5,id+' accent button contrast is too weak');
    colors.set(id,theme.bg);
    observations.push({route:'/themes',theme:id,contrast:contrast(theme.ink,theme.bg).toFixed(2)});
  }
  assert.equal(new Set(colors.values()).size,9,'all nine themes should have distinct backgrounds');
  await page.locator('.theme-card[data-theme="cosmos"]').click();
  await page.screenshot({path:new URL('theme-studio-cosmos-desktop.png',output).pathname,fullPage:true});
  await page.locator('.theme-card[data-theme="sunrise"]').click();
  await page.goto(base+'/dashboard',{waitUntil:'domcontentloaded'});
  await page.locator('#workspace:not([hidden])').waitFor({timeout:12000});
  assert.equal(await page.locator('html').getAttribute('data-theme'),'sunrise','theme retained across page navigation');
  await page.screenshot({path:new URL('dashboard-golden-hour.png',output).pathname,fullPage:true});
  for(const route of ['/payouts','/profile','/contact','/business']){
    await page.goto(base+route,{waitUntil:'domcontentloaded'});
    await page.locator('#taskharbor-theme-select').waitFor();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'sunrise',route+' should share theme');
  }
  await page.goto(base+'/themes',{waitUntil:'domcontentloaded'});
  await page.locator('.theme-card[data-theme="eden"]').click();
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:new URL('theme-studio-eden-mobile.png',output).pathname,fullPage:true});
  const themeMobile=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
  assert.ok(themeMobile.scroll<=themeMobile.width+2,'theme gallery overflow: '+JSON.stringify(themeMobile));
  await page.goto(base+'/_preview/role?as=worker',{waitUntil:'domcontentloaded'});
  await page.setViewportSize({width:390,height:844});
  await page.locator('#workspace:not([hidden])').waitFor({timeout:12000});
  await page.locator('#market-view-switch [data-market-view="discover"]').click();
  assert.equal(await page.locator('#task-demo-project-01 [data-action="claim"]').isDisabled(),false,'grant unlocks claim');
  await page.screenshot({path:new URL('worker-dark-mobile.png',output).pathname,fullPage:true});
  const dimensions=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
  assert.ok(dimensions.scroll<=dimensions.width+2,'mobile overflow: '+JSON.stringify(dimensions));
  observations.push({route:'/dashboard',viewport:'390x844',dimensions});
  if(errors.length)throw Error('JS errors: '+errors.join('; '));
  console.log('PASS: temporary TaskHarbor preview in real Chromium (roles, finances, themes, payouts, tracker, mobile)');
}catch(error){
  failures.push(error.stack||error.message);
  console.error('FAIL:',error);
  process.exitCode=1;
}finally{
  writeFileSync(new URL('results.json',output),JSON.stringify({passed:!failures.length,observations,errors,failures},null,2));
  await browser?.close();
  server.closeAllConnections?.();
  await new Promise(resolve=>server.close(resolve));
}
