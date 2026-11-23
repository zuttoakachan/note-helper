// Exercise the normal control form against workerd/D1. The scheduler wake is
// acknowledged by a fixture so no alarm can act on the synthetic accounts.
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {Miniflare, convertV4MiniflareOptions} = require('miniflare');

const source = readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
const fixture = `
export class TestScheduler extends NoteScheduler {
  async fetch(req) {
    if (new URL(req.url).pathname === '/wake') return new Response('OK');
    return super.fetch(req);
  }
}`;

test('account form saves settings, credentials and independent stop states', async t => {
  const origin = 'https://fixture.invalid';
  const calls = [];
  const identities = new Map([['initial-one', 101], ['initial-two', 202], ['updated-one', 101]]);
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules:true, script:source + fixture, compatibilityDate:'2026-10-10',
    d1Databases:['DB'], durableObjects:{SCHEDULER:{className:'TestScheduler', useSQLite:true}},
    bindings:{ADMIN_KEY:'form-fixture', COOKIE_ENCRYPTION_KEY:'ab'.repeat(32),
      NOTE_SESSION:'initial-one', NOTE_SESSION_2:'initial-two'},
    outboundService(req) {
      const address = new URL(req.url);
      assert.equal(address.href, 'https://note.com/api/v2/current_user');
      assert.equal(req.method, 'GET');
      const cookie = req.headers.get('cookie')?.replace(/^_note_session_v5=/, '');
      calls.push(cookie);
      if (cookie === 'limited') return new Response(null, {status:429, headers:{'Retry-After':'10800'}});
      const id = identities.get(cookie);
      return id ? Response.json({data:{id,urlname:'fixture'+id}}) : new Response(null,{status:401});
    }
  }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  function form(action, fields = {}, slot = '1') {
    return mf.dispatchFetch(origin+'/control', {
      method:'POST', headers:{Origin:origin, 'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({key:'form-fixture',account:slot,action,...fields}).toString()
    });
  }
  const exported = async () => (await form('export')).json();
  const credentials = () => db.prepare('SELECT * FROM nh_v13_credentials WHERE slot=?').bind('1').first();
  const clearManualDelay = () => db.prepare('UPDATE nh_v13_connection SET next_check=0 WHERE slot=?').bind('1').run();
  for (const slot of ['1','2']) {
    const response = await form('start',{},slot);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /をONにしました/);
  }
  assert.deepEqual(calls, ['initial-one','initial-two']);
  await t.test('saving shared settings keeps both recorded schedules and validates all fields together', async () => {
    const times = [Date.now()+240000, Date.now()+600000];
    await db.batch(['nh_control','nh_control_2'].map((name,i) =>
      db.prepare('UPDATE '+name+' SET next_at=? WHERE id=1').bind(times[i])));
    const fields = {tags:'#小説、詩、小説',author_hours:'48',interval_seconds:'360',scan_tags:'2',scan_notes:'3',empty_minutes:'10'};
    assert.match(await (await form('settings', fields)).text(), /2タグと動作設定を両方に保存/);
    const data = await exported();
    assert.deepEqual(data.settings.tags, ['小説','詩']);
    assert.equal(data.settings.author_hours, 48);
    assert.deepEqual(data.accounts.map(s=>s.next_at), times);
    assert.equal((await form('settings',{...fields,scan_notes:'8'})).status, 400);
    assert.deepEqual((await exported()).settings, data.settings);
    await db.prepare('UPDATE nh_control_2 SET lease=? WHERE id=1').bind(Date.now()+60000).run();
    assert.match(await (await form('settings',{...fields,tags:'短編'})).text(), /処理中のため設定を変更しません/);
    assert.deepEqual((await exported()).settings, data.settings);
    await db.prepare('UPDATE nh_control_2 SET lease=0 WHERE id=1').run();
  });
  await t.test('a verified replacement is reused, a different identity cannot replace it', async () => {
    assert.match(await (await form('save',{cookie:'updated-one'})).text(), /本人確認OK/);
    const stored = await credentials();
    assert.ok(stored?.ciphertext && stored.iv);
    assert.ok(!JSON.stringify(stored).includes('updated-one'));
    await clearManualDelay();
    assert.match(await (await form('check')).text(), /接続確認OK/);
    assert.equal(calls.at(-1), 'updated-one');
    await clearManualDelay();
    assert.match(await (await form('save',{cookie:'initial-two'})).text(), /別のnote/);
    assert.deepEqual(await credentials(), stored);
  });
  await t.test('a three-hour external wait persists through stop, start and cookie-check actions', async () => {
    await clearManualDelay();
    const before = await credentials();
    const started = Date.now();
    assert.match(await (await form('save',{cookie:'limited'})).text(), /429/);
    const gate = () => db.prepare("SELECT hold_until FROM nh_v13_connection WHERE slot='1'").first('hold_until');
    const deadline = await gate();
    assert.ok(deadline >= started + 10800000);
    const count = calls.length;
    await form('stop');
    await form('start');
    await form('check');
    assert.equal(calls.length, count);
    assert.equal(await gate(), deadline);
    assert.deepEqual(await credentials(), before);
    const data = await exported();
    assert.deepEqual(data.accounts.map(a=>a.enabled), [0,1]);
    assert.ok(!JSON.stringify(data).includes(before.ciphertext));
  });
});
