// Run with Node.js and Miniflare from the project's Wrangler installation on NODE_PATH.
// Uses two temporary SQLite Durable Objects. It does not call Cloudflare or note.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');

const root = path.resolve(__dirname, '..');
const baseline = execFileSync('git', ['show', '02e875d:worker.js'], {
  cwd: root, encoding: 'utf8', maxBuffer: 4000000
});
const candidate = fs.readFileSync(path.join(root, 'worker.js'), 'utf8');

// This class runs in workerd with the version's real Desk520 methods and SQL schema.
class Bench {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch() {
    const sql = this.ctx.storage.sql;
    const desk = new Desk520(this.ctx.storage, this.env);
    const now = Date.parse('2026-11-22T13:00:00Z');
    const query = (statement, ...args) => sql.exec(statement, ...args).toArray();
    let reads = 0;
    let queries = 0;
    const measureQuery = (statement, ...args) => {
      const cursor = sql.exec(statement, ...args);
      const result = cursor.toArray();
      reads += cursor.rowsRead;
      queries++;
      return result;
    };
    desk.rows = measureQuery;
    // Apply the new schedule migration to populated tables as on an upgrade.
    const migrate = desk.initScheduleRanges;
    if (migrate) desk.initScheduleRanges = () => {};
    desk.init();

