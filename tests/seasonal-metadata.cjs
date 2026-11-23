const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {Miniflare, convertV4MiniflareOptions} = require('miniflare');

const root = path.join(__dirname, '..');
const current = fs.readFileSync(path.join(root, 'worker.js'), 'utf8');
const previous = execFileSync('git', ['show', '82349df:worker.js'], {cwd:root, encoding:'utf8', maxBuffer:4000000});

// Both Worker versions operate on the same real SQLite database in each fixture.
class ArchiveFixture {
  constructor(ctx) { this.storage = ctx.storage; }

  async measure(desk, action) {
    const usage = {read:0, written:0, alter:[]};
    desk.rows = (query, ...args) => {
      const cursor = this.storage.sql.exec(query, ...args);
      const rows = cursor.toArray();
      usage.read += cursor.rowsRead;
      usage.written += cursor.rowsWritten;
      if (/ALTER TABLE desk_archive ADD COLUMN seasonal_tags/i.test(query))
        usage.alter.push({read:cursor.rowsRead, written:cursor.rowsWritten});
      return rows;
    };
    try { await action(); } finally { delete desk.rows; }
    return usage;
  }

  async fetch(request) {
    const input = await request.json();
    const now = Date.parse('2026-12-22T12:00:00+09:00');
    const realNow = Date.now;
    try {
      Date.now = () => now;
      return await this.run(input,now);
    } finally { Date.now = realNow; }
  }

  async run({count, upgrade},now) {
    const pub = now - 90 * D520;
    const old = new LegacyDesk(this.storage, {});
    const next = () => upgrade ? new Desk520(this.storage, {}) : new LegacyDesk(this.storage, {});
    const key = 'nseasonal';
    old.init();
    old.initCirculation16932();
    const columns = old.rows('PRAGMA table_info(desk_archive)').map(c => c.name);
    const insert = "INSERT INTO desk_archive(article,title,pub,verified,due) VALUES(?,?,?,?,?)";
    this.storage.transactionSync(() => {
      old.rows(insert,key,'合成作品',pub,pub,0);
      for (let i=1; i<count; i++) old.rows(insert,'nbook'+i,'旧作'+i,pub,pub,now+30*D520);
      old.rows(`INSERT INTO desk_work(seq,title,body,d,t,locked,draft,genre,method,chars)
        VALUES(1,'未公開の下書き',?,'2027-01-01','07:05',1,'ndraft','小説','なし',24)`,
        'クリスマス\n\n改行と原稿を維持');
      old.rows("INSERT INTO desk_link_plan(article,scheduled) VALUES('ndraft',?)",now + 10*D520);
    });
    const privateData = () => ({
      draft:old.rows('SELECT * FROM desk_work'),
      schedule:old.rows('SELECT * FROM desk_link_plan'),
      settings:old.rows('SELECT enabled,plan,blocked FROM desk_cfg')
    });
    const before = privateData();
    const target = () => old.one('SELECT * FROM desk_archive WHERE article=?',key);
    const initial = target();
    const first = next();
    const migration = await this.measure(first, () => first.init());
    const restored = target();
    const unchangedArchive = columns.every(c => initial[c] === restored[c]);
    const afterInit = old.one('SELECT COUNT(*) AS n FROM desk_archive').n;
    const seededFiller = old.one(`SELECT COUNT(*) AS n FROM desk_archive
      WHERE article='nbook'||substr(title,3) AND title='旧作'||substr(article,6)
      AND pub=? AND verified=? AND due=?`,pub,pub,now+30*D520).n;
    const taggedAfterMigration = upgrade ?
      old.one('SELECT COUNT(*) AS n FROM desk_archive WHERE seasonal_tags IS NOT NULL').n : 0;
    const desk = next();
    const cold = await this.measure(desk, () => desk.init());
    desk.initCirculation16932();
    const requests = [];
    let response;
    desk.publicRead = async (url,kind) => {
      requests.push([url,kind]);
      if (response === null) throw new Error('Fixture unavailable');
      return response;
    };
    const stages = {};
    const record = async (name, action) => {
      requests.length = 0;
      const usage = await this.measure(desk, action);
      const row = target();
      stages[name] = {title:row.title, verified:row.verified, likes:row.likes,
        tags:row.seasonal_tags, requests:[...requests], read:usage.read, written:usage.written};
    };
    const valid = {key, user:{urlname:'43__'}, status:'published', type:'TextNote', name:'合成作品',
      publishAt:new Date(pub).toISOString(), likeCount:4, body:'本文だけには七夕と元旦が出てくる。',
      hashtags:[{hashtag:{name:'#クリスマス'}},'クリスマス',{name:'小説'},'夏']};
    const detail = async (name, overrides) => {
      response = overrides === null ? null : {data:{...valid, ...overrides}};
      old.rows('UPDATE desk_archive SET due=0 WHERE article=?',key);
      await record(name, () => desk.observeArchive(now));
    };
    const feed = async (name,title,owner='43__') => {
      response = [{title,link:'https://note.com/'+owner+'/n/'+key,pubdate:new Date(pub).toISOString()}];
      old.rows('UPDATE desk_cfg SET rss_at=0 WHERE id=1');
      await record(name, () => desk.feed(now));
    };
    await detail('first', {});
    await feed('sameTitle',valid.name);
    await feed('foreignFeed','元日','another_writer');
    await feed('changedTitle','大晦日の散歩');
    await detail('removed', {name:'大晦日の散歩', hashtags:[]});
    await detail('invalidTags', {hashtags:['クリスマス',{}]});
    await detail('noTags', {hashtags:undefined});
    await detail('exactOnly', {hashtags:['七夕祭り','クリスマス風','大晦日ではない']});
    await detail('replaced', {hashtags:[{name:'七夕'}]});
    await detail('wrongOwner', {user:{urlname:'another_writer'}});
    await detail('restore', {});
    await detail('private', {status:'draft'});
    await detail('scheduled', {status:'scheduled'});
    await detail('wrongKey', {key:'nother'});
    await detail('noOwner', {user:{},noteUrl:'https://note.com/43__/n/'+key});
    await detail('reservedTitle', {name:'521'});
    await detail('future', {publishAt:new Date(now+D520).toISOString()});
    await detail('conflictingDate', {publishedAt:new Date(now+D520).toISOString()});
    await detail('invalidDate', {publishAt:'not a date'});
    await detail('differentPublication', {publishAt:new Date(now-D520).toISOString()});
    await detail('millisecondPrecision', {publishAt:new Date(pub+999).toISOString()});
    await detail('restoreAgain', {});
    await detail('unavailable', null);
    return Response.json({columns, migration, cold, unchangedArchive, afterInit, seededFiller, taggedAfterMigration,
      initialTags:restored.seasonal_tags, stages, before, after:privateData()});
  }
}

