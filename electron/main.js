const { app, BrowserWindow, ipcMain, shell, screen, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { execFile } = require('child_process');
const crypto = require('crypto');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// ── Single instance lock ─────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = false;

// ── URL de producción en Vercel ─────────────────────────────
const PROD_URL = 'https://sistema-cartera.vercel.app';

// ── Rutas de activación ─────────────────────────────────────
const ACTIVATION_FILE = path.join(app.getPath('userData'), 'activation.json');

// ── Ruta donde se guarda la última carpeta seleccionada ──────
const CARPETA_FILE = path.join(app.getPath('userData'), 'ultima-carpeta.json');

function loadActivation() {
  try {
    if (fs.existsSync(ACTIVATION_FILE)) {
      return JSON.parse(fs.readFileSync(ACTIVATION_FILE, 'utf8'));
    }
  } catch (_) {}
  return null;
}

function saveActivation(data) {
  fs.writeFileSync(ACTIVATION_FILE, JSON.stringify(data), 'utf8');
}

function getOrCreateDeviceId() {
  const saved = loadActivation();
  if (saved?.deviceId) return saved.deviceId;
  const id = crypto.randomUUID();
  saveActivation({ deviceId: id });
  return id;
}

// ── Guardar y cargar última carpeta usada ───────────────────
function guardarUltimaCarpeta(rutaCarpeta) {
  try {
    fs.writeFileSync(CARPETA_FILE, JSON.stringify({ ruta: rutaCarpeta }), 'utf8');
  } catch (_) {}
}

function cargarUltimaCarpeta() {
  try {
    if (fs.existsSync(CARPETA_FILE)) {
      const data = JSON.parse(fs.readFileSync(CARPETA_FILE, 'utf8'));
      return data.ruta || null;
    }
  } catch (_) {}
  return null;
}

// ── Validar código contra la API ────────────────────────────
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
    if (err.name === 'AbortError') {
      return { ok: false, error: 'El servidor tardó demasiado. Verifica tu conexión.' };
    }
    return { ok: false, error: 'Sin conexión a internet' };
  } finally {
    clearTimeout(timer);
  }
}

// ── Ventanas ─────────────────────────────────────────────────
let splashWin     = null;
let activationWin = null;
let mainWin       = null;
let tray          = null;

// ── System tray ───────────────────────────────────────────────
function createTray() {
  if (tray) return;
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('PayTrack');
  updateTrayMenu();

  tray.on('click', () => {
    if (mainWin && !mainWin.isDestroyed()) {
      if (mainWin.isMinimized() || !mainWin.isVisible()) {
        mainWin.show();
        mainWin.focus();
      } else {
        mainWin.focus();
      }
    } else if (activationWin && !activationWin.isDestroyed()) {
      activationWin.focus();
    }
  });
}

function updateTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: 'PayTrack', enabled: false },
    { type: 'separator' },
    {
      label: 'Mostrar ventana',
      click: () => {
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.show();
          mainWin.focus();
        } else if (activationWin && !activationWin.isDestroyed()) {
          activationWin.show();
          activationWin.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Cerrar aplicación',
      click: () => {
        tray?.destroy();
        tray = null;
        if (mainWin && !mainWin.isDestroyed()) mainWin.destroy();
        if (activationWin && !activationWin.isDestroyed()) activationWin.destroy();
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

// ── Listeners de autoUpdater ─────────────────────────────────
autoUpdater.on('error', (err) => {
  log.error('[autoUpdater] Error:', err.message);
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('update-error', err.message);
  }
});
autoUpdater.on('update-available', (info) => {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('update-available', info.version);
  }
});
autoUpdater.on('download-progress', (progress) => {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('download-progress', Math.round(progress.percent));
  }
});
autoUpdater.on('update-downloaded', () => {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('update-downloaded');
  }
});

