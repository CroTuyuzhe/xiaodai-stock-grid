'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {PriceAlertStore}=require('../price-alerts.cjs');
const {PriceNotifications}=require('../price-notifications.cjs');
const {EventEmitter}=require('node:events');
const stock={id:'demo-stock',symbol:'512480',name:'测试 ETF',quote:'0.8',quoteMeta:null},ledger={stocks:[stock],trades:[]};
const at=Date.parse('2026-11-20T02:00:00Z');
const quote=(price,marketAt='2026-11-20T10:00:00',fetchedAt=new Date(at).toISOString())=>({code:'512480',key:'sh512480',name:'测试 ETF',price,marketAt,fetchedAt,source:'tencent'});
function store(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xiaodai-alert-test-')),alerts=new PriceAlertStore(dir,{now:()=>new Date(at)});t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {alerts,dir};}
test('decimal equality, one-shot, restart and explicit rearm',t=>{
 const {alerts,dir}=store(t);const rule=alerts.upsert({stockId:stock.id,condition:'gte',target:'0.820',enabled:true},ledger).rules[0];
 let armed=[{id:rule.id,token:rule.token}];
 assert.equal(alerts.evaluate(ledger,[{id:stock.id,symbol:stock.symbol}],[quote('0.819')],armed).length,0);
 assert.equal(alerts.evaluate(ledger,[{id:stock.id,symbol:stock.symbol}],[quote('0.820','2026-11-20T10:00:01')],armed).length,1);
 assert.equal(alerts.evaluate(ledger,[{id:stock.id,symbol:stock.symbol}],[quote('0.900','2026-11-20T10:00:02')],armed).length,0);
 const restarted=new PriceAlertStore(dir,{now:()=>new Date(at+1000)});assert.equal(restarted.load().events.length,1);
 restarted.action(rule.id,'rearm',ledger);armed=[{id:rule.id,token:restarted.snapshot().rules[0].token}];
 assert.equal(restarted.evaluate(ledger,[{id:stock.id,symbol:stock.symbol}],[quote('0.820','2026-11-20T10:00:03',new Date(at+1000).toISOString())],armed).length,1);
 assert.equal(restarted.snapshot().events.length,2);
});
test('below condition, old and failed quotes, wrong stock, no stale token or manual trigger',t=>{
 const {alerts}=store(t);const rule=alerts.upsert({stockId:stock.id,condition:'lte',target:'0.800',enabled:true},ledger).rules[0];
 const run=(value,req={id:stock.id,symbol:stock.symbol},tokens=[{id:rule.id,token:rule.token}])=>alerts.evaluate(ledger,[req],[value],tokens);
 assert.equal(run(quote('0.799','2026-11-19T15:00:00')).length,0);
 assert.equal(run({...quote('0.799'),error:'网络错误'}).length,0);
 assert.equal(run(quote('0.799'),{id:stock.id,symbol:'600000'}).length,0);
 assert.equal(run(quote('0.799'),undefined,[{id:rule.id,token:'old'}]).length,0);
 assert.equal(run(quote('0.800')).length,1);
 assert.equal(alerts.snapshot().checks[stock.id].price,'0.800');
});
test('stock code change and deletion remove rules; importing can reset history',t=>{
 const {alerts}=store(t);alerts.upsert({stockId:stock.id,condition:'gte',target:'0.8',enabled:true},ledger);
 alerts.evaluate(ledger,[{id:stock.id,symbol:stock.symbol}],[quote('0.8')],alerts.snapshot().rules);
 assert.equal(alerts.snapshot().events.length,1);
 alerts.reconcile({stocks:[{...stock,symbol:'600000'}]});assert.equal(alerts.snapshot().rules.length,0);
 assert.equal(alerts.snapshot().events.length,1);
 alerts.reconcile(ledger,{reset:true});assert.equal(alerts.snapshot().events.length,0);
});
test('malformed reminder file is not overwritten',t=>{
 const {alerts,dir}=store(t);fs.writeFileSync(path.join(dir,'price-alerts.json'),'{broken');
 assert.throws(()=>alerts.load(),/无法读取/);assert.equal(fs.readFileSync(path.join(dir,'price-alerts.json'),'utf8'),'{broken');
});
test('notification outcomes and click navigate without assuming delivery',()=>{
 class FakeNotification extends EventEmitter{static isSupported(){return true;} constructor(options){super();this.options=options;FakeNotification.last=this;}show(){this.emit('show');}}
 let delivered=[],clicked=[],registered=0;
 const notifications=new PriceNotifications({Notification:FakeNotification,register:()=>registered++,onDelivery:(ids,status)=>delivered.push([ids,status]),onClick:(stockId,ids)=>clicked.push([stockId,ids]),setTimer:()=>1,clearTimer:()=>{}});
 notifications.send([{id:'event',kind:'price',stockId:'demo-stock',symbol:'512480',name:'测试 ETF',price:'0.82',target:'0.82',condition:'gte',marketAt:'2026-11-20T10:00:00'}]);
 assert.equal(FakeNotification.last.options.title,'测试 ETF（512480）价格提醒');
 assert.deepEqual(delivered,[[['event'],'submitted']]);assert.equal(registered,1);
 FakeNotification.last.emit('click');assert.deepEqual(clicked,[['demo-stock',['event']]]);
});
test('unsupported and failed notifications retain the in-app event without retries',()=>{
 let outcomes=[];
 class Unsupported{static isSupported(){return false;}}
 new PriceNotifications({Notification:Unsupported,onDelivery:(_ids,status)=>outcomes.push(status)}).send([{id:'one',kind:'test'}]);
 class Failing extends EventEmitter{static isSupported(){return true;}show(){this.emit('failed',null,'blocked');}}
 new PriceNotifications({Notification:Failing,onDelivery:(_ids,status)=>outcomes.push(status),setTimer:()=>1,clearTimer:()=>{}}).send([{id:'two',kind:'test'}]);
 assert.deepEqual(outcomes,['unsupported','failed']);
});
test('a delayed notification failure overrides submitted, never read status',t=>{
 const {alerts}=store(t);const event=alerts.testEvent();
 alerts.delivery([event.id],'submitted');alerts.delivery([event.id],'failed','Windows 拒绝通知');
 assert.equal(alerts.snapshot().events[0].delivery,'failed');
 assert.equal(alerts.snapshot().events[0].readAt,null);
});
