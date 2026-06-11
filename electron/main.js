const { app, BrowserWindow, ipcMain, shell, screen, Tray, Menu, nativeImage, dialog } = require('electron');
const baileys = require('./baileys');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { execFile } = require('child_process');
const crypto = require('crypto');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// ── Single instance lock ─────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = false;

const PROD_URL       = 'https://sistema-cartera.vercel.app';
const ACTIVATION_FILE = path.join(app.getPath('userData'), 'activation.json');
const CARPETA_FILE    = path.join(app.getPath('userData'), 'ultima-carpeta.json');
const PDFS_DIR        = path.join(app.getPath('userData'), 'pdfs');

// ── Activación ───────────────────────────────────────────────
function loadActivation() {
  try { if (fs.existsSync(ACTIVATION_FILE)) return JSON.parse(fs.readFileSync(ACTIVATION_FILE, 'utf8')); } catch (_) {}
  return null;
}
function saveActivation(data) { fs.writeFileSync(ACTIVATION_FILE, JSON.stringify(data), 'utf8'); }
function getOrCreateDeviceId() {
  const saved = loadActivation();
  if (saved?.deviceId) return saved.deviceId;
  const id = crypto.randomUUID();
  saveActivation({ deviceId: id });
  return id;
}

// ── Carpeta ──────────────────────────────────────────────────
function guardarUltimaCarpeta(ruta) {
  try { fs.writeFileSync(CARPETA_FILE, JSON.stringify({ ruta }), 'utf8'); } catch (_) {}
}
function cargarUltimaCarpeta() {
  try { if (fs.existsSync(CARPETA_FILE)) return JSON.parse(fs.readFileSync(CARPETA_FILE, 'utf8')).ruta || null; } catch (_) {}
  return null;
}

// ── API activación ───────────────────────────────────────────
async function validateCodeWithAPI(codigo, device_id) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${PROD_URL}/api/activaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, device_id }),
      signal: controller.signal,
    });
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') return { ok: false, error: 'El servidor tardó demasiado.' };
    return { ok: false, error: 'Sin conexión a internet' };
  } finally { clearTimeout(timer); }
}

// ── Ventanas ─────────────────────────────────────────────────
let splashWin = null, activationWin = null, mainWin = null, tray = null;

// ── Watcher ──────────────────────────────────────────────────
let watcherActivo = null;
let carpetaVigilada = null;
const archivosRecientes = new Set();
const debouncers = new Map();

