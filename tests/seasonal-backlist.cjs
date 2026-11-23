// Isolated workerd/SQLite comparison against v16.9.45. All article and magazine records are synthetic.
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {Miniflare,convertV4MiniflareOptions} = require('miniflare');

const root=path.join(__dirname,'..');
const oldSource=execFileSync('git',['show','82349df:worker.js'],{cwd:root,encoding:'utf8',maxBuffer:4000000});
const newSource=readFileSync(path.join(root,'worker.js'),'utf8');
const day=86400000;
const july=Date.parse('2026-07-01T00:00:00+09:00');
const scenarios=[];
function add(name,setup={},expected='nhead'){
  scenarios.push({name,now:july,title:'七夕の川辺',...setup,expected});
}
for(const [word,start,end] of [
  ['元日','01-01','01-01'],['雛祭り','03-01','03-03'],['こどもの日','05-01','05-05'],
  ['七夕','07-01','07-07'],['クリスマス','12-20','12-25'],['大晦日','12-26','12-31']
]){
  const from=Date.parse('2026-'+start+'T00:00:00+09:00'),until=Date.parse('2026-'+end+'T00:00:00+09:00')+day;
  for(const [edge,now,active] of [['before',from-1,false],['start',from,true],['end',until-1,true],['after',until,false]])
    add(word+' '+edge,{now,title:word+'の朝'},active?'nseason':'nhead');
}
add('verified tag only',{title:'星の川',tags:'["七夕"]'},'nseason');
add('tag substring',{title:'星の川',tags:'["七夕まつり"]'});
add('false word in title',{title:'ポイント還元日',now:Date.parse('2026-01-01T09:00:00+09:00')});
for(const [title,date] of [['元日本代表','01-01'],['元旦那との生活','01-01'],['こどもの日常','05-05'],['クリスマス・ローズ','12-24']])
  add(title,{title,now:Date.parse('2026-'+date+'T12:00:00+09:00')});
add('explicit tag on ambiguous title',{title:'クリスマスローズ',tags:'["クリスマス"]',now:Date.parse('2026-12-24T12:00:00+09:00')},'nseason');
add('unconfirmed title',{tags:null});
add('unconfirmed queue head',{headTags:null});
add('malformed evidence',{tags:'not-json'});
add('general season word',{title:'夏の思い出'});
add('head already matches',{head:'七夕の日'});
add('numbered series',{title:'七夕の庭（第２話）'});
add('series at head',{head:'連載・山の光'});
add('magazine opener before season',{head:'峰の道・後編',third:'第一話：春の道'},'nthird');
add('signal-based old turn',{mode:'ranked'});
add('published less than thirty days ago',{mode:'freshOnly'},'nseason');
add('new article goes first',{mode:'freshFirst'},'nfresh');
add('thirtieth day',{seasonAge:30},'nseason');
add('lower publication priority',{seasonAge:29});
add('first two queue positions only',{mode:'neighbor'});
add('scheduled magazine delay',{mode:'pacing'},null);
add('rights excluded',{mode:'excluded'},null);
add('stale candidate',{mode:'stale'});
add('later check timestamp',{mode:'futureDetail'});
add('other magazine',{mode:'choice'});
add('different rules for original manuscript',{mode:'manuscript'});
add('multiple equal venues',{mode:'multiple'},'nseason');
add('different effective genres',{mode:'genre'});
add('other venue admits only the alternate',{mode:'policy'});
add('brief for head',{mode:'headBrief'});
add('brief for alternate',{mode:'seasonBrief'});
add('head retry',{mode:'headRetry'});
add('candidate wait after inconclusive attempt',{mode:'wait'});
add('recorded elsewhere',{mode:'ref'});
add('sent elsewhere',{mode:'sent'});
add('legacy manuscript placement',{mode:'legacy'});
add('legacy placement for queue head',{mode:'headLegacy'});
add('previously circulated',{mode:'magAt'});
add('candidate in RSS hold',{mode:'candidateDelay'});
add('head in RSS hold',{mode:'headDelay'},'nseason');
add('candidate in RSS hold at different magazine',{mode:'otherCandidateDelay'});
add('head in RSS hold at different magazine',{mode:'otherHeadDelay'});
add('stopped in final delivery check',{mode:'stopped'},'nseason');
add('event ends before delivery',{mode:'eventEnds',now:july+7*day-1},'nseason');
add('only verified tag removed before delivery',{mode:'tagRemoved',title:'星の川',tags:'["七夕"]'},'nseason');
add('preflight and sent records leave next ordinary slot for the head',{mode:'attempt'},'nseason');

