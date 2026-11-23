// Run with node --test and Playwright on NODE_PATH. Set CHROMIUM_EXECUTABLE
// to use a system Chromium instead of the Playwright-managed browser.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');

const source = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
const exportsForTest = '\nexport {Desk520,nativeScreenJS,draftParagraphTextJS,draftBodyHash,readDraftCover,BROWSER_SOURCES520,browserDelivery,inspectDraftDirectory,noteIdentityJS,text520,coverId,draftFailure16935};';
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
        if(expression.includes('FIXTURE_METADATA'))return {name:title, cover:null, hash:'1'.repeat(64),textHash:'2'.repeat(64)};
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
        nativeScreenJS:screen, noteIdentityJS:identity, pause520:async () => {}, draftParagraphTextJS:'null', draftBodyHash:async () => '2'.repeat(64),
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

test('a publication requires the registered text in both saved data and the editor', async t => {
  const m = await worker;
  assert.equal(m.BROWSER_SOURCES520.readDraftCover,String(m.readDraftCover));
  assert.equal(m.BROWSER_SOURCES520.draftBodyHash,String(m.draftBodyHash));
  assert.ok(m.nativeScreenJS.includes(m.draftParagraphTextJS));
  const {chromium} = require('playwright');
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE});
  t.after(() => browser.close());
  const page = await browser.newPage();
  const title = '原稿';
  const editorPage = '<textarea aria-label="記事タイトル">原稿</textarea><div class="ProseMirror" contenteditable="true"></div>' +
    '<button>見出し画像を追加</button><button id="settings">公開設定</button><dialog><label><input type="radio" checked>無料</label>' +
    '<fieldset><input placeholder="ハッシュタグ"></fieldset><button id="publish">投稿する</button></dialog>' +
    '<script>window.clicks=0;settings.onclick=()=>document.querySelector("dialog").showModal();publish.onclick=()=>window.clicks++;</script>';
  let saved, draftStatus, reads = 0;
  const unexpected = [];
  await page.route('**/*', route => {
    const url = route.request().url();
    const html = body => route.fulfill({contentType:'text/html; charset=utf-8',body});
    if (url === 'https://note.com/notes') return html('<article><h2>原稿</h2><p>下書き</p><a href="https://editor.note.com/notes/nabc/edit">編集する</a></article>');
    if (url === 'https://editor.note.com/notes/nabc/edit/') return html(editorPage);
    if (url === 'https://note.com/api/v3/notes/nabc') {
      reads++;
      return route.fulfill({json:{data:{key:'nabc',name:title,user:{urlname:'43__',id:'1'},status:draftStatus,price:0,eyecatch:null,body:saved}}});
    }
    unexpected.push(url);
    return route.abort();
  });
  async function run({body,editor=body,html,link=false,status='draft'}) {
    saved=html;draftStatus=status;reads=0;
    let marks=0;
    const io={blocked:() => false,
      evaluate:async code => code===m.noteIdentityJS?{name:'43__',id:'1'}:page.evaluate(code),
      command:async (_method,{url}) => {
        await page.goto(url);
        if (!url.startsWith('https://editor.note.com/')) return;
        await page.evaluate(text => {
          const root=document.querySelector('.ProseMirror');
          for (const line of text.replace(/\r\n?/g,'\n').split('\n')) {
            const p=document.createElement('p');
            if (line) p.append(line);
            else p.append(document.createElement('br'));
            root.append(p);
          }
        },editor);
      }};
    const scope={inNoteBrowser:async (_b,_c,_e,action) => action(io),pause520:async () => {}};
    for(const key of ['BROWSER_SOURCES520','nativeScreenJS','draftParagraphTextJS','draftBodyHash','noteIdentityJS','coverId','text520','draftFailure16935'])
      scope[key]=m[key];
    const deliver=Function(...Object.keys(scope),'return ('+m.browserDelivery+')')(...Object.values(scope));
    const result=await deliver({},'1','fixture',{kind:'publish',key:'nabc',title,body:link?undefined:body,link},async () => {marks++;return true;});
    return {marks, clicks:await page.evaluate(() => window.clicks||0),reads,message:result.message};
  }
  const cases=[
    ['formatted paragraphs and trailing blank lines','<p data-a="1"><strong>ここ&amp;そこ</strong><br>続き</p>\n<p></p><p>文末</p><p><br></p>','ここ&そこ\r\n続き\r\n\r\n文末\r\n',true],
    ['plain saved text','そのままの文\r\n二行目','そのままの文\n二行目',true],
    ['inline fragments and escaped characters','<a href="/abc">A &lt; B</a><br/>旅&#x1f60a;','A < B\n旅😊',true],
    ['preserved space','<p>A&nbsp;B</p>','A\u00a0B',true],
    ['different kind of space','<p>A&nbsp;B</p>','A B',false],
    ['previously saved body','<p>古い文章</p>','新しい文章',false],
    ['different blank lines','<p>前</p><p>後</p>','前\n\n後',false],
    ['media and text cannot prove a plain manuscript','<p>本文</p><figure><img src="https://forbidden.invalid/image"></figure>','本文',false]
  ];
  for (const [label,html,body,matches] of cases) await t.test(label,async () => {
    const result=await run({html,body});
    assert.equal(result.reads,1);
    assert.equal(result.marks,Number(matches),result.message);
    assert.equal(result.clicks,Number(matches),result.message);
  });
  const staleEditor=await run({html:'<p>保存済み</p>',body:'保存済み',editor:'画面の別稿'});
  assert.equal(staleEditor.marks,0);
  const linkOnly=await run({link:true,html:'<p>保存済みのリンク稿</p>',body:'保存済みのリンク稿'});
  assert.equal(linkOnly.marks,1,linkOnly.message);
  assert.equal(linkOnly.clicks,1);
  const scheduled=await run({link:true,status:'scheduled',html:'<p>note側で予約中</p>',body:'note側で予約中'});
  assert.equal(scheduled.marks,0);
  assert.deepEqual(unexpected,[]);
});

