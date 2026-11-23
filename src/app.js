'use strict';
const E = GridEngine;
const Q = QuoteModel;
const $ = (q,root=document) => root.querySelector(q);
const $$ = (q,root=document) => [...root.querySelectorAll(q)];
const esc = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => crypto.randomUUID();
const copy = value => JSON.parse(JSON.stringify(value));
const localNow = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T');
const cash = (n,d=2) => { if(n==null)return '—'; const [whole,fraction]=E.D(n).toFixed(d).split('.');return whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(fraction==null?'':'.'+fraction); };
const price = n => n == null ? '—' : E.D(n).toFixed(3);
const qty = n => { const [whole,fraction]=E.D(n||0).toDecimalPlaces(8).toFixed().split('.'); return whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(fraction?'.'+fraction:''); };
const signed = n => n == null ? '—' : `${E.D(n).gt(0)?'+':''}${cash(n)}`;
const tone = n => n == null ? '' : E.D(n).gt(0) ? 'profit' : E.D(n).lt(0) ? 'loss' : '';
const shortDate = d => d.replace('T',' ');
const ICONS = {
  overview:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  grids:'<path d="M3 6h18M3 12h18M3 18h18M7 3v18M17 3v18"/>',
  trades:'<path d="M7 3h10l3 3v15H4V3h3zM8 8h8M8 12h8M8 16h5"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  report:'<path d="M4 20V4M4 20h17M8 15l4-5 4 3 5-8"/>',
  guide:'<path d="M12 21V5M12 5C9 2 5 2 2 4v15c3-2 7-2 10 1 3-3 7-3 10-1V4c-3-2-7-2-10 1z"/>',
  settings:'<path d="M4 7h16M4 17h16M8 4v6M16 14v6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  up:'<path d="m6 15 6-6 6 6"/>',
  down:'<path d="m6 9 6 6 6-6"/>',
  save:'<path d="M5 3h12l4 4v14H3V3h2zM7 3v6h10V3M7 21v-8h10v8"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  edit:'<path d="m16 3 5 5-12 12-6 1 1-6L16 3zM13 6l5 5"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  check:'<path d="m5 12 4 4L20 5"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  wallet:'<path d="M3 6h17v15H3V6zm0 0V3h14v3M15 11h7v6h-7z"/>',
  cycle:'<path d="M20 7a9 9 0 0 0-15-2L2 8m0-6v6h6M4 17a9 9 0 0 0 15 2l3-3m0 6v-6h-6"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  folder:'<path d="M2 6h8l2 3h10v12H2V6z"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>'
};
const icon = (name,extra='') => `<svg class="icon ${extra}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]||ICONS.info}</svg>`;
let state, dataDirectory='', page='overview', selectedStock='', saving=false, modalKind='', toastTimer;
let quoteBusy=false,draftQuote=null;
let marketStatus={autoEnabled:false,failures:0,nextAllowedAt:0,restriction:null},autoLoop=null,lastRestrictionNotice='';
let alertBook={rules:[],events:[],checks:{}},alertFocusStock='';
let filters={stock:'',type:'',query:'',from:'',to:''};
function blankState() { return {version:1,revision:0,isDemo:false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),stocks:[],trades:[]}; }
function demoState() {
  const s=blankState(); s.isDemo=true;
  const base={mode:'arithmetic',anchor:'10',step:'0.5',count:4,quantity:'100'};
  s.stocks=[{id:'demo-stock-1',symbol:'DEMO01',name:'示例科技',quote:'10.6',quoteAt:localNow(),grid:{...base,levels:E.generateLevels(base)}},{id:'demo-stock-2',symbol:'DEMO02',name:'示例红利 ETF',quote:'3.15',quoteAt:localNow(),grid:{mode:'arithmetic',anchor:'3.2',step:'0.1',count:4,quantity:'1000',levels:E.generateLevels({mode:'arithmetic',anchor:'3.2',step:'0.1',count:4,quantity:'1000'})}}];
  const trade=(id,seq,stockId,type,date,p,q,fee='5',tax='0',gridLevel='',buyTradeId='')=>({id,seq,stockId,type,date,price:p,quantity:q,fee,tax,otherFee:'0',gridLevel,buyTradeId,note:'虚拟演示成交'});
  s.trades=[
    trade('demo-buy-1',1,'demo-stock-1','buy','2026-10-12T10:00','10','1000'),
    trade('demo-buy-2',2,'demo-stock-2','buy','2026-10-13T10:00','3.1','2000','5','0','buy-1'),
    trade('demo-sell-1',3,'demo-stock-1','sell','2026-10-16T10:00','10.5','200','5','1.05','sell-1','demo-buy-1'),
    trade('demo-buy-3',4,'demo-stock-1','buy','2026-10-20T10:00','9.5','100','5','0','buy-1'),
    trade('demo-sell-2',5,'demo-stock-1','sell','2026-10-24T10:00','10','100','5','0.5','center','demo-buy-3'),
    trade('demo-sell-3',6,'demo-stock-2','sell','2026-10-28T10:00','3.3','1000','5','0','sell-1','demo-buy-2'),
    trade('demo-buy-4',7,'demo-stock-1','buy','2026-11-03T10:00','9.5','200','5','0','buy-1'),
    {id:'demo-dividend-1',seq:8,stockId:'demo-stock-2',type:'dividend',date:'2026-11-06T09:30',amount:'80',fee:'0',tax:'8',otherFee:'0',note:'虚拟演示分红'},
    trade('demo-sell-4',9,'demo-stock-1','sell','2026-11-10T10:00','10.5','100','5','0.53','sell-1','demo-buy-4')
  ];
  return s;
}
function notify(message,error=false) { const el=$('#toast'); el.textContent=message; el.className=`show ${error?'error':''}`; clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.className='',4500); }
async function commit(next) {
  if(saving) throw new Error('正在保存，请稍候');
  E.validateState(next); saving=true;
  try {
    const saved=window.desktop ? await desktop.save(next,state.revision||0) : {...next,revision:(state.revision||0)+1,updatedAt:new Date().toISOString()};
    if(!window.desktop) { localStorage.setItem('xiaodai-grid-ledger-v1-backup',JSON.stringify(state)); localStorage.setItem('xiaodai-grid-ledger-v1',JSON.stringify(saved)); }
    state=saved;
  } finally { saving=false; }
  render();
}
const stockOptions=(id,all=false)=>`${all?'<option value="">全部股票</option>':''}${state.stocks.map(s=>`<option value="${esc(s.id)}" ${s.id===id?'selected':''}>${esc(s.name)} · ${esc(s.symbol)}</option>`).join('')}`;
function allLedger() { return E.summarize(state).positions.flatMap(p=>p.ledger.map(t=>({...t,stock:p.stock}))).sort((a,b)=>b.date.localeCompare(a.date)||b.seq-a.seq); }
function stockName(s) { return `<div class="stock-name"><span class="stock-avatar ${s.symbol==='DEMO02'?'teal':''}">${esc(s.name.slice(0,1))}</span><span><strong>${esc(s.name)}</strong><small>${esc(s.symbol)}</small></span></div>`; }
function stockDeleteButton(stock,classes='btn small danger',label='删除股票') {
  return `<button type="button" class="${classes}" data-action="delete-stock" data-id="${esc(stock.id)}" aria-label="删除股票 ${esc(stock.name)} ${esc(stock.symbol)}">${icon('trash')}${label}</button>`;
}
function deleteStockModal(id) {
  const stock=state.stocks.find(s=>s.id===id);
  if(!stock)throw new Error('这只股票已不存在，请重新选择');
  const records=state.trades.filter(t=>t.stockId===id);
  if(records.length) {
    openModal({title:'这只股票已有成交记录',subtitle:`${stock.name} · ${stock.symbol}`,body:`<p class="confirm-message">该股票已有 <strong>${records.length}</strong> 条成交或分红、送转记录。为保留成本与历史利润，暂时不能直接删除。</p><p class="muted">如果是误录，请在交易记录中按时间从新到旧删除相关记录，再删除股票。软件会继续核对历史持仓，阻止造成超卖的删除。</p>`,buttons:`<button type="button" class="btn" data-action="close-modal">取消</button><button type="button" class="btn primary" data-action="stock-trades" data-id="${esc(id)}">查看该股记录 ${icon('arrow')}</button>`});
    return;
  }
  openModal({title:'删除股票',subtitle:`${stock.name} · ${stock.symbol}`,body:`<p class="confirm-message">确认删除 <strong>${esc(stock.name)}（${esc(stock.symbol)}）</strong> 吗？</p><p class="muted">这只股票尚无成交记录。删除后会移除该股的参考价与全部网格档位。</p>${window.desktop?'<p class="muted">删除前的账本会保留在本机自动备份中。</p>':''}`,buttons:`<button type="button" class="btn" data-action="close-modal">取消</button><button type="button" class="btn danger" data-action="confirm-delete-stock" data-id="${esc(id)}">${icon('trash')}确认删除股票</button>`});
}
function empty(message,action='add-stock',label='添加第一只股票') { return `<div class="empty-state">${icon('grids')}<h3>${esc(message)}</h3><p>从股票代码和网格档位开始，建立自己的交易账本。</p><button class="btn primary" data-action="${action}">${icon('plus')}${esc(label)}</button></div>`; }
function supportedStock(stock){try{return Q.normalizeSymbol(stock.symbol);}catch{return null;}}
function canFetchQuotes(){return !!window.desktop?.quotes;}
function refreshButton(stockId=''){
  if(!canFetchQuotes())return '';
  return `<button class="btn market-refresh ${stockId?'small':''}" data-action="${stockId?'refresh-one':'refresh-all'}" ${stockId?`data-id="${esc(stockId)}"`:''} ${quoteBusy?'disabled':''}>${icon('cycle',quoteBusy?'spinning':'')}${quoteBusy?'正在获取行情…':stockId?'获取最新价格':'刷新全部行情'}</button>`;
}
function quoteInfo(stock,full=false){
  if(!stock.quote)return '尚未填写参考价';
  const meta=stock.quoteMeta;
  if(!meta)return `手动 · ${shortDate(stock.quoteAt)}`;
  const old=meta.marketAt.slice(0,10)!==localNow().slice(0,10);
  return `${Q.SOURCES[meta.source]||'接口行情'} · ${shortDate(full?meta.marketAt:meta.marketAt.slice(5))}${old?' · 非今日行情':''}`;
}
function marketTime(time){return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(time));}
function autoDescription(){
  if(marketStatus.error)return marketStatus.error;
  const r=marketStatus.restriction;
  if(r)return `${Q.SOURCES[r.source]} ${r.statusCode===429?'请求过于频繁':'拒绝访问'}（HTTP ${r.statusCode}）。查询已暂停；${marketTime(r.resumeAfter)} 后可手动恢复。原参考价已保留。`;
  if(!marketStatus.autoEnabled)return '默认关闭；开启后仅在北京时间 9:30–11:30、13:00–15:00 随机每 60–90 秒更新。';
  if(state.isDemo||!state.stocks.some(s=>supportedStock(s)))return '等待添加真实 A 股或场内 ETF 代码；演示代码不请求行情。';
  const next=autoLoop?.nextAt||marketStatus.nextAllowedAt;
  if(autoLoop?.running)return '正在自动获取行情，原参考价保留到成功返回。';
  const prefix=!AutoQuotes.isTradingTime(Date.now())?'当前不在更新时段，等待下个周一至周五时段':marketStatus.failures?`连续 ${marketStatus.failures} 轮未完整成功，已降低更新频率`:'每轮随机间隔 60–90 秒，合并查询股票';
  return `${prefix}${next?`；下次预计 ${marketTime(next)}`:''}（北京时间）。`;
}
function autoMarkup(){
  const restricted=!!marketStatus.restriction;
  return `<div class="auto-market ${restricted||marketStatus.error?'auto-market-warning':''}" data-auto-market>
    <div class="auto-market-controls"><label class="auto-toggle"><input type="checkbox" role="switch" aria-label="自动更新行情" data-change="auto-quotes" ${marketStatus.autoEnabled?'checked':''} ${marketStatus.error||quoteBusy?'disabled':''}><span class="auto-switch" aria-hidden="true"></span><strong>自动更新行情</strong></label><span class="tag neutral">60–90 秒 · 随机间隔</span></div>
    <p class="auto-market-status" role="status">${esc(autoDescription())}</p>
    <div class="auto-market-foot"><small>周一至周五指定时段（暂未识别节假日） · 失败降频 · 受限暂停 · 退出后停止</small>${restricted?'<button class="btn small" data-action="resume-market">冷却后恢复查询</button>':''}</div>
  </div>`;
}
function renderAutoStatus(){for(const el of $$('[data-auto-market]'))el.outerHTML=autoMarkup();}
function restrictionMessage(){
  const r=marketStatus.restriction;if(!r)return;
  openModal({title:'行情接口访问受限',subtitle:`${Q.SOURCES[r.source]} · HTTP ${r.statusCode}`,body:`<p class="confirm-message">${esc(autoDescription())}</p><p class="muted">自动更新和手动查询均已暂停，不会立即切换备用来源继续重试。重启软件或切换开关会保留此冷却记录。交易记账、成本与利润计算仍可使用。</p><p class="muted">冷却结束后，在行情栏点击“冷却后恢复查询”。HTTP 403 只表示本次访问被拒绝，不代表已确认永久封禁。</p>`,buttons:'<button type="button" class="btn primary" data-action="close-modal">知道了</button>'});
}
function acceptMarketStatus(next,alert=false){
  if(!next)return;
  marketStatus=next;autoLoop?.sync();renderAutoStatus();
  const key=next.restriction?`${next.restriction.source}-${next.restriction.detectedAt}`:'';
  if(alert&&key&&key!==lastRestrictionNotice){
    lastRestrictionNotice=key;
    if(!$('#main-dialog'))restrictionMessage();else notify('行情接口访问受限，已暂停查询；请查看行情栏提示。',true);
  }
}
function quoteBar(){
  if(!canFetchQuotes()||(!['overview','grids','alerts','settings'].includes(page)&&!marketStatus.restriction&&!marketStatus.error))return '';
  const summary=state.quoteRefresh,eligible=state.stocks.filter(s=>supportedStock(s)).length;
  const date=summary?.requestedAt?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(summary.requestedAt)):'';
  const today=date.slice(0,10)===localNow().slice(0,10);
  const status=quoteBusy?'正在按股票代码获取报价，原参考价会保留到成功返回。':summary?`${today?'今日最近请求':'最近请求'} ${date} · 更新 ${summary.updatedCount} 只${summary.failedCount?` · ${summary.failedCount} 只保留原价`:''}`:`今日尚未刷新 · ${eligible} 只可查询证券`;
  return `<section class="market-section"><div class="market-bar"><div>${icon('cycle',quoteBusy?'spinning':'')}<span><strong>免费 A 股行情 · ${marketStatus.autoEnabled?'自动更新已开启':'手动更新'}</strong><small>${esc(status)}</small></span></div><span class="market-bar-note">腾讯行情优先 · 新浪备用 · 无需 API Key</span></div>${autoMarkup()}</section>`;
}
function setQuoteBusy(busy){
  quoteBusy=busy;renderAutoStatus();
  for(const b of $$('[data-action="refresh-all"],[data-action="refresh-one"],[data-action="lookup-symbol"]')){
    if(busy){b.dataset.previousHtml=b.innerHTML;b.innerHTML=icon('cycle','spinning')+'正在获取行情…';b.disabled=true;}
    else{b.disabled=false;if(b.dataset.previousHtml){b.innerHTML=b.dataset.previousHtml;delete b.dataset.previousHtml;}}
  }
}
async function refreshQuotes(stockId='',automatic=false){
  if(!canFetchQuotes())throw new Error('请使用桌面版的行情更新功能');
  const requested=state.stocks.filter(s=>(!stockId||s.id===stockId)&&supportedStock(s)).map(s=>({id:s.id,symbol:s.symbol}));
  if(!requested.length)throw new Error('请先添加 6 位 A 股或场内 ETF 代码，例如 512480；虚拟示例代码无法查询');
  const unsupported=stockId?[]:state.stocks.filter(s=>!supportedStock(s));
  setQuoteBusy(true);
  try{
    const response=await desktop.quotes(requested.map(s=>s.symbol),{automatic});
    acceptMarketStatus(response.market,!!response.restricted);
    if(response.alerts)alertBook=response.alerts;
    if(response.deferred||response.restricted&&!response.results.length){
      if(!automatic&&!response.restricted)notify(`${response.reason||'请稍候'}${response.market?.nextAllowedAt?`，预计 ${marketTime(response.market.nextAllowedAt)}`:''}`);
      return;
    }
    const applied=Q.applyResults(state,requested,response.results);
    const failures=[...applied.failed,...unsupported.map(s=>({symbol:s.symbol,message:'代码不在支持范围，保留原价'}))];
    applied.state.quoteRefresh={requestedAt:response.requestedAt,updatedCount:applied.updated.length,failedCount:failures.length};
    await commit(applied.state);
    const stale=applied.updated.filter(s=>s.quote.marketAt.slice(0,10)!==localNow().slice(0,10));
    if(!automatic)notify(`行情更新 ${applied.updated.length} 只${failures.length?`，${failures.length} 只保留原价`:''}${stale.length?`；${stale.length} 只为非今日行情`:''}`,!applied.updated.length);
    if(failures.length&&!automatic&&!response.restricted)openModal({title:'行情更新结果',subtitle:`更新 ${applied.updated.length} 只 · ${failures.length} 只保留原价`,body:`<p class="muted">未取得有效价格的股票会继续使用原参考价，没有按 0 元计入持仓。</p><div class="quote-failures">${failures.map(f=>`<div><strong>${esc(f.symbol)}</strong><span>${esc(f.message)}</span></div>`).join('')}</div>`,buttons:'<button type="button" class="btn primary" data-action="close-modal">知道了</button>'});
  }catch(error){
    if(automatic){notify(`自动行情更新未完成：${error.message}，下轮再试。`,true);}
    else throw error;
  }finally{setQuoteBusy(false);render();}
}
async function lookupSymbol(){
  if(!canFetchQuotes())throw new Error('请使用桌面版的行情更新功能');
  const form=$('#modal-form'),input=$('[name="symbol"]',form),n=Q.normalizeSymbol(input.value),original=input.value;
  setQuoteBusy(true);
  try{
    const response=await desktop.quotes([n.code]);
    acceptMarketStatus(response.market,!!response.restricted);
    if(response.restricted)throw new Error('行情接口访问受限，已暂停查询。冷却时间和恢复入口见行情栏。');
    if(response.deferred)throw new Error(`请等待下次允许查询时间：${marketTime(response.market.nextAllowedAt)}`);
    if($('#modal-form')!==form||input.value!==original)return;
    const q=response.results.find(q=>q.key===n.key);
    if(!q||q.error)throw new Error(q?.error||'暂时没有该代码的有效行情');
    Q.validateQuote(q);input.value=n.code;
    const name=$('[name="name"]',form);if(!name.value.trim())name.value=q.name;
    $('[name="quote"]',form).value=q.price;draftQuote=q;
    const status=$('#lookup-status');status.textContent=`${q.name} · ¥${price(q.price)} · ${Q.SOURCES[q.source]} · 行情 ${shortDate(q.marketAt)}${q.marketAt.slice(0,10)!==localNow().slice(0,10)?' · 非今日行情':''}`;
    if(!$('[name="id"]',form).value&&!form.dataset.gridEdited){
      $('[name="anchor"]',form).value=q.price;
      const mode=$('[name="mode"]',form).value;
      $('[name="step"]',form).value=mode==='geometric'?'3':E.Decimal.max('0.001',E.D(q.price).mul('0.03').toDecimalPlaces(3)).toString();
      const f=formObject();$('#grid-editor').innerHTML=gridEditor(E.generateLevels({...f,count:Number(f.count)}));
    }
    $('#form-error').hidden=true;
  }finally{setQuoteBusy(false);}
}

