'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
async function audit(){
 const asar=await import('@electron/asar'),root=path.resolve(__dirname,'..'),version=require('../package.json').version;
 const archive=path.join(root,'release','v'+version,'XiaodaiGrid-win32-x64','resources','app.asar');
 const paths=asar.listPackage(archive).map(p=>p.replaceAll('\\','/').replace(/^\//,''));
 const forbidden=paths.filter(p=>p.split('/').some(x=>['.git','data','backups','exports','profile','user-data','tests','scripts','screenshots'].includes(x))||/^(ledger.*\.(json|csv)|market-preferences\.json|price-alerts\.json|\.env(?:\..*)?)$/.test(path.posix.basename(p)));
 assert.deepEqual(forbidden,[],'Private or development files in application archive');
 for(const name of ['main.cjs','preload.cjs','market-quotes.cjs','market-preferences.cjs','price-alerts.cjs','price-notifications.cjs','src/auto-quotes.js','src/alerts-ui.js','src/app.js','src/styles.css','src/index.html','src/engine.js','assets/icon.png','assets/icon.ico']){
  assert.deepEqual(asar.extractFile(archive,name),fs.readFileSync(path.join(root,name)),name+' packaged content mismatch');
 }
 const pkg=JSON.parse(asar.extractFile(archive,'package.json'));assert.equal(pkg.version,version);
 const demo=JSON.parse(asar.extractFile(archive,'examples/demo-ledger.json'));assert.equal(demo.isDemo,true);assert.deepEqual(demo.stocks.map(s=>s.symbol),['DEMO01','DEMO02']);
 const patterns=[/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s]+/i,/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
 for(const name of paths.filter(p=>/\.(?:js|cjs|json|md|html|css|txt)$/.test(p)&&!p.startsWith('node_modules/'))){const text=asar.extractFile(archive,name).toString('utf8');assert.ok(!patterns.some(p=>p.test(text)),'Sensitive text in '+name);}
 console.log(JSON.stringify({version,packageAudit:'PASS',archiveSha256:crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),entries:paths.length,syntheticExamples:demo.stocks.map(s=>s.symbol)},null,2));
}
module.exports={audit};
if(require.main===module)audit().catch(error=>{console.error(error);process.exit(1);});
