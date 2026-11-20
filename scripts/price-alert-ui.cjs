'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const E=require('../src/engine.js');
(async()=>{
 const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiaodai-price-ui-'));
 const grid={mode:'arithmetic',anchor:'0.8',step:'0.02',count:4,quantity:'100'};grid.levels=E.generateLevels(grid);
 const seed={version:1,revision:1,isDemo:false,stocks:[{id:'test-etf',symbol:'512480',name:'测试 ETF',quote:'0.8',quoteAt:'2026-11-19T15:00',grid}],trades:[]};
 E.validateState(seed);fs.writeFileSync(path.join(dir,'ledger.json'),JSON.stringify(seed));
 let app,page,clock=Date.parse('2026-11-20T10:00:00+08:00'),errors=[];
 const read=()=>JSON.parse(fs.readFileSync(path.join(dir,'ledger.json'),'utf8'));
 const alerts=()=>JSON.parse(fs.readFileSync(path.join(dir,'price-alerts.json'),'utf8'));
 const launch=async()=>{
  app=await electron.launch({executablePath:process.env.GRID_TEST_EXE||require('electron'),args:[...(process.env.GRID_TEST_EXE?[]:[root]),'--user-data-dir='+path.join(dir,'profile')],env:{...process.env,XIAODAI_GRID_DATA_DIR:dir}});
  await app.evaluate(({app,Notification})=>{
   const require=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/main.cjs');
   const {MarketQuoteService}=require('./market-quotes.cjs');const {PriceAlertStore}=require('./price-alerts.cjs');
   for(const key of ['configure','resume','fetch']){const base=MarketQuoteService.prototype[key];MarketQuoteService.prototype[key]=function(...args){this.now=()=>new Date(global.__priceClock);this.random=()=>0;return base.apply(this,args);};}
   for(const key of ['upsert','evaluate','action','testEvent']){const base=PriceAlertStore.prototype[key];PriceAlertStore.prototype[key]=function(...args){this.now=()=>new Date(global.__priceClock);return base.apply(this,args);};}
   Notification.isSupported=()=>true;Notification.prototype.show=function(){global.__lastAlertNotification=this;this.emit('show');};
   const https=process.getBuiltinModule('https'),{EventEmitter}=process.getBuiltinModule('events');
   global.__priceCalls=0;
   https.get=(options,callback)=>{global.__priceCalls++;const req=new EventEmitter();req.destroy=()=>{};queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=200;res.headers={};res.resume=()=>{};callback(res);const f=Array(32).fill('');Object.assign(f,{1:'Test ETF',2:'512480',3:'0.820',30:'20261120100030'});res.emit('data',Buffer.from('v_sh512480="'+f.join('~')+'";'));res.emit('end');});return req;};
   global.__priceClock=Date.parse('2026-11-20T10:00:00+08:00');
  });
  page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date(clock-1000)});await page.clock.pauseAt(new Date(clock));await page.addInitScript(()=>{Math.random=()=>0;});await page.reload();await page.locator('h1').filter({hasText:'账本总览'}).waitFor();
 };
 try{
  await launch();
  await page.getByRole('button',{name:/价格提醒/}).first().click();
  await expect(page.getByRole('heading',{name:'价格提醒',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'添加价格提醒'}).last().click();
  await page.locator('#modal-form [name=target]').fill('0.820');
  await page.locator('#modal-form [name=note]').fill('自动测试');
  await page.locator('#modal-form button[type=submit]').click();
  assert.equal(alerts().rules.length,1);
  await page.getByRole('switch',{name:'自动更新行情'}).check();
  await page.locator('[data-action="navigate"][data-page="grids"]').click();
  await page.locator('[data-action="edit-stock"]').click();
  await page.locator('#modal-form [name=name]').fill('正在编辑的名称');
  clock+=60000;await app.evaluate((_e,t)=>{global.__priceClock=t;},clock);await page.clock.runFor(60000);
  await expect.poll(()=>read().stocks[0].quote).toBe('0.820');
  assert.equal(alerts().events.length,1);assert.equal(alerts().rules[0].enabled,false);
  assert.equal(await page.locator('#modal-form [name=name]').inputValue(),'正在编辑的名称');
  assert.equal(await page.locator('#modal-form [name=quote]').inputValue(),'0.8');
  await page.locator('#modal-form button[type=submit]').click();
  await expect.poll(()=>read().stocks[0].name).toBe('正在编辑的名称');
  assert.equal(read().stocks[0].quote,'0.820');
  await app.evaluate(()=>global.__lastAlertNotification.emit('click'));
  await expect(page.getByRole('heading',{name:'价格提醒',exact:true})).toBeVisible();
  await expect(page.locator('.alert-filters .primary')).toContainText('512480');
  await expect(page.getByText('已触发',{exact:true})).toBeVisible();
  fs.mkdirSync(path.join(root,'screenshots'),{recursive:true});await page.screenshot({path:path.join(root,'screenshots','alerts-v1.4.0.png'),fullPage:true});
  await page.locator('[data-action="read-alert"]').click();assert.ok(alerts().events[0].readAt);
  await page.locator('[data-action="test-alert"]').click();await expect.poll(()=>alerts().events.length).toBe(2);
  await app.close();app=null;await launch();await page.locator('[data-action="navigate"][data-page="alerts"]').click();
  assert.equal(alerts().events.length,2);assert.equal(alerts().rules[0].enabled,false);
  assert.deepEqual(errors,[]);
  console.log('PASS: isolated native alert UI, automatic quote while editing, one-shot notification history, preserved form and fresh price, read/test/restart.');
 }finally{if(app)await app.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
