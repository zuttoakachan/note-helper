// Run with the project's Wrangler/Miniflare installation on NODE_PATH.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');

const root = path.join(__dirname, '..');
const baseline = execFileSync('git', ['show', '02e875d:worker.js'], {
  cwd: root, encoding: 'utf8', maxBuffer: 4_000_000
});
const candidate = fs.readFileSync(path.join(root, 'worker.js'), 'utf8');

const harness = `
export class StorageBench {
  constructor(ctx) { this.storage = ctx.storage; }
  async fetch() {
    const storage = this.storage;
    const env = { DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }) }) }) } };
    const counter = { reads: 0, queries: 0 };
    function cold() {
      const desk = new Desk520(storage, env);
      desk.rows = (query, ...args) => {
        const cursor = storage.sql.exec(query, ...args);
        const result = cursor.toArray();
        counter.reads += cursor.rowsRead;
        counter.queries++;
        return result;
      };
      return desk;
    }
    const db = storage.sql;
    cold().init();
    storage.transactionSync(() => {
      for (let i = 0; i < 2000; i++) {
        db.exec("INSERT INTO desk_job(kind,subject,label,phase,next,at,message) VALUES('mag',?,'fixture','confirmed',0,?,'done')", String(i), i + 1);
      }
      db.exec("UPDATE desk_cfg SET enabled=0 WHERE id=1");
    });
    const stats = {};
    function record(operation) {
      stats[operation] = { ...counter };
      counter.reads = counter.queries = 0;
    }
    counter.reads = counter.queries = 0;
    let desk;
    for (let i = 0; i < 10; i++) {
      desk = cold();
      desk.init();
      if (!desk.ready || !desk.expansionReady || !desk.rssReady16926 || !desk.contestReady16923) throw Error('incomplete schema');
    }
    record('coldInit');
    for (let i = 0; i < 10; i++) desk.init();
    record('warmInit');
    for (let i = 0; i < 10; i++) {
      const saved = await desk.savedProductionRecords();
      if (saved.active || saved.history.length !== 24 || saved.history[0].at !== 2000) throw Error('incorrect history');
    }
    record('savedHistory');
    if (db.exec('SELECT enabled FROM desk_cfg WHERE id=1').one().enabled !== 0) throw Error('changed stop setting');
    if (db.exec('SELECT COUNT(*) AS n FROM desk_job').one().n !== 2000) throw Error('changed history');
    return Response.json(stats);
  }
}
export default { fetch(req, env) { return env.BENCH.get(env.BENCH.idFromName('fixture')).fetch(req); } };
`;

async function measure(source) {
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, name: 'bench',
    script: source.replace('export default {', 'const noteHelper = {') + harness,
    durableObjects: { BENCH: { className: 'StorageBench', useSQLite: true } },
    compatibilityDate: '2026-10-10'
  }));
  try {
    const response = await mf.dispatchFetch('https://bench.invalid/');
    if (!response.ok) throw new Error((await response.text()).slice(0,1500));
    return await response.json();
  } finally { await mf.dispose(); }
}

(async () => {
  const before = await measure(baseline);
  const after = await measure(candidate);
  console.log(JSON.stringify({ before, after }, null, 2));
  assert(after.coldInit.reads < before.coldInit.reads);
  assert(after.savedHistory.reads < before.savedHistory.reads);
})().catch(error => { console.error(error); process.exitCode = 1; });
