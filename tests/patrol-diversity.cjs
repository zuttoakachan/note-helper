// Run with the project's Wrangler/Miniflare installation on NODE_PATH.
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {Miniflare,convertV4MiniflareOptions} = require('miniflare');

const root = path.join(__dirname,'..');
const before = execFileSync('git',['show','470706f:worker.js'],{cwd:root,encoding:'utf8',maxBuffer:4_000_000});
const after = readFileSync(path.join(root,'worker.js'),'utf8');

// Run the actual scheduled patrol with a local D1 and a SQLite-backed Durable Object.
// Setup and verification statements bypass the counters. All note traffic uses fixtures.
class PatrolBench {
  constructor(ctx,env) { this.ctx=ctx; this.env=env; }
  async fetch(request) {
    const input = await request.json();
    const now = input.now||Date.UTC(2026,10,23,3);
    Date.now = () => now;
    const raw = this.env['DB_'+input.scenario];
    await prepare({DB:raw});
    const set = (query,...args) => raw.prepare(query).bind(...args).run();
    if(!input.resume) {
      await set("UPDATE nh_control SET enabled=?,account='42' WHERE id=1",+!input.stopped);
      await set("UPDATE nh_control_2 SET account='43' WHERE id=1");
      await set('UPDATE nh_v1697_discovery SET due=?',now+D520);
      await set('UPDATE nh_v14_settings SET tags=?',JSON.stringify(input.tags));
      await set('UPDATE nh_v15_settings SET scan_tags=1,scan_notes=?',input.budget);
      if(input.hold)await set("UPDATE nh_v13_connection SET hold_until=? WHERE slot='1'",now+HOUR);
      for(const key of input.seen||[])await set("INSERT INTO nh_seen VALUES(?,'liked',?)",key,now);
      for(const author of input.recent||[])await set("INSERT INTO nh_v15_authors VALUES(?,?,?,'previous')",author,now,'1');
    }
    const d1 = {queries:0,reads:0,writes:0}, durable = {queries:0,reads:0,writes:0};
    function record(result) {
      d1.queries++;
      d1.reads+=result.meta.rows_read;
      d1.writes+=result.meta.rows_written;
      return result;
    }
    function wrap(statement) {
      return {statement,bind:(...args)=>wrap(statement.bind(...args)),
        all:async()=>record(await statement.all()),run:async()=>record(await statement.run()),
        first:async()=>record(await statement.all()).results[0]??null};
    }
    const DB = {prepare:q=>wrap(raw.prepare(q)),batch:async items=>(await raw.batch(items.map(s=>s.statement))).map(record)};
    const storage = {transactionSync:fn=>this.ctx.storage.transactionSync(fn),
      sql:{exec:(...args)=>{
        const cursor=this.ctx.storage.sql.exec(...args);
        return {toArray:()=>{
          const rows=cursor.toArray();
          durable.queries++; durable.reads+=cursor.rowsRead; durable.writes+=cursor.rowsWritten;
          return rows;
        }};
      }}};
    let browsers=0;
    const env = {DB,NOTE_SESSION:'fixture',BROWSER:{acquire(){browsers++;throw Error('Unexpected browser session');}}};
    const desk = new Desk520(storage,env);
    desk.init();
    // Persist a prior receipt, then construct a fresh coordinator as on a cold start.
    patrolCoordinator16931(storage).read();
    if(input.history && !input.resume)this.ctx.storage.sql.exec(
      'INSERT INTO desk_patrol16931(slot,seq,last_run) VALUES(?,1,?)',input.historySlot||'1',
      JSON.stringify({slot:input.historySlot||'1',outcome:'success',recentTags:input.history}));
    const coordinator=patrolCoordinator16931(storage);
    env[PATROL_LOCAL16931]=coordinator;
    env.NETWORK16922=desk.networkBridge16922();
    if(input.unfinished && !input.resume){
      await acquire(scoped(env,'1'),true);
      coordinator.begin({slot:'1',started:now,outcome:'running'});
      // No finish or release. The next invocation reloads workerd and waits for the live deadline.
      const state=await raw.prepare('SELECT lease,next_at FROM nh_control WHERE id=1').first();
      return Response.json({unfinished:true,boot:fixtureBoot,state,unexpected:[]});
    }
    const http = {identity:0,lists:0,profiles:0,details:0,confirmation:0,posts:0};
    const details=[],posts=[],unexpected=[];
    const byKey=new Map(input.cards.map(c=>[c.key,c]));
    fixtureFetch=async(url,init)=>{
      const {origin,pathname}=new URL(url);
      if(origin==='https://note.com' && init.method==='GET'){
        if(pathname==='/api/v2/current_user'){http.identity++;return Response.json({data:{id:'42',urlname:'self'}});}
        if(pathname.startsWith('/api/v3/hashtags/')){http.lists++;return Response.json({data:{notes:input.cards}});}
        if(/^\/api\/v2\/creators\/.+\/contents$/.test(pathname)){http.profiles++;return Response.json({data:{contents:[]}});}
      }
      const key=/^\/api\/v3\/notes\/(n[a-z0-9]+)(\/likes)?$/.exec(pathname);
      if(origin==='https://note.com' && key && byKey.has(key[1])){
        if(init.method==='POST' && key[2]){http.posts++;posts.push(key[1]);return new Response(null,{status:200});}
        if(init.method==='GET' && !key[2]){
          const liked=posts.includes(key[1]);
          if(liked)http.confirmation++;else {http.details++;details.push(key[1]);}
          if(input.conflict===key[1])await set("INSERT OR IGNORE INTO nh_shared VALUES(?,'2','other',?)",key[1],now);
          if(input.limited===key[1])return new Response(null,{status:429,headers:{'Retry-After':'10800'}});
          return Response.json({data:{...byKey.get(key[1]),...input.overrides?.[key[1]],...(liked?{is_liked:true}:{})}});
        }
      }
      unexpected.push([init.method,pathname]);
      return new Response(null,{status:500});
    };
    Object.assign(durable,{queries:0,reads:0,writes:0});
    const ran=await run(env,'1');
    const state=await raw.prepare('SELECT enabled,next_at,total,inflight FROM nh_control WHERE id=1').first();
    const row=this.ctx.storage.sql.exec("SELECT last_run FROM desk_patrol16931 WHERE slot='1'").toArray()[0];
    const preferOriginal=!!(row&&JSON.parse(row.last_run).preferOriginalOrder);
    const saved=this.ctx.storage.sql.exec('SELECT slot,last_run FROM desk_patrol16931 ORDER BY slot').toArray()
      .map(row=>[row.slot,JSON.parse(row.last_run).recentTags||[]]);
    return Response.json({ran,http,details,posts,browsers,d1,durable,state,saved,preferOriginal,boot:fixtureBoot,unexpected});
  }
}

