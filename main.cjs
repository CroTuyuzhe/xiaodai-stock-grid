const { app, BrowserWindow, ipcMain, dialog, shell, session, Notification } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { LedgerStore } = require('./storage.cjs');
const { MarketQuoteService } = require('./market-quotes.cjs');
const { MarketPreferences } = require('./market-preferences.cjs');
const { PriceAlertStore } = require('./price-alerts.cjs');
const { PriceNotifications, APP_ID, registerWindowsShortcut } = require('./price-notifications.cjs');
const QuoteModel = require('./src/quote-model.js');
let marketQuotes, marketSettingsError='', alertSettingsError='', priceAlerts, notifier;
app.setName('小呆网格');
app.setAppUserModelId(APP_ID);
const instance = app.requestSingleInstanceLock();
let window, store;
if (!instance) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.whenReady().then(() => {
    try { registerWindowsShortcut({app,shell,path,fs}); }
    catch (error) { console.warn('无法更新开始菜单快捷方式：',error.message); }
    const dataDirectory = process.env.XIAODAI_GRID_DATA_DIR || path.join(app.getPath('userData'), 'data');
    store = new LedgerStore(dataDirectory);
    priceAlerts=new PriceAlertStore(dataDirectory);
    try{priceAlerts.load();priceAlerts.reconcile(store.load());}
    catch(error){alertSettingsError=error.message;}
    const alertStatus=()=>alertSettingsError?{error:alertSettingsError}:priceAlerts.snapshot();
    const readyAlerts=()=>{if(alertSettingsError)throw new Error(alertSettingsError);};
    const alertChanged=()=>{if(window&&!window.isDestroyed())window.webContents.send('alerts:changed',alertStatus());};
    notifier=new PriceNotifications({Notification,
      register:()=>registerWindowsShortcut({app,shell,path,fs}),
      onDelivery:(ids,status,message)=>{try{priceAlerts.delivery(ids,status,message);alertChanged();}catch(error){alertSettingsError=error.message;alertChanged();}},
      onClick:(stockId,ids)=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();window.webContents.send('alerts:open',{stockId,ids});}}
    });
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
    handler('ledger:load', () => ({ state:store.load(), dataDirectory, market:marketStatus(), alerts:alertStatus() }));
    handler('ledger:save', async (state,revision) => {const saved=await store.save(state,revision);if(!alertSettingsError){try{priceAlerts.reconcile(saved);alertChanged();}catch(error){alertSettingsError=error.message;alertChanged();}}return saved;});
    handler('alerts:save', input => {readyAlerts();const result=priceAlerts.upsert(input,store.load());alertChanged();return result;});
    handler('alerts:action', (id,action) => {readyAlerts();const result=priceAlerts.action(id,action,store.load());alertChanged();return result;});
    handler('alerts:read', id => {readyAlerts();const result=priceAlerts.read(id);alertChanged();return result;});
    handler('alerts:reset', () => {readyAlerts();const result=priceAlerts.reconcile(store.load(),{reset:true});alertChanged();return result;});
    handler('alerts:test', () => {readyAlerts();const event=priceAlerts.testEvent();alertChanged();notifier.send([event]);return priceAlerts.snapshot();});
    handler('market:quotes', async (symbols,options) => {
      readyMarket();const ledger=store.load();
      const requested=(ledger?.stocks||[]).filter(s=>{try{return symbols.includes(s.symbol)&&!!QuoteModel.normalizeSymbol(s.symbol);}catch{return false;}}).map(s=>({id:s.id,symbol:s.symbol}));
      const armed=alertSettingsError?[]:priceAlerts.snapshot().rules.filter(r=>r.enabled).map(r=>({id:r.id,token:r.token}));
      const response=await marketQuotes.fetch(symbols,{automatic:options?.automatic===true});
      if(!alertSettingsError&&requested.length&&response.results?.length){
        try{
          const current=store.load(),applied=QuoteModel.applyResults(current,requested,response.results);
          const accepted=new Set(applied.updated.map(s=>s.id));
          const events=priceAlerts.evaluate(current,requested.filter(r=>accepted.has(r.id)),response.results,armed);
          alertChanged();notifier.send(events);
        }catch(error){alertSettingsError=error.message;alertChanged();}
      }
      return {...response,alerts:alertStatus()};
    });
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
