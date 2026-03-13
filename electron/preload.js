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

  // FIX: Retornar función de limpieza para evitar fuga de listeners al re-renderizar
  onUpdateAvailable: (cb) => {
    const listener = (_, version) => cb(version);
    ipcRenderer.on('update-available', listener);
    return () => ipcRenderer.removeListener('update-available', listener);
  },
  onDownloadProgress: (cb) => {
    const listener = (_, percent) => cb(percent);
    ipcRenderer.on('download-progress', listener);
    return () => ipcRenderer.removeListener('download-progress', listener);
  },
  onUpdateDownloaded: (cb) => {
    // once: solo se dispara una vez, sin necesidad de cleanup manual
    ipcRenderer.once('update-downloaded', () => cb());
  },
  onUpdateError: (cb) => {
    const listener = (_, msg) => cb(msg);
    ipcRenderer.on('update-error', listener);
    return () => ipcRenderer.removeListener('update-error', listener);
  },

  startDownload: () => ipcRenderer.send('start-download'),
  installUpdate: () => ipcRenderer.send('install-update'),
  // FIX: Recargar la URL real (usado por página offline — location.reload() no funciona en data:URI)
  reloadApp: () => ipcRenderer.send('window-reload'),
});
