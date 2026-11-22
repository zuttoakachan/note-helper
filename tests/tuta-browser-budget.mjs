import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../worker.js', import.meta.url), 'utf8');
// Use the actual browser orchestration. Only its clock for polling is virtual.
const worker = await import('data:text/javascript;base64,' + Buffer.from(source.replace(
  'const pause520 = ms => new Promise(resolve=>setTimeout(resolve,ms));',
  'let waited=0; const pause520=async ms=>{waited+=ms;}; export function elapsed(){const n=waited;waited=0;return n;}'
) + '\nexport {readTuta520};').toString('base64'));
const wrong = {state:'identity',reason:'account_mismatch'};
const unknown = {state:'identity',reason:'account_unconfirmed'};
const ready = {state:'ready',items:[],complete:true};

async function run(listScreens) {
  const steps = [];
  let sessionCloses = 0, socketCloses = 0, reads = 0;
  const socket = new EventTarget();
  socket.accept = () => {};
  socket.close = () => { socketCloses++; };
  socket.send = text => {
    const {id, method, params} = JSON.parse(text);
    let result = {};
    if (method === 'Runtime.evaluate') {
      const expr = params.expression;
      const [step] = JSON.parse('[' + expr.slice(expr.lastIndexOf(')(')+2,-1) + ']');
      steps.push(step);
      let value;
      if (step==='list') value=listScreens[Math.min(reads++,listScreens.length-1)];
      else value={state:{login:'filled',loginReady:'ready',loginSubmit:'sent'}[step]};
      result={result:{value}};
    }
    queueMicrotask(() => socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({id,result})})));
  };
  const binding = {
    acquire:async()=>({sessionId:'fixture'}),
    devtools:{newTarget:async()=>({id:'target'})},
    connectSession:async()=>({webSocket:{fetch:async()=>({webSocket:socket})}}),
    closeSession:async()=>{sessionCloses++;}
  };
  const result = await worker.readTuta520(binding,{email:'fixture@example.invalid',password:'fake'}, {
    active:()=>true,
    seen:()=>assert.fail('unexpected mail read'),skip:()=>assert.fail('unexpected skip'),save:()=>assert.fail('unexpected save')
  });
  assert.equal(sessionCloses,1);
  assert.equal(socketCloses,1);
  return {result,steps,waited:worker.elapsed()};
}

test('an identified different Tuta mailbox closes before credentials or mail are touched', async () => {
  const {result,steps,waited} = await run([wrong]);
  assert.equal(result.kind,'screen');
  assert.equal(result.screen,'account_mismatch');
  assert.deepEqual(steps,['list']);
  assert.equal(waited,0);
});

test('a positive post-login mismatch releases the browser without more polls', async () => {
  const {result,steps,waited} = await run([{state:'login'},wrong]);
  assert.equal(result.kind,'screen');
  assert.equal(result.stage,'mailbox');
  assert.equal(result.screen,'account_mismatch');
  assert.deepEqual(steps,['list','login','loginReady','loginSubmit','list']);
  assert.equal(waited,500);
});

test('an unresolved controller or list keeps its loading window and may reach the intended inbox', async () => {
  const {result,steps,waited} = await run([{state:'page'},{state:'login'},unknown,{state:'loading'},ready]);
  assert.equal(result.kind,'ok');
  assert.equal(result.complete,true);
  assert.equal(steps.filter(s=>s==='loginSubmit').length,1);
  assert.equal(waited,2000);
});
