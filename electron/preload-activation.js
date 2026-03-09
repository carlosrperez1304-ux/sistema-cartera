const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('activationAPI', {
  validate:    (code) => ipcRenderer.invoke('validate-activation', code),
  closeWindow: ()     => ipcRenderer.send('window-close'),
});
