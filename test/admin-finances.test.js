import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import {adminFinanceSnapshot, parseFinanceQuery} from '../admin-finances-postgres.js';

test('admin finances rejects non-admins before querying private financial data', async()=>{
  const db={get(){throw Error('should not query')},all(){throw Error('should not query')}};
  for(const user of [null,{id:'a',role:'worker'},{id:'b',role:'client'}]){
    await assert.rejects(adminFinanceSnapshot(db,user),error=>error.status===403);
  }
});
test('member finance pagination and search are bounded',()=>{
  assert.deepEqual(parseFinanceQuery({page:'2',search:'  alex  '}),{page:2,pageSize:100,search:'alex'});
  assert.equal(parseFinanceQuery({page:'-20'}).page,1);
  assert.equal(parseFinanceQuery({page:'2.5'}).page,1);
  assert.equal(parseFinanceQuery({page:'1e20'}).page,1);
  assert.equal(parseFinanceQuery({search:'x'.repeat(100)}).search.length,80);
});
test('admin finances query uses independent grouped aggregates and scopes to workers',async()=>{
  let countSql,aggregateSql,params;
  const db={
    async get(sql,...args){countSql=sql;return {n:1}},
    async all(sql,...args){
      aggregateSql=sql;params=args;
      return [{id:'one',email:'person@example.test',username:'person',
        available:20,earned:150,pending:30,held:50,withdrawn:100,requested:70,requests:2}];
    }
  };
  const response=await adminFinanceSnapshot(db,{id:'admin',role:'admin'},{page:'1',search:'person'});
  assert.match(countSql,/u\.role='worker'/);
  assert.match(aggregateSql,/ledger_rollup AS/);
  assert.match(aggregateSql,/task_rollup AS/);
  assert.match(aggregateSql,/payout_rollup AS/);
  assert.match(aggregateSql,/m\.status='hold'/);
  assert.match(aggregateSql,/w\.status='requested'/);
  assert.equal(params[0],'%person%');
  assert.equal(response.rows[0].available,20);
  assert.equal(response.rows[0].requested,70);
  assert.equal(response.rows[0].held,50);
  assert.equal(response.rows[0].requests,2);
});
test('admin dashboard loads money only through authenticated admin-specific route',()=>{
  const backend=readFileSync(new URL('../server-postgres.js',import.meta.url),'utf8');
  const markup=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const browser=readFileSync(new URL('../public/admin-finances.js',import.meta.url),'utf8');
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.match(backend,/adminFinanceSnapshot\(db, user, params\)/);
  assert.match(backend,/path === '\/api\/admin-finances'/);
  assert.match(markup,/id="admin-finances" hidden/);
  assert.match(markup,/id="withdrawal-filter"/);
  assert.match(markup,/id="admin-finances-rows"/);
  assert.match(app,/TaskHarborAdminFinances\?\.mount\?\.\(s\)/);
  assert.match(app,/data-status="\$\{esc\(w.status\)\}"/);
  assert.match(browser,/credentials:'same-origin'/);
  assert.match(browser,/if \(!active\) return/);
  for(const server of ['server.js','server-postgres.js']){
    const source=readFileSync(new URL('../'+server,import.meta.url),'utf8');
    assert.match(source,/'\/admin-finances\.js'\s*:\s*'admin-finances\.js'/);
  }
  const sandbox=vm.createContext({Intl,Date,Number,String});
  vm.runInContext(browser,sandbox);
  const api=sandbox.TaskHarborAdminFinances;
  assert.equal(api.money(250),'$2.50');
  const records=[{status:'paid'},{status:'requested'},{status:'rejected'}];
  records.sort(api.requestFirst);
  assert.equal(records[0].status,'requested');
});

test('PostgreSQL: admin balances reconcile ledger, pending, hold, requested and paid independently',
  {skip:!process.env.TEST_DATABASE_URL},async()=>{
    const {Pool}=await import('pg');
    const schema='taskharbor_finances_'+randomUUID().replaceAll('-','');
    const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
    const client=await pool.connect();
    const q=(sql,...values)=>client.query(sql,values);
    function convert(sql){let i=0;return sql.replace(/\?/g,()=>'$'+(++i))}
    const db={
      get:async(sql,...values)=>(await q(convert(sql),...values)).rows[0],
      all:async(sql,...values)=>(await q(convert(sql),...values)).rows
    };
    let created=false;
    try {
      await client.query('CREATE SCHEMA '+schema);
      created=true;
      await client.query('SET search_path TO '+schema);
      await client.query(readFileSync(new URL('../neon-schema.sql',import.meta.url),'utf8'));
      await q("INSERT INTO users(id,email,password_hash,role) VALUES('admin','admin@sample.test','x','admin'),('a','alex@sample.test','x','worker'),('b','bella@sample.test','x','worker')");
      await q("INSERT INTO profiles(user_id,username,referral_code,registered_at) VALUES('a','alex','a-ref',1)");
      await q("INSERT INTO ledger(id,user_id,kind,amount) VALUES('l1','a','earning',550),('l2','a','referral',10),('l3','a','compensation',50),('l4','a','withdrawal',-250),('l5','a','withdrawal',-100),('l6','b','earning',999)");
      await q("INSERT INTO withdrawals(id,user_id,amount,destination,status) VALUES('w1','a',250,'synthetic','requested'),('w2','a',100,'synthetic','paid')");
      await q("INSERT INTO tasks(id,title,description,reward,status,worker_id) VALUES('t1','Pending','test',220,'submitted','a'),('t2','Held','test',150,'submitted','a')");
      await q("INSERT INTO moderation(task_id,status,hold_until,note) VALUES('t2','hold',9999999999999,'synthetic hold')");
      const result=await adminFinanceSnapshot(db,{id:'admin',role:'admin'}, {search:'alex'});
      assert.equal(result.total,1);
      assert.equal(result.rows.length,1);
      const row=result.rows[0];
      assert.deepEqual([row.available,row.earned,row.pending,row.held,row.withdrawn,row.requested,row.requests],[260,610,220,150,100,250,1]);
      assert.equal(row.username,'alex');
      const everyone=await adminFinanceSnapshot(db,{id:'admin',role:'admin'});
      assert.equal(everyone.total,2);
      assert.equal(everyone.rows.find(x=>x.id==='b').available,999);
      await assert.rejects(adminFinanceSnapshot(db,{id:'a',role:'worker'}),/Admin access required/);
    } finally {
      await client.query('RESET search_path').catch(()=>{});
      if(created) await client.query('DROP SCHEMA '+schema+' CASCADE').catch(()=>{});
      client.release();
      await pool.end();
    }
  });
