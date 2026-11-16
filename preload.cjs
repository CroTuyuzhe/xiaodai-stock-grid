const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  quotes: symbols => ipcRenderer.invoke('market:quotes',symbols),
  load: () => ipcRenderer.invoke('ledger:load'),
  save: (state,revision) => ipcRenderer.invoke('ledger:save',state,revision),
  export: (content,extension) => ipcRenderer.invoke('ledger:export',content,extension),
  import: () => ipcRenderer.invoke('ledger:import'),
  folder: () => ipcRenderer.invoke('ledger:folder')
});
