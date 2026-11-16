(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('decimal.js'));
  else root.GridEngine = factory(root.Decimal);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Decimal) {
  'use strict';
  Decimal.set({ precision: 50, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -50, toExpPos: 50 });
  const D = value => new Decimal(value == null || value === '' ? '0' : value);
  const ZERO = () => D(0);
  const TYPES = ['buy', 'sell', 'dividend', 'split'];
  const numeric = (value, label, positive = false) => {
    if (typeof value !== 'string' || !/^\d{1,14}(\.\d{1,8})?$/.test(value)) throw new Error(`${label}请填写最多 8 位小数的非负数字`);
    const d = D(value);
    if (positive && !d.gt(0)) throw new Error(`${label}必须大于 0`);
    return d;
  };
  const validDate = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
    const [y, m, d, h, n] = value.match(/\d+/g).map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, h, n));
    return y >= 1900 && y <= 2200 && dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && dt.getUTCHours() === h && dt.getUTCMinutes() === n;
  };
  const fees = trade => D(trade.fee).plus(trade.tax).plus(trade.otherFee);
  const sortedTrades = (state, stockId) => state.trades.filter(t => t.stockId === stockId).sort((a,b) => a.date.localeCompare(b.date) || a.seq - b.seq || a.id.localeCompare(b.id));
  function calculateStock(state, stockId) {
    const stock = state.stocks.find(s => s.id === stockId);
    if (!stock) throw new Error('股票不存在');
    let quantity = ZERO(), basis = ZERO(), realized = ZERO(), dividends = ZERO(), totalFees = ZERO(), buys = ZERO(), sells = ZERO();
    const lots = [], ledger = [], matches = [];
    for (const trade of sortedTrades(state, stockId)) {
      const charge = fees(trade);
      totalFees = totalFees.plus(charge);
      const row = { ...trade, fees: charge, realized: ZERO(), allocations: [] };
      if (trade.type === 'buy') {
        const q = D(trade.quantity), cost = D(trade.price).mul(q).plus(charge);
        lots.push({ tradeId: trade.id, date: trade.date, gridLevel: trade.gridLevel || '', quantity: q, remaining: q, remainingCost: cost, buyPrice: trade.price });
        quantity = quantity.plus(q); basis = basis.plus(cost); buys = buys.plus(cost);
        row.cashFlow = cost.neg(); row.cost = cost;
      } else if (trade.type === 'sell') {
        let rest = D(trade.quantity);
        if (rest.gt(quantity)) throw new Error(`${stock.name} ${trade.date.replace('T',' ')} 卖出 ${rest} 股，超过当时持仓 ${quantity} 股`);
        const available = trade.buyTradeId ? lots.filter(l => l.tradeId === trade.buyTradeId) : lots;
        const allowed = available.reduce((a,l) => a.plus(l.remaining), ZERO());
        if (rest.gt(allowed)) throw new Error(`${stock.name} 指定买入批次的剩余股数不足（可卖 ${allowed} 股）`);
        const net = D(trade.price).mul(rest).minus(charge);
        let released = ZERO();
        for (const lot of available) {
          if (!rest.gt(0)) break;
          if (!lot.remaining.gt(0)) continue;
          const used = Decimal.min(rest, lot.remaining);
          const cost = used.eq(lot.remaining) ? lot.remainingCost : lot.remainingCost.mul(used).div(lot.remaining);
          const proceeds = net.mul(used).div(trade.quantity);
          const match = { buyTradeId: lot.tradeId, sellTradeId: trade.id, buyDate: lot.date, sellDate: trade.date, buyGrid: lot.gridLevel, sellGrid: trade.gridLevel || '', buyGridLabel: state.trades.find(t => t.id === lot.tradeId)?.gridLabel || '', sellGridLabel: trade.gridLabel || '', quantity: used, cost, proceeds, profit: proceeds.minus(cost) };
          row.allocations.push(match); matches.push(match);
          lot.remaining = lot.remaining.minus(used); lot.remainingCost = lot.remainingCost.minus(cost);
          released = released.plus(cost); rest = rest.minus(used);
        }
        quantity = quantity.minus(trade.quantity); basis = basis.minus(released);
        if (quantity.isZero()) basis = ZERO();
        row.realized = net.minus(released); row.cashFlow = net; row.cost = released;
        realized = realized.plus(row.realized); sells = sells.plus(net);
      } else if (trade.type === 'dividend') {
        const net = D(trade.amount).minus(charge);
        dividends = dividends.plus(net); row.cashFlow = net; row.realized = net;
      } else if (trade.type === 'split') {
        if (!quantity.gt(0)) throw new Error(`${stock.name} 在没有持仓时无法记录送转股`);
        if (!charge.isZero()) throw new Error('送转股记录不支持附加费用，请在对应成交费用中记录');
        const ratio = D(trade.ratio);
        for (const lot of lots) { lot.quantity = lot.quantity.mul(ratio); lot.remaining = lot.remaining.mul(ratio); }
        quantity = quantity.mul(ratio); row.cashFlow = ZERO();
      }
      row.holdingQuantity = quantity; row.holdingCost = basis; row.cumulativeRealized = realized.plus(dividends);
      ledger.push(row);
    }
    const hasQuote = stock.quote !== '' && stock.quote != null;
    const marketValue = quantity.isZero() ? ZERO() : hasQuote ? quantity.mul(stock.quote) : null;
    const unrealized = marketValue == null ? null : marketValue.minus(basis);
    const netInvested = buys.minus(sells).minus(dividends);
    return { stock, quantity, basis, averageCost: quantity.gt(0) ? basis.div(quantity) : ZERO(), realized, dividends, totalFees, buys, sells, netInvested, marketValue, unrealized, totalProfit: unrealized == null ? null : realized.plus(dividends).plus(unrealized), breakEven: quantity.gt(0) ? netInvested.div(quantity) : null, lots, ledger, matches, hasQuote };
  }
  function summarize(state) {
    const positions = state.stocks.map(s => calculateStock(state, s.id));
    const sum = key => positions.reduce((a,p) => a.plus(p[key] || 0), ZERO());
    const missingQuotes = positions.filter(p => p.quantity.gt(0) && !p.hasQuote);
    const marketValue = missingQuotes.length ? null : sum('marketValue');
    const unrealized = missingQuotes.length ? null : sum('unrealized');
    const realized = sum('realized'), dividends = sum('dividends');
    return { positions, quantity: sum('quantity'), basis: sum('basis'), realized, dividends, fees: sum('totalFees'), buys: sum('buys'), sells: sum('sells'), netInvested: sum('netInvested'), marketValue, unrealized, totalProfit: unrealized == null ? null : realized.plus(dividends).plus(unrealized), missingQuotes, tradeCount: state.trades.filter(t => t.type === 'buy' || t.type === 'sell').length };
  }
  function generateLevels({ anchor, step, count, quantity, mode }) {
    const center = numeric(anchor, '基准价', true), interval = numeric(step, '网格间距', true);
    const q = numeric(quantity, '每档股数', true);
    if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error('上下档数须为 1 至 20');
    if (!q.isInteger()) throw new Error('每档股数须为整数');
    if (!['arithmetic','geometric'].includes(mode)) throw new Error('网格模式无效');
    const result = [];
    for (let i = count; i >= -count; i--) {
      const price = mode === 'arithmetic' ? center.plus(interval.mul(i)) : center.mul(D(1).plus(interval.div(100)).pow(i));
      const rounded = price.toDecimalPlaces(3);
      if (!rounded.gt(0)) throw new Error('最低档价格必须大于 0，请减少档数或间距');
      result.push({ id: i === 0 ? 'center' : i > 0 ? `sell-${i}` : `buy-${-i}`, label: i === 0 ? '基准档' : i > 0 ? `卖出 ${i} 档` : `买入 ${-i} 档`, side: i === 0 ? 'center' : i > 0 ? 'sell' : 'buy', price: rounded.toString(), quantity: q.toString() });
    }
    if (new Set(result.map(l => l.price)).size !== result.length) throw new Error('间距过小，四舍五入后出现相同档价，请增大间距');
    return result;
  }
  function gridStatus(state, stockId) {
    const p = calculateStock(state, stockId), levels = p.stock.grid?.levels || [];
    return levels.map(level => {
      const matchedLots = p.lots.filter(l => l.gridLevel === level.id);
      const remaining = matchedLots.reduce((a,l) => a.plus(l.remaining), ZERO());
      const everBought = matchedLots.length > 0;
      const touched = p.hasQuote && (level.side === 'buy' ? D(p.stock.quote).lte(level.price) : level.side === 'sell' ? D(p.stock.quote).gte(level.price) : false);
      return { ...level, remaining, everBought, touched, filled: remaining.gt(0), eligible: level.side === 'buy' ? !remaining.gt(0) : p.quantity.gte(level.quantity) };
    });
  }
  function validateState(state) {
    if (!state || state.version !== 1 || !Array.isArray(state.stocks) || !Array.isArray(state.trades)) throw new Error('账本格式不正确或版本不受支持');
    if (state.stocks.length > 1000 || state.trades.length > 100000) throw new Error('账本超过容量限制');
    if (typeof state.isDemo !== 'boolean') throw new Error('账本演示标记无效');
    const stockIds = new Set(), symbols = new Set(), tradeIds = new Set(), sequences = new Set();
    for (const s of state.stocks) {
      if (typeof s.id !== 'string' || !s.id || stockIds.has(s.id)) throw new Error('股票 ID 重复或无效');
      stockIds.add(s.id);
      if (typeof s.symbol !== 'string' || !/^[A-Za-z0-9.\-]{1,20}$/.test(s.symbol)) throw new Error('股票代码只支持数字、字母、点或短横线');
      if (symbols.has(s.symbol.toUpperCase())) throw new Error(`股票代码 ${s.symbol} 重复`);
      symbols.add(s.symbol.toUpperCase());
      if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 50) throw new Error('股票名称须为 1 至 50 个字符');
      if (s.quote !== '') { numeric(s.quote, '当前参考价', true); if (!validDate(s.quoteAt)) throw new Error('参考价时间无效'); }
      if (s.quoteMeta != null) {
        const m=s.quoteMeta;
        if (!m || !['tencent','sina'].includes(m.source) || typeof m.marketAt!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(m.marketAt) || !validDate(m.marketAt.slice(0,16)) || Number(m.marketAt.slice(17))>59 || s.quoteAt!==m.marketAt.slice(0,16)) throw new Error('行情来源或行情时间无效');
        if (typeof m.fetchedAt!=='string' || !Number.isFinite(Date.parse(m.fetchedAt)) || typeof m.key!=='string' || !/^(sh|sz|bj)\d{6}$/.test(m.key) || typeof m.name!=='string' || m.name.length>50 || !s.quote) throw new Error('行情记录信息无效');
      }
      if (!s.grid || !Array.isArray(s.grid.levels) || s.grid.levels.length > 100) throw new Error('网格设置无效');
      const ids = new Set(), prices = new Set();
      for (const level of s.grid.levels) {
        if (typeof level.id !== 'string' || !level.id || ids.has(level.id)) throw new Error('档位 ID 重复或无效');
        ids.add(level.id);
        if (!['buy','sell','center'].includes(level.side)) throw new Error('档位方向无效');
        if (typeof level.label !== 'string' || !level.label.trim() || level.label.length > 40) throw new Error('档位名称无效');
        const price = numeric(level.price, '档位价格', true).toString();
        if (prices.has(price)) throw new Error('网格中不能出现重复价格');
        prices.add(price);
        const qty = numeric(level.quantity, '每档股数', true);
        if (!qty.isInteger()) throw new Error('每档股数须为整数');
      }
    }
    for (const t of state.trades) {
      if (typeof t.id !== 'string' || !t.id || tradeIds.has(t.id)) throw new Error('交易 ID 重复或无效');
      tradeIds.add(t.id);
      if (!stockIds.has(t.stockId)) throw new Error('交易关联了不存在的股票');
      if (!Number.isSafeInteger(t.seq) || t.seq < 0 || sequences.has(t.seq)) throw new Error('交易顺序编号重复或无效');
      sequences.add(t.seq);
      if (!TYPES.includes(t.type) || !validDate(t.date)) throw new Error('交易类型或成交时间无效');
      for (const f of ['fee','tax','otherFee']) numeric(t[f], '费用');
      if (t.type === 'buy' || t.type === 'sell') { numeric(t.price, '成交价', true); const q = numeric(t.quantity, '成交股数', true); if (!q.isInteger()) throw new Error('人民币股票成交股数须为整数'); }
      if (t.type === 'dividend') numeric(t.amount, '税前分红', true);
      if (t.type === 'split') numeric(t.ratio, '送转股比例', true);
      if (t.type !== 'sell' && t.buyTradeId) throw new Error('只有卖出记录能关联买入批次');
      if (t.gridLevel && typeof t.gridLevel !== 'string') throw new Error('交易档位无效');
      if (t.buyTradeId) {
        const buy = state.trades.find(b => b.id === t.buyTradeId);
        if (!buy || buy.type !== 'buy' || buy.stockId !== t.stockId) throw new Error('指定买入批次不存在或股票不一致');
      }
      if (typeof t.note !== 'string' || t.note.length > 1000) throw new Error('备注不能超过 1000 个字符');
    }
    if (state.quoteRefresh != null) {
      const r=state.quoteRefresh;
      if (!r || typeof r.requestedAt!=='string' || !Number.isFinite(Date.parse(r.requestedAt)) || !Number.isInteger(r.updatedCount) || r.updatedCount<0 || !Number.isInteger(r.failedCount) || r.failedCount<0) throw new Error('行情请求记录无效');
    }
    for (const s of state.stocks) calculateStock(state, s.id);
    return state;
  }
  const CSV_HEADERS = ['记录ID','顺序','股票代码','股票名称','类型','成交时间','成交价','股数','佣金','印花税或红利税','其他费用','档位ID','档位名称','关联买入ID','税前分红','送转比例','备注'];
  const TYPE_ZH = { buy:'买入',sell:'卖出',dividend:'分红',split:'送转股' };
  function csvCell(v) { const s = String(v ?? ''); return `"${s.replace(/"/g,'""')}"`; }
  function exportCsv(state) {
    const lines = [CSV_HEADERS];
    for (const t of [...state.trades].sort((a,b) => a.date.localeCompare(b.date) || a.seq-b.seq)) {
      const s = state.stocks.find(s => s.id === t.stockId);
      const level = s.grid.levels.find(l => l.id === t.gridLevel);
      const textCell = v => /^[=+@\-\t\r]/.test(String(v || '')) ? `'${v}` : v;
      lines.push([t.id,t.seq,s.symbol,textCell(s.name),TYPE_ZH[t.type],t.date,t.price,t.quantity,t.fee,t.tax,t.otherFee,t.gridLevel,textCell(t.gridLabel || level?.label || ''),t.buyTradeId,t.amount,t.ratio,textCell(t.note)]);
    }
    return '\uFEFF' + lines.map(row => row.map(csvCell).join(',')).join('\r\n');
  }
  function parseCsv(text) {
    text = text.replace(/^\uFEFF/,'');
    const rows = []; let row = [], cell = '', quote = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quote) { if (c === '"' && text[i+1] === '"') { cell += '"'; i++; } else if (c === '"') quote = false; else cell += c; }
      else if (c === '"') { if (cell) throw new Error('CSV 引号格式无效'); quote = true; }
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i+1] === '\n') i++; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (quote) throw new Error('CSV 引号没有闭合');
    row.push(cell); if (row.some(Boolean)) rows.push(row);
    return rows;
  }
  function importCsv(state, text, idFactory) {
    const rows = parseCsv(text), headers = rows.shift();
    if (!headers || CSV_HEADERS.some((h,i) => headers[i] !== h)) throw new Error('CSV 表头不匹配，请使用本软件导出的 CSV 格式');
    const copy = JSON.parse(JSON.stringify(state));
    let added = 0, skipped = 0;
    const reverse = Object.fromEntries(Object.entries(TYPE_ZH).map(([a,b]) => [b,a]));
    let nextSequence = copy.trades.reduce((n,t) => Math.max(n,t.seq),0) + 1;
    for (const cells of rows) {
      if (cells.length !== CSV_HEADERS.length) throw new Error(`CSV 第 ${added + skipped + 2} 行列数不正确`);
      const [id,seq,symbol,name,type,date,price,quantity,fee,tax,otherFee,gridLevel,gridLabel,buyTradeId,amount,ratio,note] = cells;
      if (copy.trades.some(t => t.id === id)) { skipped++; continue; }
      let stock = copy.stocks.find(s => s.symbol.toUpperCase() === symbol.toUpperCase());
      if (!stock) { stock = { id:idFactory(),symbol,name:name.replace(/^'(?=[=+@\-\t\r])/,'') || symbol,quote:'',quoteAt:'',grid:{mode:'arithmetic',anchor:'',step:'',count:4,quantity:'100',levels:[]} }; copy.stocks.push(stock); }
      copy.trades.push({ id:id || idFactory(), seq:nextSequence++,stockId:stock.id,type:reverse[type],date,price,quantity,fee,tax,otherFee,gridLevel,gridLabel,buyTradeId,amount,ratio,note:note.replace(/^'(?=[=+@\-\t\r])/,'') });
      added++;
    }
    validateState(copy);
    return { state:copy,added,skipped };
  }
  return { D, Decimal, numeric, validDate, fees, sortedTrades, calculateStock, summarize, generateLevels, gridStatus, validateState, exportCsv, parseCsv, importCsv, CSV_HEADERS, TYPE_ZH };
});
