import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';

const source=await readFile(new URL('../worker.js',import.meta.url),'utf8');
const previous=execFileSync('git',['show','19fbc67:worker.js'],{cwd:new URL('..',import.meta.url),encoding:'utf8',maxBuffer:8*1024*1024});
const load=async code=>(await import('data:text/javascript;base64,'+Buffer.from(code+'\nexport {coordinatedBrowser16916};').toString('base64'))).coordinatedBrowser16916;
const current=await load(source),baseline=await load(previous);
const minute=60000,day=1440*minute,origin=Date.UTC(2026,10,24);

function fixture(t,factory=current){
  const db=new DatabaseSync(':memory:');
  t.after(()=>db.close());
  let writes=0,reads=0,account=0,measurement=()=>account,snapshots=0,attempts=0,denied=0;
  const storage={
    sql:{exec(q,...args){
      if(q.startsWith('UPDATE'))writes++;
      if(q.startsWith('SELECT'))reads++;
      const result=db.prepare(q).all(...args);
      return {toArray:()=>result};
    }},
    transactionSync(f){db.exec('BEGIN');try{const value=f();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}}
  };
  const provider={
    async limits(){snapshots++;return {usedBrowserTimeSeconds:await measurement()};},
    async acquire(){attempts++;if(account>=600){denied++;throw Object.assign(Error('Browser time limit exceeded for today'),{status:429});}return {sessionId:String(attempts)};},
    async closeSession(){}
  };
  const cold=()=>factory(provider,storage);
  return {cold,provider,measure(fn){measurement=fn;},stats:()=>({writes,reads,snapshots,attempts,denied,account}),
    async run(browser,kind,duration){
      const b=browser.purpose16916(kind);
      try{
        const {sessionId}=await b.acquire({});
        t.mock.timers.tick(duration);account+=duration/1000;
        await b.closeSession(sessionId);
        return true;
      }catch(error){if(error.reason)return false;throw error;}
    }};
}

test('same 24-hour schedule keeps browser time available for a late publication and late joins',async t=>{
  t.mock.timers.enable({apis:['Date'],now:origin});
  async function simulate(factory,start){
    const f=fixture(t,factory),browser=f.cold();
    const success={normal:0,join:0,publish:0,lateJoin:0};
    // Normal browser demand every 4 minutes, an independent join every 30 minutes
    // (offset to avoid the 21-second launch cooldown), a due publication at 18:01.
    for(let m=0;m<1440;m++){
      const kind=m===18*60+1?'publish':m%30===2?'join':m%4===0?'normal':null;
      if(!kind)continue;
      t.mock.timers.tick(start+m*minute-Date.now());
      if(await f.run(browser,kind,10000)){success[kind]++;if(kind==='join'&&m>=12*60)success.lateJoin++;}
    }
    const {account,denied,snapshots}=f.stats();
    return {...success,seconds:account,denied,snapshots};
  }
  const before=await simulate(baseline,origin),after=await simulate(current,origin+day);
  t.diagnostic(JSON.stringify({before,after}));
  assert.equal(before.seconds,600);
  assert.equal(before.denied,1);
  assert.equal(before.publish,0);
  assert.equal(before.lateJoin,0);
  assert.equal(after.denied,0);
  assert.equal(after.publish,1);
  assert.ok(after.lateJoin>0 && after.join>before.join);
  assert.ok(after.normal>=30 && after.seconds<=520 && after.snapshots<=48);
});

test('previews share normal budget, automatic joins have a separate share, snapshots persist across restarts',async t=>{
  t.mock.timers.enable({apis:['Date'],now:origin});
  const f=fixture(t),browser=f.cold();
  assert.equal(await f.run(browser,'normal',60000),true);
  assert.equal(browser.available16916().browserReason,'budget');
  assert.equal(await f.run(f.cold(),'preview',300000),true);
  assert.equal(browser.purpose16916('preview').available16916().retryAt,origin+day);
  assert.equal(await f.run(browser,'join',30000),true);
  assert.equal(browser.state16916().budget.normal_ms,360000);
  assert.equal(browser.state16916().budget.join_ms,30000);
  assert.equal(f.stats().snapshots,1);
  const previous=f.stats();
  for(let i=0;i<100;i++)assert.equal(await f.run(browser,'normal',0),false);
  const latest=f.stats();
  assert.equal(latest.reads-previous.reads,100);
  assert.equal(latest.writes,previous.writes);
  assert.equal(latest.attempts,previous.attempts);
  assert.equal(latest.snapshots,1);
});

