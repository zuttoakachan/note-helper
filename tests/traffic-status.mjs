import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../worker.js', import.meta.url), 'utf8');
const {Desk520} = await import('data:text/javascript;base64,' +
  Buffer.from(source + '\nexport {Desk520};').toString('base64'));

test('traffic status preserves the real initial hold and distinguishes lost saved data', async t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const storage = {
    sql: {exec(query, ...args) { return {toArray: () => db.prepare(query).all(...args)}; }},
    transactionSync(work) {
      db.exec('BEGIN');
      try { const result = work(); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    }
  };
  const desk = new Desk520(storage, {});
  desk.init();
  const state = () => desk.trafficView16913();
  const empty = {current:null, previous:null};
  assert.equal(state().message, 'アクセス状況の初回取得待ち');
  assert.deepEqual(state().payload, empty);

  db.exec('UPDATE desk_cfg SET enabled=1,blocked=0; UPDATE desk_delivery SET enabled=1');
  const now = Date.now();
  await desk.trafficTick16913(now);
  assert.equal(state().message, 'BROWSER設定の確認待ち');
  assert.equal(state().due, now + 6*3600000);
  assert.equal(state().checked, 0);
  assert.deepEqual(state().payload, empty);

  const invalid = '保存されたアクセス集計を読み戻せず・再取得待ち';
  db.exec("UPDATE desk_traffic16913 SET payload='invalid-json'");
  assert.equal(state().message, invalid);
  db.exec("UPDATE desk_traffic16913 SET payload='{}',checked=1");
  assert.equal(state().message, invalid);
  assert.equal(state().due, now + 6*3600000);
  const valid = {current:{start:'2020-01-01',end:'2020-01-07',impressions:0,pageviews:0,
    likes:0,comments:0,referrers:[],updated:''},previous:null};
  db.prepare("UPDATE desk_traffic16913 SET payload=?,message='取得済み'").run(JSON.stringify(valid));
  assert.equal(state().message, '取得済み');
  assert.deepEqual(state().payload, valid);
});
