'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const E=require('../src/engine.js');
(async()=>{
 const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiaodai-auto-ui-'));
 const grid={mode:'arithmetic',anchor:'0.8',step:'0.02',count:4,quantity:'100',levels:[]};grid.levels=E.generateLevels(grid);
 const seed={version:1,revision:1,isDemo:false,stocks:[{id:'test-etf',symbol:'512480',name:'自动行情测试 ETF',quote:'0.8',quoteAt:'2026-11-19T15:00',grid}],trades:[]};
 E.validateState(seed);fs.writeFileSync(path.join(dir,'ledger.json'),JSON.stringify(seed));
 let app,page,clock=Date.parse('2026-11-20T10:00:00+08:00'),mode='good';const errors=[];
 const read=()=>JSON.parse(fs.readFileSync(path.join(dir,'ledger.json'),'utf8'));
 const prefs=()=>JSON.parse(fs.readFileSync(path.join(dir,'market-preferences.json'),'utf8'));
 const count=()=>app.evaluate(()=>global.__autoTestCalls);
 const setMode=async value=>{mode=value;await app.evaluate((_e,v)=>{global.__autoTestMode=v;},value);};
 const advance=async ms=>{clock+=ms;await app.evaluate((_e,t)=>{global.__autoTestTime=t;},clock);await page.clock.runFor(ms);};
 const launch=async()=>{
  app=await electron.launch({executablePath:process.env.GRID_TEST_EXE||require('electron'),args:[...(process.env.GRID_TEST_EXE?[]:[root]),'--user-data-dir='+path.join(dir,'profile')],env:{...process.env,XIAODAI_GRID_DATA_DIR:dir}});
  await app.evaluate(({app},config)=>{
   global.__autoTestTime=config.clock;global.__autoTestMode=config.mode;global.__autoTestCalls=0;
   const require=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/main.cjs');
   const {MarketQuoteService}=require('./market-quotes.cjs');
   for(const key of ['configure','resume','fetch']){const original=MarketQuoteService.prototype[key];MarketQuoteService.prototype[key]=function(...args){this.now=()=>new Date(global.__autoTestTime);this.random=()=>0;return original.apply(this,args);};}
   const https=process.getBuiltinModule('https'),{EventEmitter}=process.getBuiltinModule('events');
   https.get=(options,callback)=>{
    global.__autoTestCalls++;const req=new EventEmitter();req.destroy=()=>{};
    queueMicrotask(()=>{
     if(global.__autoTestMode==='offline'){req.emit('error',new Error('simulated offline'));return;}
     const res=new EventEmitter();res.statusCode=global.__autoTestMode==='limited'?429:200;res.headers={};res.resume=()=>{};callback(res);
     if(res.statusCode===200){const keys=options.path.split('=')[1].split(',');const body=keys.map(key=>{const f=Array(32).fill('');Object.assign(f,{1:'Test ETF',2:key.slice(2),3:'0.793',30:'20261120100000'});return `v_${key}="${f.join('~')}";`;}).join('');res.emit('data',Buffer.from(body));res.emit('end');}
    });return req;
   };
  },{clock,mode});
  page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date(clock-1000)});await page.clock.pauseAt(new Date(clock));
  await page.addInitScript(()=>{Math.random=()=>0;});
  await page.reload();await page.locator('h1').filter({hasText:'账本总览'}).waitFor();
 };
 try{
  await launch();await expect(page.getByRole('switch',{name:'自动更新行情'})).not.toBeChecked();
  await advance(120000);assert.equal(await count(),0);
  await page.getByRole('switch',{name:'自动更新行情'}).check();await expect.poll(()=>prefs().autoEnabled).toBe(true);await expect(page.locator('.auto-market-status')).toContainText('下次预计');
  await advance(59000);assert.equal(await count(),0);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].minimize());
  await advance(1000);await expect.poll(()=>read().stocks[0].quote).toBe('0.793');
  assert.equal(await count(),1);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMinimized()),true);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].restore());
  await expect(page.locator('[data-action="refresh-all"]')).toBeEnabled();
  assert.deepEqual(read().stocks[0].grid,grid);assert.deepEqual(read().trades,[]);
  await page.getByRole('switch',{name:'自动更新行情'}).uncheck();await expect.poll(()=>prefs().autoEnabled).toBe(false);
  await advance(180000);assert.equal(await count(),1);
  await page.getByRole('switch',{name:'自动更新行情'}).check();await setMode('offline');
  await advance(60000);await expect.poll(()=>prefs().failures).toBe(1);assert.equal(prefs().nextAllowedAt-clock,120000);
  await expect(page.locator('.auto-market-status')).toContainText('已降低更新频率');assert.equal(read().stocks[0].quote,'0.793');
  await app.close();app=null;await launch();await expect(page.getByRole('switch',{name:'自动更新行情'})).toBeChecked();
  await advance(119000);assert.equal(await count(),0);await advance(1000);await expect.poll(()=>prefs().failures).toBe(2);assert.equal(await count(),2);assert.equal(prefs().nextAllowedAt-clock,300000);
  await setMode('limited');await advance(300000);await page.getByRole('heading',{name:'行情接口访问受限',exact:true}).waitFor();assert.equal(await count(),3);assert.equal(prefs().restriction.statusCode,429);
  await page.locator('[data-action="close-modal"]').first().click();await page.locator('[data-action="refresh-all"]').click();assert.equal(await count(),3);
  await page.getByRole('switch',{name:'自动更新行情'}).uncheck();await page.getByRole('switch',{name:'自动更新行情'}).check();assert.equal(prefs().restriction.statusCode,429);
  const shots=path.join(root,'screenshots','v'+require('../package.json').version);fs.mkdirSync(shots,{recursive:true});
  await page.setViewportSize({width:960,height:850});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(shots,'auto-quotes-restricted-960.png'),fullPage:true});
  await app.close();app=null;await launch();await page.getByRole('heading',{name:'行情接口访问受限',exact:true}).waitFor();assert.equal(await count(),0);
  await page.locator('[data-action="close-modal"]').first().click();await page.locator('[data-action="resume-market"]').click();await expect(page.locator('#toast')).toContainText('冷却');assert.equal(prefs().restriction.statusCode,429);
  await advance(960000);assert.equal(await count(),0);await setMode('good');
  await page.locator('[data-action="resume-market"]').click();await expect.poll(()=>prefs().restriction).toBe(null);
  await advance(60000);await expect.poll(()=>count()).toBe(1);await expect.poll(()=>prefs().failures).toBe(0);await expect(page.locator('[data-action="refresh-all"]')).toBeEnabled();
  await page.setViewportSize({width:1440,height:960});await page.screenshot({path:path.join(shots,'auto-quotes-enabled.png'),fullPage:true});
  await page.getByRole('switch',{name:'自动更新行情'}).uncheck();await app.close();app=null;await launch();await expect(page.getByRole('switch',{name:'自动更新行情'})).not.toBeChecked();await advance(120000);assert.equal(await count(),0);
  assert.deepEqual(read().stocks[0].grid,grid);assert.deepEqual(read().trades,[]);assert.deepEqual(errors,[]);
  console.log('PASS: default off, persisted switch, 60s automatic quote, minimized refresh, manual cooldown, 2/5min failure backoff, restart, 429 prompt/pause, toggle protection, guarded manual resume, 960px layout, unchanged grid/trades. All prices mocked and ledger isolated.');
 }finally{if(app)await app.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exit(1);});
