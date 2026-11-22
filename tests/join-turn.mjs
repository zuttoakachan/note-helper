import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';

const js = await readFile(new URL('../worker.js', import.meta.url), 'utf8');
const exportsForTest = '\nexport {Desk520,coordinatedBrowser16916};';
const {Desk520,coordinatedBrowser16916} = await import('data:text/javascript;base64,' + Buffer.from(js + exportsForTest).toString('base64'));
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
