// The same populated SQLite DO is opened by v47, the current worker and v47 again.
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {Miniflare, convertV4MiniflareOptions} = require('miniflare');
const root = path.join(__dirname, '..');

class ReactionMigration {
  constructor(ctx) {this.storage = ctx.storage;}
  async fetch(request) {
    const storage = this.storage, sql = storage.sql;
    const query = (s,...args) => sql.exec(s,...args).toArray();
    const row = {slot:'1',account:'34',owner:'writer'};
    const day = 86400000;
    let now = Date.parse('2026-11-23T03:00:00Z');
    Date.now = () => now;
    const note = {key:'ntarget',name:'旧作',status:'published',user:{urlname:'writer',id:34},
      publishAt:new Date(now-8*day).toISOString(),likeCount:2};
    const read = (desk,names,complete) => desk.reachCall16933('reachObserve',row,note,{
      readersVerified:true,sampleComplete:complete,sampleOwners:names});
    const count = () => query("SELECT COUNT(*) n FROM desk_reach_contact16933 WHERE credited='old'")[0].n;
    const metrics = (desk,run) => {
      let reads=0,writes=0,statements=0;
      desk.rows = (s,...args) => {
        const cursor=sql.exec(s,...args),result=cursor.toArray();
        statements++;reads+=cursor.rowsRead;writes+=cursor.rowsWritten;return result;
      };
      run();
      delete desk.rows;
      return {reads,writes,statements};
    };
    const old = new PreviousDesk(storage,{});
    old.initReach16933();
    query(`WITH RECURSIVE nums(x) AS(VALUES(1) UNION ALL SELECT x+1 FROM nums WHERE x<255)
      INSERT INTO desk_reach_work16933(slot,account,article,owner,title,pub,count_at)
      SELECT '1','34','n'||x,'writer','旧作',?,? FROM nums`,now-30*day,now-day);
    query(`WITH RECURSIVE nums(x) AS(VALUES(1) UNION ALL SELECT x+1 FROM nums WHERE x<5000)
      INSERT INTO desk_reach_contact16933(slot,account,key,owner,source,sent,status,confirmed)
      SELECT '1','34','nother'||x,'other'||x,'tag:創作',?,'confirmed',? FROM nums`,now-day,now-day);
    note.likeCount=0;read(old,[],true);note.likeCount=2;
    for(const key of ['na','nb']){
      now+=1000;old.reachCall16933('reachReserve',row,key,{user:{urlname:'reader'}},'tag:創作');
      now+=1000;old.reachCall16933('reachConfirm',row,key,true);
    }
    now+=1000;read(old,['reader'],false);
    const initial=count();
    const legacy=new PreviousDesk(storage,{});
    const legacyCold=metrics(legacy,()=>legacy.initReach16933());
    if(new URL(request.url).pathname==='/legacy'){
      now+=1000;
      const oldPartial=metrics(legacy,()=>read(legacy,['reader'],false));
      return Response.json({oldPartial,afterPartial:count()});
    }
    const next=new Desk520(storage,{});
    const beforeObservation=metrics(next,()=>next.initReach16933());
    now+=1000;const oldPartial=metrics(next,()=>read(next,['reader'],false));
    const afterPartial=count();
    const cold=new Desk520(storage,{});
    const coldAfter=metrics(cold,()=>cold.initReach16933());
    const warmAfter=metrics(cold,()=>cold.initReach16933());
    now+=1000;read(next,['reader','other_seen'],true);
    now+=1000;next.reachCall16933('reachReserve',row,'nnew',{user:{urlname:'new_reader'}},'tag:創作');
    now+=1000;next.reachCall16933('reachConfirm',row,'nnew',true);
    note.likeCount=3;now+=1000;
    const newPartial=metrics(next,()=>read(next,['new_reader'],false));
    now+=1000;const repeatedPartial=metrics(next,()=>read(next,['new_reader'],false));
    const rowCount=query('SELECT COUNT(*) n FROM desk_reach_work16933')[0].n;
    const plan=query("EXPLAIN QUERY PLAN SELECT key FROM desk_reach_contact16933 WHERE slot=? AND account=? AND owner=? AND status='confirmed' AND credited='' AND sent>=? AND confirmed>=sent AND confirmed<=? ORDER BY confirmed DESC,key LIMIT 1",
      '1','34','reader',now-day,now).map(r=>r.detail);
    const rollback=new PreviousDesk(storage,{});
    now+=1000;read(rollback,['reader','other_seen','new_reader'],true);
    const afterRollback=count();
    note.likeCount=4;
    now+=1000;read(rollback,['observed_before_contact'],false);
    now+=1000;next.reachCall16933('reachReserve',row,'nafterrollback',{user:{urlname:'observed_before_contact'}},'tag:創作');
    now+=1000;next.reachCall16933('reachConfirm',row,'nafterrollback',true);
    const rollbackQuality=query("SELECT quality FROM desk_reach_work16933 WHERE article='ntarget'")[0].quality;
    now+=1000;read(next,['observed_before_contact'],false);
    return Response.json({initial,afterPartial,afterRollback,afterReupgrade:count(),rowCount,plan,
      legacyCold,beforeObservation,coldAfter,warmAfter,oldPartial,newPartial,repeatedPartial,
      rollbackQuality});
  }
}

test('existing partial credits survive a cold migration and published v47 can reopen it',async()=>{
  const legacy=execFileSync('git',['show','701da77:worker.js'],{cwd:root,encoding:'utf8',maxBuffer:4000000});
  const current=readFileSync(path.join(root,'worker.js'),'utf8');
  const options={modules:[{type:'ESModule',path:'test.mjs',contents:current+"\nimport {PreviousDesk} from './v47.mjs';\nexport "+ReactionMigration.toString()},
    {type:'ESModule',path:'v47.mjs',contents:legacy+'\nexport {Desk520 as PreviousDesk};'}],
    durableObjects:{TEST:{className:'ReactionMigration',useSQLite:true}},compatibilityDate:'2026-10-10'};
  const mf=new Miniflare(convertV4MiniflareOptions?convertV4MiniflareOptions(options):options);
  try {
    const ns=await mf.getDurableObjectNamespace('TEST');
    const previous=await (await ns.get(ns.idFromName('legacy')).fetch('https://fixture.invalid/legacy')).json();
    const response=await ns.get(ns.idFromName('upgrade')).fetch('https://fixture.invalid/upgrade');
    assert.equal(response.status,200);
    const r=await response.json();
    assert.deepEqual([r.initial,r.afterPartial,r.afterRollback,r.afterReupgrade,r.rowCount,r.rollbackQuality],[1,1,2,2,256,'partial']);
    assert.equal(r.warmAfter.statements,0);
    assert.equal(r.coldAfter.reads,r.legacyCold.reads);
    assert.equal(previous.afterPartial,2);
    assert.ok(r.plan.some(detail=>detail.includes('desk_reach_contact_owner16933')));
    console.log('Reaction storage migration and observations',JSON.stringify({previous,...r}));
  } finally {await mf.dispose();}
});
