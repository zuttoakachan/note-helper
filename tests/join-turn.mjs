import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';

const js = await readFile(new URL('../worker.js', import.meta.url), 'utf8');
const exportsForTest = '\nexport {Desk520,coordinatedBrowser16916,PATROL_LOCAL16931};';
const {Desk520,coordinatedBrowser16916,PATROL_LOCAL16931} = await import('data:text/javascript;base64,' + Buffer.from(js + exportsForTest).toString('base64'));
const target = 'md3a807653baf';
const minute = 60000;

function fixture(t) {
  t.mock.timers.enable({apis:['Date'], now:Date.UTC(2026,10,23,2)});
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const storage = {
    sql:{exec(query,...args) { const rows = db.prepare(query).all(...args); return {toArray:() => rows}; }},
    transactionSync(work) {
      db.exec('BEGIN');
      try { const result = work(); db.exec('COMMIT'); return result; }
      catch(error) { db.exec('ROLLBACK'); throw error; }
    }
  };
  const raw = {acquire:async () => ({sessionId:'fixture'}),closeSession:async () => {}};
  const env = {BROWSER:coordinatedBrowser16916(raw,storage)};
  let published = false;
  const events = [];
  function makeDesk() {
    const desk = new Desk520(storage,env);
    desk.init();
    desk.duePublication = () => published;
    desk.deliveryAccount = async () => ({id:'42',slot:'1',hold:0,until:0});
    desk.publicRead = async () => {
      events.push('check');
      throw Error('offline recruitment source');
    };
    desk.task520 = async (name,work) => {
      if(name==='作品とフォロワーの記録'){
        events.push('earlier browser consumer');
        if(!env.BROWSER.available16916()){
          const session=await env.BROWSER.acquire({});
          await env.BROWSER.closeSession(session.sessionId);
        }
      }
      if(name==='参加申請・招待の承認')return work();
    };
    return desk;
  }
  const desk = makeDesk();
  db.exec('UPDATE desk_cfg SET enabled=1,blocked=0; UPDATE desk_delivery SET enabled=1; UPDATE desk_join_cfg SET enabled=1,due=0');
  db.prepare('UPDATE desk_join SET due=?').run(Date.now()+24*60*minute);
  db.prepare('UPDATE desk_join SET due=0 WHERE id=?').run(target);
  const turn = () => db.prepare('SELECT due FROM desk_join_turn WHERE id=1').get()?.due;
  return {db,desk,env,makeDesk,events,turn,publishing:(value) => {published=value;}};
}

test('a due magazine blocked by local browser spacing gets a single ordinary turn, including across cold start', async t => {
  const {desk,db,makeDesk,events,turn,publishing} = fixture(t);
  await desk.tick();
  assert.equal(turn(),Date.now()+21000);
  assert.deepEqual(events,['earlier browser consumer']);
  assert.equal(db.prepare('SELECT used FROM desk_join_cfg').get().used,0);
  assert.equal(db.prepare('SELECT message FROM desk_join WHERE id=?').get(target).message,'募集方法を確認待ち');
  t.mock.timers.tick(4*minute);
  const nextDesk = makeDesk();
  publishing(true);
  await nextDesk.tick();
  assert.ok(turn());
  assert.equal(events.filter(e=>e==='check').length,0);
  t.mock.timers.tick(4*minute);
  publishing(false);
  events.length=0;
  await nextDesk.tick();
  assert.deepEqual(events,['check','check','check','earlier browser consumer']);
  assert.equal(turn(),undefined);
  assert.equal(db.prepare('SELECT reason FROM desk_join_check16930 WHERE id=?').get(target).reason,'source_fetch');
  t.mock.timers.tick(4*minute);
  events.length=0;
  await nextDesk.tick();
  assert.deepEqual(events,['earlier browser consumer']);
  assert.equal(turn(),undefined);
});

