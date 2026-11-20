const {_electron:electron,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const E=require('../src/engine.js');
const Q=require('../src/quote-model.js');
(async()=>{
  const root=path.resolve(__dirname,'..'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'xiaodai-quote-ui-'));
  const screenshots=path.join(root,'screenshots');fs.mkdirSync(screenshots,{recursive:true});
  let app,page;const errors=[];
  const launch=async()=>{
    app=await electron.launch({executablePath:process.env.GRID_TEST_EXE||require('electron'),args:[...(process.env.GRID_TEST_EXE?[]:[root]),'--user-data-dir='+path.join(directory,'profile')],env:{...process.env,XIAODAI_GRID_DATA_DIR:directory}});
    page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.locator('h1').filter({hasText:'账本总览'}).waitFor();
    await app.evaluate(()=>{
      const https=process.getBuiltinModule('https');global.__quoteGet=https.get;global.__quoteRequests=0;
      https.get=(...args)=>{global.__quoteRequests++;return global.__quoteGet(...args);};
    });
  };
  const read=()=>JSON.parse(fs.readFileSync(path.join(directory,'ledger.json'),'utf8'));
  try{
    await launch();
    assert.equal(await app.evaluate(()=>global.__quoteRequests),0);
    await page.locator('[data-action="new-ledger"]').click();
    await page.locator('[data-action="confirm-new-ledger"]').click();
    await page.locator('input[name="symbol"]').fill('512480');
    await page.locator('[data-action="lookup-symbol"]').click();
    await expect(page.locator('input[name="name"]')).not.toHaveValue('');
    await expect(page.locator('[data-action="lookup-symbol"]')).toBeEnabled({timeout:22000});
    const fetchedPrice=await page.locator('input[name="quote"]').inputValue();
    assert.ok(E.D(fetchedPrice).gt(0));assert.match(fetchedPrice,/^\d+\.\d{3}$/);
    assert.match(await page.locator('#lookup-status').innerText(),/腾讯行情|新浪行情/);
    assert.equal(await page.locator('input[name="anchor"]').inputValue(),fetchedPrice);
    await page.screenshot({path:path.join(screenshots,'quote-lookup.png'),fullPage:true});
    await page.locator('#modal-form button[type="submit"]').click();
    await page.locator('#main-dialog').waitFor({state:'detached'});
    let ledger=read(),s=ledger.stocks[0];
    assert.equal(s.symbol,'512480');assert.equal(s.quote,fetchedPrice);Q.validateQuote({key:s.quoteMeta.key,code:s.symbol,name:s.quoteMeta.name,price:s.quote,source:s.quoteMeta.source,marketAt:s.quoteMeta.marketAt,fetchedAt:s.quoteMeta.fetchedAt});
    const originalGrid=JSON.stringify(s.grid);
    const networkBefore=await app.evaluate(()=>global.__quoteRequests);
    // A genuine provider request in the final desktop environment.
    await page.locator('[data-action="refresh-one"]').click();
    await expect.poll(()=>read().quoteRefresh?.updatedCount,{timeout:22000}).toBe(1);
    await expect(page.locator('[data-action="refresh-one"]')).toBeEnabled();
    ledger=read();assert.equal(JSON.stringify(ledger.stocks[0].grid),originalGrid);assert.equal(ledger.trades.length,0);
    assert.ok(await app.evaluate(()=>global.__quoteRequests)>networkBefore);
    await page.screenshot({path:path.join(screenshots,'quotes-grid.png'),fullPage:true});
    await page.locator('[data-action="navigate"][data-page="overview"]').first().click();
    const prior=JSON.parse(JSON.stringify(read().stocks[0]));
    // Make both providers fail. The user should see failure and retain exact prior values.
    await app.evaluate(()=>{
      const https=process.getBuiltinModule('https'),{EventEmitter}=process.getBuiltinModule('events');
      https.get=()=>{global.__quoteRequests++;const req=new EventEmitter();req.destroy=()=>{};queueMicrotask(()=>req.emit('error',new Error('测试断网')));return req;};
    });
    await page.locator('[data-action="refresh-all"]').click();
    await page.getByRole('heading',{name:'行情更新结果',exact:true}).waitFor();
    assert.match(await page.locator('.quote-failures').innerText(),/512480/);
    assert.deepEqual(read().stocks[0],prior);assert.equal(read().quoteRefresh.failedCount,1);
    await page.locator('[data-action="close-modal"]').first().click();
    // A successful older-date price is identified as non-today; the saved quote is not silently retimed.
    await app.evaluate(()=>{
      const https=process.getBuiltinModule('https'),{EventEmitter}=process.getBuiltinModule('events');
      https.get=(_options,callback)=>{global.__quoteRequests++;const req=new EventEmitter();req.destroy=()=>{};queueMicrotask(()=>{
        const res=new EventEmitter();res.statusCode=200;callback(res);const f=Array(90).fill('');f[0]='1';f[1]='ETF';f[2]='512480';f[3]='0.792';f[30]='20261112150000';
        res.emit('data',Buffer.from(`v_sh512480="${f.join('~')}";`));res.emit('end');
      });return req;};
    });
    await page.locator('[data-action="quote"]').first().click();
    await page.locator('input[name="quote"]').fill('0.791');
    await page.locator('#modal-form button[type="submit"]').click();
    await page.locator('#main-dialog').waitFor({state:'detached'});
    assert.equal(read().stocks[0].quoteMeta,undefined);
    await page.locator('[data-action="refresh-all"]').click();
    await expect.poll(()=>read().stocks[0].quote).toBe('0.792');
    await expect(page.locator('[data-action="refresh-all"]')).toBeEnabled();
    assert.equal(read().stocks[0].quoteAt,'2026-11-12T15:00');
    assert.ok((await page.locator('main').innerText()).includes('非今日行情'));
    await page.setViewportSize({width:1000,height:800});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(screenshots,'quotes-overview.png'),fullPage:true});
    // Restore the current price via the real API for the restart check.
    await app.evaluate(()=>{const https=process.getBuiltinModule('https');https.get=(...args)=>{global.__quoteRequests++;return global.__quoteGet(...args);};});
    await page.locator('[data-action="refresh-all"]').click();
    await expect.poll(()=>read().stocks[0].quoteAt.slice(0,10),{timeout:22000}).toBe(new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date()));
    await expect(page.locator('[data-action="refresh-all"]')).toBeEnabled();
    const persisted=read().stocks[0];await app.close();app=null;
    await launch();assert.deepEqual(read().stocks[0],persisted);
    assert.equal(await app.evaluate(()=>global.__quoteRequests),0);
    assert.ok((await page.locator('main').innerText()).includes('今日最近请求'));
    assert.equal(errors.length,0,errors.join('\n'));
    console.log('PASS: real 512480 lookup/name/three-decimal quote, default-grid seeding, single/all manual refresh, no startup polling, provider time/source persistence, offline preservation, stale-date labeling, narrow layout, restart.');
    console.log(JSON.stringify({testedAt:new Date().toISOString(),symbol:persisted.symbol,name:persisted.quoteMeta.name,price:persisted.quote,source:persisted.quoteMeta.source,marketAt:persisted.quoteMeta.marketAt}));
  }catch(error){
    const ledger=fs.existsSync(path.join(directory,'ledger.json'))?read():null;
    console.error('Isolated quote test diagnostics:',JSON.stringify({summary:ledger?.quoteRefresh,quoteMeta:ledger?.stocks?.[0]?.quoteMeta,failures:page?await page.locator('.quote-failures').allTextContents():[],errors}));throw error;
  }finally{if(app)await app.close();fs.rmSync(directory,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
