import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Exercise the exact functions sent to the browser, plus the outer join flow.
// No Worker binding, account or network service is needed.
const source = await readFile(new URL('../worker.js', import.meta.url), 'utf8');
const internals = '\nexport {BROWSER_SOURCES520,joinFollowDOM520,noteRead16937,browserJoin520,prepareJoinAccount520,JOIN_TARGETS520};';
const worker = await import('data:text/javascript;base64,' + Buffer.from(source + internals).toString('base64'));
const { BROWSER_SOURCES520: browser, JOIN_TARGETS520: targets } = worker;
const owner = 'example';
const profile = 'https://note.com/' + owner;
const location = new URL(profile);
const visibleNode = { getClientRects: () => [1], closest: () => null };
function button(text, attrs = {}) {
  return {...visibleNode, innerText:text, getAttribute: key => attrs[key] ?? null};
}
function readDOM(controls, canonical = profile) {
  const root = {...visibleNode, querySelector: () => ({}), querySelectorAll: selector =>
    controls.filter(c => !c.roleOnly || selector.includes('[role=button]'))};
  const document = {querySelector: () => ({href:canonical}), querySelectorAll: () => [root]};
  return runInNewContext('(' + browser.joinFollowDOM520 + ')("example")', {
    document, location, URL, getComputedStyle: () => ({visibility:'visible'})
  });
}

test('embedded scripts match the functions used by the Worker', () => {
  assert.equal(String(worker.joinFollowDOM520), browser.joinFollowDOM520);
  assert.equal(String(worker.noteRead16937), browser.noteRead16937);
});
test('creator controls distinguish followed, unfollowed and inconclusive', () => {
  assert.equal(readDOM([{...button('フォロー',{'aria-pressed':'true'}), roleOnly:true}]), 'on');
  assert.equal(readDOM([button('フォロー',{'aria-pressed':'false'})]), 'off');
  assert.equal(readDOM([button('フォロー中',{'aria-pressed':'false'})]), 'conflict');
  assert.equal(readDOM([button('フォロー中',{'aria-label':'フォロー'})]), 'conflict');
  assert.equal(readDOM([button('フォロー',{'aria-disabled':'true'})]), 'disabled');
  assert.equal(readDOM([button('フォロー中'),button('フォロー')]), 'ambiguous');
  assert.equal(readDOM([button('フォロー中')], 'https://note.com/another'), 'page');
  assert.equal(readDOM([]), 'missing');
});

async function readResponse({canonical, og, ownerId, data, code = 200}) {
  let reads = 0;
  const document = {querySelector: selector => selector.startsWith('link') ?
    (canonical ? {href:canonical} : null) : (og ? {content:og} : null)};
  const fetch = async (endpoint, options) => {
    ++reads;
    assert.equal(endpoint, '/api/v2/creators/example');
    assert.equal(options.method, 'GET');
    return Response.json({data}, {status:code});
  };
  const result = await runInNewContext('(' + browser.noteRead16937 + ')("follow",arg)', {
    arg:{owner,ownerId}, document, location, fetch, URL, TextDecoder, AbortSignal
  });
  return {state:result.state, reads, code:result.code};
}
test('profile fallback accepts an exact owner ID and rejects conflict, wrong author and rate limits', async () => {
  const data = {id:77,urlname:owner,followings:{actively:true}};
  const check = args => readResponse({og:profile,ownerId:'77',data,...args});
  assert.equal((await check({})).state, 'on');
  assert.equal((await check({data:{...data,followings:{actively:false}}})).state, 'off');
  assert.equal((await check({data:{...data,isFollowing:false}})).state, 'conflict');
  assert.equal((await check({data:{id:77,urlname:owner}})).state, 'relationship');
  assert.equal((await check({ownerId:'99'})).state, 'owner');
  assert.equal((await check({canonical:'https://note.com/wrong'})).reads, 0);
  assert.equal((await check({ownerId:null})).reads, 0);
  assert.equal((await check({code:429})).code, 429);
});