function iniciarWatcher(carpeta) {
  if (watcherActivo) { try { watcherActivo.close(); } catch (_) {} watcherActivo = null; }
  carpetaVigilada = carpeta;
  guardarUltimaCarpeta(carpeta);

  try {
    watcherActivo = fs.watch(carpeta, (eventType, filename) => {
      if (!filename || !filename.toLowerCase().endsWith('.pdf')) return;
      if (archivosRecientes.has(filename)) return;

      if (debouncers.has(filename)) { clearTimeout(debouncers.get(filename)); }

      const timer = setTimeout(() => {
        debouncers.delete(filename);
        const rutaCompleta = path.join(carpeta, filename);
        if (!fs.existsSync(rutaCompleta)) return;

        archivosRecientes.add(filename);
        setTimeout(() => archivosRecientes.delete(filename), 5000);

        try {
          const stats = fs.statSync(rutaCompleta);
          if (stats.size > 3 * 1024 * 1024) return;

          const buffer = fs.readFileSync(rutaCompleta);
          const base64 = 'data:application/pdf;base64,' + buffer.toString('base64');
          const sinExt = filename.replace(/\.pdf$/i, '');
          const nombreCliente = sinExt.split('.')[0].trim();

          if (mainWin && !mainWin.isDestroyed()) {
            mainWin.webContents.send('pdf-nuevo-detectado', { filename, nombreCliente, base64 });
            log.info('[watcher] PDF detectado:', filename);
          }

          // Buscar cliente y subir PDF siempre (independiente de WhatsApp)
          ;(async () => {
            try {
              const res = await fetch(`${PROD_URL}/api/watcher?nombre=${encodeURIComponent(nombreCliente)}&secret=paytrack-watcher-2026`);
              if (res.ok) {
                const cliente = await res.json();
                if (cliente?.id) {
                  // Marcar como Cotizado siempre
                  await fetch(`${PROD_URL}/api/watcher?accion=cotizado&id=${cliente.id}&secret=paytrack-watcher-2026`, { method: 'POST' }).catch(() => {});
                  log.info('[watcher] Cliente marcado como Cotizado:', cliente.nombre);
                }
              }
            } catch(err) {
              log.error('[watcher] Error marcando cotizado:', err.message);
            }
          })();

          // Enviar automáticamente por Baileys si está conectado
          ;(async () => {
            try {
              const conectado = await baileys.esperarConexion(30000);
              if (!conectado) { log.warn('[watcher] Baileys no conectado, no se envió:', filename); return; }
              const res = await fetch(`${PROD_URL}/api/watcher?nombre=${encodeURIComponent(nombreCliente)}&secret=paytrack-watcher-2026`);
                if (res.ok) {
                  const cliente = await res.json();
                  if (cliente?.contacto) {
                    const hora = new Date().getHours();
                    const saludo = hora >= 5 && hora < 12 ? 'Buenos días' : hora >= 12 && hora < 19 ? 'Buenas tardes' : 'Buenas noches';

                    // Extraer mes y año del nombre del archivo (ej: YASMIN.SER.MAYO.2026.pdf)
                    const partes = sinExt.split('.');
                    const mesNombre = partes[2] || '';
                    const anio = partes[3] || new Date().getFullYear();

                    // Calcular fecha límite (día 15 del mes siguiente)
                    const meses = { ENERO:'FEBRERO', FEBRERO:'MARZO', MARZO:'ABRIL', ABRIL:'MAYO', MAYO:'JUNIO', JUNIO:'JULIO', JULIO:'AGOSTO', AGOSTO:'SEPTIEMBRE', SEPTIEMBRE:'OCTUBRE', OCTUBRE:'NOVIEMBRE', NOVIEMBRE:'DICIEMBRE', DICIEMBRE:'ENERO' };
                    const mesSiguiente = meses[mesNombre.toUpperCase()] || 'SIGUIENTE';

                    const monto = cliente.monto_cotizacion ? `$${parseFloat(cliente.monto_cotizacion).toFixed(2)}` : '$0.00';

                    const mensaje = `Saludos ${saludo}!\nLa factura por EL MES DE ${mesNombre.toUpperCase()} ${anio}📃 ha sido generada.\n💠Recordandole: que la misma tiene un plazo hasta el dia 15 DE ${mesSiguiente} ${anio} para el pago.\n💰 Monto a pagar: ${monto}\n⚠️LOS PAGOS SE REALIZAN A NUESTRAS CUENTAS DE BANCOS⚠️\nCUENTAS:\nA nombre: 7LABS\n🟢Reservas: 248 013348 5\n🔵Popular:     782 6584 05\n🟢BHD:         1587 811 0015\n🧾RNC: 130-82698-6`;

                    const pdfPath = path.join(PDFS_DIR, `${Date.now()}_${filename}`);
                    fs.writeFileSync(pdfPath, buffer);
                    await baileys.enviarPDF(cliente.contacto, pdfPath, filename, mensaje);
                    log.info('[watcher] PDF enviado por WhatsApp a:', cliente.nombre);

                    // Notificación nativa de Windows
                    const { Notification } = require('electron');
                    if (Notification.isSupported()) {
                      new Notification({
                        title: 'PayTrack — PDF Enviado',
                        body: `✅ Factura enviada a ${cliente.nombre} por WhatsApp`,
                        icon: path.join(__dirname, 'assets', 'icon.png')
                      }).show();
                    }

                    // Marcar como Cotizado
                    await fetch(`${PROD_URL}/api/watcher?accion=cotizado&id=${cliente.id}&secret=paytrack-watcher-2026`, { method: 'POST' }).catch(() => {});

                    // Marcar como Notificado
                    await fetch(`${PROD_URL}/api/watcher?accion=notificado&id=${cliente.id}&secret=paytrack-watcher-2026`, { method: 'POST' }).catch(() => {});

                    if (mainWin && !mainWin.isDestroyed()) {
                      mainWin.webContents.send('pdf-enviado-whatsapp', { filename, nombreCliente, ok: true });
                    }
                  }
                }
              } catch(err) {
                log.error('[watcher] Error enviando por WhatsApp:', err.message);
              }
            })();

        } catch (err) { log.error('[watcher] Error leyendo PDF:', err.message); }
      }, 2000);

      debouncers.set(filename, timer);
    });

    watcherActivo.on('error', (err) => { log.error('[watcher] Error:', err.message); });
    log.info('[watcher] Iniciado en:', carpeta);
    updateTrayMenu();
  } catch (err) { log.error('[watcher] No se pudo iniciar:', err.message); }
}

