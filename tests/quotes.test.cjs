'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../src/engine.js');
const Q=require('../src/quote-model.js');
const {MarketQuoteService,parseTencent,parseSina}=require('../market-quotes.cjs');
const now=()=>new Date('2026-11-13T08:01:00Z');
function tencent(key='sh512480',overrides={}){
  const f=Array(90).fill('');f[0]='1';f[1]='半导体ETF国联安';f[2]=key.slice(2);f[3]='0.793';f[30]='20261113150000';
  for(const [i,v] of Object.entries(overrides))f[Number(i)]=v;
  return `v_${key}="${f.join('~')}";`;
}
function sina(key='sh512480',overrides={}){
  const f=Array(33).fill('0');f[0]='半导体ETF国联安';f[3]='0.793';f[30]='2026-11-13';f[31]='15:00:00';
  for(const [i,v] of Object.entries(overrides))f[Number(i)]=v;
  return `var hq_str_${key}="${f.join(',')}";`;
}
function stock(id,symbol){return {id,symbol,name:'自定义名称',quote:'1.001',quoteAt:'2026-11-12T15:00',grid:{mode:'arithmetic',anchor:'1',step:'0.05',count:2,quantity:'100',levels:E.generateLevels({mode:'arithmetic',anchor:'1',step:'0.05',count:2,quantity:'100'})}};}
function state(){return {version:1,isDemo:false,stocks:[stock('s1','512480')],trades:[]};}
function quote(overrides={}){return {key:'sh512480',code:'512480',name:'半导体ETF国联安',price:'0.793',marketAt:'2026-11-13T15:00:00',source:'tencent',fetchedAt:now().toISOString(),...overrides};}
test('代码识别：上海 ETF 512480、深圳 A 股、创业板 ETF 和北交所',()=>{
 for(const [symbol,key] of [['512480','sh512480'],['sh512480','sh512480'],['512480.SH','sh512480'],['000001','sz000001'],['600000','sh600000'],['688001','sh688001'],['300750','sz300750'],['159915','sz159915'],['920001','bj920001'],['830799','bj830799'],[' 512480 ','sh512480']])assert.equal(Q.normalizeSymbol(symbol).key,key);
});
test('不猜测不支持的代码，也不接受任意 URL、混合市场或少于六位的代码',()=>{
 for(const s of ['DEMO01','12480','000001.SH','900001','https://example.com','sh512480.SZ','512480&x=x','1.512480',null])assert.throws(()=>Q.normalizeSymbol(s));
});
test('腾讯 GBK 解码后的安全字段解析，ETF 价格保留三位小数',()=>{const rows=parseTencent(tencent()+'\n'+tencent('sz000001',{1:'平安银行',3:'12.07'}));assert.equal(rows.size,2);assert.equal(rows.get('sh512480').price,'0.793');assert.equal(rows.get('sh512480').marketAt,'2026-11-13T15:00:00');assert.equal(rows.get('sz000001').name,'平安银行');});
test('连续同一行响应也能完整解析，不跳过相邻股票',()=>{assert.equal(parseTencent(tencent()+tencent('sz000001')).size,2);assert.equal(parseSina(sina()+sina('sz000001')).size,2);});
test('新浪逗号格式和日期时间正确，不执行响应里的脚本',()=>{const rows=parseSina(sina()+';throw new Error("不执行");');assert.equal(rows.get('sh512480').marketAt,'2026-11-13T15:00:00');assert.equal(rows.get('sh512480').name,'半导体ETF国联安');assert.equal(parseTencent('v_pv_none_match="1";').size,0);});
test('主来源成功时每批只请求一次，不额外请求备用来源',async()=>{const calls=[];const service=new MarketQuoteService({now,request:async(p,keys)=>{calls.push({source:p.source,keys});return tencent();}});const r=await service.fetch(['512480','512480.SH','DEMO01']);assert.equal(calls.length,1);assert.equal(r.results.length,1);assert.equal(r.invalid.length,1);assert.equal(r.results[0].price,'0.793');assert.equal(r.results[0].source,'tencent');assert.equal(r.results[0].fetchedAt,now().toISOString());});
test('部分成功仅为失败代码请求备用来源，返回成功的其他代码不丢失',async()=>{const calls=[];const service=new MarketQuoteService({now,request:async(p,keys)=>{calls.push([p.source,keys]);return p.source==='tencent'?tencent():sina('sz000001',{0:'平安银行',3:'12.07'});}});const r=await service.fetch(['512480','000001']);assert.equal(calls.length,2);assert.deepEqual(calls[1][1],['sz000001']);assert.equal(r.results[0].source,'tencent');assert.equal(r.results[1].source,'sina');});
test('断网与超时转备用，全部失败返回逐代码错误而非零价格',async()=>{const service=new MarketQuoteService({now,request:async()=>{throw new Error('连接超时');}});const r=await service.fetch(['512480']);assert.ok(r.results[0].error.includes('超时'));assert.equal(r.results[0].price,undefined);assert.equal(service.busy,false);});
test('价格为零、代码错配、坏时间或未来时间均不可入账',async()=>{
 for(const overrides of [{3:'0'},{3:'--'},{3:'Infinity'},{2:'000001'},{30:'20260230150000'},{30:'20261113156000'},{30:'20991113150000'}]){
  const service=new MarketQuoteService({now,request:async(p)=>p.source==='tencent'?tencent('sh512480',overrides):'var hq_str_sh512480="";'});
  const r=await service.fetch(['512480']);assert.ok(r.results[0].error,JSON.stringify(overrides));assert.equal(r.results[0].price,undefined);
 }
});
test('请求去重与 50 个代码分批，所有代码只发送到固定来源',async()=>{const sizes=[];const symbols=Array.from({length:101},(_,i)=>String(600000+i));const service=new MarketQuoteService({now,request:async(p,keys)=>{sizes.push(keys.length);assert.equal(p.hostname,'qt.gtimg.cn');return keys.map(k=>tencent(k)).join('');}});const r=await service.fetch(symbols);assert.equal(r.results.length,101);assert.deepEqual(sizes,[50,50,1]);});
test('并发重复点击不会并发请求，完成后允许再次手动请求',async()=>{let done;const service=new MarketQuoteService({now,request:()=>new Promise(r=>{done=r;})});const first=service.fetch(['512480']);await assert.rejects(service.fetch(['512480']),/正在进行/);done(tencent());await first;assert.equal(service.busy,false);});
test('更新仅改变参考价与来源时间，股票名称、成本、网格和成交均保持',()=>{const s=state(),original=JSON.parse(JSON.stringify(s)),r=Q.applyResults(s,[{id:'s1',symbol:'512480'}],[quote()]);assert.equal(r.updated.length,1);assert.equal(s.stocks[0].quote,'1.001');assert.equal(r.state.stocks[0].quote,'0.793');assert.equal(r.state.stocks[0].name,'自定义名称');assert.equal(r.state.stocks[0].quoteMeta.marketAt,'2026-11-13T15:00:00');assert.equal(r.state.stocks[0].quoteAt,'2026-11-13T15:00');assert.deepEqual(r.state.stocks[0].grid,original.stocks[0].grid);assert.deepEqual(r.state.trades,original.trades);E.validateState(r.state);});
test('失败和更早行情均保留原价格与原时间',()=>{const s=state();let r=Q.applyResults(s,[{id:'s1',symbol:'512480'}],[{key:'sh512480',error:'断网'}]);assert.equal(r.failed.length,1);assert.deepEqual(r.state,s);const latest=Q.applyResults(s,[{id:'s1',symbol:'512480'}],[quote()]).state;r=Q.applyResults(latest,[{id:'s1',symbol:'512480'}],[quote({marketAt:'2026-11-12T15:00:00'})]);assert.equal(r.failed.length,1);assert.deepEqual(r.state,latest);});
test('股票代码在请求期间改变时，不会把旧代码价格套给新股票',()=>{const s=state();s.stocks[0].symbol='600000';const r=Q.applyResults(s,[{id:'s1',symbol:'512480'}],[quote()]);assert.equal(r.failed.length,1);assert.equal(r.state.stocks[0].quote,'1.001');});
test('无今日行情时保存有效的原始行情日期，不伪造为请求日期',()=>{const r=Q.applyResults(state(),[{id:'s1',symbol:'512480'}],[quote({marketAt:'2026-11-12T15:00:00'})]);assert.equal(r.state.stocks[0].quoteAt,'2026-11-12T15:00');assert.equal(r.state.stocks[0].quoteMeta.fetchedAt,now().toISOString());});
test('JSON 备份保留接口元数据，旧版无元数据账本仍可加载',()=>{E.validateState(state());const next=Q.applyResults(state(),[{id:'s1',symbol:'512480'}],[quote()]).state;E.validateState(JSON.parse(JSON.stringify(next)));next.stocks[0].quoteMeta.marketAt='2026-11-13T99:00:00';assert.throws(()=>E.validateState(next),/行情时间/);});
