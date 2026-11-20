"use strict";
const fs = require('node:fs');
const path = require('node:path');
const defaults = () => ({autoEnabled:false, failures:0, nextAllowedAt:0, restriction:null});
function normalize(value) {
  if (!value || typeof value.autoEnabled !== 'boolean') throw new Error('行情设置格式无效');
  const out = defaults();
  out.autoEnabled = value.autoEnabled;
  if (Number.isInteger(value.failures) && value.failures >= 0) out.failures = Math.min(value.failures, 1000);
  if (Number.isSafeInteger(value.nextAllowedAt) && value.nextAllowedAt >= 0) out.nextAllowedAt = value.nextAllowedAt;
  if (value.restriction != null) {
    const r = value.restriction;
    if (!r || ![403,429].includes(r.statusCode) || !['tencent','sina'].includes(r.source) ||
        !Number.isSafeInteger(r.detectedAt) || !Number.isSafeInteger(r.resumeAfter) || r.resumeAfter < r.detectedAt) {
      throw new Error('行情受限记录无效');
    }
    out.restriction = {statusCode:r.statusCode,source:r.source,detectedAt:r.detectedAt,resumeAfter:r.resumeAfter};
  }
  return out;
}
class MarketPreferences {
  constructor(directory) { this.directory=directory; this.file=path.join(directory,'market-preferences.json'); }
  load() {
    if (!fs.existsSync(this.file)) return defaults();
    try { return normalize(JSON.parse(fs.readFileSync(this.file,'utf8'))); }
    catch { throw new Error('行情设置文件无法读取。为保留受限记录，已停止行情查询；请保留 market-preferences.json 并检查文件。账本仍可使用。'); }
  }
  save(value) {
    const next=normalize(value);
    fs.mkdirSync(this.directory,{recursive:true});
    const temporary=this.file+'.tmp';
    fs.writeFileSync(temporary,JSON.stringify(next,null,2),'utf8');
    fs.renameSync(temporary,this.file);
  }
}
module.exports={MarketPreferences,defaults,normalize};
