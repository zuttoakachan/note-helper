import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';

const js = await readFile(new URL('../worker.js', import.meta.url), 'utf8');
const {coordinatedBrowser16916} = await import('data:text/javascript;base64,' +
  Buffer.from(js+'\nexport {coordinatedBrowser16916};').toString('base64'));
const minute = 60000;
const start = Date.UTC(2026, 10, 23, 2);

function fixture(t) {
  t.mock.timers.enable({apis:['Date'], now:start});
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const storage = {
    sql:{exec(query,...args) { const rows=db.prepare(query).all(...args); return {toArray:() => rows}; }},
    transactionSync(f) {
      db.exec('BEGIN');
      try { const result=f(); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    }
  };
  let calls=0, error=Object.assign(new Error('rate limited'),{status:429});
  const provider={
    async acquire() { calls++; if (error) throw error; return {sessionId:'fixture'}; },
    async closeSession() {}
  };
  const cold=() => coordinatedBrowser16916(provider,storage);
  return {db,cold,attempts:() => calls,reply(value) { error=value; }};
}

const failedAt = (browser, at, reason='rate') =>
  assert.rejects(browser.acquire({}), error => error.reason===reason && error.at===at);

test('repeated upstream 429 responses without deadlines back off across cold starts and reset after recovery',async t => {
  const f=fixture(t);
  let browser=f.cold();
  for (const delay of [1,2,4,8,16,32,32]) {
    const now=Date.now(), calls=f.attempts();
    await failedAt(browser,now+delay*minute);
    assert.equal(f.attempts(),calls+1);
    browser=f.cold();
    assert.equal(browser.available16916().retryAt,now+delay*minute);
    t.mock.timers.tick(delay*minute-1);
    await failedAt(browser,now+delay*minute);
    assert.equal(f.attempts(),calls+1);
    t.mock.timers.tick(1);
  }
  f.reply(null);
  const session=await browser.acquire({});
  await browser.closeSession(session.sessionId);
  assert.equal(browser.state16916().background_retry_at,0);
  t.mock.timers.tick(21000);
  f.reply(Object.assign(new Error('rate'),{status:429}));
  await failedAt(browser,Date.now()+minute);
});

test('a due publication can recover during discretionary waiting, with a single early try if still limited',async t => {
  const f=fixture(t), normal=f.cold();
  await failedAt(normal,start+minute);
  t.mock.timers.tick(minute);
  await failedAt(normal,start+3*minute);
  const actual=f.cold().purpose16916('publish');
  await failedAt(actual,start+2*minute);
  assert.equal(f.attempts(),2);
  t.mock.timers.tick(minute);
  await failedAt(normal,start+3*minute);
  await failedAt(actual,start+7*minute+1);
  assert.equal(f.attempts(),3);
  t.mock.timers.tick(5*minute);
  await failedAt(f.cold().purpose16916('publish'),start+7*minute+1);
  assert.equal(f.attempts(),3);
  t.mock.timers.tick(1);
  f.reply(null);
  assert.equal((await actual.acquire({})).sessionId,'fixture');
});

test('successful publication uses the first available session while background retries are deferred',async t => {
  const f=fixture(t), normal=f.cold();
  await failedAt(normal,start+minute);
  t.mock.timers.tick(minute);
  await failedAt(normal,start+3*minute);
  t.mock.timers.tick(minute);
  assert.equal(normal.available16916().retryAt,start+3*minute);
  f.reply(null);
  const publisher=f.cold().purpose16916('publish');
  const session=await publisher.acquire({});
  assert.equal(session.sessionId,'fixture');
  assert.equal(normal.state16916().background_retry_at,0);
  await publisher.closeSession(session.sessionId);
  assert.equal(normal.available16916().browserReason,'spacing');
  assert.equal(f.attempts(),3);
});

test('explicit provider deadlines and daily quota are observed by all purposes after a restart',async t => {
  const f=fixture(t);
  let browser=f.cold();
  for (const header of ['600',new Date(start+20*minute).toUTCString()]) {
    const now=Date.now(), until=now+10*minute, n=f.attempts();
    f.reply(Object.assign(new Error('rate'),{status:429,headers:new Headers({'Retry-After':header})}));
    await failedAt(browser,until);
    browser=f.cold();
    assert.equal(browser.state16916().background_retry_at,0);
    t.mock.timers.tick(10*minute-1);
    await failedAt(browser.purpose16916('publish'),until);
    assert.equal(f.attempts(),n+1);
    t.mock.timers.tick(1);
  }
  f.reply(Object.assign(new Error('Browser time limit exceeded for today'),{status:429}));
  const reset=Date.UTC(2026,10,24,0,0,5);
  await failedAt(browser,reset,'daily');
  t.mock.timers.tick(minute);
  const n=f.attempts();
  await failedAt(f.cold().purpose16916('publish'),reset,'daily');
  assert.equal(f.attempts(),n);
});

test('upgrading a legacy gate preserves its deadline, counters and lease',async t => {
  const {db,cold,attempts}=fixture(t);
  db.exec(`CREATE TABLE desk_browser16916(id INTEGER PRIMARY KEY,next_at INTEGER,hold_until INTEGER,lease INTEGER,token TEXT,started INTEGER,closed INTEGER,reason TEXT,attempts INTEGER,sessions INTEGER)`);
  db.prepare('INSERT INTO desk_browser16916 VALUES(1,?,?,?,?,?,?,?,?,?)')
    .run(start+21000,start+2*minute,start+minute,'keep-token',start-30*minute,start-minute,'rate',117,98);
  const browser=cold();
  await failedAt(browser,start+2*minute);
  const row=db.prepare('SELECT token,lease,attempts,sessions,rate_backoff_ms FROM desk_browser16916').get();
  assert.deepEqual({...row},{token:'keep-token',lease:start+minute,attempts:117,sessions:98,rate_backoff_ms:0});
  assert.equal(browser.state16916().background_retry_at,0);
  assert.equal(Object.hasOwn(browser.state16916(),'token'),false);
  assert.equal(attempts(),0);
});