function createSplashWindow() {
  splashWin = new BrowserWindow({
    width: 480,
    height: 300,
    resizable: false,
    frame: false,
    transparent: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    center: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: 'PayTrack',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  splashWin.loadFile(path.join(__dirname, 'splash.html'));
  splashWin.setMenuBarVisibility(false);
}

function closeSplash() {
  if (!splashWin) return;
  splashWin.destroy();
  splashWin = null;
}

function createActivationWindow() {
  activationWin = new BrowserWindow({
    width: 460,
    height: 500,
    resizable: false,
    frame: false,
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: 'PayTrack — Activación',
    webPreferences: {
      preload: path.join(__dirname, 'preload-activation.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  activationWin.loadFile(path.join(__dirname, 'activation.html'));
  activationWin.setMenuBarVisibility(false);

  activationWin.on('closed', () => {
    activationWin = null;
  });
}

// ── Página de error offline ───────────────────────────────────
const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <title>Sin conexión — PayTrack</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      background:#0f0f11;color:#e4e4e7;height:100vh;display:flex;
      flex-direction:column;align-items:center;justify-content:center;gap:1rem;
      -webkit-app-region:drag}
    .card{-webkit-app-region:no-drag;text-align:center;display:flex;
      flex-direction:column;align-items:center;gap:0.75rem}
    h2{font-size:1.25rem;color:#f87171}
    p{font-size:0.85rem;color:#71717a;max-width:320px;line-height:1.6}
    button{margin-top:0.25rem;padding:0.6rem 1.5rem;background:#635bff;
      color:#fff;border:none;border-radius:8px;font-size:0.9rem;
      cursor:pointer;transition:background 0.15s}
    button:hover{background:#4f46e5}
  </style>
</head>
<body>
  <div class="card">
    <h2>Sin conexión a Internet</h2>
    <p>PayTrack necesita conexión para cargar.<br>Verifica tu red y vuelve a intentarlo.</p>
    <button onclick="if(window.electronAPI)window.electronAPI.reloadApp();else location.reload()">Reintentar</button>
  </div>
</body>
</html>`;

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    show: false,
    backgroundColor: '#f5f4ef',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: 'PayTrack',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWin.setMenuBarVisibility(false);

  mainWin.webContents.session.clearCache().then(() => {
    mainWin.loadURL(PROD_URL).catch((err) => {
      log.warn('[mainWin] loadURL error:', err.message);
    });
  });

  mainWin.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    if (errorCode === -3) return;
    log.warn('[mainWin] did-fail-load:', errorCode, errorDescription);
    closeSplash();
    mainWin.webContents.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(OFFLINE_HTML)}`
    );
    if (!mainWin.isVisible()) mainWin.show();
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      log.warn('[autoUpdater] checkForUpdates falló:', err.message);
    });
  }, 3000);

  mainWin.webContents.once('did-finish-load', () => {
    closeSplash();
    mainWin.show();
  });

  mainWin.webContents.on('did-finish-load', () => {
    mainWin.webContents.executeJavaScript(`
      (function() {
        function syncControls() {
          const appControls = document.getElementById('electron-win-controls');
          let floatWrap = document.getElementById('__electron-win-btns');

          if (appControls) {
            if (floatWrap) floatWrap.remove();
            return;
          }

          if (floatWrap) return;

          floatWrap = document.createElement('div');
          floatWrap.id = '__electron-win-btns';
          floatWrap.style.cssText = 'position:fixed;top:10px;right:10px;z-index:99999;display:flex;gap:6px';

          function mkBtn(symbol, title, hoverBg, color, fn) {
            const b = document.createElement('button');
            b.textContent = symbol;
            b.title = title;
            b.style.cssText = 'width:28px;height:28px;border:none;border-radius:6px;background:rgba(255,255,255,0.08);color:' + color + ';font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.15s';
            b.onmouseenter = () => b.style.background = hoverBg;
            b.onmouseleave = () => b.style.background = 'rgba(255,255,255,0.08)';
            b.onclick = fn;
            return b;
          }

          floatWrap.appendChild(mkBtn('─', 'Minimizar',
            'rgba(255,255,255,0.2)', '#a1a1aa',
            () => window.electronAPI?.minimizeWindow()));
          floatWrap.appendChild(mkBtn('✕', 'Cerrar PayTrack',
            'rgba(248,113,113,0.4)', '#f87171',
            () => window.electronAPI?.closeWindow()));

          document.body.appendChild(floatWrap);
        }

        syncControls();
        const obs = new MutationObserver(syncControls);
        obs.observe(document.body, { childList: true, subtree: true });
      })();
    `).catch(() => {});
  });

  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('whatsapp://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWin.on('closed', () => {
    mainWin = null;
  });
}

// ── Segunda instancia ────────────────────────────────────────
app.on('second-instance', () => {
  if (mainWin && !mainWin.isDestroyed()) {
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.focus();
  } else if (activationWin && !activationWin.isDestroyed()) {
    activationWin.focus();
  }
});

// ── Flujo principal ──────────────────────────────────────────
app.whenReady().then(async () => {
  createTray();
  createSplashWindow();

  const deviceId = getOrCreateDeviceId();
  const saved    = loadActivation();

  if (saved?.code) {
    const result = await validateCodeWithAPI(saved.code, deviceId);
    if (result.ok) {
      createMainWindow();
      return;
    }
    log.warn('[activation] Validación fallida:', result.error);
  }

  closeSplash();
  createActivationWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createActivationWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    tray?.destroy();
    tray = null;
    app.quit();
  }
});

