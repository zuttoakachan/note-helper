const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');

const root = path.join(__dirname, '..');
const before = execFileSync('git', ['show', '19fbc67:worker.js'], {
  cwd: root, encoding: 'utf8', maxBuffer: 4000000
});
const after = fs.readFileSync(path.join(root, 'worker.js'), 'utf8');

class SteadyReadBench {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async fetch() {
    const desk = new Desk520(this.ctx.storage, this.env);
    desk.init();
    const sql = this.ctx.storage.sql;
    const query = (statement, ...args) => sql.exec(statement, ...args).toArray();
    const now = Date.parse('2026-11-23T01:00:00Z');
    Date.now = () => now;
    this.ctx.storage.transactionSync(() => {
      for (let i = 1; i <= 1000; i++) {
        query(`INSERT INTO desk_work(seq,title,body,d,t,locked,draft,genre,method,chars,article,pub)
          VALUES(?,?,'本文','2026-11-01','12:00',0,'','小説','なし',2,?,?)`,
          i,'作品'+i,'nwork'+i,i===3 ? null : now-86400000);
        // Linked published work, linked unpublished work, and independent releases.
        const article = i===2 || i===3 ? 'nwork'+i : 'nrelease'+i;
        query('INSERT INTO desk_release(id,article,title,pub) VALUES(?,?,?,?)',i,article,'作品'+i,now-86400000);
        query('INSERT INTO desk_archive(article,title,pub) VALUES(?,?,?)',article,'作品'+i,now-86400000);
        query("INSERT INTO desk_sample(seq,age,due,state) VALUES(?,1,?,'記録済み')",i,now-86400000);
      }
    });
    let rowsRead = 0;
    let requested = [];
    desk.rows = (statement, ...args) => {
      const cursor = sql.exec(statement, ...args);
      const result = cursor.toArray();
      rowsRead += cursor.rowsRead;
      return result;
    };
    desk.publicRead = async url => {
      const article = url.split('/').at(-1);
      requested.push(article);
      return {data:{key:article,user:{urlname:'43__'},likeCount:42}};
    };
    const run = async () => {
      rowsRead = 0;
      requested = [];
      await desk.measure(now);
      return {rowsRead, requested};
    };
    const empty = await run();
    for (const seq of [-5,-3,-2,-1,1,2,3,4,6,7,8,9,10,20,21,22,1001]) {
      const due = seq===21 ? now+1 : seq===22 ? now-WINDOW520 : now-1000;
      const lastTry = seq===20 ? now-1000 : 0;
      query('INSERT INTO desk_sample(seq,age,due,last_try) VALUES(?,7,?,?)',seq,due,lastTry);
    }
    const first = await run();
    const second = await run();
    const states = query('SELECT seq,state,value FROM desk_sample WHERE age=7 ORDER BY seq');
    const magazine = 'https://note.com/writer/m/mbench1';
    const members = JSON.stringify({min:0,max:1000000,genres:genre520,methods:method520});
    this.ctx.storage.transactionSync(() => {
      for (let i=1; i<=1000; i++) {
        const id = 'mbench'+i, url = 'https://note.com/writer/m/'+id, active = Number(i<=20);
        query("INSERT INTO desk_import(id,url,name,allowed,managed,state) VALUES(?,?,?,?,?,'利用中')",id,url,id,active,active);
        query("INSERT INTO desk_member(id,mode,checked) VALUES(?,'auto',?)",id,now);
        query("INSERT INTO desk_mag(url,name,rules,policy,active,recent) VALUES(?,?,'',?,?,?)",url,id,members,active,now);
      }
      query('UPDATE desk_archive SET pub=?,pick_rev=(SELECT rev FROM desk_pick_meta WHERE id=1),pick_due=?',now-60*D520,now+D520);
    });
    const candidates = " WHERE article IN ('nrelease1','nrelease4')";
    desk.initCirculation16932(); // Measure the recurring query after both versions have initialized.
    const loadMagazines = desk.eligibleMags.bind(desk);
    let lookups = 0;
    desk.eligibleMags = t => {lookups++; return loadMagazines(t);};
    const count = fn => {
      rowsRead = lookups = 0;
      const result = fn();
      return {rowsRead,lookups,result};
    };
    query('UPDATE desk_archive SET pick_due=0'+candidates);
    const plan = count(()=>desk.planArchive(now));
    query('UPDATE desk_archive SET choice=?'+candidates,magazine);
    const placement = count(()=>desk.nextPlacement(now,false));
    const delayed = query('SELECT article,mag_due FROM desk_archive WHERE mag_due=? ORDER BY article',now+HOUR);
    // One verified magazine, two verified works. The send-time check sees a later revocation.
    query("UPDATE desk_member SET mode='excluded' WHERE id<>'mbench1'");
    query('UPDATE desk_archive SET verified=?,pick_due=0,mag_due=0'+candidates,now);
    const verified = count(()=>desk.planArchive(now));
    const selected = query('SELECT choice FROM desk_archive'+candidates+' ORDER BY article');
    const eligible = desk.eligiblePlacement('nrelease1',now,'mbench1')?.target;
    query("UPDATE desk_member SET mode='excluded' WHERE id='mbench1'");
    const revoked = desk.eligiblePlacement('nrelease1',now,'mbench1');
    return Response.json({empty,first,second,states,plan,placement,delayed,verified,selected,eligible,revoked});
  }
}

