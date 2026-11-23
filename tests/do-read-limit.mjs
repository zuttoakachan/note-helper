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
    writes:0,sqlite,
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
  sqlite.exec('CREATE TABLE fixture_source(id INTEGER PRIMARY KEY)');
  const storage={attempts:0,rejections:0,alarms:[],
    sql:{exec(query,...args){
      storage.attempts++;
      if(fault.message && query.startsWith('SELECT')){
        storage.rejections++;throw Error(fault.message);
      }
      return {toArray:()=>sqlite.prepare(query).all(...args)};
    }},
    transactionSync(fn){return fn();},
    async getAlarm(){return this.alarms.at(-1)??null;},
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

const day=86400000,minute=60000;
function liveFixture(db,fault={message:''}){
  const guard=makeScheduler(db,{message:''}), app=makeScheduler(db,fault);
  let probes=0;
  const env={DB:db,ADMIN_KEY:'test-key',SCHEDULER:{
    idFromName:name=>name,get:name=>({async fetch(request){
      const path=new URL(typeof request==='string'?request:request.url).pathname;
      if(path==='/quota/read-probe')probes++;
      if(path==='/desk/admin'){
        assert.equal((await request.json()).action,'production_test_records');
        // Read-only stub, with a real shared gate in front of the returned records.
        await app.scheduler.readGate.restore();
        if(app.scheduler.readGate.until>Date.now())return app.scheduler.readGate.response();
        return Response.json({active:false,results:['stored']});
      }
      if(path==='/desk/tick')return new Response('OK');
      const target=name==='note-helper-210-seconds'?app:guard;
      return target.scheduler.fetch(request);
    }})
  }};
  const history=(action='records',key='test-key',retry=false,origin='https://fixture.invalid')=>worker.fetch(new Request('https://fixture.invalid/test',{
    method:'POST',headers:{'Origin':origin,'Accept':'application/json',...(retry?{'X-Note-Helper-Retry-Storage':'once'}:{})},
    body:new URLSearchParams({action,key})
  }),env);
  return {guard,app,env,history,probes:()=>probes};
}
function legacy(db,deadline){
  db.sqlite.exec('CREATE TABLE nh_do_read_limit(id INTEGER PRIMARY KEY,resume_at INTEGER NOT NULL)');
  db.sqlite.prepare('INSERT INTO nh_do_read_limit VALUES(1,?)').run(deadline);
}
test('only an authenticated same-origin records retry can probe a legacy hold, even concurrently',async t=>{
  const now=utcReset+90*minute,deadline=utcReset+day;
  t.mock.method(Date,'now',()=>now);
  const db=markerDB();legacy(db,deadline);
  const f=liveFixture(db);
  await f.app.scheduler.readGate.restore();
  f.app.storage.alarms.push(deadline);
  assert.equal((await f.history()).status,503);
  assert.equal((await f.history('records','bad',true)).status,503);
  assert.equal((await f.history('records','test-key',true,'https://other.invalid')).status,403);
  assert.equal((await f.history('start','test-key',true)).status,503);
  assert.equal(f.probes(),0);
  const all=await Promise.all(Array.from({length:8},()=>f.history('records','test-key',true)));
  assert(all.some(r=>r.status===200));assert.equal(f.probes(),1);
  assert.equal((await f.history()).status,200);
  const cronCtx=newContext();await worker.scheduled({},f.env,cronCtx);await cronCtx.drain();
  assert.deepEqual(f.app.storage.alarms,[deadline,now+1000]); // lift the old next-day alarm only
  const cold=liveFixture(db);assert.equal((await cold.history()).status,200);
  assert.equal(db.sqlite.prepare('SELECT resume_at FROM nh_do_read_limit').get().resume_at,deadline);
});
test('real storage refusal keeps the legacy hold closed, with no second manual probe after restart',async t=>{
  t.mock.method(Date,'now',()=>utcReset+90*minute);
  const db=markerDB();legacy(db,utcReset+day);
  const f=liveFixture(db,{message:limit});
  assert.equal((await f.history('records','test-key',true)).status,503);
  assert.equal(f.probes(),1);
  const cold=liveFixture(db);
  assert.equal((await cold.history('records','test-key',true)).status,503);
  assert.equal(cold.probes(),0);
});
test('post-reset rejection gets one shared later check; later genuine quota retains next-day hold',async t=>{
  let now=utcReset-minute;t.mock.method(Date,'now',()=>now);
  const db=markerDB(),fault={message:limit},f=liveFixture(db,fault);
  await f.app.guard();await f.app.ctx.drain();
  now=utcReset+10;await f.app.guard();await f.app.ctx.drain();
  const cronCtx=newContext();
  await worker.scheduled({},f.env,cronCtx);await cronCtx.drain();
  assert.equal(f.probes(),0);
  now=utcReset+11*minute;fault.message='';
  await Promise.all([worker.scheduled({},f.env,cronCtx),worker.scheduled({},f.env,cronCtx)]);await cronCtx.drain();
  assert.equal(f.probes(),1);
  assert.equal((await f.app.guard()).status,200);
  now+=minute;fault.message=limit;await f.app.guard();await f.app.ctx.drain();
  const cold=liveFixture(db);
  assert.equal((await cold.history('records','test-key',true)).status,503);
  now+=10*minute;await worker.scheduled({},cold.env,cronCtx);await cronCtx.drain();
  assert.equal(cold.probes(),0);
});

test('a delayed quota write observed before the successful probe cannot restore the old hold',async t=>{
  let now=utcReset+90*minute;t.mock.method(Date,'now',()=>now);
  const db=markerDB();legacy(db,utcReset+day);
  let release;
  const delayed=new Promise(resolve=>{release=resolve;});
  const slow=makeScheduler({...db,batch:async statements=>{await delayed;return db.batch(statements);}},{message:''});
  slow.scheduler.readGate.record(Error(limit));
  now+=100;
  const f=liveFixture(db);
  assert.equal((await f.history('records','test-key',true)).status,200);
  release();await slow.ctx.drain();
  const cold=liveFixture(db);
  assert.equal((await cold.history()).status,200);
  assert.equal(db.sqlite.prepare('SELECT released FROM nh_do_read_state').get().released,1);
});
test('a persisted provider-directed deadline cannot be shortened by another observer or a manual check',async t=>{
  let now=utcReset+minute;t.mock.method(Date,'now',()=>now);
  const db=markerDB(),a=liveFixture(db),b=liveFixture(db);
  a.app.scheduler.readGate.record(Object.assign(Error(limit),{retryAfter:'172800'}));
  await a.app.ctx.drain();
  const until=a.app.scheduler.readGate.until;
  now+=1000;b.app.scheduler.readGate.record(Error(limit));await b.app.ctx.drain();
  const cold=liveFixture(db);
  const response=await cold.history('records','test-key',true);
  assert.equal(response.status,503);assert.equal(cold.probes(),0);
  assert.equal(Number(response.headers.get('Retry-After')),Math.ceil((until-now)/1000));
});