// ── IPC: validar código ──────────────────────────────────────
ipcMain.handle('validate-activation', async (event, codigo) => {
  if (typeof codigo !== 'string' || !/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(codigo)) {
    return { ok: false, error: 'Formato de código inválido' };
  }

  const deviceId = getOrCreateDeviceId();
  const result   = await validateCodeWithAPI(codigo, deviceId);

  if (result.ok) {
    saveActivation({ code: codigo, deviceId });

    if (activationWin && !activationWin.isDestroyed()) {
      setTimeout(() => {
        if (activationWin && !activationWin.isDestroyed()) {
          activationWin.close();
          activationWin = null;
        }
        createMainWindow();
      }, 1200);
    } else {
      createMainWindow();
    }
  }

  return result;
});

// ── IPC: controles de ventana ────────────────────────────────
ipcMain.on('window-minimize', () => {
  const win = BrowserWindow.getFocusedWindow() || mainWin;
  if (win && !win.isDestroyed()) win.minimize();
});

ipcMain.on('window-maximize', () => {
  const win = BrowserWindow.getFocusedWindow() || mainWin;
  if (!win || win.isDestroyed()) return;
  if (win.isFullScreen()) {
    win.setFullScreen(false);
  } else if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
});

ipcMain.on('window-close', () => {
  if (activationWin && !activationWin.isDestroyed()) {
    activationWin.destroy();
    activationWin = null;
    app.quit();
    return;
  }
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.destroy();
    mainWin = null;
  }
  app.quit();
});

ipcMain.handle('toggle-fullscreen', () => {
  const win = BrowserWindow.getFocusedWindow() || mainWin;
  if (!win || win.isDestroyed()) return;
  win.setFullScreen(!win.isFullScreen());
});

ipcMain.on('window-reload', () => {
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.session.clearCache().then(() => {
      mainWin.loadURL(PROD_URL).catch((err) => {
        log.warn('[window-reload] loadURL error:', err.message);
      });
    });
  }
});

// ── IPC: auto-update ─────────────────────────────────────────
ipcMain.on('start-download', () => {
  autoUpdater.downloadUpdate().catch((err) => {
    log.error('[autoUpdater] downloadUpdate falló:', err.message);
  });
});
ipcMain.on('install-update', () => { autoUpdater.quitAndInstall(); });

ipcMain.handle('get-version', () => app.getVersion());

// ── IPC: modo mini ───────────────────────────────────────────
ipcMain.handle('toggle-mini', () => {
  const win = BrowserWindow.getFocusedWindow() || mainWin;
  if (!win || win.isDestroyed()) return;
  const [w] = win.getSize();
  if (w <= 380) {
    win.setSize(1280, 800);
    win.setResizable(true);
    win.center();
  } else {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    win.setSize(340, 240);
    win.setResizable(false);
    win.setPosition(width - 360, height - 260);
  }
});

// ── IPC: copiar PDF al portapapeles ──────────────────────────
const MAX_PDF_BYTES = 25 * 1024 * 1024;