test('magazine delivery rechecks the visible add control after reserving a placement', async () => {
  const m = await worker;
  const {chromium} = require('playwright');
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE});
  try {
    const page = await browser.newPage();
    const html = '<link rel="canonical" href="https://note.com/43__/n/nwork"><h1>作品</h1>' +
      '<button>マガジンに追加</button><div role="dialog"><div>' +
      '<a href="https://note.com/writer/m/mfixture">文芸誌</a><button id="choice" role="checkbox">追加</button></div></div>';
    await page.route('**/*', route => route.fulfill({contentType:'text/html; charset=utf-8', body:html}));
    await page.goto('https://note.com/43__/n/nwork');
    const run = (initial, final) => page.evaluate(async ({initial,final,screen,delivery}) => {
      const choice = document.getElementById('choice');
      let clicks = 0, marks = 0;
      choice.onclick = () => {clicks++;};
      const display = ({text,checked,pressed,aria}) => {
        choice.textContent = text;
        for (const [key,value] of Object.entries({'aria-checked':checked,'aria-pressed':pressed,'aria-label':aria})) {
          if (value === undefined) choice.removeAttribute(key);
          else choice.setAttribute(key,value);
        }
      };
      display(initial);
      const identity = 'fixture authenticated identity';
      const io = {command:async () => {}, blocked:() => false,
        evaluate:async code => code === identity ? {id:'1',name:'43__'} : Function('return '+code)()};
      const send = Function('inNoteBrowser','nativeScreenJS','noteIdentityJS','pause520','return ('+delivery+')')(
        async (_binding,_cookie,_editor,action) => action(io),screen,identity,async () => {});
      const result = await send({},'1','fixture',{kind:'mag',title:'作品',key:'nwork',target:'mfixture'},async () => {
        marks++;
        if (final) display(final);
        return true;
      });
      return {clicks,marks,seen:!!result.seen,notClicked:!!result.notClicked};
    }, {initial,final,screen:m.nativeScreenJS,delivery:String(m.browserDelivery)});
    const add = {text:'追加',checked:'false'};
    const held = {clicks:0,marks:0,seen:false,notClicked:false};
    assert.deepEqual(await run(add),{clicks:1,marks:1,seen:false,notClicked:false});
    for (const control of [
      {text:'削除',checked:'false'}, {text:'解除',checked:'false'}, {text:'追加済み',checked:'false'},
      {text:'削除',aria:'追加'}, {text:'追加',checked:'false',pressed:'true'}, {text:'',checked:'mixed'}
    ]) {
      assert.deepEqual(await run(control),held,JSON.stringify(control));
      assert.deepEqual(await run(add,control),{...held,marks:1,notClicked:true},JSON.stringify(control));
    }
    assert.deepEqual(await run({text:'削除',checked:'true'}),{...held,seen:true});
    assert.deepEqual(await run(add,{text:'削除',checked:'true'}),{...held,marks:1,seen:true});
  } finally { await browser.close(); }
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