test('busy lease can defer a due turn; provider limits, disabled jobs and not-yet-due jobs cannot', async t => {
  const {desk,db,env,turn} = fixture(t);
  const session = await env.BROWSER.acquire({});
  await desk.joinTick520(Date.now());
  assert.equal(turn(),Date.now()+4*minute);
  await env.BROWSER.closeSession(session.sessionId);
  db.exec('DELETE FROM desk_join_turn');
  for(const reason of ['daily','rate','startup']){
    db.prepare('UPDATE desk_browser16916 SET hold_until=?,reason=?').run(Date.now()+minute,reason);
    await desk.joinTick520(Date.now());
    assert.equal(turn(),undefined,reason);
  }
  db.exec("UPDATE desk_browser16916 SET hold_until=0,reason=''; UPDATE desk_join_cfg SET enabled=0");
  await desk.joinTick520(Date.now());
  assert.equal(turn(),undefined);
  db.exec('UPDATE desk_join_cfg SET enabled=1');
  db.prepare('UPDATE desk_join SET due=?').run(Date.now()+60*minute);
  await desk.joinTick520(Date.now());
  assert.equal(turn(),undefined);
  db.prepare('UPDATE desk_join SET due=0 WHERE id=?').run(target);
  db.prepare('UPDATE desk_distribution16918 SET app_next=?').run(Date.now()+minute);
  await desk.joinTick520(Date.now());
  assert.equal(turn(),undefined);
  db.exec("UPDATE desk_distribution16918 SET app_next=0; INSERT INTO desk_join_budget VALUES('2026-11-23',24)");
  await desk.joinTick520(Date.now());
  assert.equal(turn(),undefined);
  assert.equal(db.prepare('SELECT applications FROM desk_join_budget').get().applications,24);
  db.exec("DELETE FROM desk_join_budget; UPDATE desk_join_cfg SET day='2026-11-23',used=96");
  await desk.joinTick520(Date.now());
  assert.equal(turn(),undefined);
  assert.equal(db.prepare('SELECT used FROM desk_join_cfg').get().used,96);
});

