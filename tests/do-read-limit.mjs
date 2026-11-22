import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import worker, {NoteScheduler} from '../worker.js';

const limit='Durable Objects exceeded the daily rows read limit';
const utcReset=Date.UTC(2026,0,2,0,0,5);

// Execute marker reads and writes on SQLite so a replacement DO instance
// sees exactly what the first instance persisted through its D1 binding.
function markerDB(){
  const sqlite=new DatabaseSync(':memory:');
  return {
    writes:0,
    prepare(query){
      return {query,args:[],bind(...args){this.args=args;return this;},
        async first(){return sqlite.prepare(query).get(...this.args);}};
    },
    async batch(statements){
      for(const {query,args} of statements)sqlite.prepare(query).run(...args);
      this.writes++;
    }
  };
}
function newContext(storage){
  const pending=[];
  return {storage,waitUntil(p){pending.push(p);},async drain(){
    while(pending.length)await Promise.all(pending.splice(0));
  }};
}
function makeScheduler(db,fault){
  const sqlite=new DatabaseSync(':memory:');
  const storage={attempts:0,rejections:0,alarms:[],
    sql:{exec(query,...args){
      storage.attempts++;
      if(fault.message && query.startsWith('SELECT')){
        storage.rejections++;throw Error(fault.message);
      }
      return {toArray:()=>sqlite.prepare(query).all(...args)};
    }},
    transactionSync(fn){return fn();},
    async setAlarm(at){this.alarms.push(at);}
  };
  const ctx=newContext(storage),scheduler=new NoteScheduler(ctx,{DB:db});
  const guard=()=>scheduler.fetch(new Request('https://scheduler.internal/security/admin-key',{
    method:'POST',body:JSON.stringify({valid:true,client:'a'.repeat(64)})
  }));
  return {ctx,scheduler,storage,guard};
}

test('daily read rejection stops repeated SQL, survives cold start and expires at UTC reset',async t=>{
  let clock=utcReset-125000;
  t.mock.method(Date,'now',()=>clock);
  const db=markerDB(),fault={message:limit},warm=makeScheduler(db,fault);
  for(let i=0;i<12;i++){
    const response=await warm.guard();
    assert.equal(response.status,503);
    assert.equal(response.headers.get('Retry-After'),'125');
  }
  await warm.ctx.drain();
  assert.equal(warm.storage.rejections,1);
  assert.equal(db.writes,1);
  const cold=makeScheduler(db,fault);
  assert.equal((await cold.guard()).status,503);
  assert.equal((await cold.scheduler.fetch(new Request('https://scheduler.internal/desk/tick'))).status,503);
  await cold.scheduler.alarm();
  assert.equal(cold.storage.attempts,0);
  assert.deepEqual(cold.storage.alarms,[utcReset]);
  clock=utcReset+1;
  fault.message='';
  assert.equal((await cold.guard()).status,200);
});

test('cron also backs off when Cloudflare rejects the invocation before the DO handler',async t=>{
  let clock=utcReset-60000,denied=true,calls=0;
  t.mock.method(Date,'now',()=>clock);
  const ctx=newContext(),db=markerDB();
  const env={DB:db,SCHEDULER:{idFromName:name=>name,get:()=>({async fetch(){
    calls++;if(denied)throw Error(limit);
    return new Response('OK');
  }})}};
  for(let i=0;i<8;i++){
    await worker.scheduled({},env,ctx);await ctx.drain();
  }
  assert.equal(calls,2); // First wake and tick; subsequent cron events made no requests.
  assert.equal(db.writes,1);
  clock=utcReset;
  denied=false;
  await worker.scheduled({},env,ctx);await ctx.drain();
  assert.equal(calls,4);
});

test('other storage failures leave the read gate open for recovery',async()=>{
  for(const message of ['SQLITE_BUSY','D1_ERROR: daily row read limit','Daily rows written limit exceeded']){
    const db=markerDB(),fault={message},fixture=makeScheduler(db,fault);
    assert.equal((await fixture.guard()).status,503);
    await fixture.ctx.drain();
    assert.equal(db.writes,0);
    fault.message='';
    assert.equal((await fixture.guard()).status,200);
  }
});
