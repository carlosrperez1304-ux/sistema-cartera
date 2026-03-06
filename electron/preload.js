const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  sendPDFWhatsApp: (base64, filename, phone) =>
    ipcRenderer.invoke('send-pdf-whatsapp', { base64, filename, phone }),
});