test('a queued turn respects a provider hold that arrived between normal ticks', async t => {
  const {desk,db,events,turn} = fixture(t);
  await desk.tick();
  t.mock.timers.tick(4*minute);
  db.prepare("UPDATE desk_browser16916 SET hold_until=?,reason='daily'").run(Date.now()+24*60*minute);
  await desk.tick();
  assert.equal(turn(),undefined);
  assert.equal(events.filter(e=>e==='check').length,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM desk_join_check16930').get().n,0);
});

function attachAccount({db,desk,env},onSource=()=>{},onCredential=()=>{}){
  for(const suffix of ['','_2']){
    db.exec(`CREATE TABLE nh_control${suffix}(id INTEGER PRIMARY KEY,account TEXT,enabled INTEGER,lease INTEGER,next_at INTEGER,inflight TEXT,token TEXT);
      INSERT INTO nh_control${suffix} VALUES(1,'${suffix?'99':'42'}',1,0,0,'','');
      CREATE TABLE nh_health${suffix}(id INTEGER PRIMARY KEY,kind TEXT);
      INSERT INTO nh_health${suffix} VALUES(1,'')`);
  }
  db.exec("CREATE TABLE nh_v13_connection(slot TEXT PRIMARY KEY,hold_until INTEGER); INSERT INTO nh_v13_connection VALUES('1',0),('2',0)");
  db.exec('CREATE TABLE nh_v13_credentials(slot TEXT PRIMARY KEY)');
  env[PATROL_LOCAL16931]={};
  const requests={identity:0,sources:0,leases:0};
  env.DB={
    prepare(query){
      const stmt=db.prepare(query);
      return {bind:(...args)=>({
        all:()=>({results:stmt.all(...args)}),
        first:()=>{if(query.includes('nh_v13_credentials'))onCredential();return stmt.get(...args);},
        run:()=>{if(query.includes('SET token=?'))requests.leases++;return {meta:{changes:stmt.run(...args).changes}};}
      })};
    },
    batch:async statements=>statements.map(stmt=>stmt.all())
  };
  delete desk.deliveryAccount;
  desk.publicRead=async url=>{
    if(url.endsWith('/creators/43__')){
      requests.identity++;
      return {data:{urlname:'43__',id:'42'}};
    }
    requests.sources++;
    onSource(url);
    if(url.includes('/api/v1/magazines/'))return {data:{key:target,owner:{urlname:'wise_rat6355'},price:0}};
    if(url.includes('/api/v3/notes/'))return {data:{key:'nb26aa7f77676',status:'published',user:{urlname:'wise_rat6355'},
      body:'綴り灯 共同運営マガジン。フォロー・コメント欄に参加希望。クリエイターからの招待・プレゼント。一日一本。<a href="https://note.com/wise_rat6355/m/'+target+'">綴り灯</a>'}};
    return '';
  };
  return requests;
}

for(const [name,setup] of [
  ['account lease',(db,now)=>db.prepare('UPDATE nh_control SET lease=?,next_at=?').run(now+minute,now+60*minute)],
  ['upcoming patrol',(db,now)=>db.prepare('UPDATE nh_control SET next_at=?').run(now+30000)],
  ['inflight like',(db,now)=>db.prepare("UPDATE nh_control SET next_at=?,inflight='saved-like'").run(now+60*minute)]
]){
  test(name+' defers before reading recruitment sources and the natural alarm takes the first eligible turn',async t=>{
    const f=fixture(t),calls=attachAccount(f),now=Date.now();
    setup(f.db,now);
    await f.desk.joinTick520(now);
    assert.deepEqual(calls,{identity:1,sources:0,leases:0});
    assert.equal(f.db.prepare('SELECT due FROM desk_join_cfg').get().due,now+4*minute);
    assert.equal(f.db.prepare('SELECT phase,due FROM desk_join WHERE id=?').get(target).phase,'wait');
    assert.equal(f.db.prepare('SELECT due FROM desk_join WHERE id=?').get(target).due,now+4*minute);
    assert.equal(f.db.prepare('SELECT reason FROM desk_join_check16930 WHERE id=?').get(target).reason,'account_busy');
    assert.equal(f.db.prepare('SELECT used FROM desk_join_cfg').get().used,0);
    const cold=f.makeDesk();
    t.mock.timers.tick(4*minute);
    await cold.joinTick520(Date.now());
    assert.equal(f.events.length,0);
    await Promise.all([cold.joinTick520(Date.now(),null,true),cold.joinTick520(Date.now(),null,true)]);
    assert.equal(f.events.length,3);
    assert.equal(cold.accountJoinDue16943(),0);
    assert.equal(f.db.prepare('SELECT due FROM desk_join_cfg').get().due,Date.now()+15*minute);
    assert.equal(f.db.prepare('SELECT count(*) n FROM desk_join_budget').get().n,0);
  });
}

test('account is acquired after proof reads and a lost race gets one bounded handoff',async t=>{
  const f=fixture(t);
  f.db.prepare('UPDATE desk_join SET phase=? WHERE id=?').run('applied',target);
  const calls=attachAccount(f,()=>f.db.prepare('UPDATE nh_control SET lease=?').run(Date.now()+10*minute));
  f.db.prepare('UPDATE nh_control SET next_at=?').run(Date.now()+60*minute);
  await f.desk.joinTick520(Date.now());
  assert.deepEqual(calls,{identity:1,sources:3,leases:1});
  assert.equal(f.desk.accountJoinDue16943(),Date.now()+4*minute);
  t.mock.timers.tick(4*minute);
  await f.desk.joinTick520(Date.now(),null,true);
  assert.deepEqual(calls,{identity:2,sources:3,leases:1});
  assert.equal(f.desk.accountJoinDue16943(),Date.now()+15*minute);
  assert.equal(f.db.prepare('SELECT due FROM desk_join_cfg').get().due,Date.now()+15*minute);
  assert.equal(f.db.prepare('SELECT phase FROM desk_join WHERE id=?').get(target).phase,'applied');
});

test('an overdue account turn has a cron fallback and respects a newly stopped job',async t=>{
  const {db,desk,events}=fixture(t);
  desk.deliveryAccount=async()=>({id:'42',slot:'1',hold:0,until:Date.now()+minute});
  await desk.joinTick520(Date.now());
  t.mock.timers.tick(6*minute);
  db.exec('UPDATE desk_join_cfg SET enabled=0');
  await desk.joinTick520(Date.now());
  assert.equal(desk.accountJoinDue16943(),0);
  assert.equal(events.length,0);
});

test('a provider account hold keeps its full wait and probes never enroll in the automatic handoff',async t=>{
  const {db,desk,events}=fixture(t),now=Date.now();
  desk.deliveryAccount=async()=>({id:'42',slot:'1',hold:now+60*minute,until:now+60*minute});
  await desk.joinTick520(now);
  assert.equal(db.prepare('SELECT due FROM desk_join WHERE id=?').get(target).due,now+61*minute);
  assert.equal(desk.accountJoinDue16943(),0);
  desk.deliveryAccount=async()=>({id:'42',slot:'1',hold:0,until:now+minute});
  await desk.joinTick520(now,{target});
  assert.equal(desk.accountJoinDue16943(),0);
  assert.equal(events.length,0);
});

test('a missed alarm can be claimed by cron, while a pending publication keeps priority',async t=>{
  const {db,desk,events}=fixture(t);
  desk.deliveryAccount=async()=>({id:'42',slot:'1',hold:0,until:Date.now()+minute});
  await desk.joinTick520(Date.now());
  t.mock.timers.tick(6*minute);
  db.prepare('INSERT INTO desk_link_plan(article,scheduled) VALUES(?,?)').run('nfixture',Date.now()+minute);
  await desk.joinTick520(Date.now(),null,true);
  assert.equal(events.length,0);
  assert.equal(db.prepare('SELECT used FROM desk_join_cfg').get().used,0);
  db.exec('DELETE FROM desk_link_plan');
  await desk.joinTick520(Date.now());
  desk.deliveryAccount=async()=>({id:'42',slot:'1',hold:0,until:0});
  t.mock.timers.tick(6*minute);
  await desk.joinTick520(Date.now());
  assert.equal(events.length,3);
  assert.equal(desk.accountJoinDue16943(),0);
});

for(const interrupted of ['optional source returns 429','turned off during reads','turned off during credential load']){
  test(interrupted+' prevents even the browser startup',async t=>{
    const f=fixture(t);
    const stop=()=>f.db.exec('UPDATE desk_join_cfg SET enabled=0');
    const duringSource=url=>{
      if(interrupted==='turned off during reads')stop();
      if(interrupted.startsWith('optional') && url.includes('/m/')){
        f.db.prepare('UPDATE desk_cfg SET blocked=?').run(Date.now()+60*minute);
        throw Error('429');
      }
    };
    const calls=attachAccount(f,duringSource,interrupted==='turned off during credential load'?stop:()=>{});
    f.db.prepare('UPDATE nh_control SET next_at=?').run(Date.now()+60*minute);
    await f.desk.joinTick520(Date.now());
    assert.equal(calls.leases,interrupted==='turned off during credential load'?1:0);
    assert.equal(f.db.prepare('SELECT lease FROM nh_control').get().lease,0);
    assert.equal(f.env.BROWSER.state16916().attempts,0);
    assert.equal(f.db.prepare('SELECT used FROM desk_join_cfg').get().used,0);
    const work=f.db.prepare('SELECT reason FROM desk_join_check16930 WHERE id=?').get(target);
    assert.equal(work.reason,interrupted.startsWith('optional')?'server_wait':'inactive');
    assert.equal(f.db.prepare('SELECT phase FROM desk_join WHERE id=?').get(target).phase,'wait');
  });
}