async function measure(source,scenarios) {
  const routing="\nexport default {fetch(req,env){return env.BENCH.get(env.BENCH.idFromName(new URL(req.url).pathname)).fetch(req);}}";
  const script='let fixtureFetch; const fetch=(url,init)=>fixtureFetch(url,init);\n'+
    source.replace('export default {','const noteApp = {')+'\nexport '+PatrolBench.toString()+routing;
  const options=boot=>convertV4MiniflareOptions({modules:true,name:'patrol-fixture',script:script+'\nconst fixtureBoot='+boot+';',
    d1Databases:Object.keys(scenarios).map(id=>'DB_'+id),durableObjects:{BENCH:{className:'PatrolBench',useSQLite:true}},compatibilityDate:'2026-10-10'});
  const mf=new Miniflare(options(1));
  try {
    const results={};
    async function invoke(scenario,input) {
      const response=await mf.dispatchFetch('https://bench.invalid/'+scenario,{method:'POST',body:JSON.stringify({...input,scenario})});
      if(!response.ok)throw Error((await response.text()).slice(0,1500));
      const result=await response.json();
      assert.deepEqual(result.unexpected,[],scenario);
      return result;
    }
    for(const [scenario,input] of Object.entries(scenarios)) results[scenario]=await invoke(scenario,input);
    await mf.setOptions(options(2)); // Reload workerd with persisted D1 and Durable Object storage.
    for(const [scenario,input] of Object.entries(scenarios)){
      if(!input.checkRestart)continue;
      const result=results[scenario];
      result.afterRestart=await invoke(scenario,{...input,resume:true,now:result.state.next_at});
      assert.equal(result.boot,1);
      assert.equal(result.afterRestart.boot,2);
    }
    return results;
  } finally {await mf.dispose();}
}

