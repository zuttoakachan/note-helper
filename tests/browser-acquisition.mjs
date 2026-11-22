import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../worker.js',import.meta.url),'utf8');
const mod=await import('data:text/javascript;base64,'+
  Buffer.from(source+'\nexport {acquireBrowserWithRetryInfo};').toString('base64'));
const options={keepAlive:15000,recording:false,guardrails:{allowedDomains:['note.com','*.note.com']}};

test('one binding request preserves acquisition options and returns the same session ID',async()=>{
  let calls=0;
  const raw={acquire:assert.fail,fetch:async(url,init)=>{
    calls++;
    const request=new Request(url,init);
    assert.equal(request.method,'POST');
    assert.equal(request.url,'https://fake.host/v1/devtools/browser?keep_alive=15000&recording=false');
    assert.equal(request.redirect,'manual');
    assert.deepEqual(await request.json(),{guardrails:options.guardrails});
    return Response.json({sessionId:'example'});
  }};
  assert.deepEqual(await mod.acquireBrowserWithRetryInfo(raw,options),{sessionId:'example'});
  assert.equal(calls,1);
});

test('429 keeps the actual retry header and distinguishes explicit daily exhaustion from generic limits',async()=>{
  for(const [body,retryAfter,daily] of [
    ['{"message":"Browser time limit exceeded for today","detail":"private-example"}','150',true],
    ['Daily browser time limit has been reached','120',true],
    ['Daily browser time limit has not been reached','120',false],
    ['{"error":"Concurrent browser limit reached","info":"Daily browser time limit exceeded"}','20',false],
    ['concurrent browser limit exceeded: private-example','Fri, 25 Dec 2026 02:00:00 GMT',false],
    ['private-example'.repeat(1000),'90',false]
  ]){
    let calls=0;
    const raw={acquire:assert.fail,fetch:async()=>{
      calls++;return new Response(body,{status:429,headers:{'Retry-After':retryAfter}});
    }};
    await assert.rejects(mod.acquireBrowserWithRetryInfo(raw,options),e=>
      e.status===429 && e.retryAfter===retryAfter && (e.message.includes('for today')===daily) &&
      !e.message.includes('private-example'));
    assert.equal(calls,1);
  }
});

test('unsupported options use the typed binding once, before sending any HTTP request',async()=>{
  for(const opt of [undefined,{...options,targets:true},{...options,guardrails:{allowedDomains:[],rules:[]}}]){
    let calls=0;
    const raw={fetch:assert.fail,acquire:async received=>{assert.equal(received,opt);calls++;return {sessionId:'typed'};}};
    assert.equal((await mod.acquireBrowserWithRetryInfo(raw,opt)).sessionId,'typed');
    assert.equal(calls,1);
  }
  const raw={acquire:async received=>{assert.equal(received,options);return {sessionId:'typed'};}};
  assert.equal((await mod.acquireBrowserWithRetryInfo(raw,options)).sessionId,'typed');
});

test('transport or ambiguous success never causes a second acquisition',async()=>{
  for(const fetch of [async()=>{throw Error('connection lost')},async()=>new Response('invalid'),async()=>new Response('down',{status:503})]){
    let calls=0;
    await assert.rejects(mod.acquireBrowserWithRetryInfo({acquire:assert.fail,fetch:(...args)=>{calls++;return fetch(...args);}},options));
    assert.equal(calls,1);
  }
});
