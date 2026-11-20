'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const E=require('../src/engine.js');
(async()=>{
 const root=path.resolve(__dirname,'..'),temporaryRoot=fs.realpathSync(os.tmpdir());
 const dir=fs.mkdtempSync(path.join(temporaryRoot,'xiaodai-native-auto-'));
 const grid={mode:'arithmetic',anchor:'0.8',step:'0.02',count:4,quantity:'100',levels:[]};grid.levels=E.generateLevels(grid);
 const seed={version:1,revision:1,isDemo:false,stocks:[{id:'test-native',symbol:'512480',name:'原生计时测试 ETF',quote:'0.8',quoteAt:'2026-11-19T15:00',grid}],trades:[]};
 E.validateState(seed);fs.writeFileSync(path.join(dir,'ledger.json'),JSON.stringify(seed));
 const baseline=Date.parse('2026-11-20T10:00:00+08:00'),errors=[];
 let app,page,probe;
 const read=()=>JSON.parse(fs.readFileSync(path.join(dir,'ledger.json'),'utf8'));
 const prefs=()=>JSON.parse(fs.readFileSync(path.join(dir,'market-preferences.json'),'utf8'));
 const count=()=>app.evaluate(()=>global.__nativeQuoteCalls);
 const launch=async()=>{
  app=await electron.launch({executablePath:process.env.GRID_TEST_EXE||require('electron'),args:[...(process.env.GRID_TEST_EXE?[]:[root]),'--user-data-dir='+path.join(dir,'profile')],env:{...process.env,XIAODAI_GRID_DATA_DIR:dir}});
  await app.evaluate(({app},time)=>{
   const started=Date.now();global.__nativeQuoteCalls=0;
   const require=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/main.cjs');
   const {MarketQuoteService}=require('./market-quotes.cjs');
   for(const key of ['configure','resume','fetch']){const original=MarketQuoteService.prototype[key];MarketQuoteService.prototype[key]=function(...args){this.now=()=>new Date(time+Date.now()-started);this.random=()=>0;return original.apply(this,args);};}
   const https=process.getBuiltinModule('https'),{EventEmitter}=process.getBuiltinModule('events');
   https.get=(options,callback)=>{
    global.__nativeQuoteCalls++;const req=new EventEmitter();req.destroy=()=>{};
    queueMicrotask(()=>{
     const res=new EventEmitter();res.statusCode=200;res.headers={};res.resume=()=>{};callback(res);
     const body=options.path.split('=')[1].split(',').map(key=>{const fields=Array(32).fill('');Object.assign(fields,{1:'Native Timer ETF',2:key.slice(2),3:'0.793',30:'20261120100100'});return `v_${key}="${fields.join('~')}";`;}).join('');
     res.emit('data',Buffer.from(body));res.emit('end');
    });return req;
   };
  },baseline);
  page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));
  // Move only wall time into a trading session. Keep Chromium's original timers.
  await page.addInitScript(time=>{
   const NativeDate=Date,started=performance.now();
   window.Date=class extends NativeDate{
    constructor(...args){super(...(args.length?args:[time+performance.now()-started]));}
    static now(){return time+performance.now()-started;}
   };
   Math.random=()=>0;
   window.__originalTimers={set:setTimeout,clear:clearTimeout};
  },baseline);
  await page.reload();await page.getByRole('heading',{name:'账本总览',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>setTimeout===__originalTimers.set&&clearTimeout===__originalTimers.clear&&Function.prototype.toString.call(setTimeout).includes('[native code]')),true);
 };
 const healthy=async()=>{
  await expect(page.locator('.auto-market-status')).toContainText('下次预计');
  assert.equal(await page.locator('#toast').evaluate(el=>el.classList.contains('error')),false);
  assert.deepEqual(errors,[]);
 };
 try{
  await launch();await expect(page.getByRole('switch',{name:'自动更新行情'})).not.toBeChecked();assert.equal(await count(),0);
  probe=await page.evaluate(()=>{
   const loop=new AutoQuotes.Loop({getStatus:()=>({autoEnabled:true}),isEligible:()=>true,refresh:async()=>{}});
   try{loop.sync();loop.stop();return {ok:true};}catch(error){return {ok:false,message:error.message,stack:error.stack};}
  });
  if(!probe.ok)console.log('Native timer reproduction:',JSON.stringify(probe));
  await page.getByRole('switch',{name:'自动更新行情'}).check();await expect.poll(()=>prefs().autoEnabled).toBe(true);await healthy();assert.equal(probe.ok,true);
  await page.getByRole('switch',{name:'自动更新行情'}).uncheck();await expect.poll(()=>prefs().autoEnabled).toBe(false);await expect(page.locator('.auto-market-status')).toContainText('默认关闭');
  for(let attempt=0;attempt<3;attempt++){
   await page.getByRole('switch',{name:'自动更新行情'}).check();await healthy();
   await page.getByRole('switch',{name:'自动更新行情'}).uncheck();await expect.poll(()=>prefs().autoEnabled).toBe(false);
  }
  assert.equal(await count(),0);
  await page.getByRole('switch',{name:'自动更新行情'}).check();await healthy();await app.close();app=null;
  await launch();await expect(page.getByRole('switch',{name:'自动更新行情'})).toBeChecked();await healthy();assert.equal(await count(),0);
  console.log('PASS: original Chromium timers, enable/disable/repeated toggles, persisted enabled restart. Waiting for one real 60-second scheduled round.');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].minimize());
  await expect.poll(()=>count(),{timeout:75000,intervals:[1000]}).toBe(1);
  await expect.poll(()=>read().stocks[0].quote).toBe('0.793');
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMinimized()),true);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].restore());await healthy();
  await page.getByRole('switch',{name:'自动更新行情'}).uncheck();await expect.poll(()=>prefs().autoEnabled).toBe(false);
  assert.deepEqual(read().stocks[0].grid,grid);assert.deepEqual(read().trades,[]);assert.deepEqual(errors,[]);
  await app.close();app=null;await launch();await expect(page.getByRole('switch',{name:'自动更新行情'})).not.toBeChecked();assert.equal(await count(),0);assert.deepEqual(errors,[]);
  console.log('PASS: one native 60-second automatic quote while minimized, cancellation, disabled restart, unchanged grid/trades. Quotes mocked; all data isolated.');
 }catch(error){
  if(page&&!page.isClosed())console.error('Native regression diagnostics:',JSON.stringify({probe,errors,ui:await page.evaluate(()=>({toast:document.querySelector('#toast')?.textContent,status:document.querySelector('.auto-market-status')?.textContent}))}));
  throw error;
 }finally{
  if(app)await app.close();
  const resolved=fs.realpathSync(dir);
  if(path.dirname(resolved)!==temporaryRoot||!path.basename(resolved).startsWith('xiaodai-native-auto-'))throw new Error('Unexpected test cleanup path');
  fs.rmSync(resolved,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exit(1);});