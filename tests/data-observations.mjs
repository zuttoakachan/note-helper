import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';

const source = await readFile(new URL('../worker.js', import.meta.url), 'utf8');
const {Desk520} = await import('data:text/javascript;base64,' +
  Buffer.from(source + '\nexport {Desk520};').toString('base64'));
const day = 86400000;
const start = Date.parse('2026-11-23T02:00:00Z');

function database(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const storage = {
    sql: {exec(sql, ...args) {return {toArray: () => db.prepare(sql).all(...args)};}},
    transactionSync(work) {
      db.exec('BEGIN');
      try {const result = work(); db.exec('COMMIT'); return result;}
      catch (error) {db.exec('ROLLBACK'); throw error;}
    }
  };
  const desk = new Desk520(storage, {});
  desk.init();
  return desk;
}

function issue(channel) {
  return '<rss><channel><title>Fixture</title><link>https://note.com/' + channel +
    '</link><item><title>作品</title><link>https://note.com/43__/n/nfixture</link><pubDate>' +
    new Date(start - day).toUTCString() + '</pubDate></item></channel></rss>';
}

test('an RSS response identifying another channel cannot confirm an own publication', async t => {
  const desk = database(t);
  let now = start, channel = 'other';
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async () => new Response(issue(channel)));
  desk.rows("INSERT INTO desk_job(kind,subject,target,label,phase,next,at,message) VALUES('publish','5','nfixture','作品','sent',0,0,'fixture')");
  const phase = () => desk.one("SELECT phase FROM desk_job WHERE subject='5'").phase;
  const archive = () => desk.one("SELECT COUNT(*) n FROM desk_archive WHERE article='nfixture'").n;
  await desk.feed(now);
  assert.deepEqual([phase(),archive()], ['sent',0]);
  assert.match(desk.one('SELECT rss_msg FROM desk_cfg').rss_msg,/再確認待ち/);

  // The ordinary scheduled poll can confirm it after the source identifies itself.
  now += 17 * 60000;
  channel = '43__';
  await desk.feed(now);
  assert.deepEqual([phase(),archive()], ['confirmed',1]);

  desk.rssFaultUntil16926=now+day;
  channel='other';
  await assert.rejects(desk.publicRead('https://note.com/43__/rss','rss'),/配信元/);
});

test('shared RSS reads honor validators and a gone magazine invalidates its saved evidence',async t=>{
  const desk=database(t),mag='fixture/m/mone',url='https://note.com/'+mag+'/rss';
  let now=start,status=200;
  const headers=[];
  t.mock.method(Date,'now',()=>now);
  t.mock.method(globalThis,'fetch',async (_url,init)=>{
    headers.push(new Headers(init.headers).get('If-None-Match'));
    if(status===200)return new Response(issue(mag),{headers:{ETag:'"one"'}});
    return new Response(null,{status});
  });
  const read=()=>desk.publicRead(url,'issue');
  const state=()=>desk.one('SELECT checked,full_at,etag,items FROM desk_rss_feed16926 WHERE url=?',url);
  await Promise.all(['issue','channel','rss'].map(format=>desk.publicRead(url,format)));
  assert.deepEqual(headers,[null]);
  status=304;now+=60000;
  await read();
  assert.equal(headers.at(-1),'"one"');
  const recorded=state();
  assert.equal(recorded.full_at,start);
  assert.equal(recorded.checked,now);
  status=503;now+=60000;
  await assert.rejects(read,/503/);
  assert.equal(JSON.parse(state().items)[0].recruitmentInvalid16947,undefined);
  status=410;now+=60000;
  await assert.rejects(read,/410/);
  const gone=state();
  assert.equal(JSON.parse(gone.items)[0].recruitmentInvalid16947,1);
  assert.deepEqual([gone.checked,gone.full_at,gone.etag],[recorded.checked,recorded.full_at,recorded.etag]);
  status=304;now+=60000;
  await read();
  assert.equal(JSON.parse(state().items)[0].recruitmentInvalid16947,1);
  status=200;now+=60000;
  await read();
  assert.equal(JSON.parse(state().items)[0].recruitmentInvalid16947,undefined);
});

test('repeated partial reader samples give one credit for the same observed like', t => {
  const desk = database(t);
  let now = start;
  t.mock.method(Date, 'now', () => now);
  const row = {slot:'1',account:'34',owner:'writer'};
  const note = {status:'published',key:'nold',name:'旧作',user:{urlname:row.owner,id:34},
    publishAt:new Date(now - 7 * day).toISOString(),likeCount:0};
  const sample = (names,complete) => desk.reachCall16933('reachObserve',row,note,{
    readersVerified:true,sampleOwners:names,sampleComplete:complete});
  const sent = (key,owner='reader') => {
    now += 1000;
    desk.reachCall16933('reachReserve',row,key,{user:{urlname:owner}},'tag:創作');
    now += 1000;
    desk.reachCall16933('reachConfirm',row,key,true);
  };
  const totals = () => desk.reachCall16933('reachCounts',row).map(r => [r.source,r.n]);
  sample([],true);
  sent('nfirst');
  sent('nsecond');
  note.likeCount = 2;
  now += 1000;
  sample(['reader','before_contact'],false);
  assert.deepEqual(totals(),[['tag:創作',1]]);
  sent('nlate','before_contact');
  now += 1000;
  sample(['reader','before_contact'],false);
  assert.deepEqual(totals(),[['tag:創作',1]]);
  now += 1000;
  sample(['reader','another'],true);
  assert.deepEqual(totals(),[['tag:創作',1]]);
});
