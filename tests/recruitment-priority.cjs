// Isolated workerd DOs. The only simulated note reads are the public checks
// normally made by expandJoin520 after it has chosen a candidate.
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');

const root=path.join(__dirname,'..');
const baseline=execFileSync('git',['show','fc449af:worker.js'],{cwd:root,encoding:'utf8',maxBuffer:4000000});
const candidate=readFileSync(path.join(root,'worker.js'),'utf8');
const cases={
  twoAuthors:'mb',sameScore:'ma',oneInBase:'ma',oneInOther:'ma',singleAuthor:'ma',wrongOwner:'ma',wrongArticle:'ma',
  otherIssue:'ma',wrongOperator:'ma',ownAuthor:'ma',otherAccount:'ma',operator:'ma',notFull:'ma',differentContent:'ma',
  expiredFeed:'ma',futureFeed:'ma',staleWork:'ma',futureWork:'ma',wrongPub:'ma',staleItem:'ma',noCorpus:'ma',
  legacyFeature:'ma',legacyAll:'ma',titleOnly:'ma',missingOriginalIssue:'ma',invalidItem:'ma',otherAccountId:'ma',reusedWriterId:'ma',
  separateOwnWorks:'ma',splitWithinIssue:'ma',outsideFour:'ma',smallDifference:'ma',aliasOnly:'mb',aliasConflict:'ma',
  legacyAt16KiB:'mb',largeLegacyBase:'ma',largeRefreshed:'mb',corruptProjection:'ma',oversizedProjection:'ma',
  corruptRaw:'ma',newerOwnerAlias:'ma',simultaneousAlias:'ma',fourFull:'mb',
  laterDue:'ma',sameDueDifferentImport:'mb',strongerCurator:'ma',idleTurn:'ma',fourthTurn:'ma',lastSlot:'mb',
  resetDay:'ma',excluded:'ma',alreadyKnown:'ma',onlyOne:'ma',bothExcluded:null,quota:null,waiting:null,stopped:null,blocked:null,
  paidRule:'mb',heavy:'mb',heavyRelevantCurator:'mb'
};

