// Run with Wrangler's Miniflare on NODE_PATH; no account or remote services.
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {Miniflare,convertV4MiniflareOptions} = require('miniflare');
const root=path.join(__dirname,'..');
const oldSource=execFileSync('git',['show','82349df:worker.js'],{cwd:root,encoding:'utf8',maxBuffer:4000000});
const newSource=readFileSync(path.join(root,'worker.js'),'utf8');

class MagazineBench {
  constructor(ctx,env){this.ctx=ctx;this.env=env;}
  async fetch(){
    const desk=new Desk520(this.ctx.storage,this.env),now=Date.UTC(2026,10,23,2);
    Date.now=()=>now;
    const query=(q,...args)=>this.ctx.storage.sql.exec(q,...args).toArray();
    desk.init();
    const policy={min:0,max:200,genres:genre520,methods:method520};
    const url=id=>'https://note.com/editor/m/'+id;
    function add(id){
      query("INSERT INTO desk_import(id,url,name,allowed,managed,state) VALUES(?,?,?,1,1,'利用中')",id,url(id),id);
      query("INSERT INTO desk_member(id,mode,checked) VALUES(?,'auto',?)",id,now);
      query("INSERT INTO desk_mag(url,name,rules,policy,active,recent) VALUES(?,?,'',?,1,?)",url(id),id,JSON.stringify(policy),now);
    }
    add('ma');add('mb');
    query("UPDATE desk_cfg SET enabled=1 WHERE id=1");
    query("INSERT INTO desk_archive(article,title,pub,verified,genre,chars,choice) VALUES('nwork','題',?,?,'小説',40,?)",now-60000,now,url('ma'));
    for(const key of ['n1','n2'])query("INSERT INTO desk_archive(article,title,pub,verified) VALUES(?,'既刊',?,?)",key,now-300*D520,now);
    const own='https://note.com/43__/n/',other='https://note.com/author/n/';
    function observe(id,links,header=url(id),feed=url(id)+'/rss'){
      const xml='<rss><channel><link>'+header+'</link>'+links.map(link=>'<item><title>作品</title><link>'+link+'</link><pubDate>2020-01-01</pubDate></item>').join('')+'</channel></rss>';
      desk.rssObserve16926(feed,rss520(xml,'issue'),null);
    }
    observe('ma',[own+'n1',own+'n2',other+'n3']);
    observe('mb',[other+'n4',own+'n5']);
    // The real feed cache is limited to 128. Use its full size alongside a
    // much larger mutation ledger to detect accidental whole-table reads.
    this.ctx.storage.transactionSync(()=>{
      for(let n=0;n<126;n++)query("INSERT INTO desk_rss_feed16926 VALUES(?,?,?,'[]','','','',0,0,?)",url('mold'+n)+'/rss','mold'+n,now-D520/2,now-D520/2);
      for(let n=0;n<1000;n++)query("INSERT INTO desk_job(kind,subject,target,label,phase,next,at,message,article) VALUES('mag',?,'mold','','wait',0,?,'',?)",'nold'+n,now,'nold'+n);
    });
    let counts=null,issueQueries=0;
    desk.rows=(sql,...args)=>{
      const c=this.ctx.storage.sql.exec(sql,...args),result=c.toArray();
      if(counts){
        counts.sql++;counts.read+=c.rowsRead;counts.written+=c.rowsWritten;
        if(sql.startsWith('WITH candidates(id)'))issueQueries++;
      }
      return result;
    };
    const requests=[];
    desk.publicRead=async()=>{requests.push('note');throw Error('unexpected note request');};
    const payload=(id,issue)=>query('UPDATE desk_rss_feed16926 SET payload=? WHERE id=?',JSON.stringify(issue),id);
    const issue=(id,links)=>({header:{link:url(id)},entries:links.map(link=>({link}))});
    const delayed=()=>query("INSERT INTO desk_rss_delay16926 VALUES('nwork','ma',?,?,'')",now-60000,now+60000);
    const excluded=id=>query("UPDATE desk_member SET mode='excluded' WHERE id=?",id);
    const job=(phase='wait')=>query("INSERT INTO desk_job(kind,subject,target,label,phase,next,at,message,article) VALUES('mag','nwork@ma','ma','',?,0,?,'','nwork')",phase,now);
    const setups={
      normal:()=>{},one:()=>excluded('mb'),none:()=>{excluded('ma');excluded('mb');},
      oneHistory:()=>{excluded('mb');query("INSERT INTO desk_mag_send VALUES('nwork','mprev',?,'2026-10-31')",now-20*D520);},
      noFeed:()=>query("UPDATE desk_rss_feed16926 SET payload='' WHERE id='mb'"),
      corrupt:()=>query("UPDATE desk_rss_feed16926 SET payload='{' WHERE id='ma'"),
      unknownHead:()=>observe('ma',['',own+'n1',own+'n2']),
      foreign:()=>observe('mb',['https://elsewhere.invalid/author/n/n4',own+'n5']),
      short:()=>observe('mb',[other+'n4']),
      duplicate:()=>observe('ma',[own+'n2',own+'n2',own+'n1']),
      creator:()=>observe('ma',['https://note.com/43___/n/n1',own+'n2']),
      channel:()=>payload('ma',issue('mb',[own+'n1',own+'n2'])),
      expired:()=>query("UPDATE desk_rss_feed16926 SET full_at=?,checked=? WHERE id='ma'",now-2*D520,now-D520-1),
      futureCheck:()=>query("UPDATE desk_rss_feed16926 SET checked=? WHERE id='mb'",now+1),
      staleOther:()=>query("UPDATE desk_rss_feed16926 SET checked=? WHERE id='mb'",now-D520-1),
      confirmed304:()=>{
        const f=query("SELECT * FROM desk_rss_feed16926 WHERE id='ma'")[0];
        f.checked=now-D520/2;f.full_at=now-D520/2;
        desk.rssObserve16926(f.url,JSON.parse(f.payload),f,{etag:'fixture'},true);
      },
      newerAlias:()=>{query("UPDATE desk_rss_feed16926 SET checked=checked-10,full_at=full_at-10 WHERE id='ma'");
        observe('ma',[other+'n6',own+'n2'],'https://note.com/m/ma','https://note.com/m/ma/rss');},
      conflictingAlias:()=>observe('ma',[other+'n6',own+'n2'],'https://note.com/m/ma','https://note.com/m/ma/rss'),
      aliasOnly:()=>{query("DELETE FROM desk_rss_feed16926 WHERE id='ma'");observe('ma',[own+'n1',own+'n2'],'https://note.com/m/ma','https://note.com/m/ma/rss');},
      otherCrowded:()=>observe('mb',[own+'n4',own+'n5']),
      otherOwnFirst:()=>observe('mb',[own+'n4',other+'n5']),
      alternateUsesOwnKey:()=>observe('mb',[other+'n1',own+'n5']),
      unverifiedOwn:()=>query("UPDATE desk_archive SET verified=0 WHERE article='n1'"),
      unknownOwn:()=>query("DELETE FROM desk_archive WHERE article='n2'"),
      unequalPolicy:()=>query("UPDATE desk_mag SET policy=? WHERE url=?",JSON.stringify({...policy,max:300}),url('mb')),
      unequalRank:()=>query("INSERT INTO desk_mag_send VALUES('nother','mb',?,'2026-11-23')",now-2*D520),
      explicit:()=>{query("INSERT INTO desk_rss_match16926 VALUES('ma','nwork','',0.9,'h',?,1,'')",now);
        query("INSERT INTO desk_rss_brief16926(source,kind,url,title,hash,topic,previous,policy,checked,due,message) VALUES('ma','mag','','','h','',1,'{}',?,0,'')",now);},
      retry:()=>job(),unconfirmed:()=>{job('sent');query("UPDATE desk_job SET target='mold' WHERE subject='nwork@ma'");},delay:delayed,
      thirdKnown:()=>{add('mc');query("UPDATE desk_rss_feed16926 SET payload='' WHERE id='mb'");observe('mc',[other+'n9',own+'na']);},
      pacing:()=>query('UPDATE desk_distribution16918 SET mag_next=? WHERE id=1',now+60000)
    };
    const results={},rollback=new Error('rollback benchmark');
    for(const [name,setup] of Object.entries(setups)){
      try{this.ctx.storage.transactionSync(()=>{
        setup();const work=query("SELECT * FROM desk_archive WHERE article='nwork'")[0];
        const magazines=desk.eligibleMags(now),valid=desk.placementCandidates16918(work,magazines,now);
        counts={sql:0,read:0,written:0};
        const pick=desk.chooseMagazine520(valid,work.genre,now,work);
        const ranking=counts;counts={sql:0,read:0,written:0};
        const p=desk.eligiblePlacement('nwork',now);
        const placement=counts;counts=null;
        const original=desk.eligiblePlacement('nwork',now,'ma');
        const verified=p?desk.canDeliver(p,now):false;
        if(p)excluded(p.target);
        results[name]={pick:pick?.name||null,target:p?.target||null,original:original?.target||null,
          verified,revoked:p?desk.canDeliver(p,now):false,ranking,placement};
        throw rollback;
      });}catch(e){if(e!==rollback)throw e;}
    }
    const shared=desk.batchMagazines(now),work=query("SELECT * FROM desk_archive WHERE article='nwork'")[0];
    counts={sql:0,read:0,written:0};issueQueries=0;
    const picks=[];
    for(let i=0;i<8;i++){
      const current={...work,article:'nbatch'+i},choices=desk.placementCandidates16918(current,shared,now);
      picks.push(desk.chooseMagazine520(choices,current.genre,now,current)?.name);
    }
    const batch={counts,issueQueries,picks};counts=null;
    // Reusing an object across a successful RSS refresh must not use the old head.
    observe('ma',[other+'n6',own+'n2']);
    const refreshed=desk.chooseMagazine520(desk.placementCandidates16918(work,shared,now),work.genre,now,work)?.name;
    return Response.json({results,requests,batch,refreshed});
  }
}
async function measure(source){
  const script=source.replace('export default {','const originalWorker = {')+'\nexport '+MagazineBench.toString()+
    "\nexport default { fetch(req,env){return env.B.get(env.B.idFromName('bench')).fetch(req);} }";
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,name:'rotation',script,durableObjects:{B:{className:'MagazineBench',useSQLite:true}},compatibilityDate:'2026-10-10'}));
  try{
    const res=await mf.dispatchFetch('https://fixture.invalid/');
    if(!res.ok)throw Error((await res.text()).slice(0,1200));
    return await res.json();
  }finally{await mf.dispose();}
}
test('magazine tie uses the original verified RSS head within the placement and storage budgets',async t=>{
  const old=await measure(oldSource),next=await measure(newSource);
  assert.deepEqual(old.requests,[]);assert.deepEqual(next.requests,[]);
  assert.deepEqual(old.batch.picks,Array(8).fill('ma'));
  assert.deepEqual(next.batch.picks,Array(8).fill('mb'));
  assert.equal(next.batch.issueQueries,1);assert.equal(next.batch.counts.written,0);assert.equal(next.refreshed,'ma');
  for(const [name,a] of Object.entries(old.results)){
    await t.test(name,()=>{
      const b=next.results[name];
      if(['normal','confirmed304','aliasOnly','thirdKnown'].includes(name)){
        const id=name==='thirdKnown'?'mc':'mb';
        assert.equal(a.pick,'ma');assert.equal(b.pick,id);assert.equal(b.target,id);
      }else if(name==='pacing'){
        assert.equal(b.target,null);assert.equal(a.target,null);
      }else{
        assert.equal(b.pick,a.pick);assert.equal(b.target,a.target);
      }
      assert.equal(b.original,a.original);assert.equal(b.verified,a.verified);assert.equal(b.revoked,false);
      if(name==='delay'||name==='pacing'||name==='none')assert.equal(b.target,null);
      assert.equal(b.ranking.written,a.ranking.written);
      assert.equal(b.placement.written,a.placement.written);
      assert.ok(b.ranking.sql<=a.ranking.sql+2);
      assert.ok(b.ranking.read<=a.ranking.read+30,JSON.stringify({name,a,b}));
      if(name==='one')assert.ok(b.ranking.sql<a.ranking.sql);
      if(name==='oneHistory')assert.ok(b.ranking.read<a.ranking.read);
    });
  }
  const examples=['normal','one','oneHistory','none','noFeed','retry','thirdKnown'];
  t.diagnostic(JSON.stringify(Object.fromEntries(examples.map(k=>[k,[old.results[k].placement,next.results[k].placement]]))));
  t.diagnostic(JSON.stringify({sharedEight:[old.batch.counts,next.batch.counts],feedQueries:next.batch.issueQueries}));
});
