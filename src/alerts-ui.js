'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./engine.js'));else root.PriceAlertUI=factory(root.GridEngine);})(globalThis,function(E){
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>E.D(v).toFixed(3);
 const when=v=>v?new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'尚未检查';
 const target=r=>(r.condition==='gte'?'涨到或高于':'跌到或低于')+' ¥'+money(r.target);
 function monitoring(stock,book,market){
  if(book.error)return book.error;
  if(market.error)return '行情不可用：'+market.error;
  if(market.restriction)return '行情接口访问受限，已暂停检查；请查看行情栏。';
  if(market.nextAllowedAt>Date.now()&&market.failures)return '获取失败，已降频；下次检查时间由行情栏显示。';
  if(!market.autoEnabled)return '自动更新已关闭，仅手动在线刷新行情时检查。';
  if(!stock)return '自动更新已开启：交易时段随全部股票的行情请求检查；选择股票可查看最近成功检查时间。';
  if(!/^\d{6}$/.test(stock.symbol))return '示例代码不会请求真实行情。';
  return '自动更新已开启：交易时段随行情请求检查；最小化继续，退出或休眠时停止。';
 }
 function page(state,book,focus,market){
  const stocks=state.stocks.filter(s=>/^\d{6}$/.test(s.symbol));
  const chosen=stocks.find(s=>s.id===focus)||null;
  const rules=(book.rules||[]).filter(r=>!chosen||r.stockId===chosen.id);
  const events=(book.events||[]).filter(e=>!chosen||e.stockId===chosen.id);
  const unread=(book.events||[]).filter(e=>!e.readAt).length;
  const tabs='<div class="alert-filters"><button class="btn small '+(!chosen?'primary':'')+'" data-action="alert-filter" data-id="">全部股票</button>'+stocks.map(s=>'<button class="btn small '+(chosen?.id===s.id?'primary':'')+'" data-action="alert-filter" data-id="'+esc(s.id)+'">'+esc(s.name)+' · '+esc(s.symbol)+'</button>').join('')+'</div>';
  const check=chosen?(book.checks||{})[chosen.id]:null;
  const checkStatus=chosen?'<span>最近成功检查：'+esc(when(check?.checkedAt))+(check?.checkedAt?' · 行情 '+esc(check.marketAt?.replace('T',' '))+' · ¥'+esc(money(check.price)):'')+(check?.status&&check.status!=='fresh'?' · 最近一次检查未通过：'+esc(check.message):'')+'</span>':'<span>监控所有已设提醒的股票；选择股票查看各自检查时间。</span>';
  const records=rules.map(r=>'<div class="alert-item"><div><strong>'+esc(r.name)+' · '+esc(r.symbol)+'</strong><span class="tag '+(r.triggeredAt?'watch':r.enabled?'buy':'neutral')+'">'+(r.triggeredAt?'已触发':r.enabled?'监控中':'已暂停')+'</span><div class="alert-target">'+esc(target(r))+'</div><small>'+esc(r.note||'仅在新鲜的在线行情返回时判断')+'</small></div><div class="alert-actions"><button class="btn small" data-action="edit-alert" data-id="'+esc(r.id)+'">编辑</button><button class="btn small" data-action="alert-action" data-id="'+esc(r.id)+'" data-mode="'+(r.enabled?'pause':'rearm')+'">'+(r.enabled?'暂停':'重新启用')+'</button><button class="icon-btn" title="删除提醒" aria-label="删除提醒" data-action="delete-alert" data-id="'+esc(r.id)+'">×</button></div></div>').join('');
  const history=events.map(e=>'<div class="alert-item '+(!e.readAt?'alert-unread':'')+'"><div><strong>'+(e.kind==='test'?'系统通知测试':esc(e.name)+' · '+esc(e.symbol))+'</strong>'+(e.readAt?'':'<span class="tag watch">未读</span>')+'<div class="alert-target">'+(e.kind==='test'?'测试提醒':esc(target(e))+' · 实际 ¥'+esc(money(e.price)))+'</div><small>触发：'+esc(when(e.triggeredAt))+(e.marketAt?' · 行情：'+esc(e.marketAt.replace('T',' ')):'')+'</small><small class="alert-delivery">'+esc(({submitted:'已提交系统，是否弹出取决于 Windows 设置',failed:'系统通知失败，软件内记录已保留',unsupported:'系统通知不可用，软件内记录已保留',unknown:'系统未确认展示，软件内记录已保留',pending:'正在提交系统通知'})[e.delivery]||'通知状态未知')+'</small></div><div class="alert-actions">'+(!e.readAt?'<button class="btn small" data-action="read-alert" data-id="'+esc(e.id)+'">标记已读</button>':'')+(e.stockId&&state.stocks.some(s=>s.id===e.stockId)?'<button class="btn small" data-action="alert-stock" data-id="'+esc(e.stockId)+'">查看股票</button>':'')+'</div></div>').join('');
  return '<div class="alert-workspace"><div class="alert-notice">价格提醒只作观察，不会自动下单。首次拿到符合条件的有效新报价就会触发，无须先从另一侧穿越目标价；每条规则默认只提醒一次。60–90 秒采样可能错过两轮之间的短暂触价。</div>'+(book.error?'<div class="notice amber">'+esc(book.error)+'</div>':'')+'<section class="alert-section"><div class="panel-head"><div><h2>价格提醒 <span class="count">'+rules.length+'</span></h2><p>'+esc(monitoring(chosen,book,market))+'</p></div><div class="inline-actions"><button class="btn small" data-action="test-alert" '+(book.error?'disabled':'')+'>测试系统通知</button></div></div>'+tabs+'<div class="alert-check">'+checkStatus+'</div>'+(records||'<div class="empty-inline">还没有价格提醒。添加规则后，手动刷新即可试用。</div>')+'</section><section class="alert-section"><div class="panel-head"><div><h2>触发记录 <span class="count">'+unread+' 未读</span></h2><p>触发先记在本机，即使 Windows 没有显示通知仍可查看。</p></div>'+(unread?'<button class="btn small" data-action="read-all-alerts">全部标记已读</button>':'')+'</div>'+(history||'<div class="empty-inline">尚无触发记录。</div>')+'</section></div>';
 }
 return {page,target,monitoring};
});
