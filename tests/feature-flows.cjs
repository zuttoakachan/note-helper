// Integration tests for saved records, user-facing routes and background jobs.
// The test-only scheduler exposes fixtures directly through its local DO stub.
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {Miniflare, convertV4MiniflareOptions} = require('miniflare');

const source = readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
const origin = 'https://fixture.invalid';
const admin = 'fixture-only';
const key = 'nfixture';

// This class is appended to the Worker under test in Miniflare only.
const fixtureSource = `export class FixtureScheduler extends NoteScheduler {
  async fetch(req) {
    const {hostname, pathname} = new URL(req.url);
    if (hostname !== 'fixture.internal') return super.fetch(req);
    await prepare(this.env);
    this.desk ||= new Desk520(this.ctx.storage, this.env);
    this.desk.init();
    const desk = this.desk;

    if (pathname === '/pending') {
      const results = [{key:'source', label:'fixture', state:'wait', message:'<saved>', at:12}];
      desk.rows('UPDATE desk_test16920 SET token=?,slot=?,phase=1,started=10,finished=0,due=11,results=? WHERE id=1',
        'offline-token', '1', JSON.stringify(results));
      return new Response(null, {status:204});
    }
    if (pathname === '/snapshot') {
      return Response.json({
        test: desk.one('SELECT * FROM desk_test16920 WHERE id=1'),
        jobs: desk.rows('SELECT * FROM desk_job ORDER BY kind,subject'),
        alarm: await this.ctx.storage.getAlarm(),
        changes: desk.one('SELECT total_changes() AS count').count
      });
    }
    if (pathname === '/metrics') {
      const noon = Date.parse('2026-11-23T12:01:00+09:00');
      const day = 86400000;
      const realNow = Date.now;
      try {
        Date.now = () => noon;
        desk.rows('UPDATE desk_growth SET started=?', noon - 14 * day);
        const fetches = [];
        desk.publicRead = async (url, kind) => {
          fetches.push(url);
          if (kind === 'rss') return [{link:'https://note.com/43__/n/nfixture', title:'合成作品', pubdate:new Date(noon-day).toISOString()}];
          if (url.endsWith('/creators/43__')) return {data:{urlname:'43__', follower_count:17}};
          if (url.endsWith('/notes/nfixture')) return {data:{key:'nfixture', user:{urlname:'43__'}, like_count:4}};
          throw Error('Unexpected fixture request');
        };
        await desk.feed(noon);
        await desk.followers(noon);
        await desk.measure(noon);
        Date.now = () => noon + 6 * day + 3600000;
        await desk.measure(Date.now());
        return Response.json({
          fetches, follower: desk.one('SELECT value FROM desk_follower WHERE d=?','2026-11-23').value,
          samples: desk.rows('SELECT age,value,state FROM desk_sample ORDER BY age')
        });
      } finally { Date.now = realNow; }
    }
    return new Response(null, {status:404});
  }
}`;

