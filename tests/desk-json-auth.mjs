import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../worker.js';

const origin = 'https://fixture.invalid';
const key = 'fixture-only';
const direct = 'X-Note-Helper-Admin-Key';

function fixture(locked = false, browser) {
  const guarded = [];
  let reads = 0;
  const env = {
    ADMIN_KEY: key,
    BROWSER: browser,
    SCHEDULER: {
      idFromName: name => name,
      get: () => ({
        async fetch(req) {
          if (new URL(req.url).pathname === '/security/admin-key') {
            const body = await req.json();
            assert.match(body.client, /^[a-f0-9]{64}$/);
            assert.deepEqual(Object.keys(body).sort(), ['client', 'valid']);
            guarded.push(body.valid);
            return Response.json({allowed: body.valid && !locked, retry: locked ? 30 : 0});
          }
          assert.equal(new URL(req.url).pathname, '/desk/admin');
          assert.deepEqual(await req.json(), {action: 'plans'});
          assert.equal(req.headers.has(direct), false);
          assert.equal(req.headers.has('Authorization'), false);
          reads++;
          return Response.json({publicationLinks: []});
        }
      })
    }
  };
  const request = (headers, site = origin, action = 'plans') => worker.fetch(new Request(site + '/520', {
    method: 'POST',
    headers: {Origin: site, 'Content-Type': 'application/json', ...headers},
    body: JSON.stringify({action})
  }), env);
  return {request, guarded, reads: () => reads};
}

test('both desk JSON credentials authenticate before accessing the saved plans', async () => {
  const {request, guarded, reads} = fixture();
  for (const headers of [{[direct]: key}, {Authorization: 'Bearer ' + btoa(key)}]) {
    const response = await request(headers);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).publicationLinks.length, 0);
  }
  assert.deepEqual(guarded, [true, true]);
  assert.equal(reads(), 2);
});

test('capacity reads only aggregate limits with admin credentials and never opens a browser', async () => {
  let calls = 0;
  const browser = {
    limits() {
      calls++;
      return {activeSessions:[{id:'private-session'}], maxConcurrentSessions:3,
        allowedBrowserAcquisitions:0, usedBrowserTimeSeconds:600.5, extra:'private'};
    },
    acquire() { assert.fail('unexpected acquisition'); }
  };
  const {request, reads} = fixture(false,browser);
  assert.equal((await request({},origin,'browser_capacity')).status,403);
  assert.equal(calls,0);
  const result = await request({[direct]:key},origin,'browser_capacity');
  assert.equal(result.status,200);
  assert.deepEqual((await result.json()).capacity,{
    activeSessions:1, maxConcurrentSessions:3, allowedBrowserAcquisitions:0, usedBrowserTimeSeconds:600.5
  });
  assert.equal(calls,1);
  const partial = fixture(false,{limits:() => ({allowedBrowserAcquisitions:1})});
  assert.equal((await (await partial.request({[direct]:key},origin,'browser_capacity')).json()).capacity.usedBrowserTimeSeconds,null);
  const missing = fixture();
  assert.equal((await missing.request({[direct]:key},origin,'browser_capacity')).status,503);
  assert.equal(reads(),0);
});

test('an invalid, ambiguous or insecure direct key cannot authorize a desk read', async () => {
  const {request, guarded, reads} = fixture();
  assert.equal((await request({Origin: 'https://other.invalid', [direct]: key})).status, 403);
  assert.deepEqual(guarded, []);
  assert.equal((await request({})).status, 403);
  assert.equal((await request({[direct]: 'wrong'})).status, 403);
  assert.equal((await request({[direct]: key, Authorization: 'Bearer invalid'})).status, 403);
  assert.equal((await request({[direct]: key}, 'http://fixture.invalid')).status, 403);
  assert.deepEqual(guarded, [false, false, false, false]);
  assert.equal(reads(), 0);
});

test('the direct credential observes the same guard lockout', async () => {
  const {request, guarded, reads} = fixture(true);
  const response = await request({[direct]: key});
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '30');
  assert.ok(!(await response.text()).includes(key));
  assert.deepEqual(guarded, [true]);
  assert.equal(reads(), 0);
});