async function run(source) {
  const harness = `\nexport ${SteadyReadBench.toString()}
    export default {fetch(req, env) {return env.B.get(env.B.idFromName('sample')).fetch(req);}}`;
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules:true, name:'sample-read-test', script:source.replace('export default {','const app = {')+harness,
    durableObjects:{B:{className:'SteadyReadBench',useSQLite:true}}, compatibilityDate:'2026-10-10'
  }));
  try {
    const res = await mf.dispatchFetch('https://bench.invalid/');
    if (!res.ok) throw Error((await res.text()).slice(0,1000));
    return await res.json();
  } finally { await mf.dispose(); }
}

(async () => {
  const old = await run(before);
  const current = await run(after);
  assert.deepEqual(current.states,old.states);
  for (const result of [old,current]) {
    assert.deepEqual(result.empty.requested,[]);
    assert.deepEqual(result.first.requested,['nrelease5','nwork2','nrelease1','nwork1','nwork4','nwork6','nwork7','nwork8']);
    assert.deepEqual(result.second.requested,['nwork9','nwork10']);
    assert.deepEqual(result.states.filter(s=>s.value===42).map(s=>s.seq),[-5,-2,-1,1,4,6,7,8,9,10]);
    assert.equal(result.states.find(s=>s.seq===22).state,'欠測');
    assert.equal(result.placement.result,null);
    assert.deepEqual(result.delayed.map(r=>r.article),['nrelease1','nrelease4']);
    assert.equal(result.verified.lookups,1);
    assert.deepEqual(result.selected.map(r=>r.choice),Array(2).fill('https://note.com/writer/m/mbench1'));
    assert.equal(result.eligible,'mbench1');
    assert.equal(result.revoked,null);
  }
  for (const scenario of ['empty','first','second']) {
    assert(current[scenario].rowsRead < old[scenario].rowsRead);
    console.log('Publication samples ('+scenario+'):',old[scenario].rowsRead,'→',current[scenario].rowsRead,'rows read.');
  }
  for (const scenario of ['plan','placement']) {
    assert.equal(current[scenario].lookups,0);
    assert.equal(old[scenario].lookups,1);
    assert(current[scenario].rowsRead < old[scenario].rowsRead);
    console.log('Unverified works ('+scenario+'):',old[scenario].rowsRead,'→',current[scenario].rowsRead,'rows read.');
  }
})().catch(err => {console.error(err); process.exitCode=1;});
