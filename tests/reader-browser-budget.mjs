import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';

const workerFile = new URL('../worker.js', import.meta.url);
const baseline = execFileSync('git', ['show', 'ab687cb:worker.js'], {
  cwd: new URL('..', import.meta.url), encoding: 'utf8', maxBuffer: 4000000
});
async function load(source) {
  const code = source + '\nexport {prepare,readerOpportunity1697,LOCAL_BROWSERS16921};';
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}
const old = await load(baseline);
const current = await load(await readFile(workerFile, 'utf8'));

async function measure(app, t, options) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  let launches = 0;
  let availabilityChecks = 0;
  function statement(query, args = []) {
    function result() {
      const results = db.prepare(query).all(...args);
      return {results, meta: db.prepare('SELECT changes() AS changes').get()};
    }
    return {
      bind: (...values) => statement(query, values),
      first: () => result().results[0] ?? null, run: result, all: result
    };
  }
  const env = {
    DB: {prepare: statement, batch: queries => queries.map(q => q.run())},
    BROWSER: {acquire() { launches++; throw Error('offline browser fixture'); }},
    SLOT: '1', NOTE_SESSION: 'fixture', TRACE: {calls: 0, identity: {id: '42', owner: 'self'}}
  };
  await app.prepare(env);
  if (options.browserHold) {
    app.LOCAL_BROWSERS16921.set(env.BROWSER, {available() {
      availabilityChecks++;
      return {message:'ブラウザーの待機中'};
    }});
  }
  const {turn = 0, pending = false, counts} = options;
  const key = 'nexample';
  const owner = turn === 3 ? 'self' : 'author';
  const source = {key, name: 'Fixture', status: 'published', hashtags: ['創作'],
    user: {id: owner === 'self' ? '42' : '24', urlname: owner}, ...counts};
  const fetch = t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(init.method, 'GET');
    if (url === 'https://note.com/api/v3/notes/' + key) return Response.json({data: source});
    assert.equal(url, 'https://note.com/api/v2/creators/self/contents?kind=note&page=1');
    return Response.json({data: {contents: [{...source, likeCount: 1}]}});
  });
  db.prepare('UPDATE nh_control SET account=?,enabled=1,token=?,lease=? WHERE id=1').run('42','token',Date.now()+60000);
  if (pending) {
    db.prepare('INSERT INTO nh_v1697_comments VALUES(?,?,?,?,?,?,?,?,?)')
      .run('pending','1',key,owner,'reader','fingerprint','sending',Date.now(),null);
  }
  db.prepare("UPDATE nh_v1697_discovery SET seed=?,seed_owner=?,turn=?,pending=? WHERE slot='1'")
    .run(key,owner,turn,pending ? 'pending' : '');
  if (options.futureDue) db.prepare("UPDATE nh_v1697_discovery SET due=?,message=? WHERE slot='1'")
    .run(Date.now()+3600000, '前回の一覧取得を確認');
  const run = () => app.readerOpportunity1697(env, {account:'42'}, {}, 'token', new Set(['42']), () => {}, () => {});
  let outcome;
  if (pending && !options.browserHold) await assert.rejects(run, /前回|起動/);
  else outcome = await run();
  const row = db.prepare("SELECT due,turn,used,pending,message FROM nh_v1697_discovery WHERE slot='1'").get();
  const observation = db.prepare("SELECT state,read_at,confirmed FROM nh_v16915_diagnostics WHERE slot='1'").get();
  fetch.mock.restore();
  return {launches, row, observation, availabilityChecks, outcome};
}

test('a future reader round retains its last observation during a browser hold and an unresolved send remains guarded', async t => {
  const ordinary = await measure(current,t,{futureDue:true,browserHold:true});
  assert.equal(ordinary.row.message,'前回の一覧取得を確認');
  assert.equal(ordinary.availabilityChecks,0);
  assert.equal(ordinary.launches,0);
  const recovery = await measure(current,t,{futureDue:true,browserHold:true,pending:true});
  assert.equal(recovery.availabilityChecks,1);
  assert.equal(recovery.outcome.handled,true);
  assert.equal(recovery.row.pending,'pending');
  assert.equal(recovery.launches,0);
});

test('fresh explicit zero reactions skip ordinary component launches and retain the original exploration schedule', async t => {
  t.mock.timers.enable({apis:['Date'], now:Date.UTC(2026,10,23,2)});
  for (const args of [{counts:{likeCount:4,comment_count:0}}, {turn:1,counts:{like_count:0,commentCount:0,comment_count:0}}]) {
    const before = await measure(old, t, args);
    const after = await measure(current, t, args);
    assert.equal(before.launches, 1);
    assert.equal(after.launches, 0);
    assert.equal(after.row.used, before.row.used);
    assert.equal(after.row.turn, before.row.turn);
    assert.equal(after.row.due, before.row.due);
    assert.equal(after.row.due, Date.now()+30*60000);
    assert.match(after.row.message, /候補なし/);
    assert.deepEqual({...after.observation}, {state:'wait',read_at:0,confirmed:0});
  }
});

test('possible targets, missing or inconsistent counts, pending recovery and own-work measurements still use the browser', async t => {
  const cases = [
    {counts:{}}, {counts:{comment_count:'0'}}, {counts:{commentCount:0,comment_count:1}},
    {counts:{commentCount:null}}, {counts:{commentCount:1}},
    {turn:1,counts:{commentCount:0}}, {turn:1,counts:{commentCount:0,likeCount:2}},
    {turn:1,counts:{commentCount:0,likeCount:0,like_count:1}}, {turn:1,counts:{commentCount:2,likeCount:0}},
    {pending:true,counts:{commentCount:0,likeCount:0}}, {turn:3,counts:{commentCount:0,likeCount:0}}
  ];
  for (const args of cases) {
    const result = await measure(current, t, args);
    assert.equal(result.launches, 1, JSON.stringify(args));
    if (args.pending) assert.equal(result.row.pending, 'pending');
  }
});
