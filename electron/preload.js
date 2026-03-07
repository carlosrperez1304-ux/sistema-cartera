const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  sendPDFWhatsApp: (base64, filename, phone, message) =>
    ipcRenderer.invoke('send-pdf-whatsapp', { base64, filename, phone, message }),
  windowControl: (action) => ipcRenderer.invoke('window-control', action),
  toggleMini: () => ipcRenderer.invoke('toggle-mini'),
});