class RecruitmentBench{
  constructor(ctx){this.ctx=ctx;}
  async fetch(request){
    const scenario=new URL(request.url).pathname.slice(1);
    const now=Date.UTC(2026,10,23,5),day=jstDay(now);
    Date.now=()=>now;
    const events=[],browser=[];
    const desk=new Desk520(this.ctx.storage,{BROWSER:{acquire:async()=>{browser.push('acquire');throw Error('unexpected browser');}}});
    const query=(sql,...bindings)=>this.ctx.storage.sql.exec(sql,...bindings).toArray();
    desk.init();
    const weak={full:true,themes:['自然','都市'],tokens:['水面','霧雨','空港','車庫','書庫','窓口','路肩','古道']};
    const own={full:true,themes:['自然','都市','記憶','暮らし'],tokens:['星空','改札','部屋','家族','本棚','台所','街灯','記憶']};
    const unlike={full:true,themes:['仕事','金銭'],tokens:['賞金','投資','金額','職場','給料','時給','店長','銀行']};
    const authorIds=new Map([['43__','42'],['account_two','43']]);
    const savedFeature=(feature,author)=>{
      if(!authorIds.has(author))authorIds.set(author,String(100+authorIds.size));
      // Every listed feature in these synthetic bodies comes from the body.
      return JSON.stringify({...feature,recruitment16947:{authorId:authorIds.get(author),
        themes:2**feature.themes.length-1,tokens:2**feature.tokens.length-1}});
    };
    const url=(id,owner)=>'https://note.com/'+owner+'/m/'+id;
    const publicWork=(article,owner,feature,pub=now-7*D520)=>{
      query('INSERT INTO desk_network_work16922(article,owner,title,pub,feature,full,fiction,likes,seen) VALUES(?,?,?,?,?,1,1,0,?)',
        article,owner,'短編小説',pub,savedFeature(feature,owner),now);
    };
    const makeItem=(article,owner,pub=now-7*D520)=>({article,owner,pub,title:'短編小説'});
    const issue=(id,owner,items)=>JSON.stringify({header:{link:url(id,owner),title:'文芸誌'},
      entries:items.map(i=>({link:'https://note.com/'+i.owner+'/n/'+i.article,title:i.title,pubdate:new Date(i.pub).toUTCString()}))});
    const paddedIssue=(id,owner,items,bytes)=>{
      const value=JSON.parse(issue(id,owner,items));value.header.description='';
      value.header.description='.'.repeat(bytes-new TextEncoder().encode(JSON.stringify(value)).length);
      return value;
    };
    const mag=(id,owner,items)=>{
      query('INSERT INTO desk_network_mag16922(id,url,owner,name,items,first_at,last_at,changed) VALUES(?,?,?,?,?,?,?,?)',
        id,url(id,owner),owner,'文芸誌',JSON.stringify(items),now-21*D520,now,now-D520);
      query("INSERT INTO desk_rss_feed16926 VALUES(?,?,?,'[]',?,'','',0,0,?)",
        url(id,owner)+'/rss',id,now,issue(id,owner,items),now);
    };
    const discover=(id,owner,due=now-60000)=>{
      query('INSERT INTO desk_import(id,url,name) VALUES(?,?,?)',id,url(id,owner),'文芸誌');
      query('INSERT INTO desk_join_discovery(id,due) VALUES(?,?)',id,due);
      query("INSERT INTO desk_member(id,mode) VALUES(?,'check')",id);
    };
    const alpha=[makeItem('na1','aone'),makeItem('na2','atwo')];
    const beta=[makeItem('nb1','bone'),makeItem('nb2','btwo')];
    const replaceBeta=()=>{
      query("UPDATE desk_network_mag16922 SET items=? WHERE id='mb'",JSON.stringify(beta));
      query("UPDATE desk_rss_feed16926 SET payload=? WHERE id='mb'",issue('mb','editb',beta));
    };
    const betaOwner=owner=>{
      beta[1].owner=owner;replaceBeta();
      query("UPDATE desk_network_work16922 SET owner=?,feature=? WHERE article='nb2'",owner,savedFeature(own,owner));
    };
    const drop=id=>query("UPDATE desk_member SET mode='excluded' WHERE id=?",id);
    const due=now-60000;
    this.ctx.storage.transactionSync(()=>{
      query('UPDATE desk_cfg SET enabled=1 WHERE id=1');
      query('UPDATE desk_delivery SET enabled=1 WHERE id=1');
      query('UPDATE desk_join_cfg SET enabled=1 WHERE id=1');
      query('UPDATE desk_expansion SET day=?,used=1,due=0 WHERE id=1',day);
      discover('ma','edita',due);discover('mb','editb',due);
      query("INSERT INTO desk_audience16922(slot,account,owner,corpus,updated) VALUES('1','42','43__','[\"nself\"]',?)",now);
      query("INSERT INTO desk_audience16922(slot,account,owner,updated) VALUES('2','43','account_two',?)",now);
      publicWork('nself','43__',own);for(const i of alpha)publicWork(i.article,i.owner,weak,i.pub);
      for(const i of beta)publicWork(i.article,i.owner,own,i.pub);
      mag('ma','edita',alpha);mag('mb','editb',beta);
      switch(scenario){
        case 'sameScore':for(const w of beta)query('UPDATE desk_network_work16922 SET feature=? WHERE article=?',savedFeature(weak,w.owner),w.article);break;
        case 'oneInBase':query("DELETE FROM desk_network_work16922 WHERE article='na2'");break;
        case 'oneInOther':query("DELETE FROM desk_network_work16922 WHERE article='nb2'");break;
        case 'singleAuthor':betaOwner('bone');break;
        case 'wrongOwner':query("UPDATE desk_network_work16922 SET owner='elsewhere' WHERE article='nb2'");break;
        case 'wrongArticle':beta[1].article='nmissing';replaceBeta();break;
        case 'otherIssue':query("UPDATE desk_rss_feed16926 SET payload=? WHERE id='mb'",issue('mx','editb',beta));break;
        case 'wrongOperator':query("UPDATE desk_rss_feed16926 SET payload=? WHERE id='mb'",issue('mb','another',beta));break;
        case 'ownAuthor':betaOwner('43__');break;
        case 'otherAccount':betaOwner('account_two');break;
        case 'operator':betaOwner('editb');break;
        case 'notFull':query("UPDATE desk_network_work16922 SET full=0 WHERE article='nb2'");break;
        case 'differentContent':query("UPDATE desk_network_work16922 SET feature=? WHERE article='nb2'",savedFeature(unlike,'btwo'));break;
        case 'legacyFeature':query("UPDATE desk_network_work16922 SET feature=? WHERE article='nb2'",JSON.stringify(own));break;
        case 'legacyAll':query("UPDATE desk_network_work16922 SET feature=json_remove(feature,'$.recruitment16947')");break;
        case 'titleOnly':query("UPDATE desk_network_work16922 SET feature=json_set(feature,'$.recruitment16947.themes',0,'$.recruitment16947.tokens',0) WHERE article='nb2'");break;
        case 'otherAccountId':query("UPDATE desk_network_work16922 SET feature=? WHERE article='nb2'",savedFeature(own,'account_two'));break;
        case 'reusedWriterId':query("UPDATE desk_network_work16922 SET feature=? WHERE article='nb2'",savedFeature(own,'bone'));break;
        case 'separateOwnWorks':
        case 'splitWithinIssue':{
          publicWork('nself2','43__',unlike);
          query("UPDATE desk_audience16922 SET corpus='[\"nself\",\"nself2\"]' WHERE owner='43__'");
          for(const w of scenario==='separateOwnWorks'?beta:[beta[1]])
            query('UPDATE desk_network_work16922 SET feature=? WHERE article=?',savedFeature(unlike,w.owner),w.article);
          break;
        }
        case 'outsideFour':{
          for(const w of beta)query('UPDATE desk_network_work16922 SET feature=? WHERE article=?',savedFeature(weak,w.owner),w.article);
          for(const id of ['mc','md','me']){
            discover(id,'edit'+id,due);
            const works=[makeItem('n'+id+'1',id+'one'),makeItem('n'+id+'2',id+'two')];
            for(const w of works)publicWork(w.article,w.owner,id==='me'?own:weak,w.pub);
            mag(id,'edit'+id,works);
          }
          break;
        }
        case 'smallDifference':{
          const tokens=Array.from({length:24},(_,i)=>'単語'+i);
          const own24={...own,tokens};
          query("UPDATE desk_network_work16922 SET feature=? WHERE article='nself'",savedFeature(own24,'43__'));
          for(const w of [...alpha,...beta]){
            const count=w.owner.startsWith('a')?8:9;
            const f={...own24,tokens:tokens.map((s,i)=>i<count?s:'別語'+i)};
            query('UPDATE desk_network_work16922 SET feature=? WHERE article=?',savedFeature(f,w.owner),w.article);
          }
          break;
        }
        case 'aliasOnly':query("UPDATE desk_rss_feed16926 SET url='https://note.com/m/mb/rss' WHERE id='mb'");break;
        case 'aliasConflict':query("INSERT INTO desk_rss_feed16926 SELECT 'https://note.com/m/mb/rss',id,checked,items,'',etag,modified,quiet,added,full_at FROM desk_rss_feed16926 WHERE id='mb'");break;
        case 'legacyAt16KiB':query("UPDATE desk_rss_feed16926 SET payload=? WHERE id='ma'",JSON.stringify(paddedIssue('ma','edita',alpha,16384)));break;
        case 'largeLegacyBase':{
          query("INSERT INTO desk_rss_feed16926 SELECT 'https://note.com/m/ma/rss',id,checked-60000,items,payload,etag,modified,quiet,added,full_at-60000 FROM desk_rss_feed16926 WHERE id='ma'");
          query("UPDATE desk_rss_feed16926 SET payload=? WHERE url=?",JSON.stringify(paddedIssue('ma','edita',alpha,16385)),url('ma','edita')+'/rss');
          discover('mc','editc',due);mag('mc','editc',beta);break;
        }
        case 'largeRefreshed':
        case 'corruptProjection':
        case 'oversizedProjection':{
          const feed=url('mb','editb')+'/rss',old=query('SELECT * FROM desk_rss_feed16926 WHERE url=?',feed)[0];
          desk.rssObserve16926(feed,paddedIssue('mb','editb',beta,120000),old);
          if(scenario==='corruptProjection')query("UPDATE desk_rss_feed16926 SET items='{' WHERE url=?",feed);
          if(scenario==='oversizedProjection')query("UPDATE desk_rss_feed16926 SET items=json_set(items,'$[0].title',?) WHERE url=?",'a'.repeat(16385),feed);
          break;
        }
        case 'corruptRaw':query("UPDATE desk_rss_feed16926 SET payload='{' WHERE id='mb'");break;
        case 'newerOwnerAlias':
        case 'simultaneousAlias':{
          if(scenario==='newerOwnerAlias')query("UPDATE desk_rss_feed16926 SET checked=checked-60000,full_at=full_at-60000 WHERE id='mb'");
          query("INSERT INTO desk_rss_feed16926 VALUES(?, 'mb',?,'[]',?,'','',0,0,?)",
            url('mb','neweditor')+'/rss',now,issue('mb',scenario==='newerOwnerAlias'?'neweditor':'editb',beta),now);
          break;
        }
        case 'fourFull':{
          query('UPDATE desk_expansion SET used=47');
          for(const k of ['nself2','nself3','nself4'])publicWork(k,'43__',own);
          query('UPDATE desk_audience16922 SET corpus=? WHERE slot=?',JSON.stringify(['nself','nself2','nself3','nself4']),'1');
          for(const [id,owner,body] of [['ma','edita',weak],['mb','editb',own],['mc','editc',weak],['md','editd',weak]]){
            const items=id==='ma'?alpha.slice():id==='mb'?beta.slice():[];
            for(let j=items.length;j<4;j++){
              const entry=makeItem('n'+id+j,id+'author'+j);items.push(entry);publicWork(entry.article,entry.owner,body);
            }
            if(id==='mc'||id==='md'){discover(id,owner,due);mag(id,owner,items);}
            const feed=url(id,owner)+'/rss',old=query('SELECT * FROM desk_rss_feed16926 WHERE url=?',feed)[0];
            desk.rssObserve16926(feed,paddedIssue(id,owner,items,120000),old);
          }
          break;
        }
        case 'missingOriginalIssue':query("UPDATE desk_rss_feed16926 SET payload='' WHERE id='mb'");break;
        case 'invalidItem':query("UPDATE desk_rss_feed16926 SET payload=json_set(payload,'$.entries[1].link','https://elsewhere.invalid/btwo/n/nb2') WHERE id='mb'");break;
        case 'expiredFeed':query("UPDATE desk_rss_feed16926 SET checked=?,full_at=? WHERE id='mb'",now-29*D520,now-29*D520);break;
        case 'futureFeed':query("UPDATE desk_rss_feed16926 SET checked=? WHERE id='mb'",now+60000);break;
        case 'staleWork':query("UPDATE desk_network_work16922 SET seen=? WHERE article='nb2'",now-29*D520);break;
        case 'futureWork':query("UPDATE desk_network_work16922 SET seen=? WHERE article='nb2'",now+60000);break;
        case 'wrongPub':query("UPDATE desk_network_work16922 SET pub=pub-? WHERE article='nb2'",D520);break;
        case 'staleItem':beta[1].pub=now-61*D520;replaceBeta();query("UPDATE desk_network_work16922 SET pub=? WHERE article='nb2'",beta[1].pub);break;
        case 'noCorpus':query("UPDATE desk_audience16922 SET corpus='[]' WHERE owner='43__'");break;
        case 'laterDue':query("UPDATE desk_join_discovery SET due=? WHERE id='mb'",due+1000);break;
        case 'sameDueDifferentImport':query("UPDATE desk_import SET due=? WHERE id='mb'",now+D520);break;
        case 'strongerCurator':{
          const posts=[now-8*D520,now-D520].map((pub,i)=>({article:'npost'+i,pub,owners:['one','two'],feature:weak}));
          query("INSERT INTO desk_network_curator16922(owner,posts,seen) VALUES('edita',?,?)",JSON.stringify(posts),now);
          break;
        }
        case 'idleTurn':query('UPDATE desk_expansion SET used=0');break;
        case 'fourthTurn':query('UPDATE desk_expansion SET used=4');break;
        case 'lastSlot':query('UPDATE desk_expansion SET used=47');break;
        case 'resetDay':query("UPDATE desk_expansion SET used=48,day='2026-11-22'");break;
        case 'excluded':drop('mb');break;
        case 'alreadyKnown':query("INSERT INTO desk_join_target(id,definition,created) VALUES('mb','{}',?)",now);break;
        case 'onlyOne':query("DELETE FROM desk_join_discovery WHERE id='mb'");break;
        case 'bothExcluded':drop('ma');drop('mb');break;
        case 'quota':query('UPDATE desk_expansion SET used=48');break;
        case 'waiting':query('UPDATE desk_expansion SET due=?',now+D520);break;
        case 'stopped':query('UPDATE desk_join_cfg SET enabled=0');break;
        case 'blocked':query('UPDATE desk_cfg SET blocked=?',now+D520);break;
        case 'heavy':
        case 'heavyRelevantCurator':{
          // Bring the existing comparison caches near their production caps.
          for(let i=0;i<90;i++){
            const owner='editor'+i,id='mother'+i;
            const items=[0,1,2].map(j=>makeItem('nold'+i+'x'+j,'person'+j,now-(j+1)*4*D520));
            for(const w of items)publicWork(w.article,w.owner,unlike,w.pub);
            mag(id,owner,items);
            query('INSERT INTO desk_network_curator16922(owner,magazines,seen) VALUES(?,?,?)',owner,JSON.stringify([id]),now);
          }
          for(let i=0;i<1000;i++)discover('mlater'+i,'later'+i,now+D520);
          if(scenario==='heavyRelevantCurator')query("INSERT INTO desk_network_curator16922(owner,seen) VALUES('editb',?)",now);
          break;
        }
      }
    });
    // A candidate's content evidence alone cannot prove a free application.
    // Return a real-looking, paid rule or a public issue with no application link.
    desk.publicRead=async(route,format)=>{
      events.push({route,format});
      const id=route.includes('/mb')?'mb':'ma',owner=id==='mb'?'editb':'edita';
      if(format==='html')return '<html><head><meta property="og:url" content="'+url(id,owner)+'"></head><body>'+
        (scenario==='paidRule'?'<a href="https://note.com/'+owner+'/n/nrules">参加募集</a>':'')+'</body></html>';
      if(route.includes('/api/v1/magazines/'))return {data:{key:id,name:'文芸誌',owner:{urlname:owner},price:scenario==='paidRule'?100:0}};
      if(route.endsWith('/notes/nrules'))return {data:{key:'nrules',name:'参加募集',status:'published',price:100,user:{urlname:owner},body:'有料の参加申請'}};
      throw Error('unexpected path '+route);
    };
    const cfg=()=>query('SELECT day,used,due FROM desk_expansion')[0];
    const before=cfg();
    const counts={sql:0,read:0,written:0};
    const projected={issueQueries:0,issues:0,bytes:0,maxBytes:0,workQueries:0,keys:0};
    desk.rows=(sql,...bindings)=>{
      const c=this.ctx.storage.sql.exec(sql,...bindings),result=c.toArray();
      counts.sql++;counts.read+=c.rowsRead;counts.written+=c.rowsWritten;
      if(sql.includes('FROM wanted w JOIN desk_rss_feed16926')){
        projected.issueQueries++;projected.issues+=result.length;
        for(const row of result){
          const size=new TextEncoder().encode(row.payload||row.norm||'').length;
          projected.bytes+=size;projected.maxBytes=Math.max(projected.maxBytes,size);
        }
      }
      if(sql.includes('FROM desk_network_work16922 WHERE article IN (')){
        projected.workQueries++;
        projected.keys+=bindings.filter(k=>typeof k==='string'&&/^n[a-z0-9]+$/.test(k)).length;
      }
      return result;
    };
    await desk.expandJoin520(now);
    const checked=query("SELECT id,due,message FROM desk_join_discovery WHERE checked=? AND id IN ('ma','mb')",now);
    const roles=query("SELECT i.id,i.allowed,i.managed,m.mode FROM desk_import i JOIN desk_member m ON m.id=i.id WHERE i.id IN ('ma','mb') ORDER BY i.id");
    const state={jobs:query("SELECT COUNT(*) n FROM desk_join WHERE id IN ('ma','mb')")[0].n,
      targets:query("SELECT COUNT(*) n FROM desk_join_target WHERE id IN ('ma','mb')")[0].n,
      applications:query('SELECT COALESCE(SUM(applications),0) n FROM desk_join_budget')[0].n};
    // Later actions in joinTick520 still use the existing curator ranking,
    // regardless of which magazine was first considered for a public read.
    const total={...counts};
    let capped=null;
    if(scenario==='fourFull'){
      const previous=events.length;
      // All three attempts fall after the 15-minute gate, within the same day.
      for(let i=1;i<=3;i++)await desk.expandJoin520(now+i*16*60000);
      capped={sql:counts.sql-total.sql,read:counts.read-total.read,written:counts.written-total.written,requests:events.length-previous};
    }
    const applicationRank=desk.networkRecruitment16922([{id:'ma'},{id:'mb'}],now,1)?.id;
    let applicationProbe=null;
    if(scenario==='twoAuthors'){
      // Stop the normal application selection at its existing read-only probe.
      // Only the separate source-research queue is allowed to change order.
      query("UPDATE desk_member SET mode='excluded' WHERE id IN (SELECT id FROM desk_join_target)");
      query('UPDATE desk_join_cfg SET used=1,day=?,due=0',day);
      for(const [id,owner] of [['ma','edita'],['mb','editb']]){
        const article='nrule'+id;
        const definition={...JOIN520,id,owner,article,url:url(id,owner),rule:'https://note.com/'+owner+'/n/'+article};
        query('INSERT INTO desk_join_target VALUES(?,?,?)',id,JSON.stringify(definition),now);
        query('INSERT INTO desk_join(id) VALUES(?)',id);
      }
      const stop=new Error('stop after observing the chosen application');
      try{await desk.joinTick520(now,{capture(item){applicationProbe=item.id;throw stop;}});}
      catch(error){if(error!==stop)throw error;}
    }
    return Response.json({now,before,after:cfg(),checked,roles,state,events,browser,applicationRank,applicationProbe,capped,projected,counts:total});
  }
}
async function measure(source){
  const script=source.replace('export default {','const originalWorker = {')+'\nexport '+RecruitmentBench.toString()+
    "\nexport default { fetch(req,env){return env.B.get(env.B.idFromName(new URL(req.url).pathname)).fetch(req);} }";
  const outbound=[];
  const mf=new Miniflare(convertV4MiniflareOptions({name:'recruitment-bench',script,modules:true,
    durableObjects:{B:{className:'RecruitmentBench',useSQLite:true}},compatibilityDate:'2026-10-10',
    outboundService:req=>{outbound.push(new URL(req.url).pathname);return new Response('unplanned public request',{status:500});}}));
  try{
    const results={};
    for(const name of Object.keys(cases)){
      const r=await mf.dispatchFetch('https://fixture.invalid/'+name);
      if(!r.ok)throw Error(name+' '+(await r.text()).slice(0,1000));
      results[name]=await r.json();
    }
    assert.deepEqual(outbound,[]);
    return results;
  }finally{await mf.dispose();}
}
test('only eligible evidence can reorder a normally due recruitment source',async t=>{
  const old=await measure(baseline),next=await measure(candidate);
  for(const [name,expected] of Object.entries(cases)){
    await t.test(name,()=>{
      const a=old[name],b=next[name];
      assert.equal(a.checked[0]?.id??null,expected===null?null:'ma');
      assert.deepEqual(b.checked.map(x=>x.id),expected?[expected]:[]);
      if(b.checked.length)assert.equal(b.checked[0].message.includes('募集調査を優先'),b.checked[0].id!==a.checked[0].id);
      assert.deepEqual(b.before,a.before);assert.deepEqual(b.after,a.after);
      assert.deepEqual(b.browser,[]);assert.deepEqual(b.events.map(e=>e.format),a.events.map(e=>e.format));
      assert.equal(b.events.length,expected?(name==='paidRule'?3:2):0);
      if(expected){
        assert.equal(b.events[0].route,'https://note.com/api/v1/magazines/'+expected);
        assert.equal(b.events[1].route,'https://note.com/'+(expected==='ma'?'edita':'editb')+'/m/'+expected);
        assert.equal(b.after.used,name==='resetDay'?1:b.before.used+1);assert.equal(b.after.due,b.now+15*60000);
        assert.equal(b.checked[0].due,b.now+7*86400000);
      }else assert.deepEqual(b.after,b.before);
      assert.deepEqual(b.roles,a.roles);assert.ok(b.roles.every(r=>!r.allowed&&!r.managed&&r.mode!=='auto'));
      assert.deepEqual(b.state,{jobs:0,targets:name==='alreadyKnown'?1:0,applications:0});
      assert.equal(b.applicationRank,a.applicationRank);assert.equal(b.applicationRank,'ma');
      if(name==='twoAuthors')assert.equal(b.applicationProbe,'ma');
      assert.ok(b.projected.maxBytes<=16384);
      if(name==='fourFull'){
        assert.deepEqual(b.capped,a.capped);assert.equal(b.capped.requests,0);assert.equal(b.capped.written,0);
        assert.equal(b.projected.issueQueries,1);assert.equal(b.projected.issues,4);
        assert.equal(b.projected.workQueries,1);assert.equal(b.projected.keys,20);
        assert.ok(b.projected.bytes<8192);
      }
      assert.equal(b.counts.written,a.counts.written);
    });
  }
  for(const gate of ['idleTurn','fourthTurn','onlyOne','blocked','stopped','quota','waiting'])
    assert.ok(next[gate].counts.read<=old[gate].counts.read,gate);
  assert.ok(next.twoAuthors.counts.read<=old.twoAuthors.counts.read+36);
  assert.ok(next.heavy.counts.read<=next.twoAuthors.counts.read+12);
  assert.ok(next.heavy.counts.sql<=next.twoAuthors.counts.sql+2);
  assert.ok(next.heavyRelevantCurator.counts.read<=old.heavyRelevantCurator.counts.read+36);
  t.diagnostic(JSON.stringify(Object.fromEntries(['twoAuthors','oneInOther','legacyAll','largeLegacyBase','largeRefreshed','fourFull','fourthTurn','onlyOne','quota','waiting','heavy','heavyRelevantCurator']
    .map(k=>[k,[old[k].counts,next[k].counts]]))));
  t.diagnostic(JSON.stringify({fourFullProjection:next.fourFull.projected,cappedThree:next.fourFull.capped}));
});