function detenerWatcher() {
  if (watcherActivo) { try { watcherActivo.close(); } catch (_) {} watcherActivo = null; }
  carpetaVigilada = null;
  updateTrayMenu();
}

// ── Tray ─────────────────────────────────────────────────────
function createTray() {
  if (tray) return;
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('PayTrack');
  updateTrayMenu();
  tray.on('click', () => {
    if (mainWin && !mainWin.isDestroyed()) { mainWin.show(); mainWin.focus(); }
    else if (activationWin && !activationWin.isDestroyed()) activationWin.focus();
  });
}

function updateTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: 'PayTrack', enabled: false },
    { type: 'separator' },
    { label: carpetaVigilada ? `Vigilando: ${path.basename(carpetaVigilada)}` : 'Sin carpeta vigilada', enabled: false },
    ...(carpetaVigilada ? [{ label: 'Detener watcher', click: () => { detenerWatcher(); if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('watcher-detenido'); } }] : []),
    { type: 'separator' },
    { label: 'Mostrar ventana', click: () => { if (mainWin && !mainWin.isDestroyed()) { mainWin.show(); mainWin.focus(); } } },
    { type: 'separator' },
    { label: 'Cerrar aplicación', click: () => { detenerWatcher(); tray?.destroy(); tray = null; if (mainWin && !mainWin.isDestroyed()) mainWin.destroy(); if (activationWin && !activationWin.isDestroyed()) activationWin.destroy(); app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

// ── autoUpdater ──────────────────────────────────────────────
autoUpdater.on('error', (err) => { log.error('[autoUpdater]', err.message); if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('update-error', err.message); });
autoUpdater.on('update-available', (info) => { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('update-available', info.version); });
autoUpdater.on('download-progress', (p) => { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('download-progress', Math.round(p.percent)); });
autoUpdater.on('update-downloaded', () => { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('update-downloaded'); });

// ── Splash ───────────────────────────────────────────────────
function createSplashWindow() {
  splashWin = new BrowserWindow({ width: 480, height: 300, resizable: false, frame: false, transparent: false, skipTaskbar: true, alwaysOnTop: true, center: true, icon: path.join(__dirname, 'assets', 'icon.png'), title: 'PayTrack', webPreferences: { contextIsolation: true, nodeIntegration: false } });
  splashWin.loadFile(path.join(__dirname, 'splash.html'));
  splashWin.setMenuBarVisibility(false);
}
function closeSplash() { if (!splashWin) return; splashWin.destroy(); splashWin = null; }

// ── Activation ───────────────────────────────────────────────
function createActivationWindow() {
  activationWin = new BrowserWindow({ width: 460, height: 500, resizable: false, frame: false, titleBarStyle: 'hidden', icon: path.join(__dirname, 'assets', 'icon.png'), title: 'PayTrack — Activación', webPreferences: { preload: path.join(__dirname, 'preload-activation.js'), contextIsolation: true, nodeIntegration: false } });
  activationWin.loadFile(path.join(__dirname, 'activation.html'));
  activationWin.setMenuBarVisibility(false);
  activationWin.on('closed', () => { activationWin = null; });
}

// ── Offline HTML ─────────────────────────────────────────────
const OFFLINE_HTML = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Sin conexión — PayTrack</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;background:#0f0f11;color:#e4e4e7;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;-webkit-app-region:drag}.card{-webkit-app-region:no-drag;text-align:center;display:flex;flex-direction:column;align-items:center;gap:0.75rem}h2{font-size:1.25rem;color:#f87171}p{font-size:0.85rem;color:#71717a;max-width:320px;line-height:1.6}button{margin-top:0.25rem;padding:0.6rem 1.5rem;background:#635bff;color:#fff;border:none;border-radius:8px;font-size:0.9rem;cursor:pointer}button:hover{background:#4f46e5}</style></head><body><div class="card"><h2>Sin conexión a Internet</h2><p>PayTrack necesita conexión para cargar.<br>Verifica tu red y vuelve a intentarlo.</p><button onclick="if(window.electronAPI)window.electronAPI.reloadApp();else location.reload()">Reintentar</button></div></body></html>`;

// ── Main Window ──────────────────────────────────────────────
function createMainWindow() {
  mainWin = new BrowserWindow({ width: 1280, height: 800, minWidth: 960, minHeight: 600, frame: true, autoHideMenuBar: true, title: 'PayTrack — Gestión de Cartera', show: false, backgroundColor: '#1a1915', icon: path.join(__dirname, 'assets', 'icon.png'), titleBarOverlay: { color: '#191919', symbolColor: '#ffffff', height: 36 }, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false } });
  mainWin.setMenuBarVisibility(false);

  mainWin.webContents.session.clearCache().then(() => {
    mainWin.loadURL(PROD_URL).catch((err) => { log.warn('[mainWin] loadURL error:', err.message); });
  });

  mainWin.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    if (errorCode === -3) return;
    log.warn('[mainWin] did-fail-load:', errorCode, errorDescription);
    closeSplash();
    mainWin.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(OFFLINE_HTML)}`);
    if (!mainWin.isVisible()) mainWin.show();
  });

  setTimeout(() => { autoUpdater.checkForUpdates().catch((err) => { log.warn('[autoUpdater] checkForUpdates falló:', err.message); }); }, 3000);

  mainWin.webContents.once('did-finish-load', () => { closeSplash(); mainWin.show(); });

  mainWin.webContents.on('did-finish-load', () => {
    // Reanudar watcher si había carpeta guardada
    const ultimaCarpeta = cargarUltimaCarpeta();
    if (ultimaCarpeta && fs.existsSync(ultimaCarpeta) && !watcherActivo) {
      iniciarWatcher(ultimaCarpeta);
      mainWin.webContents.send('watcher-iniciado', ultimaCarpeta);
    }

    mainWin.webContents.executeJavaScript(`
      (function() {
        function syncControls() {
          const appControls = document.getElementById('electron-win-controls');
          let floatWrap = document.getElementById('__electron-win-btns');
          if (appControls) { if (floatWrap) floatWrap.remove(); return; }
          if (floatWrap) return;
          floatWrap = document.createElement('div');
          floatWrap.id = '__electron-win-btns';
          floatWrap.style.cssText = 'position:fixed;top:10px;right:10px;z-index:99999;display:flex;gap:6px';
          function mkBtn(symbol, title, hoverBg, color, fn) {
            const b = document.createElement('button');
            b.textContent = symbol; b.title = title;
            b.style.cssText = 'width:28px;height:28px;border:none;border-radius:6px;background:rgba(255,255,255,0.08);color:' + color + ';font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.15s';
            b.onmouseenter = () => b.style.background = hoverBg;
            b.onmouseleave = () => b.style.background = 'rgba(255,255,255,0.08)';
            b.onclick = fn; return b;
          }
          floatWrap.appendChild(mkBtn('─', 'Minimizar', 'rgba(255,255,255,0.2)', '#a1a1aa', () => window.electronAPI?.minimizeWindow()));
          floatWrap.appendChild(mkBtn('✕', 'Cerrar PayTrack', 'rgba(248,113,113,0.4)', '#f87171', () => window.electronAPI?.closeWindow()));
          document.body.appendChild(floatWrap);
        }
        syncControls();
        new MutationObserver(syncControls).observe(document.body, { childList: true, subtree: true });
      })();
    `).catch(() => {});
  });

  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('whatsapp://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWin.on('closed', () => { mainWin = null; });
  mainWin.on('close', (e) => {
    if (!app._quitting) {
      e.preventDefault();
      mainWin.hide();
    }
  });
}

// ── Segunda instancia ────────────────────────────────────────
app.on('second-instance', () => {
  if (mainWin && !mainWin.isDestroyed()) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); }
  else if (activationWin && !activationWin.isDestroyed()) activationWin.focus();
});

// ── App ready ────────────────────────────────────────────────
app.whenReady().then(async () => {
  if (!fs.existsSync(PDFS_DIR)) fs.mkdirSync(PDFS_DIR, { recursive: true });
  createTray();
  createSplashWindow();

  // Iniciar Baileys WhatsApp
  baileys.onQR((qrImage) => {
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('whatsapp-qr', qrImage);
  });
  baileys.onStatus((status) => {
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('whatsapp-status', status);
  });
  baileys.iniciarBaileys().catch(err => log.error('[Baileys] Error al iniciar:', err.message));
  const deviceId = getOrCreateDeviceId();
  const saved    = loadActivation();
  if (saved?.code) {
    const result = await validateCodeWithAPI(saved.code, deviceId);
    if (result.ok) { createMainWindow(); return; }
    log.warn('[activation] Validación fallida:', result.error);
  }
  closeSplash();
  createActivationWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createActivationWindow(); });
});

app.on('window-all-closed', () => {
  // No cerrar completamente - mantener watcher y Baileys activos
});

// Minimizar al tray en vez de cerrar
if (mainWin) {
  mainWin.on('close', (e) => {
    if (!app._quitting) {
      e.preventDefault();
      mainWin.hide();
      if (tray) {
        tray.displayBalloon && tray.displayBalloon({
          title: 'PayTrack',
          content: 'La app sigue corriendo en segundo plano. El watcher está activo.',
          icon: 'info'
        });
      }
    }
  });
}

app.on('before-quit', () => { app._quitting = true; });

// ── IPC: activación ──────────────────────────────────────────
ipcMain.handle('validate-activation', async (event, codigo) => {
  if (typeof codigo !== 'string' || !/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(codigo)) return { ok: false, error: 'Formato de código inválido' };
  const deviceId = getOrCreateDeviceId();
  const result   = await validateCodeWithAPI(codigo, deviceId);
  if (result.ok) {
    saveActivation({ code: codigo, deviceId });
    if (activationWin && !activationWin.isDestroyed()) {
      setTimeout(() => { if (activationWin && !activationWin.isDestroyed()) { activationWin.close(); activationWin = null; } createMainWindow(); }, 1200);
    } else { createMainWindow(); }
  }
  return result;
});

// ── IPC: ventana ─────────────────────────────────────────────
ipcMain.on('window-minimize', () => { const win = BrowserWindow.getFocusedWindow() || mainWin; if (win && !win.isDestroyed()) win.minimize(); });
ipcMain.on('window-maximize', () => { const win = BrowserWindow.getFocusedWindow() || mainWin; if (!win || win.isDestroyed()) return; if (win.isFullScreen()) win.setFullScreen(false); else if (win.isMaximized()) win.unmaximize(); else win.maximize(); });
ipcMain.on('window-close', () => { if (activationWin && !activationWin.isDestroyed()) { activationWin.destroy(); activationWin = null; app.quit(); return; } if (mainWin && !mainWin.isDestroyed()) { mainWin.destroy(); mainWin = null; } app.quit(); });
ipcMain.handle('toggle-fullscreen', () => { const win = BrowserWindow.getFocusedWindow() || mainWin; if (!win || win.isDestroyed()) return; win.setFullScreen(!win.isFullScreen()); });
ipcMain.on('window-reload', () => { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.session.clearCache().then(() => mainWin.loadURL(PROD_URL).catch((err) => log.warn('[reload]', err.message))); });

// ── FIX #5: reloadApp ────────────────────────────────────────
ipcMain.on('reload-app', () => { if (mainWin && !mainWin.isDestroyed()) mainWin.loadURL(PROD_URL).catch(() => {}); });

// ── IPC: auto-update ─────────────────────────────────────────
ipcMain.on('start-download', () => { autoUpdater.downloadUpdate().catch((err) => log.error('[autoUpdater]', err.message)); });
ipcMain.on('install-update', () => { autoUpdater.quitAndInstall(); });
ipcMain.handle('get-version', () => app.getVersion());

// ── IPC: modo mini ───────────────────────────────────────────
ipcMain.handle('toggle-mini', () => {
  const win = BrowserWindow.getFocusedWindow() || mainWin;
  if (!win || win.isDestroyed()) return;
  const [w] = win.getSize();
  if (w <= 380) { win.setSize(1280, 800); win.setResizable(true); win.center(); }
  else { const { width, height } = screen.getPrimaryDisplay().workAreaSize; win.setSize(340, 240); win.setResizable(false); win.setPosition(width - 360, height - 260); }
});

// ── FIX #1 y #4: send-pdf-whatsapp con SetFileDropList y delay ──
const MAX_PDF_BYTES = 25 * 1024 * 1024;

ipcMain.handle('send-pdf-whatsapp', async (event, payload) => {
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'Parámetros inválidos' };
  const { base64, filename, phone, message } = payload;
  if (typeof base64 !== 'string' || base64.length === 0) return { ok: false, error: 'PDF inválido' };
  if (base64.length > MAX_PDF_BYTES * 1.4) return { ok: false, error: 'PDF demasiado grande (máx. 25 MB)' };

  let pdfPath = null;

  try {
    const cleanB64 = base64.includes(',') ? base64.split(',')[1] : base64;
    const safeName = ((typeof filename === 'string' ? filename : '') || 'documento.pdf')
      .replace(/[^a-zA-Z0-9._\- ]/g, '_').replace(/\.{2,}/g, '_').slice(0, 120);

    // FIX #4: guardar en carpeta permanente, no tmpdir
    pdfPath = path.join(PDFS_DIR, `${Date.now()}_${safeName}`);
    fs.writeFileSync(pdfPath, Buffer.from(cleanB64, 'base64'));

    // FIX #1: usar SetFileDropList de System.Windows.Forms
    await new Promise((resolve, reject) => {
      const psScript = `Add-Type -AssemblyName System.Windows.Forms;$f=New-Object System.Collections.Specialized.StringCollection;$f.Add('${pdfPath.replace(/'/g, "''")}');[System.Windows.Forms.Clipboard]::SetFileDropList($f)`;
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      execFile('powershell', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
        { timeout: 10000 },
        (err) => (err ? reject(err) : resolve())
      );
    });

    // Abrir WhatsApp
    const num = (typeof phone === 'string' ? phone : '').replace(/\D/g, '');
    if (num) {
      const text = (typeof message === 'string' ? message : '').trim();
      const url = text ? `whatsapp://send?phone=${num}&text=${encodeURIComponent(text)}` : `whatsapp://send?phone=${num}`;
      await shell.openExternal(url);
    }

    // FIX #4: limpiar PDFs viejos (más de 30 días)
    setTimeout(() => {
      try {
        const ahora = Date.now();
        fs.readdirSync(PDFS_DIR).forEach(f => {
          const ruta = path.join(PDFS_DIR, f);
          const stats = fs.statSync(ruta);
          if (ahora - stats.mtimeMs > 30 * 24 * 60 * 60 * 1000) fs.unlinkSync(ruta);
        });
      } catch (_) {}
    }, 1000);

    return { ok: true };
  } catch (err) {
    log.error('[send-pdf-whatsapp]', err.message);
    return { ok: false, error: err.message };
  }
});

