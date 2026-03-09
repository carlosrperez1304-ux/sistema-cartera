const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow:    () => ipcRenderer.send('window-close'),
  toggleMini:       () => ipcRenderer.invoke('toggle-mini'),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  sendPDFWhatsApp: (base64, filename, phone, message) =>
    ipcRenderer.invoke('send-pdf-whatsapp', { base64, filename, phone, message }),
  getVersion: () => ipcRenderer.invoke('get-version'),
  // Auto-update
  onUpdateAvailable:  (cb) => ipcRenderer.on('update-available',  (_, version) => cb(version)),
  onDownloadProgress: (cb) => ipcRenderer.on('download-progress', (_, percent) => cb(percent)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', () => cb()),
  startDownload:  () => ipcRenderer.send('start-download'),
  installUpdate:  () => ipcRenderer.send('install-update'),
});