ipcMain.handle('send-pdf-whatsapp', async (event, payload) => {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Parámetros inválidos' };
  }

  const { base64, filename, phone, message } = payload;

  if (typeof base64 !== 'string' || base64.length === 0) {
    return { ok: false, error: 'PDF inválido' };
  }

  if (base64.length > MAX_PDF_BYTES * 1.4) {
    return { ok: false, error: 'El archivo PDF es demasiado grande (máx. 25 MB)' };
  }

  let tmpPath = null;

  try {
    const cleanB64 = base64.includes(',') ? base64.split(',')[1] : base64;

    const safeName = ((typeof filename === 'string' ? filename : '') || 'documento.pdf')
      .replace(/[^a-zA-Z0-9._\- ]/g, '_')
      .replace(/\.{2,}/g, '_')
      .slice(0, 120);

    tmpPath = path.join(os.tmpdir(), `paytrack_${Date.now()}_${safeName}`);
    fs.writeFileSync(tmpPath, Buffer.from(cleanB64, 'base64'));

    await new Promise((resolve, reject) => {
      const psScript = `Set-Clipboard -Path '${tmpPath.replace(/'/g, "''")}'`;
      const encoded  = Buffer.from(psScript, 'utf16le').toString('base64');
      execFile(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
        { timeout: 8000 },
        (err) => (err ? reject(err) : resolve())
      );
    });

    const num = (typeof phone === 'string' ? phone : '').replace(/\D/g, '');
    if (num) {
      const text = (typeof message === 'string' ? message : '').trim();
      const url  = text
        ? `whatsapp://send?phone=${num}&text=${encodeURIComponent(text)}`
        : `whatsapp://send?phone=${num}`;
      await shell.openExternal(url);
    }

    return { ok: true };
  } catch (err) {
    log.error('[send-pdf-whatsapp]', err.message);
    return { ok: false, error: err.message };
  } finally {
    if (tmpPath) {
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    }
  }
});

// ═══════════════════════════════════════════════════════════════
// ── IPC: SELECCIONAR CARPETA Y LEER PDFs AUTOMÁTICAMENTE ──────
// ═══════════════════════════════════════════════════════════════
ipcMain.handle('seleccionar-carpeta-pdfs', async () => {
  // Cargar última carpeta usada para abrirla por defecto
  const ultimaCarpeta = cargarUltimaCarpeta();

  // Abrir diálogo para seleccionar carpeta
  const result = await dialog.showOpenDialog(mainWin, {
    title: 'Seleccionar carpeta de facturas del mes',
    defaultPath: ultimaCarpeta || app.getPath('documents'),
    properties: ['openDirectory'],
    buttonLabel: 'Seleccionar carpeta',
  });

  if (result.canceled || !result.filePaths.length) {
    return { ok: false, cancelado: true };
  }

  const carpeta = result.filePaths[0];

  // Guardar como última carpeta usada
  guardarUltimaCarpeta(carpeta);

  // Leer todos los PDFs de la carpeta
  let archivos;
  try {
    archivos = fs.readdirSync(carpeta).filter(f => f.toLowerCase().endsWith('.pdf'));
  } catch (err) {
    return { ok: false, error: 'No se pudo leer la carpeta: ' + err.message };
  }

  if (archivos.length === 0) {
    return { ok: false, error: 'No se encontraron archivos PDF en la carpeta seleccionada.' };
  }

  // Convertir cada PDF a base64 y extraer el nombre del cliente del nombre del archivo
  // Formato esperado: "Bancas Yamiley.SER.ABRIL.2026.pdf"
  // El nombre del cliente es la parte antes del primer punto
  const pdfs = [];

  for (const archivo of archivos) {
    const rutaCompleta = path.join(carpeta, archivo);

    // Verificar tamaño (máx 3MB por PDF)
    try {
      const stats = fs.statSync(rutaCompleta);
      if (stats.size > 3 * 1024 * 1024) {
        pdfs.push({
          nombre: archivo,
          error: 'Archivo mayor a 3MB, omitido',
          base64: null,
        });
        continue;
      }
    } catch (_) {
      continue;
    }

    // Leer PDF como base64
    try {
      const buffer = fs.readFileSync(rutaCompleta);
      const base64 = 'data:application/pdf;base64,' + buffer.toString('base64');

      // Extraer nombre del cliente del nombre del archivo
      // Formato: "Bancas Yamiley.SER.ABRIL.2026.pdf"
      // Resultado: "Yamiley" (segunda palabra) o toda la parte antes del primer punto
      const sinExtension = archivo.replace(/\.pdf$/i, '');
      const partes = sinExtension.split('.');
      const nombreCliente = partes[0].trim(); // "Bancas Yamiley"

      pdfs.push({
        nombre: archivo,
        nombreCliente,
        base64,
        error: null,
      });
    } catch (err) {
      pdfs.push({
        nombre: archivo,
        error: 'Error al leer el archivo: ' + err.message,
        base64: null,
      });
    }
  }

  return {
    ok: true,
    carpeta,
    totalArchivos: archivos.length,
    pdfs,
  };
});
