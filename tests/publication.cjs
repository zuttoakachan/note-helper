// Run with node --test and Playwright on NODE_PATH. Set CHROMIUM_EXECUTABLE
// to use a system Chromium instead of the Playwright-managed browser.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');

const source = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
const exportsForTest = '\nexport {Desk520,nativeScreenJS,browserDelivery,inspectDraftDirectory,noteIdentityJS,text520,coverId,draftFailure16935};';
const worker = import('data:text/javascript;base64,' + Buffer.from(source + exportsForTest).toString('base64'));

test('draft directory and delivery preview handle canonical list URLs and accessible editor titles', async () => {
  const m = await worker;
  const {chromium} = require('playwright');
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE});
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.abort());
    await page.setContent('<main id="fixture"></main>');
    const results = await page.evaluate(async ({screen, identity, deliveryFn, directoryFn, helpers}) => {
      const root = document.getElementById('fixture');
      const link = 'https://editor.note.com/notes/nabc/edit/';
      const title = '試験原稿';
      const body = 'はじめ\n\n終端';
      let locationValue = new URL('https://note.com/notes/');
      let clicks = 0, marks = 0;
      document.addEventListener('click', () => clicks++);
      function mountList() {
        root.innerHTML = '<article><h2>試験原稿</h2><p>下書き</p><a href="' + link + '">編集する</a></article>';
      }
      function mountEditor() {
        root.innerHTML = '<textarea aria-label="記事タイトル" placeholder="作品名"></textarea>' +
          '<div class="ProseMirror" contenteditable="true"><p>はじめ</p><p><br class="ProseMirror-trailingBreak"></p><p>終端</p></div>' +
          '<button>見出し画像を追加</button>';
        root.firstElementChild.value = title;
      }
      async function evaluate(expression) {
        if(expression === identity)return {id:'1', name:'43__'};
        if(expression.includes('FIXTURE_METADATA'))return {name:title, cover:null, hash:'1'.repeat(64)};
        return Function('location', 'document', 'return (' + expression + ')')(locationValue, document);
      }
      const frame = (step, arg) => evaluate('(' + screen + ')(' + JSON.stringify(step) + ',' + JSON.stringify(arg) + ')');
      const ready = url => frame('draftListReady', {url});
      mountList();
      const observations = {};
      observations.slash = await ready('https://note.com/notes');
      locationValue = new URL('https://note.com/notes/?page=2#list');
      observations.fragment = await ready('https://note.com/notes?page=2#toolbar');
      observations.otherPage = await ready('https://note.com/notes?page=3');
      locationValue = new URL('https://other.invalid/notes/?page=2');
      observations.otherSite = await ready('https://note.com/notes?page=2');
      locationValue = new URL('https://note.com/notes');
      root.innerHTML = '<a href="https://other.invalid/notes/nabc/edit">編集</a>';
      observations.unsafeLink = await ready('https://note.com/notes');
      mountEditor();
      locationValue = new URL(link);
      const args = {key:'nabc', title, body};
      observations.matched = (await frame('draftCheck', args)).state;
      observations.whitespace = (await frame('draftCheck', {...args, body:'はじめ\n終端'})).state;
      observations.differentTitle = (await frame('draftCheck', {...args, title:'別の稿'})).state;
      root.insertAdjacentHTML('beforeend', '<input aria-label="タイトル">');
      observations.ambiguous = (await frame('draftCheck', args)).state;

      const io = {evaluate, blocked:() => false, command:async (method, {url}) => {
        if(method !== 'Page.navigate')throw Error('Unexpected browser command');
        locationValue = new URL(url);
        if(locationValue.origin === 'https://note.com'){locationValue.pathname = '/notes/';mountList();}
        else mountEditor();
      }};
      const scope = {
        inNoteBrowser:async (_binding, _cookie, _editor, action) => action(io),
        nativeScreenJS:screen, noteIdentityJS:identity, pause520:async () => {},
        BROWSER_SOURCES520:{readDraftCover:'FIXTURE_METADATA', draftBodyHash:'FIXTURE_HASH'}
      };
      for(const [name, src] of Object.entries(helpers))scope[name] = Function('return (' + src + ')')();
      const run = fn => Function(...Object.keys(scope), 'return (' + fn + ')')(...Object.values(scope));
      observations.preview = (await run(deliveryFn)({}, '1', 'fixture', {kind:'publish', title, body, preview:true}, async () => {marks++;return false;})).message;
      observations.directory = (await run(directoryFn)({}, 'fixture', '1', [{seq:1,title}])).rows;
      return {...observations, clicks, marks};
    }, {
      screen:m.nativeScreenJS, identity:m.noteIdentityJS, deliveryFn:String(m.browserDelivery), directoryFn:String(m.inspectDraftDirectory),
      helpers:Object.fromEntries(['text520','coverId','draftFailure16935'].map(n => [n,String(m[n])]))
    });
    assert.deepEqual([results.slash,results.fragment,results.otherPage,results.otherSite,results.unsafeLink], [true,true,false,false,false]);
    assert.deepEqual([results.matched,results.whitespace,results.differentTitle,results.ambiguous], ['ready','body_mismatch','title_mismatch','title_ambiguous']);
    assert.match(results.preview, /登録稿と下書きのタイトル・本文・改行の一致を確認/);
    assert.deepEqual(results.directory, [{seq:1, title:'試験原稿', article:'nabc'}]);
    assert.equal(results.clicks, 0);
    assert.equal(results.marks, 0);
  } finally {
    await browser.close();
  }
});

