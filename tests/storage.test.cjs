const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {LedgerStore}=require('../storage.cjs');
const initial=()=>({version:1,revision:0,isDemo:false,stocks:[],trades:[]});
test('原子保存、重启加载、自动备份和版本冲突保护',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'xiaodai-store-test-'));
  try{const store=new LedgerStore(directory);assert.equal(store.load(),null);let s=await store.save(initial(),0);assert.equal(s.revision,1);s=await store.save({...s,isDemo:true},1);assert.equal(s.revision,2);assert.equal(new LedgerStore(directory).load().isDemo,true);assert.equal(fs.readdirSync(path.join(directory,'backups')).length,1);const backup=JSON.parse(fs.readFileSync(path.join(directory,'backups',fs.readdirSync(path.join(directory,'backups'))[0]),'utf8'));assert.equal(backup.isDemo,false);await assert.rejects(store.save(s,1),/另一窗口/);assert.equal(store.load().revision,2);}finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('损坏账本禁止被新保存覆盖',async()=>{const directory=fs.mkdtempSync(path.join(os.tmpdir(),'xiaodai-corrupt-test-'));try{const store=new LedgerStore(directory);fs.writeFileSync(path.join(directory,'ledger.json'),'{损坏');assert.throws(()=>store.load());await assert.rejects(store.save(initial(),0));assert.equal(fs.readFileSync(path.join(directory,'ledger.json'),'utf8'),'{损坏');}finally{fs.rmSync(directory,{recursive:true,force:true});}});
