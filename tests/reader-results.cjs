// Run with Playwright on NODE_PATH and a local Chromium executable.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const {chromium}=require('playwright');

test('the production reader probe separates a reader, anonymous likes, empty lists and inconsistent responses',async t=>{
  const source=fs.readFileSync(path.join(__dirname,'../worker.js'),'utf8');
  const names=['productionReaderProbe16920','BROWSER_SOURCES520','cleanCookie','noteIdentityJS','reachCount16933','noteReadHold16937','emptyReaderMessage'];
  const app=await import('data:text/javascript;base64,'+Buffer.from(source+'\nexport {'+names.join(',')+'};').toString('base64'));
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  t.after(()=>browser.close());
  const seed={key:'nfixture',owner:'writer'};
  const location='https://note.com/writer/n/nfixture',title='雨の日の手紙';
  const member=(id,urlname)=>({user:{id,urlname}});
  const list=(likes,total)=>({data:{likes,extra_fields:{like_count:total},is_last_page:true}});
  const cases={
    countDialog:{count:2,button:2,modal:'<a href="/reader">reader</a><a href="/reader2">reader 2</a>',expected:'read',clicks:1,lookups:0},
    countMismatch:{count:2,button:3,response:list([member(2,'reader'),member(3,'reader2')],2),expected:'read'},
    wrongHeading:{count:2,button:2,heading:'別の記事',response:list([member(2,'reader'),member(3,'reader2')],2),expected:'read'},
    duplicateControls:{count:2,button:2,duplicate:true,response:list([member(2,'reader'),member(3,'reader2')],2),expected:'read'},
    articleBody:{count:2,button:2,insideBody:true,response:list([member(2,'reader'),member(3,'reader2')],2),expected:'read'},
    missingControl:{count:2,response:list([member(2,'reader'),member(3,'reader2')],2),expected:'read'},
    onlyAnonymous:{count:1,response:list([{user:null}],1),expected:'empty',message:/匿名/},
    guestModal:{count:1,button:1,modal:'ゲストユーザー',expected:'empty',message:/匿名/,clicks:1,lookups:0},
    mixed:{count:2,response:list([{user:null},member(3,'reader')],2),expected:'read',message:/1人/},
    selfOnly:{count:1,response:list([member(1,'writer')],1),expected:'empty',message:/作者自身/},
    confirmedZero:{count:0,response:list([],0),expected:'empty',message:/空表示/},
    inconsistentZero:{count:2,response:list([],2),expected:'error',message:/count/},
    unequalTotals:{count:2,response:{data:{likes:[member(2,'reader')],extra_fields:{likeCount:1,like_count:2}}},expected:'error',message:/count/},
    zeroFromArticleOnly:{count:0,response:{data:{likes:[]}},expected:'empty',message:/記事情報/},
    inconsistentPositive:{count:1,response:list([member(2,'reader')],0),expected:'error',message:/count/},
    malformed:{count:1,response:{data:{likes:null}},expected:'error',message:/shape/},
    unavailable:{count:1,code:404,expected:'error',message:/HTTP 404/},
    rate:{count:1,code:429,expected:'hold'}
  };
  for(const [name,c] of Object.entries(cases))await t.test(name,async t=>{
    const context=await browser.newContext();
    t.after(()=>context.close());
    const page=await context.newPage();
    let requests=0;
    const unexpected=[];
    const pair='<div><button aria-label="スキする" aria-pressed="false" onclick="window.hearts++">♡</button>'+
      '<button aria-haspopup="dialog" onclick="window.opened++;document.querySelector(\'[role=dialog]\').hidden=false">'+c.button+'</button></div>';
    const controls=c.button==null?'':(c.insideBody?'<div data-testid="note-body">'+pair+'</div>':pair)+(c.duplicate?pair:'');
    const html='<meta charset="utf-8"><link rel="canonical" href="'+location+'"><main><article><h1>'+(c.heading||title)+'</h1>'+controls+'</article></main>'+
      '<div role="dialog" hidden><h2>スキした人</h2>'+(c.modal||'')+'</div><script>window.hearts=0;window.opened=0;</script>';
    await context.route('**/*',async route=>{
      const r=route.request();
      if(r.method()==='GET'&&r.url()===location)return route.fulfill({contentType:'text/html',body:html});
      if(r.method()==='GET'&&r.url()==='https://note.com/api/v3/notes/nfixture/likes'){
        requests++;return route.fulfill({status:c.code||200,contentType:'application/json',headers:c.code===429?{'Retry-After':'3600'}:{},body:JSON.stringify(c.response||{})});
      }
      unexpected.push([r.method(),r.url()]);return route.abort();
    });
    const io={command:async(method,args)=>{assert.equal(method,'Page.navigate');await page.goto(args.url);},
      evaluate:expr=>expr===app.noteIdentityJS?Promise.resolve({id:'42'}):page.evaluate(expr),blocked:()=>false};
    const dependencies={inNoteBrowser:async(_b,_cookie,_ed,fn)=>fn(io),pause520:async()=>{}};
    for(const key of names.slice(1))dependencies[key]=app[key];
    const probe=Function(...Object.keys(dependencies),'return ('+app.productionReaderProbe16920.toString()+')')(...Object.values(dependencies));
    const result=await probe({BROWSER:{},NOTE_SESSION:'fixture'},'42',seed,{...seed,name:title,user:{urlname:seed.owner},status:'published',likeCount:c.count,commentCount:0});
    if(c.expected==='hold'){assert.equal(result.code,429);assert.ok(result.hold>=3600000);}
    else {
      assert.equal(result.identity,true);
      assert.equal(result.readers,c.expected==='read');
      assert.equal(result.readerEmpty,c.expected==='empty');
      if(c.message)assert.match(result.readerMessage,c.message);
    }
    assert.deepEqual(await page.evaluate(()=>[window.hearts,window.opened]),[0,c.clicks||0]);
    assert.equal(requests,c.lookups??1);
    assert.deepEqual(unexpected,[]);
  });
});
