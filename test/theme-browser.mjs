/* Real Chromium smoke/visual test against the synthetic TaskHarbor lab. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {server} from './visual-lab-server.mjs';
const output=new URL('../artifacts/theme-lab/',import.meta.url);
mkdirSync(output,{recursive:true});
const failures=[],errors=[],observations=[];
const at=selector=>selector;
let browser;
try {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1366,height:900}});
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  const css=async selector=>page.locator(selector).first().evaluate(node=>{
    const result=getComputedStyle(node);
    return {background:result.backgroundColor,color:result.color};
  });
  await page.goto(base+'/dashboard',{waitUntil:'domcontentloaded'});
  await page.locator('#workspace:not([hidden])').waitFor({timeout:10000});
  await page.locator('#taskharbor-theme-select').waitFor();
  // The same browser lab tests functional work discovery, not just CSS colors.
  await page.locator('#market-view-switch [data-market-view="discover"]').waitFor();
  assert.equal(await page.locator('#task-work-example-1').isVisible(),true,'discovery shows available work');
  assert.equal(await page.locator('#task-work-example-2').isVisible(),false,'discovery hides assigned tasks');
  await page.locator('#market-view-switch [data-market-view="mine"]').click();
  assert.equal(await page.locator('#task-work-example-1').isVisible(),false,'My Tasks hides available work');
  assert.equal(await page.locator('#task-work-example-2').isVisible(),true,'My Tasks shows claimed work');
  assert.equal(await page.locator('#task-work-example-3').isVisible(),true,'My Tasks shows submitted work');
  assert.equal(await page.locator('#market-view-switch [data-market-view="mine"]').getAttribute('aria-pressed'),'true');
  await page.locator('#market-view-switch [data-market-view="discover"]').click();
  observations.push({page:'dashboard',workViews:'discover and mine scoped correctly'});
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  const light=await css('body');
  assert.equal(light.background,'rgb(246, 248, 245)');
  await page.screenshot({path:new URL('dashboard-light-desktop.png',output).pathname,fullPage:true});
  await page.locator('#taskharbor-theme-select').selectOption('dark');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  assert.equal(await page.evaluate(()=>localStorage.getItem('taskharbor.theme')),'dark');
  const dark=await css('body');
  assert.equal(dark.background,'rgb(14, 25, 22)');
  const header=await css('.site-header');
  assert.equal(header.background,'rgb(25, 43, 36)');
  const task=await css('#tasks .task-listing');
  assert.equal(task.background,'rgb(25, 43, 36)');
  observations.push({page:'dashboard',light,dark,header,task});
  await page.screenshot({path:new URL('dashboard-dark-desktop.png',output).pathname,fullPage:true});
  for(const route of ['/payouts','/profile','/contact']){
    const response=await page.goto(base+route,{waitUntil:'domcontentloaded'});
    assert.equal(response.status(),200,route);
    await page.locator('#taskharbor-theme-select').waitFor();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark',route);
    const bg=await css('body');
    assert.equal(bg.background,'rgb(14, 25, 22)',route);
    observations.push({page:route,darkBackground:bg.background});
    await page.screenshot({path:new URL(route.slice(1)+'-dark-desktop.png',output).pathname,fullPage:true});
  }
  await page.locator('#taskharbor-theme-select').selectOption('light');
  await page.goto(base+'/dashboard',{waitUntil:'domcontentloaded'});
  await page.locator('#taskharbor-theme-select').waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light','cross-page persistence');
  await page.setViewportSize({width:390,height:844});
  await page.locator('#workspace:not([hidden])').waitFor({timeout:10000});
  await page.locator('#taskharbor-theme-select').selectOption('dark');
  await page.screenshot({path:new URL('dashboard-dark-mobile.png',output).pathname,fullPage:true});
  const overflow=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,width:innerWidth}));
  observations.push({page:'mobile-dashboard',overflow});
  assert.ok(overflow.scrollWidth<=overflow.width+2,'Mobile horizontal overflow detected '+JSON.stringify(overflow));
  if(errors.length) throw Error('Unexpected JS runtime errors: '+errors.join('; '));
  console.log('PASS: real Chromium light/dark desktop, cross-page persistence, mobile, and style checks');
} catch(error){
  failures.push(error.stack||error.message);
  console.error('FAIL:',error);
  process.exitCode=1;
} finally {
  writeFileSync(new URL('results.json',output),JSON.stringify({passed:!failures.length,observations,errors,failures},null,2));
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
