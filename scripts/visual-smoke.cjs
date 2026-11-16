const { _electron:electron,expect }=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
(async()=>{
  const root=path.resolve(__dirname,'..'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'xiaodai-visual-'));
  const screenshots=path.join(root,'screenshots','v'+require('../package.json').version);
  fs.mkdirSync(screenshots,{recursive:true});
  let app;const errors=[];
  const audit=async(page,label)=>{
    const result=await page.evaluate(()=>{
      const small=[],walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()){
        const node=walker.currentNode,el=node.parentElement;
        if(!node.textContent.trim()||!el||el.closest('script,style,#toast'))continue;
        const style=getComputedStyle(el);
        if(style.visibility==='hidden'||!el.getClientRects().length)continue;
        if(parseFloat(style.fontSize)<13)small.push({text:node.textContent.trim().slice(0,50),size:style.fontSize});
      }
      return {overflow:document.documentElement.scrollWidth>innerWidth,small};
    });
    assert.equal(result.overflow,false,label+' page overflow');
    assert.deepEqual(result.small,[],label+' unreadable text');
  };
  try{
    app=await electron.launch({executablePath:process.env.GRID_TEST_EXE||require('electron'),args:[...(process.env.GRID_TEST_EXE?[]:[root]),'--user-data-dir='+path.join(directory,'profile')],env:{...process.env,XIAODAI_GRID_DATA_DIR:directory}});
    const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
    await page.locator('h1').waitFor();
    for(const width of [1440,1280,1000,960]){
      await page.setViewportSize({width,height:960});
      for(const id of ['overview','grids','trades','report','guide','settings']){
        await page.locator(`[data-action="navigate"][data-page="${id}"]`).first().click();
        await audit(page,`${id} ${width}`);
        if(width===1440||width===960)await page.screenshot({path:path.join(screenshots,`${id}-${width}.png`),fullPage:true});
      }
    }
    await page.setViewportSize({width:1440,height:960});
    await page.locator('[data-action="navigate"][data-page="overview"]').first().click();
    await page.screenshot({path:path.join(screenshots,'workspace-preview.png'),fullPage:false});
    for(const width of [1440,960]){
      await page.setViewportSize({width,height:760});
      await page.locator('[data-action="add-stock"]').first().click();
      await audit(page,`stock dialog ${width}`);
      await page.locator('#main-dialog .modal-footer').scrollIntoViewIfNeeded();
      await expect(page.locator('#modal-form button[type="submit"]')).toBeInViewport();
      await page.locator('#main-dialog').evaluate(el=>el.scrollTop=0);
      await page.screenshot({path:path.join(screenshots,`stock-dialog-${width}.png`)});
      await page.locator('[data-action="close-modal"]').first().click();
      for(const type of ['buy','sell','dividend']){
        await page.locator(`[data-action="add-trade"][data-type="${type}"]`).click();
        await expect(page.locator('select[name="type"]')).toHaveValue(type);
        await audit(page,`${type} dialog ${width}`);
        await page.locator('#main-dialog .modal-footer').scrollIntoViewIfNeeded();
        await expect(page.locator('#modal-form button[type="submit"]')).toBeInViewport();
        if(type==='sell'){
          await page.locator('#main-dialog').evaluate(el=>el.scrollTop=0);
          await page.screenshot({path:path.join(screenshots,`sell-dialog-${width}.png`)});
        }
        await page.locator('[data-action="close-modal"]').first().click();
      }
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: six pages at 1440/1280/1000/960, visible text >=13px, no page overflow, stock/trade dialogs and footer access, three quick transaction types.');
  }finally{if(app)await app.close();fs.rmSync(directory,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