// ── IPC: watcher ─────────────────────────────────────────────
ipcMain.handle('seleccionar-carpeta-pdfs', async () => {
  const ultimaCarpeta = cargarUltimaCarpeta();
  const result = await dialog.showOpenDialog(mainWin, {
    title: 'Seleccionar carpeta de facturas del mes',
    defaultPath: ultimaCarpeta || app.getPath('documents'),
    properties: ['openDirectory'],
    buttonLabel: 'Seleccionar carpeta',
  });
  if (result.canceled || !result.filePaths.length) return { ok: false, cancelado: true };
  const carpeta = result.filePaths[0];
  iniciarWatcher(carpeta);

  let archivos;
  try { archivos = fs.readdirSync(carpeta).filter(f => f.toLowerCase().endsWith('.pdf')); }
  catch (err) { return { ok: false, error: 'No se pudo leer la carpeta: ' + err.message }; }

  if (archivos.length === 0) return { ok: true, carpeta, totalArchivos: 0, pdfs: [] };

  const pdfs = [];
  for (const archivo of archivos) {
    const rutaCompleta = path.join(carpeta, archivo);
    try {
      const stats = fs.statSync(rutaCompleta);
      if (stats.size > 3 * 1024 * 1024) { pdfs.push({ nombre: archivo, error: 'Mayor a 3MB', base64: null }); continue; }
      const buffer = fs.readFileSync(rutaCompleta);
      const base64 = 'data:application/pdf;base64,' + buffer.toString('base64');
      const nombreCliente = archivo.replace(/\.pdf$/i, '').split('.')[0].trim();
      pdfs.push({ nombre: archivo, nombreCliente, base64, error: null });
    } catch (err) { pdfs.push({ nombre: archivo, error: err.message, base64: null }); }
  }

  return { ok: true, carpeta, totalArchivos: archivos.length, pdfs };
});