class SeasonalBench{
  constructor(ctx,env){this.ctx=ctx;this.env=env;}
  async fetch(request){
    const cases=await request.json(),desk=new Desk520(this.ctx.storage,this.env);
    const query=(q,...args)=>this.ctx.storage.sql.exec(q,...args).toArray();
    const id='mfixture',url='https://note.com/writer/m/'+id,other='mother',otherUrl='https://note.com/writer/m/'+other;
    let now=Date.UTC(2026,0,1),counts=null;
    Date.now=()=>now;
    desk.init();desk.initCirculation16932();desk.initRss16926();
    const hasTags=query('PRAGMA table_info(desk_archive)').some(row=>row.name==='seasonal_tags');
    const policy=JSON.stringify({min:0,max:200,genres:genre520,methods:method520});
    const mag=(key,link)=>{
      query("INSERT INTO desk_import(id,url,name,allowed,managed,state) VALUES(?,?,?,1,1,'利用中')",key,link,key);
      query("INSERT INTO desk_member(id,mode,checked) VALUES(?,'auto',?)",key,now);
      query("INSERT INTO desk_mag(url,name,rules,policy,active,recent) VALUES(?,?,'',?,1,?)",link,key,policy,now);
    };
    const article=(key,title,age,tags)=>{
      query('INSERT INTO desk_archive(article,title,pub,verified,genre,chars,choice) VALUES(?,?,?,?,?,?,?)',
        key,title,now-age*D520,now,'小説',40,url);
      if(hasTags)query('UPDATE desk_archive SET seasonal_tags=? WHERE article=?',tags,key);
    };
    const job=(key,target,phase)=>query("INSERT INTO desk_job(kind,subject,article,target,label,phase,next,at,message) VALUES('mag',?,?,?,'',?,0,?,'')",
      key+'@'+target,key,target,phase,now);
    const hold=(key,target=id)=>query("INSERT INTO desk_rss_delay16926 VALUES(?,?,?,?,'')",key,target,now-60000,now+60000);
    this.ctx.storage.transactionSync(()=>{
      for(let i=0;i<500;i++){
        query("INSERT INTO desk_ref VALUES(?,?,'','',?)",'nx'+i,'mx'+i,now);
        query("INSERT INTO desk_mag_send VALUES(?,?,?,'2025-01-01')",'nx'+i,'mx'+i,now);
        query("INSERT INTO desk_placement VALUES(?,?,?,?)",100+i,'https://note.com/o/m/mx'+i,'',now);
        job('nx'+i,'mx'+i,'seen');
      }
    });
    const manuscript=chars=>query("INSERT INTO desk_work(seq,title,body,d,t,locked,draft,genre,method,chars,article,pub) VALUES(5,'旧作','','2025-01-01','00:00',0,'','小説','本人執筆',?,'nseason',?)",chars,now-60*D520);
    const changes={
      ranked:()=>query('UPDATE desk_scout_state SET older=1 WHERE id=1'),
      freshFirst:()=>article('nfresh','今日の新作',1,'[]'),
      neighbor:()=>article('nother','手紙',70,'[]'),
      pacing:()=>query('UPDATE desk_distribution16918 SET mag_next=?',now+60000),
      excluded:()=>query("UPDATE desk_member SET mode='excluded'"),
      stale:()=>query("UPDATE desk_archive SET verified=? WHERE article='nseason'",now-8*D520-1),
      futureDetail:()=>query("UPDATE desk_archive SET verified=? WHERE article='nseason'",now+1),
      choice:()=>query("UPDATE desk_archive SET choice=? WHERE article='nseason'",otherUrl),
      manuscript:()=>manuscript(300),
      multiple:()=>mag(other,otherUrl),
      genre:()=>query("UPDATE desk_archive SET genre='詩' WHERE article='nseason'"),
      policy:()=>{mag(other,otherUrl);query('UPDATE desk_mag SET policy=? WHERE url=?',JSON.stringify({min:0,max:30,genres:genre520,methods:method520}),otherUrl);manuscript(25);},
      headBrief:()=>query("INSERT INTO desk_rss_match16926 VALUES(?,'nhead','',0.4,'h',?,1,'')",other,now),
      seasonBrief:()=>query("INSERT INTO desk_rss_match16926 VALUES(?,'nseason','',0.4,'h',?,1,'')",other,now),
      headRetry:()=>job('nhead',id,'wait'),
      wait:()=>job('nseason',other,'wait'),
      ref:()=>query("INSERT INTO desk_ref VALUES('nseason',?,'','',?)",other,now),
      sent:()=>query("INSERT INTO desk_mag_send VALUES('nseason',?,?,'2025-01-01')",other,now),
      legacy:()=>{manuscript(40);query("INSERT INTO desk_placement VALUES(5,?,'',?)",otherUrl,now);},
      headLegacy:()=>{manuscript(40);query("UPDATE desk_work SET article='nhead' WHERE seq=5");query("INSERT INTO desk_placement VALUES(5,?,'',?)",otherUrl,now);},
      magAt:()=>query("UPDATE desk_archive SET mag_at=? WHERE article='nseason'",now-8*D520),
      candidateDelay:()=>hold('nseason'),headDelay:()=>hold('nhead'),
      otherCandidateDelay:()=>hold('nseason',other),otherHeadDelay:()=>hold('nhead',other),
      stopped:()=>query('UPDATE desk_cfg SET enabled=0'),
    };
    const requests=[];
    desk.publicRead=async()=>{requests.push('note');throw Error('unexpected network request');};
    desk.rows=(q,...args)=>{
      const cursor=this.ctx.storage.sql.exec(q,...args),result=cursor.toArray();
      if(counts){counts.queries++;counts.read+=cursor.rowsRead;counts.written+=cursor.rowsWritten;}
      return result;
    };
    const output={},undo=new Error('roll back synthetic scenario');
    for(const s of cases){
      try{this.ctx.storage.transactionSync(()=>{
        now=s.now;
        mag(id,url);query('UPDATE desk_cfg SET enabled=1');query('UPDATE desk_scout_state SET older=0');
        article('nhead',s.head||'山の光',s.mode==='freshOnly'?5:80,s.headTags===undefined?'[]':s.headTags);
        article('nseason',s.title,s.mode==='freshOnly'?1:s.seasonAge??60,s.tags===undefined?'[]':s.tags);
        if(s.third)article('nthird',s.third,40,'[]');
        changes[s.mode]?.();
        counts={queries:0,read:0,written:0};
        const pick=desk.nextPlacement(now,s.mode!=='freshFirst'&&s.mode!=='freshOnly');
        const cost=counts;counts=null;
        const reason=pick?query('SELECT reason FROM desk_circulation_pick16932 WHERE article=? AND id=?',pick.key,pick.target)[0]?.reason:'';
        const allowed=pick?desk.canDeliver(pick,now):false;
        if(s.mode==='eventEnds')now+=1;
        if(s.mode==='tagRemoved' && hasTags)query("UPDATE desk_archive SET seasonal_tags='[]' WHERE article='nseason'");
        const afterChange=pick?desk.canDeliver(pick,now):false;
        const subsequent=[];
        if(s.mode==='attempt'){
          job('nseason',id,'wait');
          subsequent.push(desk.nextPlacement(now,true)?.key,desk.canDeliver(pick,now));
          query("UPDATE desk_job SET phase='sent' WHERE article='nseason'");
          query("INSERT INTO desk_mag_send VALUES('nseason',?,?,?)",id,now,jstDay(now));
          query("UPDATE desk_archive SET mag_at=?,mag_due=? WHERE article='nseason'",now,now+2*HOUR);
          subsequent.push(desk.nextPlacement(now,true)?.key,desk.canDeliver(pick,now));
        }
        query("UPDATE desk_member SET mode='excluded'");
        output[s.name]={key:pick?.key??null,id:pick?.target??null,reason,cost,allowed,afterChange,subsequent,revoked:pick?desk.canDeliver(pick,now):false};
        throw undo;
      });}catch(error){if(error!==undo)throw error;}
    }
    return Response.json({output,requests});
  }
}
async function run(source){
  const script=source.replace('export default {','const original = {')+'\nexport '+SeasonalBench.toString()+
    '\nexport default {fetch(req,env){return env.B.get(env.B.idFromName("season")).fetch(req);}}';
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,name:'backlist',script,
    durableObjects:{B:{className:'SeasonalBench',useSQLite:true}},compatibilityDate:'2026-10-10'}));
  try{
    const r=await mf.dispatchFetch('https://fixture.invalid/',{method:'POST',body:JSON.stringify(scenarios)});
    if(!r.ok)throw Error((await r.text()).slice(0,900));
    return await r.json();
  }finally{await mf.dispose();}
}
test('seasonal backlist on the real old-work queue',async t=>{
  const before=await run(oldSource),after=await run(newSource);
  assert.deepEqual(before.requests,[]);assert.deepEqual(after.requests,[]);
  for(const s of scenarios){
    await t.test(s.name,()=>{
      const a=before.output[s.name],b=after.output[s.name];
      assert.equal(b.key,s.expected);assert.equal(b.id,a.id);
      if(a.key!==b.key){
        assert.equal(a.key,'nhead');assert.equal(b.key,'nseason');assert.match(b.reason,/行事/);
      }else assert.equal(b.reason,a.reason);
      assert.equal(a.allowed,b.allowed);assert.equal(b.revoked,false);
      if(s.mode==='stopped')assert.equal(b.allowed,false);
      if(s.mode==='eventEnds'||s.mode==='tagRemoved'){assert.equal(a.afterChange,true);assert.equal(b.afterChange,false);}
      if(s.mode==='attempt')assert.deepEqual(b.subsequent,['nhead',true,'nhead',false]);
      assert.ok(b.cost.queries<=a.cost.queries+(s.mode==='multiple'?1:0),JSON.stringify({a:a.cost,b:b.cost}));
      assert.equal(b.cost.written,a.cost.written);
      assert.ok(b.cost.read<=a.cost.read+8,JSON.stringify({old:a.cost,next:b.cost}));
    });
  }
  t.diagnostic(JSON.stringify(Object.fromEntries(['七夕 start','七夕 before','sent elsewhere','legacy manuscript placement','signal-based old turn']
    .map(name=>[name,{v45:before.output[name].cost,v46:after.output[name].cost}]))));
});
