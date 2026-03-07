const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow:    () => ipcRenderer.send('window-close'),
  toggleMini:     () => ipcRenderer.invoke('toggle-mini'),
  sendPDFWhatsApp: (base64, filename, phone, message) =>
    ipcRenderer.invoke('send-pdf-whatsapp', { base64, filename, phone, message }),
});
