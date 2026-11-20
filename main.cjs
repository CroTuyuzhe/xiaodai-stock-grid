const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { LedgerStore } = require('./storage.cjs');
const { MarketQuoteService } = require('./market-quotes.cjs');
const { MarketPreferences } = require('./market-preferences.cjs');
let marketQuotes, marketSettingsError='';
app.setName('小呆网格');
app.setAppUserModelId('com.xiaodai.stockgrid');
const instance = app.requestSingleInstanceLock();
let window, store;
if (!instance) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.whenReady().then(() => {
    const dataDirectory = process.env.XIAODAI_GRID_DATA_DIR || path.join(app.getPath('userData'), 'data');
    store = new LedgerStore(dataDirectory);
    const preferences=new MarketPreferences(dataDirectory);
    try{marketQuotes=new MarketQuoteService({preferences:preferences.load(),persist:next=>preferences.save(next)});}
    catch(error){marketSettingsError=error.message;marketQuotes=new MarketQuoteService();}
    const marketStatus=()=>({...marketQuotes.status(),...(marketSettingsError?{error:marketSettingsError}:{})});
    const readyMarket=()=>{if(marketSettingsError)throw new Error(marketSettingsError);};
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*','https://*/*','ws://*/*','wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
    const handler = (channel, fn) => ipcMain.handle(channel, async (event,...args) => {
      if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('请求来源无效');
      return fn(...args);
    });
    handler('ledger:load', () => ({ state:store.load(), dataDirectory, market:marketStatus() }));
    handler('ledger:save', (state,revision) => store.save(state,revision));
    handler('market:quotes', (symbols,options) => {readyMarket();return marketQuotes.fetch(symbols,{automatic:options?.automatic===true});});
    handler('market:configure', enabled => {readyMarket();return marketQuotes.configure(enabled);});
    handler('market:resume', () => {readyMarket();return marketQuotes.resume();});
    handler('ledger:export', async (content, extension) => {
      if (!['json','csv'].includes(extension) || typeof content !== 'string' || Buffer.byteLength(content) > 25*1024*1024) throw new Error('导出内容无效');
      const result = await dialog.showSaveDialog(window, { title:'导出账本', defaultPath:`小呆网格-${new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date())}.${extension}`, filters:[{ name:extension === 'json' ? '完整账本备份' : '交易明细表',extensions:[extension] }] });
      if (result.canceled) return { canceled:true };
      fs.writeFileSync(result.filePath,content,'utf8');
      return { canceled:false, filePath:result.filePath };
    });
    handler('ledger:import', async () => {
      const result = await dialog.showOpenDialog(window, { title:'选择账本备份或交易 CSV',properties:['openFile'],filters:[{ name:'账本文件',extensions:['json','csv'] }] });
      if (result.canceled) return null;
      const filePath = result.filePaths[0];
      if (fs.statSync(filePath).size > 20*1024*1024) throw new Error('导入文件不能超过 20 MB');
      return { name:path.basename(filePath),content:fs.readFileSync(filePath,'utf8').replace(/^\uFEFF/,'') };
    });
    handler('ledger:folder', () => shell.openPath(dataDirectory));
    window = new BrowserWindow({ width:1440,height:960,minWidth:960,minHeight:700,backgroundColor:'#f3f6fa',title:'小呆网格',icon:path.join(__dirname,'assets','icon.ico'),autoHideMenuBar:true,webPreferences:{ preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false } });
    window.webContents.setWindowOpenHandler(() => ({ action:'deny' }));
    window.webContents.on('will-navigate', e => e.preventDefault());
    window.loadFile(path.join(__dirname,'src','index.html'));
    app.on('activate', () => { if (window) window.show(); });
  });
  app.on('window-all-closed', () => app.quit());
}