test('an observed account floor survives failed, empty or stale samples and a waiting cold worker',async t=>{
  t.mock.timers.enable({apis:['Date'],now:origin});
  const f=fixture(t);
  f.measure(()=>505.144);
  assert.equal(await f.run(f.cold(),'join',1000),false);
  for(const sample of [()=>{throw Error('provider unavailable');},()=>null,()=>0]){
    t.mock.timers.tick(31*minute);
    f.measure(sample);
    const b=f.cold(),before=b.state16916().budget.used_ms;
    assert.equal(b.available16916().browserReason,'budget');
    assert.equal(await f.run(b,'publish',10000),true);
    assert.equal(b.state16916().budget.used_ms,before+10000);
  }
  assert.equal(Math.round(f.cold().state16916().budget.used_ms),535144);
  assert.equal(f.stats().snapshots,4);
  assert.equal(f.stats().attempts,3);
});

test('an active session crossing UTC midnight charges only its current-day portion after cold start',async t=>{
  t.mock.timers.enable({apis:['Date'],now:origin+day-5000});
  const f=fixture(t),b=f.cold();
  // Withhold provider data so the persisted local charge is independently tested.
  f.measure(()=>null);
  const join=b.purpose16916('join'),session=await join.acquire({});
  t.mock.timers.tick(4999);
  assert.equal(b.state16916().budget.join_ms,4999);
  t.mock.timers.tick(11001);
  assert.equal(b.state16916().budget.join_ms,11000);
  await join.closeSession(session.sessionId);
  const restarted=f.cold();
  assert.equal(restarted.state16916().budget.join_ms,11000);
  assert.equal(restarted.state16916().budget.used_ms,11000);
  t.mock.timers.tick(21000);
  assert.equal(await f.run(restarted,'normal',10000),true);
  assert.equal(restarted.state16916().budget.used_ms,21000);
  assert.equal(f.stats().snapshots,2);
});

test('abandoned browser lease is charged once upon takeover; obsolete close cannot overwrite admission',async t=>{
  t.mock.timers.enable({apis:['Date'],now:origin});
  const f=fixture(t),old=f.cold().purpose16916('normal');
  const first=await old.acquire({});
  t.mock.timers.tick(4*minute);
  const b=f.cold();
  assert.equal(b.state16916().budget.normal_ms,4*minute);
  assert.equal(await f.run(b,'join',10000),true);
  await old.closeSession(first.sessionId);
  assert.equal(b.state16916().budget.normal_ms,4*minute);
  assert.equal(b.state16916().budget.used_ms,250000);
});

test('concurrent eligible requests share one sample and receive a single browser lease',async t=>{
  t.mock.timers.enable({apis:['Date'],now:origin});
  const f=fixture(t),b=f.cold();
  let finish;
  f.measure(()=>new Promise(resolve=>{finish=resolve;}));
  const ordinary=b.acquire({}),join=b.purpose16916('join').acquire({});
  await Promise.resolve();
  assert.equal(f.stats().snapshots,1);
  finish(10);
  const [session,held]=await Promise.allSettled([ordinary,join]);
  assert.equal(session.status,'fulfilled');
  assert.equal(held.reason.reason,'busy');
  assert.equal(f.stats().attempts,1);
  await b.closeSession(session.value.sessionId);
});

test('uncertain close retains its idle tail, prevents an immediate launch and bills the wait once',async t=>{
  t.mock.timers.enable({apis:['Date'],now:origin});
  const f=fixture(t),b=f.cold();
  const {sessionId}=await b.acquire({});
  t.mock.timers.tick(8000);
  f.provider.closeSession=async()=>{throw Error('close unavailable');};
  await assert.rejects(b.closeSession(sessionId),/close unavailable/);
  assert.equal(b.available16916().browserReason,'busy');
  t.mock.timers.tick(15000);
  assert.equal(b.available16916().browserReason,'spacing');
  t.mock.timers.tick(6000);
  assert.equal(b.state16916().budget.normal_ms,23000);
  f.provider.closeSession=async()=>{};
  assert.equal(await f.run(f.cold(),'join',10000),true);
  assert.equal(b.state16916().budget.used_ms,33000);
  assert.equal(b.state16916().budget.normal_ms,23000);
});
