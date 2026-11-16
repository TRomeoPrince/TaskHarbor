import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const functionText=source.match(/function referralUsd\(micros\)\{[\s\S]*?\n\}/)?.[0];
function format(micros) {
  assert.ok(functionText,'Referral formatter must exist in the real worker dashboard');
  const sandbox=vm.createContext({});
  vm.runInContext(functionText+'; globalThis.display=referralUsd',sandbox);
  return sandbox.display(micros);
}

test('zero referral rewards use a simple cents display',()=>{
  assert.equal(format(0),'$0.00');
  assert.equal(format(null),'$0.00');
  assert.equal(format(NaN),'$0.00');
});

test('worker sees whole cents but never a made-up rounded-up balance',()=>{
  assert.equal(format(10000),'$0.01');
  assert.equal(format(20000),'$0.02');
  assert.equal(format(1500000),'$1.50');
  assert.equal(format(10999),'$0.01');
  assert.equal(format(19999),'$0.01');
});

test('nonzero sub-cent earnings are visible without exposing micro precision',()=>{
  assert.equal(format(1),'Under $0.01');
  assert.equal(format(9999),'Under $0.01');
});

test('referral section never exposes six decimals or fractional accounting remainder',()=>{
  const line=source.split('\n').find(x=>x.includes("$('referral-stats').textContent"));
  assert.ok(line,'The referral summary should be rendered');
  assert.match(line,/Total rewards: \$\{referralUsd\(s\.referrals\.totalMicros\)\}/);
  assert.doesNotMatch(line,/toFixed\(6\)/);
  assert.doesNotMatch(line,/Fractional remainder/);
  assert.match(line,/Referred members:/);
});