test('v16.9.45 archive migration and seasonal metadata use the existing public-detail slot', async t => {
  let outbound = 0;
  const mf = new Miniflare(convertV4MiniflareOptions({
    compatibilityDate:'2026-10-10',
    modules:[
      {type:'ESModule', path:'seasonal-entry.mjs', contents:current+
        "\nimport {LegacyDesk} from './seasonal-legacy.mjs';\nexport "+ArchiveFixture.toString()},
      {type:'ESModule', path:'seasonal-legacy.mjs', contents:previous+'\nexport {Desk520 as LegacyDesk}'}
    ],
    durableObjects:{FIXTURE:{className:'ArchiveFixture', useSQLite:true}},
    outboundService:() => { outbound++; return new Response(null,{status:502}); }
  }));
  t.after(() => mf.dispose());
  const ns = await mf.getDurableObjectNamespace('FIXTURE');
  async function run(count, upgrade) {
    const stub = ns.get(ns.idFromName([count,upgrade].join('-')));
    const res = await stub.fetch('https://fixture.invalid/', {method:'POST',body:JSON.stringify({count,upgrade})});
    if (!res.ok) throw Error((await res.text()).slice(0,1500));
    return res.json();
  }
  const old = await run(2048,false);
  const small = await run(1,true);
  const large = await run(2048,true);
  assert.equal(outbound,0);
  for (const [result,size] of [[old,2048],[small,1],[large,2048]]) {
    assert.ok(!result.columns.includes('seasonal_tags'));
    assert.equal(result.afterInit,size);
    assert.equal(result.seededFiller,size-1);
    assert.equal(result.taggedAfterMigration,0);
    assert.ok(result.unchangedArchive);
    assert.deepEqual(result.before,result.after);
    assert.equal(result.cold.alter.length,0);
  }
  assert.equal(old.migration.alter.length,0);
  assert.equal(large.initialTags,null);
  assert.equal(large.migration.alter.length,1);
  assert.deepEqual(large.migration.alter,small.migration.alter);
  assert.equal(large.migration.read,small.migration.read);
  assert.equal(large.migration.written,small.migration.written);
  t.diagnostic('ALTER TABLE, 1 and 2,048 archived works: '+JSON.stringify(large.migration.alter[0]));
  t.diagnostic('Cold init v16.9.45 / upgrade / subsequent cold init: '+
    [old.cold,large.migration,large.cold].map(u => u.read+' read, '+u.written+' written').join(' / '));
  t.diagnostic('Whole upgrade, one archived work: '+small.migration.read+' read, '+small.migration.written+' written.');

  const stages = large.stages;
  for (const [name, stage] of Object.entries(stages)) {
    assert.deepEqual(stage.requests,old.stages[name].requests,name);
    const rss = ['sameTitle','foreignFeed','changedTitle'].includes(name);
    assert.deepEqual(stage.requests, rss ? [['https://note.com/43__/rss','rss']] :
      [['https://note.com/api/v3/notes/nseasonal','json']], name);
    assert.equal(stage.read,old.stages[name].read,name+' rows read');
    assert.equal(stage.written,old.stages[name].written,name+' rows written');
  }
  for (const name of ['first','sameTitle','foreignFeed','restore','restoreAgain','millisecondPrecision']) {
    assert.deepEqual(JSON.parse(stages[name].tags),['クリスマス'],name);
    assert.equal(stages[name].likes,4);
  }
  assert.equal(stages.changedTitle.title,'大晦日の散歩');
  assert.equal(stages.changedTitle.tags,null);
  for (const name of ['removed','invalidTags','noTags','exactOnly'])
    assert.deepEqual(JSON.parse(stages[name].tags),[],name);
  assert.deepEqual(JSON.parse(stages.replaced.tags),['七夕']);
  for (const name of ['wrongOwner','private','scheduled','wrongKey','noOwner','reservedTitle','unavailable']) {
    assert.equal(stages[name].tags,null,name);
    assert.equal(stages[name].verified,0,name);
  }
  for (const name of ['future','conflictingDate','invalidDate','differentPublication'])
    assert.equal(stages[name].tags,null,name);
  t.diagnostic('Normal detail, v16.9.45 and current: '+stages.first.read+' read, '+
    stages.first.written+' written, '+stages.first.requests.length+' public request.');
  t.diagnostic('Same-title RSS, v16.9.45 and current: '+stages.sameTitle.read+' read, '+
    stages.sameTitle.written+' written, '+stages.sameTitle.requests.length+' public request.');
});
