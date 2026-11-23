// Run with Wrangler's Miniflare on NODE_PATH. No remote services are used.
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {Miniflare,convertV4MiniflareOptions} = require('miniflare');

const root=path.join(__dirname,'..');
const baseline=execFileSync('git',['show','15a8ed5:worker.js'],{cwd:root,encoding:'utf8',maxBuffer:4000000});
const candidate=readFileSync(path.join(root,'worker.js'),'utf8');

class FirstIssueBench {
  constructor(ctx,env){this.ctx=ctx;this.env=env;}
  async fetch(){
    const desk=new Desk520(this.ctx.storage,this.env);
    const query=(q,...args)=>this.ctx.storage.sql.exec(q,...args).toArray();
    const now=Date.UTC(2026,10,23,2),id='mmag',url='https://note.com/writer/m/'+id;
    Date.now=()=>now;
    desk.init();desk.initCirculation16932();desk.initRss16926();
    const policy=JSON.stringify({min:0,max:200,genres:genre520,methods:method520});
    query("INSERT INTO desk_import(id,url,name,allowed,managed,state) VALUES(?,?,?,1,1,'利用中')",id,url,id);
    query("INSERT INTO desk_member(id,mode,checked) VALUES(?,'auto',?)",id,now);
    query("INSERT INTO desk_mag(url,name,rules,policy,active,recent) VALUES(?,?,'',?,1,?)",url,id,policy,now);
    query("UPDATE desk_cfg SET enabled=1 WHERE id=1");
    const add=(key,title,n)=>query('INSERT INTO desk_archive(article,title,pub,verified,genre,chars,choice) VALUES(?,?,?,?,?,?,?)',
      key,title,now-n*60000,now,'小説',40,url);
    add('nlater','ある夜の話・後編',1);
    add('nentry','雨の駅で（掌編）',2);
    this.ctx.storage.transactionSync(()=>{
      for(let i=1;i<=1000;i++){
        query("INSERT INTO desk_ref VALUES(?,?,'','',?)",'n'+i,'mother'+i,now);
        query("INSERT INTO desk_placement VALUES(?,?,?,?)",i,'https://note.com/o/m/mother'+i,'',now);
        query("INSERT INTO desk_mag_send VALUES(?,?,?,'2020-02-02')",'n'+i,'mother'+i,now);
      }
    });
    const requests=[];
    desk.publicRead=async()=>{requests.push('note');throw Error('unexpected external request');};
    let measured;
    desk.rows=(q,...args)=>{
      const cursor=this.ctx.storage.sql.exec(q,...args),rows=cursor.toArray();
      if(measured){measured.sql++;measured.read+=cursor.rowsRead;measured.written+=cursor.rowsWritten;}
      return rows;
    };
    const insertJob=(key,phase)=>query("INSERT INTO desk_job(kind,subject,article,target,label,phase,next,at,message) VALUES('mag',?,?,?,'',?,0,?,'')",key+'@'+id,key,id,phase,now);
    const delay=key=>query("INSERT INTO desk_rss_delay16926 VALUES(?,?,?,?,'')",key,id,now-60000,now+60000);
    const setup={
      first:()=>{},firstChapter:()=>query("UPDATE desk_archive SET title=CASE article WHEN 'nentry' THEN '第１話：氷' ELSE '春の庭（第十二話）' END"),
      noLabel:()=>query("UPDATE desk_archive SET title='春の庭' WHERE article='nlater'"),
      novella:()=>query("UPDATE desk_archive SET title='雨の駅で・中編' WHERE article='nlater'"),
      quoted:()=>query("UPDATE desk_archive SET title='「後編」という小説ができるまで' WHERE article='nlater'"),
      ambiguous:()=>query("UPDATE desk_archive SET title='【第1話】雨の日・後編' WHERE article='nentry'"),
      observed:()=>query("INSERT INTO desk_ref VALUES('nprior',?,'','',?)",id,now),
      attempted:()=>query("INSERT INTO desk_mag_send VALUES('nprior',?,?,'2020-01-01')",id,now),
      oldJob:()=>insertJob('nprior','seen'),
      legacy:()=>query("INSERT INTO desk_placement VALUES(-1,?,'',?)",'https://note.com/m/'+id,now),
      oldOwnerAlias:()=>query("INSERT INTO desk_placement VALUES(-1,?,'',?)",'https://note.com/m/m/'+id+'/',now),
      otherChoice:()=>query("UPDATE desk_archive SET choice='https://note.com/writer/m/melse' WHERE article='nentry'"),
      manuscriptPolicy:()=>query("INSERT INTO desk_work(seq,title,body,d,t,locked,draft,genre,method,chars,article,pub) VALUES(1,'原稿','','2026-01-01','00:00',0,'','小説','なし',300,'nentry',?)",now),
      retry:()=>insertJob('nlater','wait'),
      entryDelay:()=>delay('nentry'),
      priorRejected:()=>{query("UPDATE desk_archive SET pub=? WHERE article='nentry'",now);delay('nentry');},
      excluded:()=>query("UPDATE desk_member SET mode='excluded' WHERE id=?",id),
      pacing:()=>query("UPDATE desk_distribution16918 SET mag_next=?",now+60000),
    };
    const result={},rollback=new Error('rollback scenario');
    for(const [name,arrange] of Object.entries(setup)){
      try{
        this.ctx.storage.transactionSync(()=>{
          arrange();measured={sql:0,read:0,written:0};
          const job=desk.nextPlacement(now,false);
          const counts=measured;measured=null;
          const stored=job?query('SELECT reason FROM desk_circulation_pick16932 WHERE article=? AND id=?',job.key,id)[0]?.reason:null;
          const fresh=job?desk.canDeliver(job,now):false;
          query("UPDATE desk_member SET mode='excluded' WHERE id=?",id);
          result[name]={key:job?.key||null,target:job?.target||null,stored,fresh,revoked:job?desk.canDeliver(job,now):false,counts};
          throw rollback;
        });
      }catch(error){if(error!==rollback)throw error;}
    }
    return Response.json({result,requests});
  }
}