test('offline Worker workflows', async t => {
  let outbound = 0;
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules:true, script:source + '\n' + fixtureSource, compatibilityDate:'2026-10-10',
    d1Databases:['DB'], durableObjects:{SCHEDULER:{className:'FixtureScheduler', useSQLite:true}},
    bindings:{ADMIN_KEY:admin, COOKIE_ENCRYPTION_KEY:'11'.repeat(32)},
    outboundService:() => { outbound++; return new Response('Unexpected external request', {status:503}); }
  }));
  t.after(() => mf.dispose());
  const ns = await mf.getDurableObjectNamespace('SCHEDULER');
  const stub = name => ns.get(ns.idFromName(name));
  const appObject = stub('note-helper-210-seconds');
  const snapshot = async () => (await appObject.fetch('https://fixture.internal/snapshot')).json();
  const deskAction = input => mf.dispatchFetch(origin+'/520', {
    method:'POST', headers:{Origin:origin, 'Content-Type':'application/json', 'X-Note-Helper-Admin-Key':admin},
    body:JSON.stringify(input)
  });
  const methods = ['prepare','telegramAction','scoped','reserveOutreach16910','settleOutreach16910',
    'boardHash16912','rememberReaders1699','reserveComment1697','settleComment1697'];
  const local = await import('data:text/javascript;base64,' +
    Buffer.from(source+'\nexport {'+methods.join(',')+'};').toString('base64'));

  await t.test('reading a pending test as JSON and HTML keeps its lease, results, jobs and alarm', async () => {
    assert.equal((await appObject.fetch('https://fixture.internal/pending')).status,204);
    const before = await snapshot();
    for (const accept of ['application/json','text/html']) {
      const response = await mf.dispatchFetch(origin+'/test', {
        method:'POST', headers:{Origin:origin, Accept:accept, 'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({key:admin,action:'records'}).toString()
      });
      assert.equal(response.status,200);
      if (accept === 'application/json') {
        const data = await response.json();
        assert.equal(data.active,true);
        assert.equal(data.results[0].message,'<saved>');
      } else {
        assert.match(await response.text(), /&lt;saved&gt;/);
      }
    }
    assert.deepEqual(await snapshot(),before);
  });

  await t.test('native saved-results form preserves its origin and reads an unfinished test with or without JavaScript', async t => {
    const {chromium} = require('playwright');
    const browser = await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE});
    t.after(() => browser.close());
    await appObject.fetch('https://fixture.internal/pending');
    const before = await snapshot();
    for (const javaScriptEnabled of [true,false]) {
      const context = await browser.newContext({javaScriptEnabled,serviceWorkers:'block'});
      const submitted = [];
      await context.route('**/*', async route => {
        const req = route.request();
        if (req.url() !== origin+'/test') return route.abort();
        const headers = await req.allHeaders();
        if (req.method() === 'POST') submitted.push([headers.origin,new URLSearchParams(req.postData()).get('action')]);
        const res = await mf.dispatchFetch(req.url(), {method:req.method(),headers,body:req.postDataBuffer()??undefined});
        await route.fulfill({status:res.status,headers:Object.fromEntries(res.headers),body:Buffer.from(await res.arrayBuffer())});
      });
      try {
        const page = await context.newPage();
        await page.goto(origin+'/test');
        await page.locator('input[name="key"]').fill(admin);
        const [response] = await Promise.all([
          page.waitForResponse(r => r.request().method() === 'POST'),
          page.getByRole('button',{name:'保存済みの結果・履歴を読む'}).click()
        ]);
        assert.deepEqual(submitted,[[origin,'records']]);
        assert.equal(response.status(),200);
        assert.match(await page.locator('#testresult').innerText(),/<saved>/);
        assert.deepEqual(await snapshot(),before);
      } finally { await context.close(); }
    }
    const denied = await mf.dispatchFetch(origin+'/test', {
      method:'POST',headers:{Origin:'https://other.invalid'},body:new URLSearchParams({action:'records',key:admin})
    });
    assert.equal(denied.status,403);
    assert.deepEqual(await snapshot(),before);
  });

  await t.test('photo consent, metadata stripping, deduplication, download and share confirmation', async () => {
    // A gray one-pixel JPEG, with an additional JPEG comment inserted after SOI.
    const pixels = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AJ//Z','base64');
    const comment = Buffer.from('fixture-comment');
    const jpeg = Buffer.concat([pixels.subarray(0,2), Buffer.from([255,254,0,comment.length+2]), comment, pixels.subarray(2)]);
    const input = {action:'photo', allowed:true, jpeg:jpeg.toString('base64'), caption:'合成写真'};
    assert.equal((await deskAction({...input,allowed:false})).status,400);
    assert.equal((await deskAction(input)).status,200);
    const second = await deskAction(input);
    assert.equal(second.status,200);
    const {photos} = await second.json();
    assert.equal(photos.length,1);
    const {hash} = photos[0];
    const download = await deskAction({action:'download', hash});
    assert.equal(download.status,200);
    assert.equal(download.headers.get('Content-Type'),'image/jpeg');
    // The only additional metadata in the original image is its APP0 segment.
    assert.deepEqual(Buffer.from(await download.arrayBuffer()),Buffer.concat([pixels.subarray(0,2),pixels.subarray(20)]));
    assert.equal((await deskAction({action:'shared',hash,confirm:false})).status,400);
    const mark = async () => (await (await deskAction({action:'shared',hash,confirm:true})).json()).photos[0].shared;
    const at = await mark();
    assert.ok(at>0);
    assert.equal(await mark(),at);
  });

  await t.test('RSS and daily counts record observed values and mark a missed seven-day sample', async () => {
    const response = await stub('reports').fetch('https://fixture.internal/metrics');
    assert.equal(response.status,200);
    const {fetches,follower,samples} = await response.json();
    assert.equal(fetches.filter(url => url.includes('/notes/'+key)).length,1);
    assert.equal(follower,17);
    assert.deepEqual(samples,[{age:1,value:4,state:'記録済み'},{age:7,value:null,state:'欠測'}]);
  });

  await t.test('a confirmed action counts once, readers keep their cooldown and an uncertain board send counts zero', async () => {
    const DB = await mf.getD1Database('DB');
    const env = local.scoped({DB},'1');
    await DB.prepare("UPDATE nh_control SET enabled=1,account='42',token='fixture',lease=? WHERE id=1")
      .bind(Date.now()+900000).run();
    const settings = {author_hours:1};
    const reserve = job => local.reserveOutreach16910(env,'fixture',settings,job);
    const settle = (job,key,confirmed) => local.settleOutreach16910(env,{...job,key},confirmed);
    const qa = {kind:'qa', owner:'writer', author:'103', hash:'fx01', source:'source', url:'https://note.com/writer'};
    const qaKey = await reserve(qa);
    assert.ok(qaKey);
    await settle(qa,qaKey,true);
    await settle(qa,qaKey,true);
    assert.equal((await DB.prepare("SELECT qa FROM nh_v16910_state WHERE slot='1'").first()).qa,1);

    const membership = {kind:'member', owner:'member', author:'104', hash:'', plan:'0円', source:'source', url:'https://note.com/member/membership'};
    const memberKey = await reserve(membership);
    assert.ok(memberKey);
    await settle(membership,memberKey,true);
    assert.equal(await reserve({...membership,owner:'second',author:'105'}),null);
    assert.equal((await DB.prepare('SELECT COUNT(*) n FROM nh_v16912_boards').first()).n,1);
    const url = 'https://note.com/other/membership/boards/abc/posts/def';
    const board = {kind:'board', owner:'other', author:'106', hash:await local.boardHash16912(url), source:'source', url};
    assert.equal(await reserve({...board,hash:'wrong'}),null);
    const boardKey = await reserve(board);
    assert.ok(boardKey);
    await settle(board,boardKey,false);
    assert.equal((await DB.prepare("SELECT sent FROM nh_v16912_state WHERE slot='1'").first()).sent,0);

    const seed = {owner:'writer',key:'nseed'};
    const comment = await local.reserveComment1697(env,'fixture',settings,seed,{owner:'reader',hash:'fx02'},'107');
    assert.ok(comment);
    await local.settleComment1697(env,comment,true);
    await local.settleComment1697(env,comment,true);
    assert.equal((await DB.prepare("SELECT comments FROM nh_v1697_discovery WHERE slot='1'").first()).comments,1);
    await local.rememberReaders1699(env,['writer','r1','r1','r2'],seed,'returning',()=>{});
    assert.deepEqual((await DB.prepare('SELECT owner FROM nh_v1699_readers ORDER BY owner').all()).results,
      [{owner:'r1'},{owner:'r2'}]);
    const due = Date.now()+86400000;
    await DB.prepare("UPDATE nh_v1699_readers SET next_at=? WHERE owner='r1'").bind(due).run();
    await local.rememberReaders1699(env,['r1'],seed,'returning',()=>{});
    assert.equal((await DB.prepare("SELECT next_at FROM nh_v1699_readers WHERE owner='r1'").first()).next_at,due);
  });

  await t.test('Telegram pairing, five-minute test cooldown and disconnect use a mock transport', async t => {
    const env = {DB:await mf.getD1Database('DB'), TELEGRAM_BOT_TOKEN:'123:fixture'};
    await local.prepare(env);
    const calls = [];
    t.mock.method(globalThis,'fetch',async (url,init) => {
      const target = new URL(url);
      assert.equal(target.origin,'https://api.telegram.org');
      assert.equal(init.method,'POST');
      const method = target.pathname.split('/').at(-1);
      calls.push(method);
      let result;
      if (method === 'getMe') result={username:'fixture_bot'};
      else if (method === 'getUpdates') {
        const {nonce} = await env.DB.prepare('SELECT nonce FROM nh_v14_telegram WHERE id=1').first();
        result=[{update_id:1,message:{chat:{type:'private',id:77}, from:{id:77}, date:Date.now()/1000, text:'/start '+nonce}}];
      } else {
        assert.equal(method,'sendMessage');
        result={message_id:1};
      }
      return Response.json({ok:true,result});
    });
    await local.telegramAction(env,'tg_pair');
    assert.match(await local.telegramAction(env,'tg_connect'),/連携しました/);
    assert.match(await local.telegramAction(env,'tg_test'),/送りました/);
    assert.match(await local.telegramAction(env,'tg_test'),/5分/);
    await local.telegramAction(env,'tg_off');
    assert.equal((await env.DB.prepare('SELECT chat_id FROM nh_v14_telegram WHERE id=1').first()).chat_id,'');
    assert.deepEqual(calls,['getMe','getUpdates','sendMessage']);
  });

  await t.test('the email handler only imports an authenticated invitation after forwarding succeeds', async t => {
    t.mock.method(globalThis,'fetch',async () => {
      outbound++;
      throw Error('Unexpected external email request');
    });
    const recipient='notice@fixture.invalid', inbox='inbox@fixture.invalid';
    const saved=[], forwarded=[], rejected=[];
    const env={NOTE_INVITE_TO:recipient,NOTE_MAIL_FORWARD_TO:inbox,SCHEDULER:{
      idFromName:name=>name, get:()=>({fetch:async req=>{
        assert.equal(new URL(req.url).pathname,'/desk/invitation');
        saved.push(await req.json());
        return Response.json({});
      }})
    }};
    function mail(content,options={}) {
      const raw='Content-Type: text/plain; charset=utf-8\r\n\r\n'+content;
      return {to:recipient,raw,rawSize:Buffer.byteLength(raw),headers:new Headers({
        From:'note <notify@note.com>','Authentication-Results':'mx.cloudflare.net; dmarc=pass header.from=note.com'
      }),forward:async address=>forwarded.push(address),setReject:reason=>rejected.push(reason),...options};
    }
    const invite='綴り灯の共同運営への招待 https://note.com/join/md3a807653baf';
    await local.default.email(mail(invite,{to:'other@fixture.invalid'}),env);
    await local.default.email(mail('通常メール'),env);
    await local.default.email(mail(invite,{headers:new Headers({From:'other@fixture.invalid'})}),env);
    assert.equal(saved.length,0);
    await local.default.email(mail(invite),env);
    assert.equal(saved.length,1);
    assert.equal(rejected.length,1);
    assert.deepEqual(forwarded,[inbox,inbox,inbox]);
    await assert.rejects(local.default.email(mail(invite,{forward:async()=>{throw Error('fixture failure');}}),env),/could not be forwarded/);
    assert.equal(saved.length,1);
  });
  assert.equal(outbound,0);
});