function render() {
  const titles={overview:['账本总览','让每一档交易，都有清楚的记录。'],grids:['网格计划','设好档位，记录成交，按计划复盘。'],trades:['交易记录','买入、卖出、分红和送转股，完整留痕。'],report:['利润复盘','看清已落袋的收益，也看清仍在持仓中的波动。'],alerts:['价格提醒','设置目标价，查看触发与未读记录。'],guide:['网格说明','从第一只股票，到第一轮网格交易。'],settings:['账本与备份','你的交易数据，保存在自己的电脑里。']};
  const t=titles[page];
  $('#app').innerHTML=`<aside class="sidebar"><div class="brand"><div class="brand-symbol"><i></i><i></i><i></i><i></i></div><span>小呆网格<small>人民币交易账本</small></span></div><div class="workspace-label">我的交易空间</div><nav>${[['overview','账本总览'],['grids','网格计划'],['trades','交易记录'],['report','利润复盘'],['alerts','价格提醒']].map(([id,label])=>`<button data-action="navigate" data-page="${id}" class="nav-item ${page===id?'active':''}">${icon(id==='alerts'?'bell':id)}${label}${id==='alerts'&&(alertBook.events||[]).some(e=>!e.readAt)?`<span class="nav-count">${(alertBook.events||[]).filter(e=>!e.readAt).length}</span>`:''}${id==='grids'?`<span class="nav-count">${state.stocks.length}</span>`:''}</button>`).join('')}<div class="nav-divider"></div>${[['guide','网格说明'],['settings','账本与备份']].map(([id,label])=>`<button data-action="navigate" data-page="${id}" class="nav-item ${page===id?'active':''}">${icon(id)}${label}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="local-indicator"><span></span>本地保存 · 人民币账本</div><p>有计划地交易<br>有依据地复盘</p><div class="profile"><div class="profile-avatar">呆</div><span>小呆的交易助手<small>本地账本 · v1.4.1</small></span></div></div></aside><div class="workspace"><header class="topbar"><span><i class="status-dot"></i>${state.isDemo?'演示账本':'我的人民币账本'}<span class="top-divider">/</span>${t[0]}</span><div class="topbar-right"><span>${localNow().slice(0,10).replaceAll('-',' / ')}</span><span class="currency-badge">CNY · 人民币</span><button class="icon-btn" aria-label="导出备份" title="导出完整备份" data-action="backup">${icon('save')}</button><span class="user-badge">呆</span></div></header><main><div class="page-heading"><div><div class="eyebrow">${page==='overview'?'交易工作台 · CNY':'小呆网格 / '+t[0]}</div><h1>${t[0]}</h1><p>${t[1]}</p></div><div class="heading-actions">${page==='alerts'?`${refreshButton()}<button class="btn primary" data-action="add-alert" ${!state.stocks.some(s=>supportedStock(s))||alertBook.error?'disabled':''}>${icon('plus')}添加价格提醒</button>`:page!=='guide'&&page!=='settings'?`${refreshButton()}<button class="btn" data-action="add-stock">${icon('plus')}添加股票</button><button class="btn primary" data-action="add-trade">${icon('plus')}记录成交</button>`:''}</div></div>${state.isDemo?`<div class="demo-banner"><span>${icon('info')}正在体验演示账本，所有股票、行情和成交均为虚拟示例。</span><button data-action="new-ledger">创建我的账本 ${icon('arrow')}</button></div>`:''}${quoteBar()}<div id="page-content">${({overview:overviewPage,grids:gridsPage,trades:tradesPage,report:reportPage,guide:guidePage,settings:settingsPage,alerts:()=>PriceAlertUI.page(state,alertBook,alertFocusStock,marketStatus)})[page]()}</div><footer><span>${icon('check')} ${window.desktop?'本机账本':'浏览器账本'} · 自动保存${state.updatedAt?' · '+new Date(state.updatedAt).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit'}):''}</span><span>行情按设置更新 · 档位提示以已保存参考价为准</span></footer></main></div>`;
  autoLoop?.sync();renderAutoStatus();
}
function metric(label,value,sub,iconName,cls='',main=false) { return `<div class="metric ${main?'metric-featured':''}"><div class="metric-title">${label}${icon(iconName)}</div><div class="metric-value ${cls}">${value}<small>${label==='已平仓批次'?'笔':'元'}</small></div><div class="metric-sub">${sub}</div></div>`; }
function overviewPage() {
  const s=E.summarize(state), alerts=s.positions.flatMap(p=>E.gridStatus(state,p.stock.id).filter(l=>l.touched&&l.eligible).map(l=>({...l,stock:p.stock}))).slice(0,4);
  return `<div class="metrics">${metric('累计总利润',signed(s.totalProfit),'已实现 + 分红 + 持仓浮动','report',tone(s.totalProfit),true)}${metric('持仓市值',cash(s.marketValue),`当前持有 ${s.positions.filter(p=>p.quantity.gt(0)).length} 只股票`,'wallet')}${metric('已实现收益',signed(s.realized.plus(s.dividends)),`含税后分红 ¥${cash(s.dividends)}`,'cycle',tone(s.realized.plus(s.dividends)))}${metric('持仓浮动盈亏',signed(s.unrealized),`剩余持仓成本 ¥${cash(s.basis)}`,'grids',tone(s.unrealized))}</div>${s.missingQuotes.length?`<div class="notice amber">${icon('info')} ${s.missingQuotes.map(p=>esc(p.stock.name)).join('、')} 尚未填写参考价，市值和总利润暂不计算。</div>`:''}<section class="panel"><div class="panel-head"><div><h2>我的持仓 <span class="count">${s.positions.length}</span></h2><p>成本按买入批次保留，已扣除卖出对应成本</p></div><button class="text-btn" data-action="navigate" data-page="grids">管理网格 ${icon('arrow')}</button></div>${state.stocks.length?holdingsTable(s.positions):empty('你的第一张网格，准备就绪')}</section><section class="panel recent-panel"><div class="trade-workspace"><div class="trade-workspace-title"><span class="soft-icon">${icon('trades')}</span><div><h2>交易工作台</h2><p>选择操作，按实际成交填写股数与费用</p></div></div><div class="inline-actions"><button class="btn buy-btn" data-action="add-trade" data-type="buy">${icon('down')}买入记账</button><button class="btn sell-btn" data-action="add-trade" data-type="sell">${icon('up')}卖出记账</button><button class="btn" data-action="add-trade" data-type="dividend">${icon('wallet')}记录分红</button></div></div><div class="panel-head"><div><h2>最近成交</h2><p>每一次操作，都有迹可循</p></div><button class="text-btn" data-action="navigate" data-page="trades">全部记录 ${icon('arrow')}</button></div>${tradeTable(allLedger().slice(0,5),false)}</section><div class="overview-middle"><section class="panel chart-panel"><div class="panel-head"><div><h2>收益的每一步</h2><p>累计已实现收益，包含税后分红</p></div><span class="tag neutral">按成交时间</span></div>${profitChart()}<div class="chart-caption"><span><i class="legend-dot"></i>已实现收益</span><span>不包含历史持仓浮盈亏</span></div></section><section class="panel alerts-panel"><div class="panel-head"><div><h2>档位观察</h2><p>按已保存参考价比对计划</p></div><span class="soft-icon">${icon('grids')}</span></div>${alerts.length?alerts.map(l=>`<button class="alert-row" data-action="grid-stock" data-id="${esc(l.stock.id)}"><span class="direction-icon ${l.side}">${icon(l.side==='buy'?'down':'up')}</span><span><strong>${esc(l.stock.name)}<span class="tag ${l.side}">${esc(l.label)}</span></strong><small>计划价 ¥${price(l.price)} · ${qty(l.quantity)} 股</small></span>${icon('arrow')}</button>`).join(''):'<div class="quiet"><span>◎</span><strong>按自己的节奏，等待下一档</strong><p>当前没有可观察的触价档位</p></div>'}<div class="alert-note">触价为价格对比提示，成交后请手动记账。</div></section></div>`;
}
function holdingsTable(positions) { return `<div class="table-wrap"><table><thead><tr><th>股票</th><th class="num">持仓 / 股</th><th class="num">平均持仓成本</th><th class="num">参考价 / 元</th><th class="num">持仓市值</th><th class="num">累计总利润</th><th>操作</th></tr></thead><tbody>${positions.map(p=>`<tr><td>${stockName(p.stock)}</td><td class="num mono">${qty(p.quantity)}</td><td class="num mono">${price(p.averageCost)}</td><td class="num"><button class="quote-button mono" title="更新手动参考价" data-action="quote" data-id="${esc(p.stock.id)}">${p.hasQuote?price(p.stock.quote):'填写价格'} ${icon('edit')}</button><small class="cell-sub">${esc(quoteInfo(p.stock))}</small></td><td class="num mono">${cash(p.marketValue)}</td><td class="num mono ${tone(p.totalProfit)}">${signed(p.totalProfit)}</td><td><div class="inline-actions stock-manage-actions"><button class="text-btn" data-action="grid-stock" data-id="${esc(p.stock.id)}">网格详情 ${icon('arrow')}</button><button class="text-btn" data-action="add-alert" data-id="${esc(p.stock.id)}">${icon('bell')}提醒</button>${stockDeleteButton(p.stock,'text-btn danger-text','删除')}</div></td></tr>`).join('')}</tbody></table></div>`; }
function profitChart() {
  const rows=allLedger().reverse();
  if(!rows.length) return '<div class="chart-empty"><div class="chart-empty-lines"></div><p>记录第一笔成交，开始积累你的收益曲线</p></div>';
  let total=E.D(0); const points=[{date:rows[0].date.slice(0,10),value:0}];
  for(const r of rows) { total=total.plus(r.realized); points.push({date:r.date.slice(0,10),value:total.toNumber()}); }
  const w=760,h=220,left=64,right=22,top=24,bottom=36;
  let lo=Math.min(0,...points.map(p=>p.value)),hi=Math.max(0,...points.map(p=>p.value));
  if(hi===lo) { hi+=100;lo-=20; } const pad=(hi-lo)*.14; hi+=pad;lo-=pad;
  const x=i=>left+i/(points.length-1)*(w-left-right), y=v=>top+(hi-v)/(hi-lo)*(h-top-bottom);
  const path=points.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
  const ticks=Array.from({length:4},(_,i)=>lo+(hi-lo)*i/3);
  const area=`${path} L${x(points.length-1)},${h-bottom} L${left},${h-bottom} Z`;
  const labelIndices=[0,Math.floor((points.length-1)/2),points.length-1].filter((v,i,a)=>a.indexOf(v)===i);
  return `<div class="profit-chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="累计已实现收益曲线"><defs><linearGradient id="profit-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2468df" stop-opacity=".17"/><stop offset="100%" stop-color="#2468df" stop-opacity="0"/></linearGradient></defs>${ticks.map(v=>`<line x1="${left}" x2="${w-right}" y1="${y(v)}" y2="${y(v)}" stroke="#edf0f5" stroke-dasharray="3 5"/><text x="${left-12}" y="${y(v)+4}" text-anchor="end">${cash(v,0)}</text>`).join('')}<path d="${area}" fill="url(#profit-fill)"/><path d="${path}" fill="none" stroke="#2468df" stroke-width="2.7" stroke-linejoin="round" stroke-linecap="round"/>${points.map((p,i)=>`<circle cx="${x(i)}" cy="${y(p.value)}" r="${i===points.length-1?4.5:3}" fill="#fff" stroke="#2468df" stroke-width="2"><title>${p.date} · ¥${cash(p.value)}</title></circle>`).join('')}${labelIndices.map(i=>`<text x="${x(i)}" y="${h-9}" text-anchor="${i===0?'start':i===points.length-1?'end':'middle'}">${points[i].date.slice(5).replace('-',' / ')}</text>`).join('')}</svg></div>`;
}
function gridsPage() {
  if(!state.stocks.length) return `<section class="panel">${empty('先添加一只股票，设置你的网格')}</section>`;
  if(!state.stocks.some(s=>s.id===selectedStock)) selectedStock=state.stocks[0].id;
  const p=E.calculateStock(state,selectedStock), s=p.stock, levels=E.gridStatus(state,s.id), g=s.grid;
  return `<div class="stock-tabs">${state.stocks.map(s=>`<button class="stock-tab ${s.id===selectedStock?'active':''}" data-action="select-stock" data-id="${esc(s.id)}"><strong>${esc(s.name)}</strong><span>${esc(s.symbol)}</span></button>`).join('')}<button class="stock-tab-add" title="添加股票" aria-label="添加股票" data-action="add-stock">${icon('plus')}</button></div><section class="panel stock-summary"><div>${stockName(s)}<span class="tag neutral">人民币 CNY</span></div><div class="stock-price"><span>${s.quoteMeta?'接口参考价':'手动参考价'}</span><strong>${s.quote?price(s.quote):'—'}</strong><small>${esc(quoteInfo(s,true))}</small></div><div class="stock-stat"><span>当前持仓</span><strong>${qty(p.quantity)} <small>股</small></strong></div><div class="stock-stat"><span>平均持仓成本</span><strong>${price(p.averageCost)}</strong></div><div class="stock-stat"><span>累计总利润</span><strong class="${tone(p.totalProfit)}">${signed(p.totalProfit)}</strong></div><div class="stock-quote-actions">${refreshButton(s.id)}<button class="text-btn" data-action="add-alert" data-id="${esc(s.id)}">${icon('bell')}价格提醒</button><button class="text-btn" data-action="quote" data-id="${esc(s.id)}">${icon('edit')}手动填写</button></div></section><div class="grid-layout"><section class="panel grid-ladder"><div class="panel-head"><div><h2>股票网格档位</h2><p>选择档位即可填写成交，档价与实际成交价分别保留</p></div><div class="inline-actions stock-manage-actions"><button class="btn small" data-action="edit-stock" data-id="${esc(s.id)}">${icon('settings')}设置档位</button>${stockDeleteButton(s)}</div></div><div class="grid-parameters"><span><small>网格方式</small><strong>${g.mode==='geometric'?'等比网格':'等差网格'}</strong></span><span><small>基准价</small><strong>¥${g.anchor?price(g.anchor):'—'}</strong></span><span><small>间距</small><strong>${esc(g.step||'—')}${g.mode==='geometric'?'%':' 元'}</strong></span><span><small>档位数量</small><strong>${levels.length} 档</strong></span></div>${levels.length?`<div class="ladder-head"><span>档位</span><span>计划价格</span><span>计划股数</span><span>状态 / 未平仓</span><span></span></div><div class="ladder-rows">${levels.map(l=>`<div class="ladder-row ${l.side} ${l.touched&&l.eligible?'reached':''}"><div><i class="ladder-dot"></i><strong>${esc(l.label)}</strong></div><div class="ladder-price">${price(l.price)}<div class="price-bar" style="width:${Math.max(10,100-Math.abs(Number(l.price)-Number(s.quote||g.anchor||l.price))/Math.max(Number(g.anchor||l.price),.001)*160)}%"></div></div><div class="mono">${qty(l.quantity)} 股</div><div>${l.side==='center'?'<span class="tag neutral">价格中枢</span>':l.side==='buy'&&l.filled?`<span class="tag buy">未平仓 ${qty(l.remaining)} 股</span>`:l.touched&&l.eligible?'<span class="tag watch">参考价已触及</span>':l.side==='buy'&&l.everBought?'<span class="tag neutral">已平仓 · 可再记买入</span>':l.side==='sell'&&!l.eligible?'<span class="muted">持仓不足</span>':'<span class="muted">等待触价</span>'}</div><div>${l.side==='center'?`<button class="text-btn" data-action="grid-trade" data-id="${esc(s.id)}" data-level="${esc(l.id)}" data-type="buy">记买入</button>`:`<button class="btn small ${l.side==='buy'?'buy-btn':'sell-btn'}" data-action="grid-trade" data-id="${esc(s.id)}" data-level="${esc(l.id)}" data-type="${l.side}">${l.side==='buy'?'记买入':'记卖出'}</button>`}</div></div>`).join('')}</div>`:'<div class="empty-inline">暂未设置档位，请点击右上角“设置档位”。</div>'}<div class="grid-footnote">${icon('info')} 档位按计划价排列。触价提示不代表已成交，也不会自动下单。</div></section><div class="grid-side"><section class="panel cost-breakdown"><div class="panel-head"><div><h2>成本与收益</h2><p>费用已计入每笔核算</p></div></div><div class="definition-list"><div><span>累计买入支出</span><strong>¥${cash(p.buys)}</strong></div><div><span>累计卖出净收入</span><strong>¥${cash(p.sells)}</strong></div><div><span>税后现金分红</span><strong>¥${cash(p.dividends)}</strong></div><div class="divide"><span>剩余持仓成本</span><strong>¥${cash(p.basis)}</strong></div><div><span>已实现交易利润</span><strong class="${tone(p.realized)}">${signed(p.realized)}</strong></div><div><span>持仓浮动盈亏</span><strong class="${tone(p.unrealized)}">${signed(p.unrealized)}</strong></div><div class="divide"><span>累计全部费用</span><strong>¥${cash(p.totalFees)}</strong></div><div><span>回本参考价 <button class="mini-info" title="（买入含费支出 − 卖出扣费收入 − 税后分红）÷ 剩余股数；可以为负。未包含未来卖出费用。">ⓘ</button></span><strong>${p.breakEven==null?'—':price(p.breakEven)}</strong></div></div></section><section class="plan-note"><span class="soft-icon">${icon('guide')}</span><h3>一档一笔，清楚记账</h3><p>在左侧选中买入档位。卖出时关联原买入批次，就能看到这一轮网格的净利润。</p><button class="text-btn" data-action="navigate" data-page="guide">查看网格说明 ${icon('arrow')}</button></section></div></div><section class="panel"><div class="panel-head"><div><h2>未平仓买入批次</h2><p>部分卖出后保留剩余股数及对应成本</p></div><button class="text-btn" data-action="add-trade" data-id="${esc(s.id)}">记录成交 ${icon('plus')}</button></div>${lotsTable(p)}</section>`;
}
function lotsTable(p) { const lots=p.lots.filter(l=>l.remaining.gt(0)); return lots.length?`<div class="table-wrap"><table><thead><tr><th>买入时间</th><th>买入档位</th><th class="num">原成交价</th><th class="num">剩余股数</th><th class="num">剩余含费成本</th><th class="num">剩余每股成本</th><th>操作</th></tr></thead><tbody>${lots.map(l=>`<tr><td class="mono">${esc(shortDate(l.date))}</td><td>${esc(state.trades.find(t=>t.id===l.tradeId)?.gridLabel||p.stock.grid.levels.find(g=>g.id===l.gridLevel)?.label||'未指定档位')}</td><td class="num mono">${price(l.buyPrice)}</td><td class="num mono">${qty(l.remaining)}</td><td class="num mono">${cash(l.remainingCost)}</td><td class="num mono">${price(l.remainingCost.div(l.remaining))}</td><td><button class="text-btn" data-action="sell-lot" data-id="${esc(p.stock.id)}" data-buy="${esc(l.tradeId)}">卖出此批次 ${icon('arrow')}</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-inline">目前没有未平仓的买入批次。</div>'; }
function filteredLedger() { return allLedger().filter(t=>(!filters.stock||t.stockId===filters.stock)&&(!filters.type||t.type===filters.type)&&(!filters.from||t.date.slice(0,10)>=filters.from)&&(!filters.to||t.date.slice(0,10)<=filters.to)&&(!filters.query||`${t.stock.name} ${t.stock.symbol} ${t.note}`.toLowerCase().includes(filters.query.toLowerCase()))); }
function tradesPage() { const rows=filteredLedger(); return `<section class="panel"><div class="filter-bar"><div class="search-input">${icon('search')}<input id="trade-search" placeholder="搜索股票代码、名称、备注" value="${esc(filters.query)}" aria-label="搜索交易记录"></div><select data-change="filter-stock" aria-label="按股票筛选">${stockOptions(filters.stock,true)}</select><select data-change="filter-type" aria-label="按成交类型筛选"><option value="">全部类型</option>${Object.entries(E.TYPE_ZH).map(([k,v])=>`<option value="${k}" ${filters.type===k?'selected':''}>${v}</option>`).join('')}</select><label class="date-filter">从<input type="date" data-change="filter-from" value="${esc(filters.from)}" aria-label="开始日期"></label><label class="date-filter">至<input type="date" data-change="filter-to" value="${esc(filters.to)}" aria-label="结束日期"></label><button class="text-btn" data-action="clear-filter">重置</button></div><div class="panel-head compact"><span class="muted">共 <strong>${rows.length}</strong> 条记录 · 按成交时间倒序</span><div class="inline-actions"><button class="btn small" data-action="import">导入记录</button><button class="btn small" data-action="export-csv">${icon('download')}导出全部 CSV</button></div></div><div id="trade-results">${tradeTable(rows,true)}</div></section>`; }
function tradeTable(rows,edit) { return rows.length?`<div class="table-wrap"><table class="trade-table"><thead><tr><th>成交时间</th><th>股票</th><th>类型 / 档位</th><th class="num">成交价</th><th class="num">股数</th><th class="num">全部费用</th><th class="num">净现金流</th><th class="num">已实现收益</th>${edit?'<th>操作</th>':''}</tr></thead><tbody>${rows.map(t=>`<tr><td class="mono">${esc(t.date.slice(0,10))}<small class="cell-sub">${esc(t.date.slice(11))}</small></td><td>${stockName(t.stock)}</td><td><span class="tag ${t.type}">${E.TYPE_ZH[t.type]}</span><small class="cell-sub">${esc(t.gridLabel||t.stock.grid.levels.find(l=>l.id===t.gridLevel)?.label||(t.type==='split'?`股数 × ${t.ratio}`:'未指定档位'))}</small></td><td class="num mono">${t.type==='dividend'?cash(t.amount):t.price?price(t.price):'—'}</td><td class="num mono">${t.quantity?qty(t.quantity):'—'}</td><td class="num mono">${cash(t.fees)}</td><td class="num mono">${signed(t.cashFlow)}</td><td class="num mono ${tone(t.realized)}">${['buy','split'].includes(t.type)?'—':signed(t.realized)}</td>${edit?`<td><div class="inline-actions"><button class="icon-btn" title="编辑成交" aria-label="编辑成交" data-action="edit-trade" data-id="${esc(t.id)}">${icon('edit')}</button><button class="icon-btn danger-hover" title="删除成交" aria-label="删除成交" data-action="delete-trade" data-id="${esc(t.id)}">${icon('trash')}</button></div></td>`:''}</tr>`).join('')}</tbody></table></div>`:'<div class="empty-inline">暂无符合条件的成交记录。</div>'; }
function reportPage() {
  const s=E.summarize(state),matches=s.positions.flatMap(p=>p.matches.map(m=>({...m,stock:p.stock}))).sort((a,b)=>b.sellDate.localeCompare(a.sellDate));
  const wins=matches.filter(m=>m.profit.gt(0)).length;
  return `<div class="metrics">${metric('已实现交易利润',signed(s.realized),'按卖出对应买入批次核算','cycle',tone(s.realized),true)}${metric('税后分红',cash(s.dividends),'税前分红 − 税费与其他费用','wallet')}${metric('累计全部费用',cash(s.fees),'佣金 + 税费 + 其他费用','trades')}${metric('已平仓批次',String(matches.length),matches.length?`${wins} 笔盈利 · ${matches.length-wins} 笔持平或亏损`:'等待完成第一轮交易','grids')}</div><section class="panel"><div class="panel-head"><div><h2>每只股票的收益账</h2><p>总利润 = 已实现交易利润 + 税后分红 + 持仓浮动盈亏</p></div><button class="btn small" data-action="export-csv">${icon('download')}导出交易明细</button></div>${s.positions.length?`<div class="table-wrap"><table><thead><tr><th>股票</th><th class="num">累计买入支出</th><th class="num">卖出净收入</th><th class="num">剩余成本</th><th class="num">交易利润</th><th class="num">税后分红</th><th class="num">浮动盈亏</th><th class="num">总利润</th></tr></thead><tbody>${s.positions.map(p=>`<tr><td>${stockName(p.stock)}</td><td class="num mono">${cash(p.buys)}</td><td class="num mono">${cash(p.sells)}</td><td class="num mono">${cash(p.basis)}</td><td class="num mono ${tone(p.realized)}">${signed(p.realized)}</td><td class="num mono">${cash(p.dividends)}</td><td class="num mono ${tone(p.unrealized)}">${signed(p.unrealized)}</td><td class="num mono ${tone(p.totalProfit)}">${signed(p.totalProfit)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-inline">添加股票并记录成交后，即可查看利润复盘。</div>'}</section><section class="panel"><div class="panel-head"><div><h2>买卖配对明细</h2><p>指定批次优先；未指定批次按先进先出分摊。分红单独计入总收益。</p></div><span class="tag neutral">费用已分摊</span></div>${matches.length?`<div class="table-wrap"><table><thead><tr><th>股票</th><th>买入 → 卖出时间</th><th>买入档位 → 卖出档位</th><th class="num">已平仓股数</th><th class="num">买入含费成本</th><th class="num">卖出扣费收入</th><th class="num">配对净利润</th></tr></thead><tbody>${matches.map(m=>{const name=id=>m.stock.grid.levels.find(l=>l.id===id)?.label||'未指定';return `<tr><td>${stockName(m.stock)}</td><td class="mono">${esc(m.buyDate.slice(0,10))}<small class="cell-sub">→ ${esc(m.sellDate.slice(0,10))}</small></td><td>${esc(m.buyGridLabel||name(m.buyGrid))}<small class="cell-sub">→ ${esc(m.sellGridLabel||name(m.sellGrid))}</small></td><td class="num mono">${qty(m.quantity)}</td><td class="num mono">${cash(m.cost)}</td><td class="num mono">${cash(m.proceeds)}</td><td class="num mono ${tone(m.profit)}">${signed(m.profit)}</td></tr>`;}).join('')}</tbody></table></div>`:'<div class="empty-inline">记录一笔卖出后，会自动生成对应的买卖配对明细。</div>'}</section>`;
}
function guidePage() { return `<section class="guide-hero"><div class="eyebrow">从计划到记录</div><h2>把价格分成格子，<br>把每一次交易记清楚。</h2><p>网格是预先制定的一组价格与股数。价格落到买入档时观察买入机会，上到卖出档时观察卖出机会；实际成交后，再在这里记账。</p><div class="guide-grid-art"><span>11.000 <b>卖出 2 档</b></span><span>10.500 <b>卖出 1 档</b></span><span class="center">10.000 <b>基准档</b></span><span>9.500 <b>买入 1 档</b></span><span>9.000 <b>买入 2 档</b></span></div></section><div class="guide-steps">${[['01','设定股票代码','点击“添加股票”，填写代码和名称。例如代码填写 600000；点击“按代码获取名称和价格”可获取名称、最新成交价与行情时间。'],['02','生成网格档位','输入基准价、间距、上下档数和每档股数，生成后也可逐档修改价格与股数。'],['03','记录买入档位','在网格表点击“记买入”，核对实际成交时间、股数、成交价和费用。计划价与实际成交价分别保存。'],['04','卖出并核对利润','选择对应买入批次，或使用先进先出配对。部分卖出会自动分摊买入和卖出费用。']].map(([n,h,p])=>`<article><span>${n}</span><h3>${h}</h3><p>${p}</p></article>`).join('')}</div><div class="guide-columns"><section class="panel guide-copy"><h2>网格怎样计算？</h2><h3>等差网格 · 每档相差固定金额</h3><p>基准价 10 元，间距 0.5 元：买入 1 档为 9.5 元，买入 2 档为 9 元；卖出 1 档为 10.5 元，卖出 2 档为 11 元。</p><div class="formula">档位价格 = 基准价 + 档数 × 间距</div><h3>等比网格 · 相邻两档按固定倍率</h3><p>基准价 10 元，间距 5%：卖出 1 档为 10.5 元；买入 1 档为 10 ÷ 1.05 ≈ 9.524 元。向下使用除法，以保持相邻档位的倍率相同。</p><div class="formula">档位价格 = 基准价 × (1 + 间距%) ^ 档数</div><p class="muted">自动生成价格保留 3 位小数。实际交易请按该证券最小报价单位填写；每档股数需自行遵循相应交易规则。档位只是价格计划，不限制手动成交。</p></section><section class="panel guide-copy"><h2>成本和利润怎样核算？</h2><h3>每笔买入都有自己的成本</h3><p>买入含费成本 = 成交价 × 股数 + 佣金 + 税费 + 其他费用。卖出时按指定批次或先进先出扣减相应成本。</p><h3>平均持仓成本 ≠ 回本参考价</h3><p>平均持仓成本 = 未平仓买入批次的剩余含费成本 ÷ 剩余股数。回本参考价则进一步考虑累计卖出收入和税后分红，因此可能低于 0，且没有包含未来卖出费用。</p><div class="formula">总利润 = 已实现交易利润 + 税后分红 + 持仓浮动盈亏</div><p>也等于：持仓市值 + 卖出净收入 + 税后分红 − 累计买入含费支出。两种算法在同一账本内核对一致。</p><p class="muted">费用请按券商交割单填写；各笔费用先精确核算，界面金额展示到分，逐行展示的四舍五入可能与合计差 0.01 元。成本为本账本口径。</p></section></div><section class="panel guide-copy"><h2>使用时的几个约定</h2><div class="guide-columns"><div><h3>已有持仓怎么开始？</h3><p>先录入历史买入成交。没有逐笔资料时，可用“期初持仓”备注录入一笔汇总买入，成交价填写原含费总成本 ÷ 股数，费用填 0；此时利润只涵盖录入起点以后的变化。</p><h3>分红和送转股怎么记？</h3><p>分红填写税前金额及红利税。送转股填写股数变动倍率，例如每 10 股转增 3 股填写 1.3；成本总额不变，每股成本相应变化。除权后请重新检查网格与参考价。</p></div><div><h3>参考价与档位状态</h3><p>参考价可以手动填写，也可以点击“刷新全部行情”按股票代码获取。腾讯行情优先，失败后尝试新浪；无需 API Key。自动更新默认关闭。开启后仅在北京时间周一至周五 9:30–11:30、13:00–15:00 随机每 60–90 秒更新；午休、收盘和周末暂停。暂未识别法定节假日。触价只比较已保存参考价与计划价，不代表挂单或成交。</p><h3>行情时间与免费接口</h3><p>显示接口返回的行情时间与来源，请求时间单独保存在账本。非交易日、停牌或接口缓存可能返回较早的成交价；非今日行情会标注。零价格、无效代码、超时或失败均保留原价。免费公开接口可能调整或延迟，不保证持续可用。</p><h3>网格适用边界</h3><p>网格需要预留资金和可卖持仓。连续下跌时可能持续买入并累积亏损，持续上涨时可能提前卖出。软件记录已成交事项，不校验交易日、T+1、可用资金或券商订单。</p></div></div></section>`; }
function settingsPage() { return `<div class="settings-layout"><section class="panel settings-card"><div class="soft-icon">${icon('save')}</div><h2>账本与数据</h2><p>成交记录自动保存。退出再打开，继续你的计划。行情默认手动更新；开启自动更新后，仅在工作日指定时段随机更新，失败时降频，受限时暂停。</p><div class="definition-list"><div><span>当前账本</span><strong>${state.isDemo?'演示账本':'我的人民币账本'}</strong></div><div><span>股票数量 / 记录数量</span><strong>${state.stocks.length} / ${state.trades.length}</strong></div><div><span>记账币种</span><strong>人民币 CNY</strong></div><div><span>成本配对</span><strong>指定买入批次 / 先进先出</strong></div><div><span>数据保存方式</span><strong>${window.desktop?'本机文件 + 最近 30 次自动备份':'当前浏览器存储'}</strong></div></div>${window.desktop?`<div class="data-path">${esc(dataDirectory)}</div><button class="btn" data-action="folder">${icon('folder')}打开数据文件夹</button>`:'<div class="notice amber">浏览器清理数据会影响本账本，请定期导出完整备份。</div>'}</section><section class="panel settings-card"><div class="soft-icon">${icon('download')}</div><h2>备份、恢复与导出</h2><p>完整备份包含股票、档位、参考价和所有成交记录。</p><div class="settings-actions"><button class="btn primary" data-action="backup">${icon('download')}导出完整备份 JSON</button><button class="btn" data-action="export-csv">${icon('trades')}导出全部交易 CSV</button><button class="btn" data-action="import">${icon('folder')}导入备份 / 交易 CSV</button></div><p class="muted">JSON 恢复会替换当前账本，并在确认后生效。CSV 按记录 ID 去重并追加成交；CSV 不包含完整网格设置与参考价，建议同时保留 JSON 备份。股票代码请在表格软件中按文本保留前导零。</p></section><section class="panel settings-card full"><h2>创建空白账本</h2><p>${state.isDemo?'结束体验，从自己的第一只股票开始。':'新建前请先导出完整备份。创建后将清空当前股票、档位和交易记录。'}</p><button class="btn ${state.isDemo?'primary':'danger'}" data-action="new-ledger">${icon('plus')}创建我的空白账本</button></section></div>`; }
function openModal({title,subtitle='',body,form='',large=false,buttons=''}) {
  closeModal(); modalKind=form;draftQuote=null;
  $('#modal-root').innerHTML=`<dialog id="main-dialog" class="modal ${large?'modal-large':''}" aria-labelledby="dialog-title"><form id="modal-form" data-form="${form}"><div class="modal-head"><div><h2 id="dialog-title">${esc(title)}</h2>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div><button type="button" class="icon-btn" data-action="close-modal" aria-label="关闭">${icon('close')}</button></div><div class="modal-body">${body}<div id="form-error" class="form-error" role="alert" hidden></div></div><div class="modal-footer">${buttons||`<button type="button" class="btn" data-action="close-modal">取消</button><button type="submit" class="btn primary">${icon('check')}保存</button>`}</div></form></dialog>`;
  const d=$('#main-dialog'); d.showModal(); d.addEventListener('cancel',()=>{modalKind='';});
}
function closeModal() { const d=$('#main-dialog'); if(d?.open) d.close(); $('#modal-root').innerHTML=''; modalKind=''; }
function field(label,name,value='',type='text',extra='',help='') { return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${extra}>${help?`<small>${help}</small>`:''}</label>`; }
function showFormError(error) { const el=$('#form-error'); if(el) { el.textContent=error.message||String(error); el.hidden=false; el.scrollIntoView({block:'nearest'}); } else notify(error.message||String(error),true); }
function gridEditor(levels) { return levels.length?`<div class="table-wrap grid-editor-wrap"><table class="grid-editor"><thead><tr><th>档位名称</th><th>计划价格 / 元</th><th>计划股数</th></tr></thead><tbody>${levels.map((l,i)=>`<tr data-level-id="${esc(l.id)}" data-level-side="${l.side}"><td><input aria-label="档位名称 ${i+1}" name="level-label" value="${esc(l.label)}" maxlength="40" required></td><td><input aria-label="计划价格 ${i+1}" name="level-price" value="${esc(l.price)}" inputmode="decimal" required></td><td><input aria-label="计划股数 ${i+1}" name="level-quantity" value="${esc(l.quantity)}" inputmode="numeric" required></td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">填写参数并点击“生成 / 重置档位”。</p>'; }
function stockModal(id='') {
  const s=state.stocks.find(s=>s.id===id),g=s?.grid||{mode:'arithmetic',anchor:'10',step:'0.5',count:4,quantity:'100'};
  const levels=s?g.levels:E.generateLevels(g);
  openModal({title:s?'设置股票与网格':'添加股票与网格',subtitle:'所有金额均为人民币；档位价格与实际成交价分别保存。',form:'stock',large:true,body:`<input type="hidden" name="id" value="${esc(id)}">${canFetchQuotes()?`<div class="stock-lookup"><button type="button" class="btn" data-action="lookup-symbol">${icon('search')}按代码获取名称和价格</button><small id="lookup-status">先输入 6 位股票或 ETF 代码，再点击获取。新建股票会按价格初始化未修改的默认网格。</small></div>`:''}<div class="form-grid">${field('股票代码','symbol',s?.symbol||'','text','required maxlength="20" placeholder="例如 512480 / 600000"')}${field('股票名称','name',s?.name||'','text','required maxlength="50" placeholder="填写便于识别的名称"')}${field('当前参考价 / 元（选填）','quote',s?.quote||'','text','inputmode="decimal" placeholder="获取行情或手动填写"','接口使用其行情时间；手动改价使用当前北京时间。')}<label class="field"><span>网格方式</span><select name="mode" data-change="stock-mode"><option value="arithmetic" ${g.mode==='arithmetic'?'selected':''}>等差 · 固定金额间距</option><option value="geometric" ${g.mode==='geometric'?'selected':''}>等比 · 固定百分比间距</option></select></label>${field('基准价 / 元','anchor',g.anchor||'10','text','required inputmode="decimal"')}${field('间距 / 元或 %','step',g.step||'0.5','text','required inputmode="decimal"')}${field('基准价上下各几档','count',g.count||4,'number','required min="1" max="20" step="1"')}${field('每档股数','quantity',g.quantity||'100','text','required inputmode="numeric"','请自行按该股票或 ETF 的交易单位填写。')}</div><div class="form-section-head"><div><h3>逐档设置</h3><p>可直接修改每档价格、名称与股数。</p></div><button type="button" class="btn small" data-action="generate-grid">${icon('cycle')}生成 / 重置档位</button></div><div id="grid-editor">${gridEditor(levels)}</div><div class="notice">修改上方参数后，点击“生成 / 重置档位”才会更新下方档位。已记成交保持原档位名称快照。</div>`,buttons:s?`${stockDeleteButton(s,'btn danger stock-delete-footer')}<button type="button" class="btn" data-action="close-modal">取消</button><button type="submit" class="btn primary">${icon('check')}保存</button>`:''});
  $('#modal-form').dataset.originalQuote=s?.quote||'';
}
function formObject() { return Object.fromEntries(new FormData($('#modal-form')).entries()); }
function tradeModal(stockId='',type='buy',options={}) {
  const existing=state.trades.find(t=>t.id===options.id), draft=options.draft||existing||{};
  const stock=state.stocks.find(s=>s.id===(draft.stockId||stockId))||state.stocks[0];
  if(!stock) { stockModal();notify('请先添加股票，再记录成交'); return; }
  type=draft.type||type;
  const editing=!!existing;
  // Only lots available immediately before this transaction can be selected.
  const date=draft.date||localNow(),seq=existing?.seq??state.trades.reduce((n,t)=>Math.max(n,t.seq),0)+1;
  const before={...state,trades:state.trades.filter(t=>t.id!==existing?.id&&(t.date<date||(t.date===date&&t.seq<seq)))};
  const position=E.calculateStock(before,stock.id), lots=position.lots.filter(l=>l.remaining.gt(0));
  const levelId=draft.gridLevel??options.gridLevel??'',level=stock.grid.levels.find(l=>l.id===levelId);
  const lot=lots.find(l=>l.tradeId===(draft.buyTradeId||options.buyTradeId));
  const initialQty=draft.quantity|| (lot?lot.remaining.toString():level?.quantity||stock.grid.quantity||'100');
  let specific='';
  if(type==='buy'||type==='sell') specific=`<div class="form-grid"><label class="field"><span>${type==='buy'?'买入档位':'卖出档位'}</span><select name="gridLevel" data-change="trade-level"><option value="">不指定档位 / 手动成交</option>${stock.grid.levels.map(l=>`<option value="${esc(l.id)}" ${l.id===levelId?'selected':''}>${esc(l.label)} · ¥${price(l.price)}</option>`).join('')}${levelId&&!level?`<option selected value="${esc(levelId)}">${esc(draft.gridLabel||'历史档位')}</option>`:''}</select></label>${field('实际成交价 / 元','price',draft.price||level?.price||stock.quote||'','text','required inputmode="decimal" placeholder="按交割单填写"')}${field('实际成交股数','quantity',initialQty,'text','required inputmode="numeric"')}${type==='sell'?`<label class="field"><span>关联买入批次</span><select name="buyTradeId" data-change="trade-preview"><option value="">自动配对 · 先进先出</option>${lots.map(l=>`<option value="${esc(l.tradeId)}" ${l.tradeId===(draft.buyTradeId||options.buyTradeId)?'selected':''}>${l.date.slice(5).replace('T',' ')} · ${qty(l.remaining)} 股 · 买价 ${price(l.buyPrice)}${l.gridLevel?' · '+esc(stock.grid.levels.find(g=>g.id===l.gridLevel)?.label||'历史档位'):''}</option>`).join('')}</select><small>该时间点可卖 ${qty(position.quantity)} 股；指定批次优先。</small></label>`:'<div class="field field-hint"><span>记账规则</span><p>佣金和其他买入费用，全部计入本批次成本。</p></div>'}</div>`;
  if(type==='dividend') specific=`<div class="form-grid">${field('税前现金分红 / 元','amount',draft.amount||'','text','required inputmode="decimal"')}<div class="field field-hint"><span>红利税单独填写</span><p>在下方税费栏填写红利税，净额会计入总收益。</p></div></div>`;
  if(type==='split') specific=`<div class="form-grid">${field('送转后股数 ÷ 送转前股数','ratio',draft.ratio||'1.3','text','required inputmode="decimal"','例如每 10 股转增 3 股，填写 1.3。')}<div class="field field-hint"><span>只改变股数，不改变总成本</span><p>送转后请重新检查参考价和网格档位。</p></div></div>`;
  openModal({title:editing?'编辑成交记录':'记录一笔成交',subtitle:'以券商实际交割单为准，股数与费用均可手动填写。',form:'trade',body:`<input type="hidden" name="id" value="${esc(existing?.id||'')}"><div class="form-grid"><label class="field"><span>股票</span><select name="stockId" data-change="trade-stock" ${editing?'disabled':''}>${stockOptions(stock.id)}</select>${editing?`<input type="hidden" name="stockId" value="${esc(stock.id)}">`:''}</label><label class="field"><span>成交类型</span><select name="type" data-change="trade-type">${Object.entries(E.TYPE_ZH).map(([k,v])=>`<option value="${k}" ${k===type?'selected':''}>${v}</option>`).join('')}</select></label></div>${field('成交时间（北京时间）','date',date,'datetime-local','required data-change="trade-date"')}<div class="trade-specific">${specific}</div><div class="form-section-head"><h3>${type==='split'?'送转股不附加费用':'实际费用 / 元'}</h3><span class="muted">按交割单填写，不自动估算税率</span></div>${type==='split'?'<input type="hidden" name="fee" value="0"><input type="hidden" name="tax" value="0"><input type="hidden" name="otherFee" value="0">':`<div class="form-grid three">${field('佣金','fee',draft.fee||'0','text','required inputmode="decimal"')}${field(type==='dividend'?'红利税':'税费（如印花税）','tax',draft.tax||'0','text','required inputmode="decimal"')}${field('其他费用','otherFee',draft.otherFee||'0','text','required inputmode="decimal"')}</div>`}<label class="field"><span>备注（选填）</span><textarea name="note" rows="2" maxlength="1000" placeholder="例如：买入第 2 档 / 期初持仓 / 券商流水号">${esc(draft.note||'')}</textarea></label><div id="trade-preview" class="trade-preview"></div>`});
  updateTradePreview();
}
function tradeFromForm() {
  const f=formObject(),old=state.trades.find(t=>t.id===f.id),s=state.stocks.find(s=>s.id===f.stockId);
  const t={id:old?.id||uid(),seq:old?.seq??state.trades.reduce((n,t)=>Math.max(n,t.seq),0)+1,stockId:f.stockId,type:f.type,date:f.date,fee:f.fee||'0',tax:f.tax||'0',otherFee:f.otherFee||'0',note:f.note||'',gridLevel:f.gridLevel||'',gridLabel:s?.grid.levels.find(l=>l.id===f.gridLevel)?.label||old?.gridLabel||'',buyTradeId:f.buyTradeId||''};
  if(f.type==='buy'||f.type==='sell') { t.price=f.price;t.quantity=f.quantity; }
  if(f.type==='dividend')t.amount=f.amount;
  if(f.type==='split')t.ratio=f.ratio;
  return t;
}
function updateTradePreview() {
  if(modalKind!=='trade')return;
  try { const t=tradeFromForm(),next=copy(state);next.trades=next.trades.filter(x=>x.id!==t.id);next.trades.push(t);E.validateState(next);const row=E.calculateStock(next,t.stockId).ledger.find(x=>x.id===t.id);$('#trade-preview').innerHTML=`<div><span>${t.type==='buy'?'本次买入含费支出':t.type==='sell'?'本次卖出扣费收入':t.type==='dividend'?'本次税后分红':'送转后持仓股数'}</span><strong>${t.type==='split'?qty(row.holdingQuantity)+' 股':'¥'+cash(row.cashFlow.abs())}</strong></div>${t.type==='sell'?`<div><span>本次已实现交易利润</span><strong class="${tone(row.realized)}">${signed(row.realized)} 元</strong></div>`:''}<small>保存后将重新核对完整历史持仓与买卖配对。</small>`; }
  catch(e){$('#trade-preview').innerHTML=`<span class="muted">${esc(e.message)}</span>`;}
}
function quoteModal(id) { const s=state.stocks.find(s=>s.id===id);openModal({title:'手动填写参考价',subtitle:`${s.name} · ${s.symbol}`,form:'quote',body:`<input type="hidden" name="id" value="${esc(id)}"><p class="muted">当前记录：${esc(quoteInfo(s,true))}。如需接口报价，请返回页面点击“获取最新价格”。</p>${field('参考价 / 元','quote',s.quote,'text','required inputmode="decimal" placeholder="填写你查看到的价格"')}${field('价格时间（北京时间）','quoteAt',localNow(),'datetime-local','required')}<p class="muted">手动保存后会标记为“手动填写”，用于计算市值、浮动盈亏和触价提示。</p>`}); }
function alertModal(stockId='',id='') {
  if(!window.desktop?.saveAlert)throw new Error('价格提醒需要桌面版');
  const rule=alertBook.rules?.find(r=>r.id===id);
  const stocks=state.stocks.filter(s=>supportedStock(s));
  if(!stocks.length)throw new Error('先添加真实的 6 位股票或 ETF 代码');
  const chosen=rule?.stockId||stockId||stocks[0].id;
  const options=stocks.map(s=>'<option value="'+esc(s.id)+'" '+(s.id===chosen?'selected':'')+'>'+esc(s.name)+' · '+esc(s.symbol)+'</option>').join('');
  const body='<input type="hidden" name="id" value="'+esc(id)+'"><label class="field"><span>股票</span><select name="stockId">'+options+'</select></label>'+
    '<label class="field"><span>触发条件</span><select name="condition"><option value="gte" '+(rule?.condition!=='lte'?'selected':'')+'>涨到或高于目标价</option><option value="lte" '+(rule?.condition==='lte'?'selected':'')+'>跌到或低于目标价</option></select></label>'+
    field('目标价格 / 元','target',rule?.target||'','text','required inputmode="decimal" placeholder="例如 0.820"')+
    field('备注（选填）','note',rule?.note||'','text','maxlength="120" placeholder="例如：第一档卖出观察"')+
    '<label class="alert-enabled"><input type="checkbox" name="enabled" '+(rule?.enabled===false?'':'checked')+'> 启用此提醒</label><p class="muted">保存会更新规则；勾选启用后才参与下一次检查。已触发的规则可手动重新启用。</p>';
  openModal({title:rule?'编辑价格提醒':'添加价格提醒',subtitle:'触发记录保存在本机；手动填写参考价不会触发。',form:'alert',body});
}

function confirmModal(title,message,action,id='',confirm='确认') { openModal({title,body:`<p class="confirm-message">${esc(message)}</p>`,buttons:`<button type="button" class="btn" data-action="close-modal">取消</button><button type="button" class="btn danger" data-action="${action}" data-id="${esc(id)}">${confirm}</button>`}); }
async function exportFile(extension) {
  const content=extension==='json'?JSON.stringify(state,null,2):E.exportCsv(state);
  if(window.desktop){const result=await desktop.export(content,extension);if(!result.canceled)notify('已导出到所选位置');}
  else { const blob=new Blob([content],{type:extension==='json'?'application/json':'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`小呆网格-${localNow().slice(0,10)}.${extension}`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);notify('已生成下载文件'); }
}
let pendingImport=null;
async function prepareImport(file) {
  if(!file)return;
  if(file.name.toLowerCase().endsWith('.json')) {
    const next=JSON.parse(file.content.replace(/^\uFEFF/,''));E.validateState(next);pendingImport={state:next,name:file.name};
    openModal({title:'恢复完整账本',subtitle:file.name,body:`<div class="import-summary"><strong>${next.stocks.length}</strong> 只股票 <strong>${next.trades.length}</strong> 条记录</div><p>恢复会替换当前账本（${state.stocks.length} 只股票、${state.trades.length} 条记录）。桌面版会保留恢复前的自动备份；建议先导出当前完整备份。</p>`,buttons:'<button type="button" class="btn" data-action="close-modal">取消</button><button type="button" class="btn danger" data-action="confirm-import">确认恢复账本</button>'});
  }else if(file.name.toLowerCase().endsWith('.csv')) {
    const result=E.importCsv(state,file.content,uid);pendingImport={state:result.state,name:file.name};
    openModal({title:'导入交易 CSV',subtitle:file.name,body:`<div class="import-summary"><strong>${result.added}</strong> 条新记录 <strong>${result.skipped}</strong> 条重复记录</div><p>新增记录会追加到当前账本，保存前已核对时间顺序与持仓股数。重复记录按 ID 跳过。CSV 中新增的股票需设置网格，参考价可点击行情按钮获取。</p>`,buttons:'<button type="button" class="btn" data-action="close-modal">取消</button><button type="button" class="btn primary" data-action="confirm-import">确认导入</button>'});
  } else throw new Error('请选择 JSON 备份或 CSV 交易记录');
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  event.preventDefault();const a=button.dataset.action,id=button.dataset.id;
  if(saving){notify('正在保存，请稍候');return;}
  if(quoteBusy&&!['navigate','select-stock','close-modal'].includes(a)){notify('正在获取行情，请稍候');return;}
  try {
    if(a==='resume-market'){
      acceptMarketStatus(await desktop.resumeMarket());lastRestrictionNotice='';render();notify('已恢复行情查询；自动更新将重新等待随机间隔。');
    }
    if(a==='refresh-all')await refreshQuotes();
    if(a==='refresh-one')await refreshQuotes(id);
    if(a==='lookup-symbol')await lookupSymbol();
    if(a==='navigate'){page=button.dataset.page;render();window.scrollTo(0,0);}
    if(a==='add-stock')stockModal();
    if(a==='add-alert')alertModal(id||alertFocusStock);
    if(a==='edit-alert')alertModal('',id);
    if(a==='alert-filter'){alertFocusStock=id;render();}
    if(a==='alert-stock'){selectedStock=id;page='grids';render();}
    if(a==='alert-action'){alertBook=await desktop.alertAction(id,button.dataset.mode);render();notify(button.dataset.mode==='pause'?'提醒已暂停':'提醒已重新启用');}
    if(a==='delete-alert')confirmModal('删除价格提醒','删除该规则不会清除已有的触发历史。','confirm-delete-alert',id,'删除提醒');
    if(a==='confirm-delete-alert'){alertBook=await desktop.alertAction(id,'delete');closeModal();render();notify('已删除提醒');}
    if(a==='read-alert'){alertBook=await desktop.readAlerts(id);render();}
    if(a==='read-all-alerts'){alertBook=await desktop.readAlerts();render();}
    if(a==='test-alert'){alertBook=await desktop.testAlert();render();notify('测试提醒已记入记录；Windows 通知设置可能阻止弹窗。');}
    if(a==='edit-stock')stockModal(id);
    if(a==='close-modal')closeModal();
    if(a==='add-trade')tradeModal(id||selectedStock,button.dataset.type||'buy');
    if(a==='grid-stock'){selectedStock=id;page='grids';render();window.scrollTo(0,0);}
    if(a==='select-stock'){selectedStock=id;render();}
    if(a==='grid-trade')tradeModal(id,button.dataset.type,{gridLevel:button.dataset.level});
    if(a==='sell-lot')tradeModal(id,'sell',{buyTradeId:button.dataset.buy});
    if(a==='edit-trade') {const t=state.trades.find(t=>t.id===id);tradeModal(t.stockId,t.type,{id});}
    if(a==='quote')quoteModal(id);
    if(a==='generate-grid') { const f=formObject();const levels=E.generateLevels({...f,count:Number(f.count)});$('#grid-editor').innerHTML=gridEditor(levels);$('#form-error').hidden=true; }
    if(a==='delete-stock')deleteStockModal(id);
    if(a==='stock-trades'){closeModal();filters={stock:id,type:'',query:'',from:'',to:''};page='trades';render();window.scrollTo(0,0);}
    if(a==='confirm-delete-stock'){if(!state.stocks.some(s=>s.id===id))throw new Error('这只股票已不存在，请重新选择');if(state.trades.some(t=>t.stockId===id))throw new Error('已有成交记录的股票不能直接删除，请先查看该股记录');const next=copy(state);next.stocks=next.stocks.filter(s=>s.id!==id);await commit(next);if(selectedStock===id)selectedStock='';if(filters.stock===id)filters.stock='';closeModal();render();notify('已删除股票及其网格档位');}
    if(a==='delete-trade')confirmModal('删除这条成交记录','删除后将重新核算全部后续成本与利润。如果造成历史超卖或批次缺失，删除将被阻止。','confirm-delete-trade',id,'删除记录');
    if(a==='confirm-delete-trade'){const next=copy(state);next.trades=next.trades.filter(t=>t.id!==id);await commit(next);closeModal();notify('记录已删除，成本已重算');}
    if(a==='backup')await exportFile('json');
    if(a==='export-csv')await exportFile('csv');
    if(a==='folder')await desktop.folder();
    if(a==='clear-filter'){filters={stock:'',type:'',query:'',from:'',to:''};render();}
    if(a==='import'){if(window.desktop)await prepareImport(await desktop.import());else $('#file-import').click();}
    if(a==='confirm-import'&&pendingImport){const replace=pendingImport.name.toLowerCase().endsWith('.json');const next={...pendingImport.state,revision:state.revision};await commit(next);if(replace&&window.desktop?.resetAlerts)alertBook=await desktop.resetAlerts();pendingImport=null;selectedStock='';alertFocusStock='';closeModal();notify('导入成功，账本已重新核算');}
    if(a==='new-ledger')confirmModal('创建我的空白账本',state.isDemo?'创建后将移除虚拟演示数据，你可以填写自己的股票代码和网格档位。':'这会清空当前账本。请确认已导出完整 JSON 备份，再创建空白账本。','confirm-new-ledger','','创建空白账本');
    if(a==='confirm-new-ledger'){await commit({...blankState(),revision:state.revision});if(window.desktop?.resetAlerts)alertBook=await desktop.resetAlerts();selectedStock='';alertFocusStock='';filters={stock:'',type:'',query:'',from:'',to:''};page='overview';closeModal();render();notify('你的空白账本已创建');stockModal();}
  }catch(e){showFormError(e);}
});
document.addEventListener('submit',async event=>{
  if(event.target.getAttribute('id')!=='modal-form')return;event.preventDefault();
  if(saving||quoteBusy){notify('正在保存或获取行情，请稍候');return;}
  const f=formObject(),form=event.target.dataset.form;
  try {
    if(form==='alert'){
      alertBook=await desktop.saveAlert({id:f.id||'',stockId:f.stockId,condition:f.condition,target:f.target.trim(),note:f.note,enabled:!!f.enabled});
      alertFocusStock=f.stockId;page='alerts';closeModal();render();notify('价格提醒已保存');return;
    }
    const next=copy(state);
    if(form==='stock') {
      const old=next.stocks.find(s=>s.id===f.id),levels=$$('#grid-editor tbody tr').map(row=>({id:row.dataset.levelId,side:row.dataset.levelSide,label:$('[name="level-label"]',row).value.trim(),price:$('[name="level-price"]',row).value.trim(),quantity:$('[name="level-quantity"]',row).value.trim()}));
      const stock={id:old?.id||uid(),symbol:(()=>{try{return Q.normalizeSymbol(f.symbol).code;}catch{return f.symbol.trim().toUpperCase();}})(),name:f.name.trim(),quote:f.quote.trim(),quoteAt:old&&old.quote===f.quote.trim()?old.quoteAt:localNow(),grid:{mode:f.mode,anchor:f.anchor,step:f.step,count:Number(f.count),quantity:f.quantity,levels}};
      let sameCode=false;try{sameCode=old&&Q.normalizeSymbol(old.symbol).key===Q.normalizeSymbol(stock.symbol).key;}catch{sameCode=old?.symbol===stock.symbol;}
      if(old&&sameCode&&!draftQuote&&f.quote.trim()===event.target.dataset.originalQuote){stock.quote=old.quote;stock.quoteAt=old.quoteAt;if(old.quoteMeta)stock.quoteMeta=copy(old.quoteMeta);}
      if(draftQuote&&Q.normalizeSymbol(stock.symbol).key===draftQuote.key&&stock.quote===draftQuote.price){stock.quoteAt=draftQuote.marketAt.slice(0,16);stock.quoteMeta=Q.metadata(draftQuote);}
      else if(sameCode&&old.quote===stock.quote&&old.quoteMeta){stock.quoteAt=old.quoteAt;stock.quoteMeta=copy(old.quoteMeta);}
      if(!levels.length)throw new Error('请先生成网格档位');
      E.numeric(f.anchor,'基准价',true);E.numeric(f.step,'间距',true);E.numeric(f.quantity,'每档股数',true);
      if(!Number.isInteger(Number(f.count))||Number(f.count)<1||Number(f.count)>20)throw new Error('上下档数须为 1 至 20');
      if(old)next.stocks[next.stocks.findIndex(s=>s.id===old.id)]=stock;else next.stocks.push(stock);
      await commit(next);selectedStock=stock.id;page='grids';closeModal();render();notify('股票与网格档位已保存');
    }
    if(form==='trade') {const t=tradeFromForm();next.trades=next.trades.filter(x=>x.id!==t.id);next.trades.push(t);await commit(next);closeModal();notify('成交已记录，成本与利润已更新');}
    if(form==='quote') {E.numeric(f.quote,'参考价',true);const s=next.stocks.find(s=>s.id===f.id);s.quote=f.quote;s.quoteAt=f.quoteAt;delete s.quoteMeta;await commit(next);closeModal();notify('参考价已更新');}
  }catch(e){showFormError(e);}
});
document.addEventListener('change',async event=>{
  const target=event.target,a=target.dataset.change;
  if(!a)return;
  try {
    if(a==='auto-quotes'){
      try{acceptMarketStatus(await desktop.configureMarket(target.checked));render();}
      catch(error){renderAutoStatus();throw error;}
      return;
    }
    if(modalKind==='stock'&&target.name==='mode')$('#modal-form').dataset.gridEdited='true';
    if(a.startsWith('filter-')) {filters[a.slice(7)]=target.value;render();}
    if(a==='trade-type'||a==='trade-stock'||a==='trade-date') {const f=formObject();if(a==='trade-stock'){f.gridLevel='';f.buyTradeId='';f.price='';}tradeModal(f.stockId,f.type,{id:f.id,draft:f});}
    if(a==='trade-level'){const f=formObject(),s=state.stocks.find(s=>s.id===f.stockId),l=s.grid.levels.find(l=>l.id===f.gridLevel);if(l){$('[name="price"]').value=l.price;$('[name="quantity"]').value=l.quantity;}updateTradePreview();}
    if(a==='trade-preview')updateTradePreview();
  }catch(e){showFormError(e);}
});
document.addEventListener('input',event=>{
  if(modalKind==='stock'){
    if(['symbol','quote'].includes(event.target.name)){draftQuote=null;const status=$('#lookup-status');if(status)status.textContent='输入已更改，可再次按代码获取行情。';}
    if(['anchor','step','count','quantity','level-price','level-quantity','level-label'].includes(event.target.name))$('#modal-form').dataset.gridEdited='true';
  }
  if(event.target.id==='trade-search'){filters.query=event.target.value;$('#trade-results').innerHTML=tradeTable(filteredLedger(),true);}
  if(modalKind==='trade')updateTradePreview();
});
$('#file-import').addEventListener('change',async event=>{
  try { const file=event.target.files[0];if(!file)return;if(file.size>20*1024*1024)throw new Error('导入文件不能超过 20 MB');await prepareImport({name:file.name,content:await file.text()}); }catch(e){notify(e.message,true);}finally{event.target.value='';}
});
(async()=>{
  try {
    if(window.desktop){const loaded=await desktop.load();state=loaded.state;dataDirectory=loaded.dataDirectory;marketStatus=loaded.market||marketStatus;alertBook=loaded.alerts||alertBook;
      desktop.onAlertsChanged(next=>{alertBook=next;if(state)render();});
      desktop.onAlertOpen(({stockId})=>{alertFocusStock=state?.stocks.some(s=>s.id===stockId)?stockId:'';page='alerts';if(state)render();});
    }
    else {const raw=localStorage.getItem('xiaodai-grid-ledger-v1');state=raw?JSON.parse(raw):null;}
    if(!state){state={...blankState(),revision:0};await commit(demoState());}else{E.validateState(state);render();}
    if(window.desktop?.configureMarket){
      autoLoop=new AutoQuotes.Loop({getStatus:()=>marketStatus,isEligible:()=>!state.isDemo&&state.stocks.some(s=>supportedStock(s)),isReady:()=>!quoteBusy&&!saving,refresh:()=>refreshQuotes('',true),onChange:renderAutoStatus});
      autoLoop.sync();
      window.addEventListener('focus',()=>autoLoop.sync());
      window.addEventListener('beforeunload',()=>autoLoop.stop());
      acceptMarketStatus(marketStatus,true);
    }
  }catch(e){$('#app').innerHTML=`<div class="load-error"><h1>账本暂时无法打开</h1><p>${esc(e.message)}</p><p>为保留原始数据，软件没有覆盖账本。请从数据文件夹的 backups 中找回最近备份。</p>${window.desktop?'<button class="btn" data-action="folder">打开数据文件夹</button>':''}</div>`;}
})();
