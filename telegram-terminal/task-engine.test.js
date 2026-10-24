import test from 'node:test';
import assert from 'node:assert/strict';
import {TaskEngine} from './task-engine.js';

test('independent tasks and pending versus paid balance', () => {
  const e = new TaskEngine();
  e.addTask({id:'a',source:'authorized-provider',title:'Example task',rewardUgx:500,sourceRewardUgx:700});
  e.addTask({id:'b',source:'authorized-provider',title:'Another task',rewardUgx:500});
  e.assign('a','worker-1');
  e.assign('b','worker-2');
  assert.throws(() => e.assign('a','worker-2'));
  assert.throws(() => e.transition('a','submitted','worker-2'));
  e.transition('a','submitted','worker-1');
  e.transition('a','pending_review','worker-1');
  assert.deepEqual(e.balances('worker-1'),{pendingUgx:500,paidUgx:0});
  assert.throws(() => e.transition('a','approved','worker-1'));
  e.transition('a','approved','admin');
  e.transition('a','paid','admin');
  assert.deepEqual(e.balances('worker-1'),{pendingUgx:0,paidUgx:500});
  assert.equal(e.getTask('b').status,'in_progress');
});
test('reject invalid task and status transitions', () => {
  const e = new TaskEngine();
  assert.throws(() => e.addTask({id:'x',source:'a',title:'x',rewardUgx:-5}));
  e.addTask({id:'x',source:'a',title:'x',rewardUgx:100});
  assert.throws(() => e.addTask({id:'x',source:'a',title:'x',rewardUgx:100}));
  assert.throws(() => e.transition('x','paid','admin'));
});