// Drive the normal browser entry through a local DevTools binding. A check of
// an existing application must never fill a composer, send again or mark a write.
async function verifyJob(job, evaluate) {
  const observed = [];
  class LocalSocket extends EventTarget {
    accept() {}
    close() {}
    send(raw) {
      const {id,method,params} = JSON.parse(raw);
      let result = {};
      if(method === 'Runtime.evaluate') {
        observed.push(params.expression);
        result = {result:{value:evaluate(params.expression)}};
      }
      this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({id,result})}));
    }
  }
  const socket = new LocalSocket();
  const binding = {
    acquire:async()=>({sessionId:'test'}), closeSession:async()=>{},
    devtools:{newTarget:async()=>({id:'local'})},
    connectSession:async()=>({webSocket:{fetch:async()=>({webSocket:socket})}})
  };
  let marks = 0;
  const result = await worker.browserJoin520(binding,'43','dummy',{target:targets[0].id,...job},
    async()=>{++marks;return false;},async()=>true);
  assert.equal(marks,0);
  assert.equal(observed.some(e=>e.endsWith('("send")') || /\)\("(?:send|fill)",/.test(e)),false);
  return result;
}
const self = {id:'43',name:'43__'};
const mag = {key:targets[0].id, owner:{urlname:targets[0].owner}, price:0, isJoint:true};
function evaluateCheck(data) {
  return expression => {
    if(expression.includes('/api/v2/current_user'))return self;
    if(expression.includes('/api/v1/magazines/'))return data;
    if(expression.includes('const n=(await r.json()).data'))return {hash:'tested',count:0};
    if(expression.includes('window.scrollTo'))return;
    if(expression.includes('("read",'))return {state:'ready'};
    throw Error('unexpected test command');
  };
}
test('unreadable membership holds even a fresh application; unresolved rights stay unconfirmed',async()=>{
  const unavailable=await verifyJob({kind:'apply'},evaluateCheck(null));
  assert.equal(unavailable.reason,'membership_read');
  const unknown=await verifyJob({kind:'verify'},evaluateCheck({data:mag}));
  assert.equal(unknown.reason,'editorial_unconfirmed');
  const confirmed=await verifyJob({kind:'verify'},evaluateCheck({data:{...mag,editors:[{urlname:'43__'}]}}));
  assert.equal(confirmed.joined,true);
});
test('existing applications remain pending without a second submission',async()=>{
  for(const [phase,expected] of [['sent','application_unconfirmed'],['applied','invitation_wait']]) {
    const result=await verifyJob({kind:'check',phase,hash:'tested'},evaluateCheck({data:mag}));
    assert.equal(result.reason,expected);
  }
});

test('both saved recruitment routes exercise the fallback and hold an unknown relationship', async () => {
  const heldIds=['m32620a9cd50d','md3a807653baf'];
  for(const target of targets.filter(t=>heldIds.includes(t.id))) {
    let directReads=0;
    const io={
      command:async()=>{}, blocked:()=>false,
      poll:async(fn,ok)=>{
        for(let n=0;n<3;n++){const v=await fn();if(ok(v))return v;}
        return null;
      },
      evaluate:async expression=>{
        if(expression.includes('/api/v2/current_user'))return self;
        if(expression.startsWith('('+browser.joinFollowDOM520+')'))return 'missing';
        if(expression.startsWith('('+browser.noteRead16937+')')) {
          ++directReads;
          assert(expression.endsWith(JSON.stringify({owner:target.owner,ownerId:'99'})+')'));
          return {state:'relationship'};
        }
        if(expression.includes('クリエイターからの招待・プレゼント'))return 'on';
        throw Error('unexpected read');
      }
    };
    const article={key:target.article,status:'published',user:{id:99,urlname:target.owner}};
    const result=await worker.prepareJoinAccount520(io,target,'43',{},async()=>{
      assert.fail('No durable action should be attempted while the relationship is unknown');
    },async()=>true,article);
    assert.equal(directReads,1);
    assert.equal(result.reason,'follow_unreadable');
    assert.equal(result.noFollow,undefined);
  }
  assert.equal(targets.filter(t=>heldIds.includes(t.id)).length,2);
});
