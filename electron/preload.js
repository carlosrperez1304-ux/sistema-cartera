const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  // ── Controles de ventana ──
  minimizeWindow:   () => ipcRenderer.send('window-minimize'),
  maximizeWindow:   () => ipcRenderer.send('window-maximize'),
  closeWindow:      () => ipcRenderer.send('window-close'),
  toggleMini:       () => ipcRenderer.invoke('toggle-mini'),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  reloadApp:        () => ipcRenderer.send('window-reload'),

  // ── PDF a WhatsApp ──
  sendPDFWhatsApp: (base64, filename, phone, message) =>
    ipcRenderer.invoke('send-pdf-whatsapp', { base64, filename, phone, message }),

  // ── Versión ──
  getVersion: () => ipcRenderer.invoke('get-version'),

  // ── Watcher de carpeta ──
  seleccionarCarpetaPDFs: () => ipcRenderer.invoke('seleccionar-carpeta-pdfs'),
  detenerWatcher:         () => ipcRenderer.invoke('detener-watcher'),
  estadoWatcher:          () => ipcRenderer.invoke('estado-watcher'),

  onPdfNuevoDetectado: (cb) => {
    const listener = (_, data) => cb(data);
    ipcRenderer.on('pdf-nuevo-detectado', listener);
    return () => ipcRenderer.removeListener('pdf-nuevo-detectado', listener);
  },
  onWatcherIniciado: (cb) => {
    const listener = (_, carpeta) => cb(carpeta);
    ipcRenderer.on('watcher-iniciado', listener);
    return () => ipcRenderer.removeListener('watcher-iniciado', listener);
  },
  onWatcherDetenido: (cb) => {
    ipcRenderer.on('watcher-detenido', () => cb());
  },

  // ── Auto-update ──
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
    ipcRenderer.once('update-downloaded', () => cb());
  },
  onUpdateError: (cb) => {
    const listener = (_, msg) => cb(msg);
    ipcRenderer.on('update-error', listener);
    return () => ipcRenderer.removeListener('update-error', listener);
  },
  startDownload: () => ipcRenderer.send('start-download'),
  installUpdate: () => ipcRenderer.send('install-update'),
});
