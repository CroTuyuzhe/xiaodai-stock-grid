const { _electron:electron,expect }=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const E=require('../src/engine.js');
(async()=>{
  const root=path.resolve(__dirname,'..'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'xiaodai-delete-'));
  const screenshots=path.join(root,'screenshots','v'+require('../package.json').version);
  fs.mkdirSync(screenshots,{recursive:true});
  const grid={mode:'arithmetic',anchor:'10',step:'0.5',count:2,quantity:'100'};
  const stock=(id,symbol,name)=>({id,symbol,name,quote:'11',quoteAt:'2026-11-13T15:00',grid:{...grid,levels:E.generateLevels(grid)}});
  const seeded={version:1,revision:1,isDemo:false,createdAt:'2026-11-13T00:00:00Z',updatedAt:'2026-11-13T00:00:00Z',stocks:[stock('empty-1','512480','待删除 ETF'),stock('traded','000001','已清仓股票'),stock('empty-2','600000','最后一只股票')],trades:[
    {id:'buy',seq:1,stockId:'traded',type:'buy',date:'2026-11-10T10:00',price:'10',quantity:'200',fee:'5',tax:'0',otherFee:'0',gridLevel:'',buyTradeId:'',note:'误录测试'},
    {id:'sell',seq:2,stockId:'traded',type:'sell',date:'2026-11-11T10:00',price:'11',quantity:'200',fee:'5',tax:'0',otherFee:'0',gridLevel:'',buyTradeId:'buy',note:'误录测试'}
  ]};
  E.validateState(seeded);assert.equal(E.calculateStock(seeded,'traded').quantity.toString(),'0');
  fs.writeFileSync(path.join(directory,'ledger.json'),JSON.stringify(seeded,null,2));
  const read=()=>JSON.parse(fs.readFileSync(path.join(directory,'ledger.json'),'utf8'));
  const unchanged=()=>assert.deepEqual(read(),seeded);
  const errors=[];let app,page;
  const launch=async()=>{
    app=await electron.launch({executablePath:process.env.GRID_TEST_EXE||require('electron'),args:[...(process.env.GRID_TEST_EXE?[]:[root]),'--user-data-dir='+path.join(directory,'profile')],env:{...process.env,XIAODAI_GRID_DATA_DIR:directory}});
    page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.locator('h1').waitFor();
  };
  const nav=async(id)=>page.locator(`[data-action="navigate"][data-page="${id}"]`).first().click();
  try{
    await launch();await page.setViewportSize({width:1440,height:960});
    assert.equal(await page.locator('[data-action="delete-stock"]').count(),3);
    // Visible list action identifies its exact target and cancellation writes nothing.
    await page.locator('[data-action="delete-stock"][data-id="empty-1"]').click();
    await expect(page.locator('#main-dialog')).toContainText('待删除 ETF（512480）');
    unchanged();await page.screenshot({path:path.join(screenshots,'delete-confirmation.png')});
    await page.getByRole('button',{name:'取消',exact:true}).click();unchanged();
    // Clear old trade filters so the protected-stock route can be checked.
    await nav('trades');
    await page.locator('[data-change="filter-type"]').selectOption('buy');
    await page.locator('[data-change="filter-from"]').fill('2026-11-12');
    await nav('overview');
    // A zero holding quantity still has historical profit and cannot be deleted.
    await page.locator('[data-action="delete-stock"][data-id="traded"]').click();
    await expect(page.getByRole('heading',{name:'这只股票已有成交记录',exact:true})).toBeVisible();
    await expect(page.locator('#main-dialog')).toContainText('2 条');
    assert.equal(await page.locator('[data-action="confirm-delete-stock"]').count(),0);unchanged();
    // The final mutation independently rechecks the history guard.
    await page.evaluate(()=>{const b=document.createElement('button');b.dataset.action='confirm-delete-stock';b.dataset.id='traded';document.querySelector('.modal-body').append(b);b.click();b.remove();});
    await expect(page.locator('#form-error')).toContainText('已有成交记录');unchanged();
    await page.locator('[data-action="stock-trades"]').click();
    await expect(page.locator('[data-change="filter-stock"]')).toHaveValue('traded');
    await expect(page.locator('[data-change="filter-type"]')).toHaveValue('');
    await expect(page.locator('[data-change="filter-from"]')).toHaveValue('');
    assert.equal(await page.locator('.trade-table tbody tr').count(),2);
    // A selected stock can be deleted from the sticky settings footer at 960px.
    await nav('grids');await page.locator('[data-action="select-stock"][data-id="empty-1"]').click();
    await page.setViewportSize({width:960,height:760});
    await expect(page.locator('.grid-ladder .panel-head [data-action="delete-stock"]')).toBeVisible();
    await page.locator('[data-action="edit-stock"]').click();
    await page.locator('.modal-footer [data-action="delete-stock"]').click();
    await page.locator('[data-action="confirm-delete-stock"]').click();
    await page.locator('#main-dialog').waitFor({state:'detached'});
    assert.deepEqual(read().stocks,seeded.stocks.slice(1));assert.deepEqual(read().trades,seeded.trades);
    assert.equal(await page.locator('.stock-tab').count(),2);
    await expect(page.locator('.stock-summary')).toContainText('已清仓股票');
    const backups=fs.readdirSync(path.join(directory,'backups')).map(f=>JSON.parse(fs.readFileSync(path.join(directory,'backups',f),'utf8')));
    assert.ok(backups.some(b=>b.stocks.some(s=>s.id==='empty-1')),'deleted stock remains in automatic backup');
    // Explicitly remove the two mistaken records through the protected trade UI.
    await page.locator('.grid-ladder .panel-head [data-action="delete-stock"]').click();
    await page.screenshot({path:path.join(screenshots,'delete-protection.png')});
    await page.locator('[data-action="stock-trades"]').click();
    await page.locator('[data-action="delete-trade"][data-id="sell"]').click();
    await page.locator('[data-action="confirm-delete-trade"]').click();await page.locator('#main-dialog').waitFor({state:'detached'});
    await page.locator('[data-action="delete-trade"][data-id="buy"]').click();
    await page.locator('[data-action="confirm-delete-trade"]').click();await page.locator('#main-dialog').waitFor({state:'detached'});
    await nav('grids');await page.locator('[data-action="select-stock"][data-id="traded"]').click();
    await page.locator('.grid-ladder .panel-head [data-action="delete-stock"]').click();
    await page.locator('[data-action="confirm-delete-stock"]').click();await page.locator('#main-dialog').waitFor({state:'detached'});
    assert.deepEqual(read().stocks,[seeded.stocks[2]]);assert.deepEqual(read().trades,[]);
    await nav('overview');await page.locator('[data-action="delete-stock"][data-id="empty-2"]').click();
    await page.locator('[data-action="confirm-delete-stock"]').click();await page.locator('#main-dialog').waitFor({state:'detached'});
    assert.deepEqual(read().stocks,[]);await nav('grids');
    await expect(page.locator('main')).toContainText('先添加一只股票');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await app.close();app=null;await launch();assert.deepEqual(read().stocks,[]);assert.deepEqual(read().trades,[]);
    assert.deepEqual(errors,[]);
    console.log('PASS: visible list/grid/settings deletion, cancel preserves ledger, target-only deletion, protected closed-position history, final guard, filtered record shortcut, backups, last-stock deletion and restart.');
  }finally{if(app)await app.close();fs.rmSync(directory,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
