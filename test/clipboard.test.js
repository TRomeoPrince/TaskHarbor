import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
for(const mode of ['legacy','modern','blocked'])test('referral copy: '+mode,async()=>{
 let handler,selected=false,written;
 const input={value:'https://example.test/r/12345678',focus(){},select(){selected=true;},setSelectionRange(){}};
 const button={dataset:{copyTarget:'referral-link'},textContent:'Copy link'};
 const context={document:{addEventListener(_,fn){handler=fn;},getElementById(){return input;},execCommand(){return mode==='legacy';}},navigator:{clipboard:{async writeText(value){if(mode==='blocked')throw Error('Denied');written=value;}}},setTimeout(){}};
 vm.runInNewContext(readFileSync(new URL('../public/clipboard.js',import.meta.url),'utf8'),context);
 await handler({target:{closest(){return button;}}});assert.ok(selected);
 assert.equal(button.textContent,mode==='blocked'?'Link selected — copy manually':'Copied!');if(mode==='modern')assert.equal(written,input.value);
});
