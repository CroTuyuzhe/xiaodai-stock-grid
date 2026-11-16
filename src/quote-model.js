(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./engine.js'));
  else root.QuoteModel=factory(root.GridEngine);
})(typeof globalThis!=='undefined'?globalThis:this,function(E){
  'use strict';
  const SOURCES={tencent:'腾讯行情',sina:'新浪行情',manual:'手动填写'};
  function normalizeSymbol(input){
    if(typeof input!=='string')throw new Error('请输入 6 位 A 股或场内 ETF 代码，例如 512480');
    const raw=input.trim().toLowerCase();
    const match=/^(?:(sh|sz|bj))?(\d{6})(?:\.(sh|sz|bj))?$/.exec(raw);
    if(!match||match[1]&&match[3]&&match[1]!==match[3])throw new Error('请输入 6 位 A 股或场内 ETF 代码，例如 512480');
    const code=match[2];
    const inferred=/^(?:60|68|5)/.test(code)?'sh':/^(?:00|30|1)/.test(code)?'sz':/^(?:4|8|92)/.test(code)?'bj':null;
    const market=match[1]||match[3]||inferred;
    if(!market||market!==inferred)throw new Error('该代码不属于当前支持的沪深北 A 股或场内 ETF 范围');
    return {code,market,key:market+code};
  }
  function validMarketTime(value){
    return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)&&E.validDate(value.slice(0,16))&&Number(value.slice(17))<60;
  }
  function validateQuote(q){
    if(!q||typeof q!=='object')throw new Error('行情返回内容无效');
    const normalized=normalizeSymbol(q.code);
    if(normalized.key!==q.key)throw new Error('行情代码与市场不一致');
    E.numeric(q.price,'接口价格',true);
    if(!SOURCES[q.source]||q.source==='manual')throw new Error('行情来源无效');
    if(!validMarketTime(q.marketAt))throw new Error('行情时间无效');
    if(typeof q.fetchedAt!=='string'||!Number.isFinite(Date.parse(q.fetchedAt)))throw new Error('请求时间无效');
    if(typeof q.name!=='string'||!q.name.trim()||q.name.length>50)throw new Error('接口股票名称无效');
    return q;
  }
  function metadata(q){validateQuote(q);return {source:q.source,marketAt:q.marketAt,fetchedAt:q.fetchedAt,name:q.name,key:q.key};}
  function applyResults(state,requested,results){
    const next=JSON.parse(JSON.stringify(state)),updated=[],failed=[];
    const resultByKey=new Map();
    for(const q of results){if(q&&q.key&&!resultByKey.has(q.key))resultByKey.set(q.key,q);}
    for(const request of requested){
      const stock=next.stocks.find(s=>s.id===request.id);
      if(!stock||stock.symbol!==request.symbol){failed.push({symbol:request.symbol,message:'请求期间股票代码已改变，未覆盖价格'});continue;}
      try{
        const normalized=normalizeSymbol(stock.symbol),q=resultByKey.get(normalized.key);
        if(!q)throw new Error('接口未返回该代码行情');
        if(q.error)throw new Error(q.error);
        validateQuote(q);
        let previousKey='';try{previousKey=normalizeSymbol(stock.symbol).key;}catch{}
        if(stock.quoteMeta&&stock.quoteMeta.source!=='manual'&&stock.quoteMeta.key===previousKey&&stock.quoteMeta.marketAt>q.marketAt)throw new Error('接口返回的行情比已保存行情更早，已保留原价格');
        stock.quote=q.price;stock.quoteAt=q.marketAt.slice(0,16);stock.quoteMeta=metadata(q);
        updated.push({id:stock.id,symbol:stock.symbol,name:stock.name,quote:q});
      }catch(e){failed.push({symbol:stock.symbol,message:e.message});}
    }
    return {state:next,updated,failed};
  }
  return {SOURCES,normalizeSymbol,validMarketTime,validateQuote,metadata,applyResults};
});