async function measure(source){
  const script=source.replace('export default {','const originalWorker = {')+'\nexport '+FirstIssueBench.toString()+
    "\nexport default { fetch(req,env){return env.B.get(env.B.idFromName('bench')).fetch(req);} }";
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,name:'first-issue',script,
    durableObjects:{B:{className:'FirstIssueBench',useSQLite:true}},compatibilityDate:'2026-10-10'}));
  try{
    const res=await mf.dispatchFetch('https://fixture.invalid/');
    if(!res.ok)throw Error((await res.text()).slice(0,600));
    return await res.json();
  }finally{await mf.dispose();}
}
test('first magazine placement selects a verified opener within the existing queue and resources',async t=>{
  const old=await measure(baseline),next=await measure(candidate);
  assert.deepEqual(old.requests,[]);assert.deepEqual(next.requests,[]);
  for(const name of Object.keys(old.result)){
    await t.test(name,()=>{
      const a=old.result[name],b=next.result[name];
      if(name==='first'||name==='firstChapter'){
        assert.equal(a.key,'nlater');assert.equal(b.key,'nentry');assert.match(b.stored,/初|最初/);
      }else assert.equal(b.key,a.key);
      assert.equal(b.target,a.target);assert.equal(b.fresh,a.fresh);assert.equal(b.revoked,false);
      if(name==='priorRejected')assert.equal(b.key,'nlater');
      if(name==='excluded'||name==='pacing')assert.equal(b.key,null);
      assert.ok(b.counts.sql<=a.counts.sql,'first placement must stay within the previous query budget');
      assert.equal(b.counts.written,a.counts.written);
      assert.ok(b.counts.read<=a.counts.read+12,JSON.stringify({name,a,b}));
    });
  }
  t.diagnostic(JSON.stringify({old:old.result.first.counts,next:next.result.first.counts,ordinary:next.result.noLabel.counts}));
});
