'use strict';
const https=require('node:https');
const Q=require('./src/quote-model.js');
const MAX_BYTES=2*1024*1024;
const PROVIDERS=[
  {source:'tencent',hostname:'qt.gtimg.cn',path:keys=>`/q=${keys.join(',')}`,referer:'https://stockapp.finance.qq.com/'},
  {source:'sina',hostname:'hq.sinajs.cn',path:keys=>`/list=${keys.join(',')}`,referer:'https://finance.sina.com.cn/'}
];
function download(provider,keys){
  return new Promise((resolve,reject)=>{
    let settled=false,req,timer;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
    req=https.get({hostname:provider.hostname,path:provider.path(keys),port:443,headers:{'User-Agent':'Mozilla/5.0 XiaodaiGrid/1.1.0','Referer':provider.referer,'Accept':'*/*'},timeout:7000},res=>{
      if(res.statusCode!==200){res.resume();finish(new Error(`接口返回 HTTP ${res.statusCode}`));return;}
      let size=0;const chunks=[];
      res.on('data',chunk=>{size+=chunk.length;if(size>MAX_BYTES){finish(new Error('行情响应过大'));req.destroy();return;}chunks.push(chunk);});
      res.on('error',error=>finish(error));
      res.on('end',()=>finish(null,new TextDecoder('gb18030').decode(Buffer.concat(chunks))));
    });
    timer=setTimeout(()=>{finish(new Error('行情接口连接超时'));req.destroy();},8500);
    req.on('timeout',()=>{finish(new Error('行情接口连接超时'));req.destroy();});
    req.on('error',error=>finish(error));
  });
}
function parseTencent(text){
  const records=new Map();
  for(const match of text.matchAll(/(?:^|(?<=[;\r\n]))\s*v_((?:sh|sz|bj)\d{6})="([^"\r\n]*)"\s*;/g)){
    const fields=match[2].split('~'),key=match[1],timestamp=fields[30]||'';
    if(fields[2]!==key.slice(2)||!/^\d{14}$/.test(timestamp))continue;
    const marketAt=`${timestamp.slice(0,4)}-${timestamp.slice(4,6)}-${timestamp.slice(6,8)}T${timestamp.slice(8,10)}:${timestamp.slice(10,12)}:${timestamp.slice(12,14)}`;
    records.set(key,{key,code:fields[2],name:fields[1],price:fields[3],marketAt});
  }
  return records;
}
function parseSina(text){
  const records=new Map();
  for(const match of text.matchAll(/(?:^|(?<=[;\r\n]))\s*var\s+hq_str_((?:sh|sz|bj)\d{6})="([^"\r\n]*)"\s*;/g)){
    const fields=match[2].split(','),key=match[1];
    if(fields.length<32)continue;
    records.set(key,{key,code:key.slice(2),name:fields[0],price:fields[3],marketAt:`${fields[30]}T${fields[31]}`});
  }
  return records;
}
class MarketQuoteService{
  constructor({request=download,now=()=>new Date()}={}){this.request=request;this.now=now;this.busy=false;}
  async fetch(symbols){
    if(!Array.isArray(symbols)||symbols.length<1||symbols.length>1000||symbols.some(s=>typeof s!=='string'||s.length>30))throw new Error('每次可查询 1 至 1000 个股票代码');
    if(this.busy)throw new Error('行情请求正在进行，请稍候');
    this.busy=true;
    try{
      const fetchedAt=this.now().toISOString(),unique=new Map(),invalid=[];
      for(const input of symbols){try{const n=Q.normalizeSymbol(input);unique.set(n.key,n);}catch(e){invalid.push({input,error:e.message});}}
      const keys=[...unique.keys()],found=new Map(),reasons=new Map();
      for(let offset=0;offset<keys.length;offset+=50){
        const batch=keys.slice(offset,offset+50);
        for(const provider of PROVIDERS){
          const needed=batch.filter(key=>!found.has(key));if(!needed.length)break;
          try{
            const text=await this.request(provider,needed);
            const parsed=provider.source==='tencent'?parseTencent(text):parseSina(text);
            for(const key of needed){
              try{
                const raw=parsed.get(key);if(!raw)throw new Error('代码不存在或接口未返回数据');
                const q={...raw,source:provider.source,fetchedAt};Q.validateQuote(q);
                if(Date.parse(`${q.marketAt}+08:00`)>this.now().getTime()+10*60*1000)throw new Error('接口行情时间晚于当前时间');
                found.set(key,q);
              }catch(e){reasons.set(key,e.message);}
            }
          }catch(e){for(const key of needed)reasons.set(key,/超时/.test(e.message)?'行情接口连接超时':'行情接口暂时不可用，请检查网络后重试');}
        }
      }
      const results=keys.map(key=>found.get(key)||{key,code:unique.get(key).code,error:reasons.get(key)||'暂无可用行情'});
      return {results,invalid,requestedAt:fetchedAt};
    }finally{this.busy=false;}
  }
}
module.exports={MarketQuoteService,download,parseTencent,parseSina,PROVIDERS};
