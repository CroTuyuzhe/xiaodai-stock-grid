'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const E=require('./src/engine.js'),Q=require('./src/quote-model.js');
const blank=()=>({version:1,revision:0,rules:[],events:[],checks:{}});
const clone=value=>JSON.parse(JSON.stringify(value));
const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const positive=value=>{E.numeric(value,'提醒价格',true);return E.D(value).toString();};
const beijingDay=time=>new Date(time+8*3600000).toISOString().slice(0,10);
function validBook(book){
 if(!book||book.version!==1||!Number.isSafeInteger(book.revision)||book.revision<0||!Array.isArray(book.rules)||!Array.isArray(book.events)||!book.checks||typeof book.checks!=='object'||Array.isArray(book.checks))throw new Error('价格提醒文件格式无效');
 const ids=new Set();
 for(const r of book.rules){
  if(!r||typeof r.id!=='string'||ids.has(r.id)||typeof r.stockId!=='string'||typeof r.name!=='string'||typeof r.note!=='string'||r.note.length>120||!['gte','lte'].includes(r.condition)||typeof r.enabled!=='boolean'||!stamp(r.armedAt)||!stamp(r.createdAt)||typeof r.token!=='string'||Q.normalizeSymbol(r.symbol).key!==r.key)throw new Error('价格提醒规则无效');
  positive(r.target);ids.add(r.id);
 }
 const events=new Set();
 for(const e of book.events){if(!e||typeof e.id!=='string'||events.has(e.id)||!['price','test'].includes(e.kind)||!stamp(e.triggeredAt)||!['pending','submitted','failed','unsupported','unknown'].includes(e.delivery)||e.readAt!==null&&!stamp(e.readAt))throw new Error('提醒历史格式无效');events.add(e.id);}
 return book;
}
function quoteFreshness(q,now){
 try{
  Q.validateQuote(q);
  const fetched=Date.parse(q.fetchedAt),market=Date.parse(q.marketAt+'+08:00');
  if(now-fetched>120000||fetched-now>30000)return '请求时间已过期或异常';
  if(beijingDay(now)!==q.marketAt.slice(0,10)||now-market>180000||market-now>30000)return '行情不是最近三分钟内的有效报价';
  return '';
 }catch(e){return e.message;}
}
class PriceAlertStore{
 constructor(directory,{now=()=>new Date()}={}){this.directory=directory;this.file=path.join(directory,'price-alerts.json');this.now=now;this.book=blank();}
 load(){
  if(!fs.existsSync(this.file))return this.snapshot();
  try{this.book=validBook(JSON.parse(fs.readFileSync(this.file,'utf8').replace(/^\uFEFF/,'')));}
  catch{throw new Error('价格提醒文件无法读取。为保留原记录，提醒检查已停止；账本仍可使用。请保留 price-alerts.json 后检查。');}
  return this.snapshot();
 }
 snapshot(){return clone(this.book);}
 change(fn){
  const next=this.snapshot(),result=fn(next);
  if(JSON.stringify(next)===JSON.stringify(this.book))return result;
  next.revision=this.book.revision+1;validBook(next);
  fs.mkdirSync(this.directory,{recursive:true});const temporary=this.file+'.tmp',handle=fs.openSync(temporary,'w');
  try{fs.writeFileSync(handle,JSON.stringify(next,null,2),'utf8');fs.fsyncSync(handle);}finally{fs.closeSync(handle);}
  fs.renameSync(temporary,this.file);this.book=next;return result;
 }
 upsert(input,ledger){
  if(!input||typeof input!=='object')throw new Error('提醒设置无效');
  const stock=ledger?.stocks.find(s=>s.id===input.stockId);if(!stock)throw new Error('请选择当前账本中的股票');
  const n=Q.normalizeSymbol(stock.symbol),target=positive(input.target);
  if(!['gte','lte'].includes(input.condition)||typeof input.enabled!=='boolean')throw new Error('请选择提醒条件与启用状态');
  const note=String(input.note||'').trim();if(note.length>120)throw new Error('提醒备注最多 120 字');
  const at=this.now().toISOString();
  this.change(book=>{
   const old=input.id&&book.rules.find(r=>r.id===input.id);
   if(input.id&&!old)throw new Error('这条提醒已不存在');
   if(!old&&book.rules.length>=200)throw new Error('最多可保存 200 条价格提醒');
   const rule={id:old?.id||randomUUID(),stockId:stock.id,symbol:n.code,key:n.key,name:stock.name,condition:input.condition,target,note,enabled:input.enabled,createdAt:old?.createdAt||at,armedAt:at,token:randomUUID(),triggeredAt:null,lastMarketAt:null};
   if(old)book.rules[book.rules.indexOf(old)]=rule;else book.rules.push(rule);
  });return this.snapshot();
 }
 action(id,action,ledger){
  this.change(book=>{
   const rule=book.rules.find(r=>r.id===id);if(!rule)throw new Error('这条提醒已不存在');
   if(action==='delete'){book.rules=book.rules.filter(r=>r.id!==id);return;}
   if(action==='pause'){rule.enabled=false;return;}
   if(action!=='rearm')throw new Error('提醒操作无效');
   const stock=ledger?.stocks.find(s=>s.id===rule.stockId);if(!stock||Q.normalizeSymbol(stock.symbol).key!==rule.key)throw new Error('股票代码已更改，请重新创建提醒');
   rule.enabled=true;rule.triggeredAt=null;rule.lastMarketAt=null;rule.armedAt=this.now().toISOString();rule.token=randomUUID();
  });return this.snapshot();
 }
 reconcile(ledger,{reset=false}={}){
  this.change(book=>{
   if(reset){Object.assign(book,{rules:[],events:[],checks:{}});return;}
   const stocks=new Map((ledger?.stocks||[]).map(s=>[s.id,s]));
   book.rules=book.rules.filter(r=>{try{return stocks.has(r.stockId)&&Q.normalizeSymbol(stocks.get(r.stockId).symbol).key===r.key;}catch{return false;}});
   for(const r of book.rules)r.name=stocks.get(r.stockId).name;
   for(const id of Object.keys(book.checks)){const s=stocks.get(id);if(!s||book.checks[id].symbol!==s.symbol)delete book.checks[id];}
  });return this.snapshot();
 }
 evaluate(ledger,requested,results,requestRules){
  const at=this.now().toISOString(),now=Date.parse(at),triggered=[];
  const resultMap=new Map((results||[]).filter(q=>q&&q.key).map(q=>[q.key,q]));
  const allowed=new Map(requestRules.map(r=>[r.id,r.token]));
  this.change(book=>{
   for(const request of requested){
    const stock=ledger?.stocks.find(s=>s.id===request.id);if(!stock||stock.symbol!==request.symbol)continue;
    let n;try{n=Q.normalizeSymbol(stock.symbol);}catch{continue;}
    const q=resultMap.get(n.key),previous=book.checks[stock.id]||{};
    const issue=!q?'接口未返回有效报价':q.error||quoteFreshness(q,now)||(stock.quoteMeta?.source!=='manual'&&stock.quoteMeta?.key===n.key&&stock.quoteMeta.marketAt>q.marketAt?'行情早于已保存价格':'');
    book.checks[stock.id]={...previous,symbol:stock.symbol,attemptedAt:at,status:issue?(q&&!q.error?'stale':'failed'):'fresh',message:issue||''};
    if(issue)continue;
    Object.assign(book.checks[stock.id],{checkedAt:at,marketAt:q.marketAt,price:q.price});
    for(const rule of book.rules.filter(r=>r.enabled&&r.stockId===stock.id&&r.key===n.key&&allowed.get(r.id)===r.token)){
     if(rule.lastMarketAt&&rule.lastMarketAt>=q.marketAt)continue;
     rule.lastMarketAt=q.marketAt;
     const matched=rule.condition==='gte'?E.D(q.price).gte(rule.target):E.D(q.price).lte(rule.target);
     if(!matched)continue;
     const event={id:randomUUID(),kind:'price',ruleId:rule.id,stockId:stock.id,symbol:n.code,name:stock.name,condition:rule.condition,target:rule.target,price:q.price,marketAt:q.marketAt,fetchedAt:q.fetchedAt,triggeredAt:at,note:rule.note,readAt:null,delivery:'pending',deliveryMessage:''};
     rule.enabled=false;rule.triggeredAt=at;book.events.unshift(event);triggered.push(clone(event));
    }
   }
  });return triggered;
 }
 testEvent(){
  const event={id:randomUUID(),kind:'test',triggeredAt:this.now().toISOString(),stockId:'',symbol:'',name:'系统通知测试',readAt:null,delivery:'pending',deliveryMessage:''};
  this.change(book=>book.events.unshift(event));return clone(event);
 }
 delivery(ids,status,message=''){
  if(!['submitted','failed','unsupported','unknown'].includes(status))throw new Error('通知状态无效');
  this.change(book=>{for(const e of book.events.filter(e=>ids.includes(e.id))){if(e.delivery==='pending'||e.delivery==='unknown'||status==='failed'&&e.delivery==='submitted'){e.delivery=status;e.deliveryMessage=String(message).slice(0,300);}}});return this.snapshot();
 }
 read(id){this.change(book=>{for(const e of book.events){if(!e.readAt&&(!id||e.id===id))e.readAt=this.now().toISOString();}});return this.snapshot();}
}
module.exports={PriceAlertStore,quoteFreshness,validBook};