const card=(key,id,hashtags)=>({key,status:'published',name:key,user:{id:String(id),urlname:'writer'+id},hashtags,is_liked:false});
const first=card('nfirst',10,['創作','詩']);
const second=card('nsecond',11,['創作','随筆']);
const base={tags:['創作','詩','随筆'],budget:3,cards:[first,second],history:['詩']};
const scenarios={
  diversity:base,
  noHistory:{...base,history:null},
  otherSlot:{...base,historySlot:'2'},
  single:{...base,cards:[first]},
  unknownTags:{...base,cards:[{...first,hashtags:undefined},second]},
  ineligible:{...base,seen:['nseen'],recent:['14'],cards:[
    first,card('nseen',13,['創作','随筆']),card('nrecent',14,['創作','随筆']),
    {...second,is_liked:true},card('nself',42,['創作','随筆'])
  ]},
  unverified:{...base,overrides:{nsecond:{status:'draft'}}},
  wrongAuthor:{...base,overrides:{nsecond:{user:{id:'75',urlname:'someoneelse'}}}},
  missingTag:{...base,history:['詩','創作'],overrides:{nsecond:{hashtags:['創作']}},checkRestart:true},
  conflict:{...base,conflict:'nsecond'},
  rateLimited:{...base,history:['詩','創作'],limited:'nsecond',checkRestart:true},
  bounded:{...base,history:['創作','詩','詩','詩','詩','詩','詩','詩'],checkRestart:true},
  unfinished:{...base,unfinished:true,checkRestart:true},
  stopped:{...base,stopped:true},
  hold:{...base,hold:true}
};

test('ordinary patrol diversifies equally eligible cards within the existing HTTP and database budget',async t=>{
  const old=await measure(before,scenarios), current=await measure(after,scenarios);
  for(const [name,input] of Object.entries(scenarios)){
    await t.test(name,()=>{
      const a=old[name],b=current[name];
      if(input.unfinished){
        for(const result of [a,b]){
          assert.equal(result.unfinished,true);
          assert.ok(result.state.next_at>result.state.lease);
          assert.deepEqual(result.afterRestart.details,['nfirst']);
          assert.deepEqual(result.afterRestart.posts,['nfirst']);
        }
        assert.equal(b.afterRestart.preferOriginal,false);
        assert.deepEqual(b.afterRestart.saved,[['1',['詩','詩']]]);
        return;
      }
      for(const result of [a,b]){
        assert.equal(result.browsers,0);
        assert.equal(result.state.inflight,'');
        assert.equal(result.http.posts,result.posts.length);
        assert.equal(result.http.confirmation,result.posts.length);
        assert.equal(result.state.total,result.posts.length);
        if(input.hold||input.stopped){
          assert.equal(result.ran,false);
          assert.ok(Object.values(result.http).every(n=>n===0));
          assert.equal(result.state.enabled,+!input.stopped);
          continue;
        }
        assert.equal(result.ran,true);
        assert.equal(result.http.identity,1);
        assert.equal(result.http.lists,1);
        assert.equal(result.http.profiles,0);
        assert.equal(result.http.details,1);
        const rateWait=name==='rateLimited' && result===b;
        assert.equal(result.state.next_at,rateWait?Date.UTC(2026,10,23,6):Date.UTC(2026,10,23,3,4));
      }
      if(input.hold||input.stopped)return;
      assert.deepEqual(a.posts,['nfirst']);
      if(input.overrides || input.conflict || input.limited){
        assert.deepEqual(b.details,['nsecond']);
        assert.deepEqual(b.posts,[]);
        assert.deepEqual(b.saved,[['1',input.history]]);
        assert.equal(b.preferOriginal,true);
      }else{
        assert.deepEqual(b.posts,[name==='diversity'||name==='bounded'?'nsecond':'nfirst']);
        assert.deepEqual(a.http,b.http);
        assert.deepEqual(a.d1,b.d1);
        assert.deepEqual(a.durable,b.durable);
        if(name==='diversity')assert.deepEqual(b.saved,[['1',['詩','随筆']]]);
        if(name==='otherSlot')assert.deepEqual(b.saved.find(([slot])=>slot==='2'),['2',['詩']]);
      }
      if(input.checkRestart){
        const next=b.afterRestart;
        assert.equal(next.ran,true);
        assert.equal(next.state.inflight,'');
        assert.deepEqual(next.posts,['nfirst']);
        assert.deepEqual(next.details,['nfirst']);
        assert.equal(next.preferOriginal,false);
        if(name==='bounded'){
          const previous=[...input.history.slice(1),'随筆'];
          assert.deepEqual(b.saved,[['1',previous]]);
          assert.deepEqual(next.saved,[['1',[...previous.slice(1),'創作']]]);
        }else{
          assert.deepEqual(next.saved,[['1',[...input.history,'創作']]]);
        }
      }
    });
  }
  const {d1,durable,http,browsers,posts}=current.diversity;
  t.diagnostic(JSON.stringify({before:{d1:old.diversity.d1,durable:old.diversity.durable,http:old.diversity.http,
    browsers:old.diversity.browsers,posts:old.diversity.posts},after:{d1,durable,http,browsers,posts}}));
});
