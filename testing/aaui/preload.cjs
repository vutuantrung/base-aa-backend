const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('aaui', {
  getLogs: () => ipcRenderer.invoke('aaui:logs'),
  checkHttp: () => ipcRenderer.invoke('aaui:check-http'),
  refreshTasks: () => ipcRenderer.invoke('aaui:refresh-tasks'),
  onLog: callback => {
    const listener = (_event, record) => callback(record);
    ipcRenderer.on('aaui:log', listener);
    return () => ipcRenderer.removeListener('aaui:log', listener);
  }
});