ipcMain.handle('detener-watcher', () => { detenerWatcher(); return { ok: true }; });
ipcMain.handle('estado-watcher', () => ({ activo: !!watcherActivo, carpeta: carpetaVigilada }));

// ── IPC: WhatsApp Baileys ─────────────────────────────────────
ipcMain.handle('whatsapp-status', () => ({ conectado: baileys.estaConectado() }));

ipcMain.handle('whatsapp-enviar-mensaje', async (event, { numero, mensaje }) => {
  try {
    await baileys.enviarMensaje(numero, mensaje);
    return { ok: true };
  } catch(err) {
    log.error('[Baileys] enviarMensaje:', err.message);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('whatsapp-enviar-pdf', async (event, { numero, base64, filename, mensaje }) => {
  try {
    const cleanB64 = base64.includes(',') ? base64.split(',')[1] : base64;
    const pdfPath = path.join(PDFS_DIR, Date.now() + '_' + filename);
    fs.writeFileSync(pdfPath, Buffer.from(cleanB64, 'base64'));
    await baileys.enviarPDF(numero, pdfPath, filename, mensaje);
    return { ok: true };
  } catch(err) {
    log.error('[Baileys] enviarPDF:', err.message);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('whatsapp-cerrar-sesion', async () => {
  try {
    await baileys.cerrarSesion();
    return { ok: true };
  } catch(err) {
    return { ok: false, error: err.message };
  }
});
