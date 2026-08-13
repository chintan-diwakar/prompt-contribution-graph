const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('promptTrailDesktop', {
  shareActivity: (payload) => ipcRenderer.invoke('prompttrail:share-activity', payload),
});
