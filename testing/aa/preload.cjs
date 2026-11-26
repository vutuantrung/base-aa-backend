const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('aa', {
  getLogs: () => ipcRenderer.invoke('aa:logs'),
  checkHttp: () => ipcRenderer.invoke('aa:check-http'),
  refreshTasks: () => ipcRenderer.invoke('aa:refresh-tasks'),
  getSelectionOptions: () => ipcRenderer.invoke('aa:selection-options'),
  refreshSelections: () => ipcRenderer.invoke('aa:refresh-selections'),
  submitSelection: selection => ipcRenderer.invoke('aa:submit-selection', selection),
  onLog: callback => {
    const listener = (_event, record) => callback(record);
    ipcRenderer.on('aa:log', listener);
    return () => ipcRenderer.removeListener('aa:log', listener);
  }
});