    this.ctx.storage.transactionSync(() => {
      for (let i = 0; i < 720; i++) {
        const explicit = i % 4 === 0 ? 'nk' + i : '';
        const publishedAt = i >= 240 ? now - D520 * (i + 1) : null;
        query(`INSERT INTO desk_work(seq,title,body,d,t,locked,draft,genre,method,chars,suggested,article,pub)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, i+1, '作品'+i, '本文', '2026-11-28', '22:00',
          Number(i%17===0), explicit, '小説', 'なし', 2, '20:00', publishedAt ? 'npub'+i : null, publishedAt);
        if (i%5===0) query('INSERT INTO desk_draft_identity(seq,article,paused) VALUES(?,?,?)',
          i+1, 'nb'+i, Number(i%10===0));
        if (explicit || i%5===0) query('INSERT INTO desk_link_plan(article,scheduled,pub,title) VALUES(?,?,?,?)',
          explicit || 'nb'+i, now + D520*(i+2), i%3===0 ? now-1000000 : null, '作品'+i);
      }
      for (let i = 0; i < 80; i++) query('INSERT INTO desk_link_plan(article,scheduled) VALUES(?,?)',
        'nonly'+i, now-D520*(i+2));
      query('UPDATE desk_cfg SET enabled=1 WHERE id=1');
      query('UPDATE desk_delivery SET enabled=1,start=? WHERE id=1', now-1000*D520);
    });

    let migration = null;
    const schedules = view => query('SELECT * FROM '+view+' WHERE pub IS NULL ORDER BY seq');
    const original = JSON.stringify(schedules('desk_work_schedule'));
    const view = migrate ? 'desk_open_schedule16939' : 'desk_work_schedule';
    if (migrate) {
      desk.rows = (statement, ...args) => {
        if (statement.startsWith('CREATE VIEW')) throw Error('interrupted migration');
        return measureQuery(statement, ...args);
      };
      let interrupted = false;
      try { migrate.call(desk); } catch (e) { interrupted = e.message === 'interrupted migration'; }
      const partial = query("SELECT name FROM sqlite_master WHERE name IN ('desk_open_schedule16939','desk_link_all_time16939','desk_manuscript_time16939')");
      if (!interrupted || partial.length) throw Error('migration did not roll back');
      desk.rows = measureQuery;
      reads = queries = 0;
      migrate.call(desk);
      migration = {reads, queries};
    }
    if (JSON.stringify(schedules(view)) !== original) throw Error('schedule migration changed a reservation');

    const sections = [];
    const outcomes = [];
    const measure = (name, operation) => {
      reads = queries = 0;
      for (let i = 0; i < 12; i++) outcomes.push(operation(now + 60000*i));
      sections.push({name, reads, queries});
    };
    measure('due publication', t => desk.duePublication(t));
    measure('next publication alarm', t => desk.publicationAlarm16915(t));
    measure('browser priority', t => desk.publicationPriority16916(t));
    measure('seven feature window checks', t => {
      let count = 0;
      for (let i = 0; i < 7; i++) {
        const window = [t-5*M520, t+6*M520];
        const link = desk.one('SELECT 1 FROM desk_link_plan WHERE pub IS NULL AND scheduled BETWEEN ? AND ? LIMIT 1', ...window);
        const pausedFilter = i<2 ? 'paused=0 AND ' : '';
        if (link || desk.one('SELECT 1 FROM '+view+' WHERE pub IS NULL AND '+pausedFilter+'scheduled BETWEEN ? AND ? LIMIT 1', ...window)) count++;
      }
      return count;
    });

    // Eligible magazines exist, while candidate works lack recent verification.
    this.ctx.storage.transactionSync(() => {
      const policy = JSON.stringify({min:0,max:1000000,genres:genre520,methods:method520});
      for (let i = 0; i < 300; i++) {
        const id = 'mbench'+i, url = 'https://note.com/writer/m/'+id, allowed = Number(i<12);
        query("INSERT INTO desk_import(id,url,name,allowed,managed,state) VALUES(?,?,?,?,?,'利用中')",id,url,id,allowed,allowed);
        query("INSERT INTO desk_member(id,mode,checked) VALUES(?,'auto',?)",id,now);
        query("INSERT INTO desk_mag(url,name,rules,policy,active,recent) VALUES(?,?,'',?,?,?)",url,id,policy,allowed,now);
      }
      for (let i = 0; i < 80; i++) query('INSERT INTO desk_archive(article,title,pub,verified,choice) VALUES(?,?,?,?,?)',
        'narchive'+i,'既刊'+i,now-(1+i)*D520,0,'https://note.com/writer/m/mbench0');
    });
    measure('placement selection', t => desk.nextPlacement(t,false));
    if (desk.eligibleMags(now).length !== 12) throw Error('incorrect eligibility');
    query("UPDATE desk_member SET mode='excluded' WHERE id='mbench0'");
    if (desk.eligibleMags(now).length !== 11) throw Error('eligibility cache survived record change');

    // Reuse the same clock with a due reservation and check both the busy and expired windows.
    query("UPDATE desk_work SET d='2026-11-22',t='22:01' WHERE seq=2");
    measure('due and expired windows', t => {
      const job = desk.duePublication(t);
      return [desk.publicationPriority16916(t), job?.subject ?? null, job?.scheduled ?? null];
    });
    const mutations = [];
    for (const [seq, dt, draft] of [[2,now+60000,''],[6,now+120000,'nb5'],[9,now+180000,'nk8']]) {
      if (draft) query('UPDATE desk_link_plan SET scheduled=?,pub=NULL WHERE article=?',dt,draft);
      const job = desk.duePublication(dt);
      if (job?.subject !== String(seq)) throw Error('rescheduled or manual draft not selected');
      mutations.push([job.subject,job.target,job.scheduled]);
      query('UPDATE desk_work SET locked=1 WHERE seq=?',seq);
      if (desk.duePublication(dt)) throw Error('locked draft remained eligible');
    }
    if (JSON.stringify(schedules(view)) !== JSON.stringify(schedules('desk_work_schedule'))) throw Error('stale schedule after update');
    return Response.json({sections, outcomes, migration, mutations});
  }
}

async function run(source) {
  const harness = '\nexport '+Bench.toString()+'\nexport default {fetch(req,env){return env.BENCH.get(env.BENCH.idFromName("bench")).fetch(req)}}';
  const options = {modules:true,script:source.replace('export default {','const noteWorker = {')+harness,
    durableObjects:{BENCH:{className:'Bench',useSQLite:true}},compatibilityDate:'2026-10-10'};
  const mf = new Miniflare(convertV4MiniflareOptions ? convertV4MiniflareOptions(options) : options);
  try {
    const response = await mf.dispatchFetch('http://bench/');
    if (!response.ok) throw Error(await response.text());
    return await response.json();
  } finally {await mf.dispose();}
}

async function main() {
  const before = await run(baseline);
  const after = await run(candidate);
  assert.deepEqual(before.outcomes, after.outcomes);
  assert.deepEqual(before.mutations, after.mutations);
  console.table(before.sections.map((section,i)=>({
    operation:section.name,oldRows:section.reads,newRows:after.sections[i].reads,
    oldQueries:section.queries,newQueries:after.sections[i].queries
  })));
  console.log('One-time candidate schedule index creation:',after.migration);
  assert(after.sections[0].reads<before.sections[0].reads);
  assert(after.sections[4].reads<before.sections[4].reads);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
