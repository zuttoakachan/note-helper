import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';

const source = await readFile(new URL('../worker.js', import.meta.url), 'utf8');
const {prepare, run} = await import('data:text/javascript;base64,' +
  Buffer.from(source + '\nexport {prepare,run};').toString('base64'));

const owner = {id: '73', urlname: 'reader'};
const sparse = {key:'nfirst', status:'published', user:owner};
const verified = {...sparse, hashtags:['創作'], is_liked:false};

async function patrol(t, cards, details, {budget = 3, hold = false, tagNotes = [], seen = false, recent = false} = {}) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  function statement(query, args = []) {
    const read = () => {
      const results = db.prepare(query).all(...args);
      return {results, meta:db.prepare('SELECT changes() AS changes').get()};
    };
    return {bind:(...values) => statement(query, values), first:() => read().results[0] ?? null, all:read, run:read};
  }
  const env = {DB:{prepare:statement, batch:queries => queries.map(q => q.run())}, NOTE_SESSION:'fixture'};
  await prepare(env);
  db.prepare("UPDATE nh_control SET account='42',enabled=1 WHERE id=1").run();
  db.prepare('UPDATE nh_v15_settings SET scan_notes=? WHERE id=1').run(budget);
  db.prepare("UPDATE nh_v1697_discovery SET due=? WHERE slot='1'").run(Date.now()+100000);
  db.prepare("INSERT INTO nh_v1699_readers(slot,owner,source,origin,seen,expires) VALUES('1','reader','nsource','returning',?,?)")
    .run(Date.now(),Date.now()+100000);
  if (hold) db.prepare("UPDATE nh_v13_connection SET hold_until=? WHERE slot='1'").run(Date.now()+100000);
  if (seen) db.prepare("INSERT INTO nh_seen(key,status,created) VALUES('nfirst','liked',?)").run(Date.now());
  if (recent) db.prepare("INSERT INTO nh_v15_authors(author,last_at,slot,token) VALUES('73',?,'1','past')").run(Date.now());
  const reads = [], sends = [], unexpected = [];
  let lookups = 0;
  const fetch = t.mock.method(globalThis, 'fetch', async (url, init) => {
    const {pathname} = new URL(url);
    if (init.method === 'GET' && pathname === '/api/v2/current_user') return Response.json({data:{id:'42',urlname:'self'}});
    if (init.method === 'GET' && pathname === '/api/v2/creators/reader/contents') {
      lookups++;
      return Response.json({data:{contents:cards}});
    }
    if (init.method === 'GET' && pathname.startsWith('/api/v3/hashtags/')) return Response.json({data:{notes:tagNotes}});
    const match = /^\/api\/v3\/notes\/(n\w+)(\/likes)?$/.exec(pathname);
    if (match && details[match[1]]) {
      const key = match[1];
      if (init.method === 'POST' && match[2]) { sends.push(key); return new Response(null,{status:200}); }
      if (init.method === 'GET' && !match[2]) {
        reads.push(key);
        return Response.json({data:{...details[key], ...(sends.includes(key)?{is_liked:true}:{})}});
      }
    }
    unexpected.push([init.method,pathname]);
    return new Response(null,{status:500});
  });
  try { await run(env,'1'); }
  finally { fetch.mock.restore(); }
  assert.deepEqual(unexpected,[]);
  const confirmed = db.prepare("SELECT readers FROM nh_v1697_discovery WHERE slot='1'").get().readers;
  return {lookups,reads,sends,confirmed};
}

test('a reader profile without list hashtags reaches the detail check and confirms one like', async t => {
  const result = await patrol(t,[sparse],{nfirst:verified});
  assert.deepEqual(result,{lookups:1,reads:['nfirst','nfirst'],sends:['nfirst'],confirmed:1});
});

test('reader detail must match the article, owner, author, public status, like state and literary tags', async t => {
  const changes = [
    {key:'nwrong'}, {user:{...owner,id:'99'}}, {user:{...owner,urlname:'other'}},
    {status:'draft'}, {is_liked:true}, {is_liked:null}, {hashtags:[]}, {hashtags:undefined}, {hashtags:['旅行']}
  ];
  for (const change of changes) {
    const result = await patrol(t,[sparse],{nfirst:{...verified,...change}});
    assert.deepEqual(result,{lookups:1,reads:['nfirst'],sends:[],confirmed:0},JSON.stringify(change));
  }
});

test('verified list matches take priority and all lookups share the patrol detail budget', async t => {
  const explicit = {...verified,key:'nknown'};
  const rejected = {...explicit,hashtags:['旅行']};
  const result = await patrol(t,[sparse,explicit],{nfirst:verified,nknown:rejected},{budget:1});
  assert.deepEqual(result,{lookups:1,reads:['nknown'],sends:[],confirmed:0});
  const next = {...sparse,key:'nsecond'};
  const sparseOnly = await patrol(t,[sparse,next],{nfirst:{...verified,hashtags:[]},nsecond:{...verified,key:'nsecond'}});
  assert.deepEqual(sparseOnly,{lookups:1,reads:['nfirst'],sends:[],confirmed:0});
  const other = {...verified,key:'nother',user:{id:'80',urlname:'other'}};
  const exhausted = await patrol(t,[sparse],{nfirst:{...verified,hashtags:[]},nother:other},{budget:1,tagNotes:[other]});
  assert.deepEqual(exhausted,{lookups:1,reads:['nfirst'],sends:[],confirmed:0});
});

test('known exclusions skip detail reads and an active upstream hold blocks the patrol', async t => {
  const cards = [
    {...sparse,hashtags:[]},{...sparse,hashtags:['旅行']},{...sparse,hashtags:null},{...sparse,is_liked:true},
    {...sparse,status:'draft'},{...sparse,user:{...owner,id:'42'}},{...sparse,user:{...owner,urlname:'other'}}
  ];
  assert.deepEqual(await patrol(t,cards,{}),{lookups:1,reads:[],sends:[],confirmed:0});
  for (const guard of [{seen:true},{recent:true}]) {
    assert.deepEqual(await patrol(t,[sparse],{nfirst:verified},guard),{lookups:1,reads:[],sends:[],confirmed:0});
  }
  assert.deepEqual(await patrol(t,[sparse],{nfirst:verified},{hold:true}),{lookups:0,reads:[],sends:[],confirmed:0});
});
