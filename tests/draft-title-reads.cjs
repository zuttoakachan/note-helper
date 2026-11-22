// Run with the project's Wrangler/Miniflare installation on NODE_PATH.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');

const root = path.join(__dirname, '..');
const before = execFileSync('git', ['show', '5488c3e:worker.js'], {
  cwd:root, encoding:'utf8', maxBuffer:4_000_000
});
const after = fs.readFileSync(path.join(root, 'worker.js'), 'utf8');

class DraftTitleBench {
  constructor(ctx, env) { this.ctx=ctx; this.env=env; }

  async fetch() {
    const sql = this.ctx.storage.sql;
    const desk = new Desk520(this.ctx.storage, this.env);
    desk.init();
    const now = Date.parse('2026-11-22T00:00:00+09:00');
    const scheduled = i => now + (i + 2) * 3600000;
    const run = (statement, ...args) => sql.exec(statement, ...args).toArray();
    const insertWork = (i, seq, draft='', published=null, suggested=false, dayOffset=0) => {
      const jst = new Date(scheduled(i) + dayOffset * 86400000 + 9 * 3600000).toISOString();
      const clock = jst.slice(11,16);
      run('INSERT INTO desk_work(seq,title,body,d,t,suggested,locked,draft,genre,method,chars,pub) VALUES(?,?,?,?,?,?,0,?,?,?,?,?)',
        seq,'T'+i,'体',jst.slice(0,10),suggested ? '' : clock,clock,draft,'小説','なし',1,published);
    };

    this.ctx.storage.transactionSync(() => {
      run('UPDATE desk_cfg SET enabled=1 WHERE id=1');
      for (let i=0; i<720; i++) {
        insertWork(i, i+1, i===90 ? 'nexplicit' : '', i>=240 || i===94 ? now-1 : null, i===95);
      }
      insertWork(89,721,'',null,false,1); // Same title on a different day.
      run("INSERT INTO desk_link_plan(article,scheduled,title,title_due) VALUES('ntwin',?,'T89',1)",scheduled(89));
      run("INSERT INTO desk_draft_identity(seq,article,paused) VALUES(92,'nknown',0)");
      for (let i=0; i<100; i++) {
        const title = i===96 ? null : i>=89 ? 'T'+i : 'without-a-manuscript-'+i;
        const at = i===92 ? scheduled(i)+1 : i===93 ? now-10*60000 : scheduled(i);
        run('INSERT INTO desk_link_plan(article,scheduled,title,title_due,pub) VALUES(?,?,?,?,?)',
          'nl'+i,at,title,i===98 ? now+60000 : 0,i===99 ? now-1 : null);
      }
    });

    // Stop immediately after the genuine candidate-selection and retry writes.
    // This fixture needs neither account credentials nor an outbound network.
    desk.deliveryAccount = async () => null;
    const lookups = [];
    desk.rows = (statement, ...args) => {
      const cursor = sql.exec(statement, ...args);
      const result = cursor.toArray();
      if (statement.startsWith('SELECT l.article FROM desk_link_plan l')) {
        lookups.push({ rows:cursor.rowsRead, articles:result.map(r=>r.article) });
      }
      return result;
    };
    await desk.lookupDraftTitle(now);
    const retries = run('SELECT article FROM desk_link_plan WHERE title_due=? ORDER BY article', now+12*60000).map(r=>r.article);
    await desk.lookupDraftTitle(now+1); // Existing four-minute retry gate.
    await desk.lookupDraftTitle(now+4*60000+1);
    const matchesBefore = run('SELECT COUNT(*) n FROM desk_draft_identity')[0].n;
    desk.rememberDraftMetadata({name:'T89',body:'<p>体</p>'},'nl89');
    const matchesAfter = run('SELECT COUNT(*) n FROM desk_draft_identity')[0].n;
    return Response.json({lookups,retries,matchesBefore,matchesAfter});
  }
}

async function measure(source) {
  const harness = `export ${DraftTitleBench.toString()}
export default { fetch(req, env) { return env.BENCH.get(env.BENCH.idFromName('title')).fetch(req); } };`;
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules:true, name:'draft-title-bench', script:source.replace('export default {','const app = {') + harness,
    durableObjects:{ BENCH:{className:'DraftTitleBench',useSQLite:true} },compatibilityDate:'2026-10-10'
  }));
  try {
    const response = await mf.dispatchFetch('https://bench.invalid/');
    if (!response.ok) throw Error((await response.text()).slice(0,1000));
    return await response.json();
  } finally { await mf.dispose(); }
}

(async () => {
  const expected = ['nl89','nl95','nl96','nl97'];
  const old = await measure(before);
  const current = await measure(after);
  for (const result of [old,current]) {
    assert.equal(result.lookups.length,2);
    assert.deepEqual(result.lookups[1].articles,['ntwin','nl98']);
    assert.deepEqual(result.lookups[0].articles,expected);
    assert.deepEqual(result.retries,expected);
    assert.equal(result.matchesAfter,result.matchesBefore);
  }
  assert(current.lookups[0].rows < old.lookups[0].rows);
  console.log('Future draft title lookup:', old.lookups[0].rows, '→', current.lookups[0].rows, 'rows read.');
})().catch(err => {console.error(err);process.exitCode=1;});