async function deskFixture() {
  const {Desk520} = await worker;
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE desk_cfg(id INTEGER PRIMARY KEY,enabled,blocked);
    INSERT INTO desk_cfg VALUES(1,1,0);
    CREATE TABLE desk_delivery(id INTEGER PRIMARY KEY,enabled,utc_day,pubs,mags,due,start);
    CREATE TABLE desk_job(kind,subject,target,label,at,next,article,message,phase DEFAULT 'wait',PRIMARY KEY(kind,subject));
    CREATE TABLE desk_link_plan(article,scheduled,pub);
    CREATE TABLE desk_archive(article,title);
    CREATE TABLE desk_work_schedule(seq,key,title,locked,paused,scheduled,pub);
    CREATE VIEW desk_open_schedule16939 AS SELECT * FROM desk_work_schedule;
  `);
  const now = Date.now();
  db.prepare('INSERT INTO desk_delivery VALUES(1,1,?,0,0,0,?)').run(Math.floor(now / 86400000), now - 86400000);
  db.prepare('INSERT INTO desk_link_plan VALUES(?,?,NULL)').run('nabc', now);
  const desk = new Desk520({sql:{exec:(sql,...args) => ({toArray:() => db.prepare(sql).all(...args)})}}, {BROWSER:{acquire() {throw Error('No live browser');}}});
  return {db, desk, now};
}

test('interrupting an unsent preflight permits another check inside the same five-minute window', async () => {
  const {db, desk, now} = await deskFixture();
  try {
    // Snapshot the durable receipt before finalization, as on an isolate restart.
    let receipt;
    desk.deliveryAccount = async () => {receipt = db.prepare('SELECT phase,next FROM desk_job').get();return null;};
    await desk.dispatchUnlocked16915(now, true);
    assert.equal(receipt.phase, 'wait');
    assert.equal(receipt.next, now + 60000);
    db.prepare('UPDATE desk_job SET next=?').run(receipt.next);
    assert.equal(desk.duePublication(now + 59999), null);
    assert.equal(desk.duePublication(now + 60000).key, 'nabc');
    assert.equal(desk.duePublication(now + 300001), null);
    for(const phase of ['sent','seen']) {
      db.prepare('UPDATE desk_job SET phase=?').run(phase);
      assert.equal(desk.duePublication(now + 60000), null);
    }
  } finally {db.close();}
});

test('publication alarm rechecks eligibility after concurrent dispatch, respecting retries and expiry', async () => {
  for(const state of ['eligible','retry','expired','sent']) {
    const {db, desk, now} = await deskFixture();
    try {
      if(state === 'expired')db.prepare('UPDATE desk_link_plan SET scheduled=?').run(now - 300001);
      if(state === 'retry' || state === 'sent')db.prepare("INSERT INTO desk_job(kind,subject,next,phase) VALUES('publish','nabc',?,?)").run(
        state === 'retry'? now + 60000 : now - 1000, state === 'sent'? 'sent' : 'wait');
      let finish;
      const started = [];
      desk.dispatchUnlocked16915 = async (at, pubOnly) => {
        started.push({at,pubOnly});
        if(!pubOnly)await new Promise(resolve => {finish = resolve;});
      };
      const running = desk.dispatch(now);
      const alarm = desk.dispatch(now-400000,true);
      assert.equal(started.length,1);
      finish();
      await Promise.all([running,alarm]);
      assert.equal(started.length, state === 'eligible'?2:1, state);
      if(state === 'eligible'){
        assert.equal(started[1].pubOnly,true);
        assert.ok(started[1].at>=now);
      }
    } finally {db.close();}
  }
});
