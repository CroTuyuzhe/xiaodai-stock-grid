const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  quotes: (symbols,options) => ipcRenderer.invoke('market:quotes',symbols,options),
  configureMarket: enabled => ipcRenderer.invoke('market:configure',enabled),
  resumeMarket: () => ipcRenderer.invoke('market:resume'),
  saveAlert: input => ipcRenderer.invoke('alerts:save',input),
  alertAction: (id,action) => ipcRenderer.invoke('alerts:action',id,action),
  readAlerts: id => ipcRenderer.invoke('alerts:read',id),
  resetAlerts: () => ipcRenderer.invoke('alerts:reset'),
  testAlert: () => ipcRenderer.invoke('alerts:test'),
  onAlertsChanged: callback => {const listener=(_event,data)=>callback(data);ipcRenderer.on('alerts:changed',listener);return ()=>ipcRenderer.removeListener('alerts:changed',listener);},
  onAlertOpen: callback => {const listener=(_event,data)=>callback(data);ipcRenderer.on('alerts:open',listener);return ()=>ipcRenderer.removeListener('alerts:open',listener);},
  load: () => ipcRenderer.invoke('ledger:load'),
  save: (state,revision) => ipcRenderer.invoke('ledger:save',state,revision),
  export: (content,extension) => ipcRenderer.invoke('ledger:export',content,extension),
  import: () => ipcRenderer.invoke('ledger:import'),
  folder: () => ipcRenderer.invoke('ledger:folder')
});
