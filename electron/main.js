const { app, BrowserWindow, ipcMain, shell, screen } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { execFile } = require('child_process'); // FIX C1: execFile en vez de exec
const crypto = require('crypto');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// ── Single instance lock ─────────────────────────────────────
// FIX: Evitar múltiples instancias de la app al mismo tiempo
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
// ───────────────────────────────────────────────────────────

// ── Rutas de activación ─────────────────────────────────────
const ACTIVATION_FILE = path.join(app.getPath('userData'), 'activation.json');
// ───────────────────────────────────────────────────────────

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

// ── Validar código contra la API ────────────────────────────
async function validateCodeWithAPI(codigo, device_id) {
  try {
    const res = await fetch(`${PROD_URL}/api/activaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, device_id }),
    });
    return await res.json();
  } catch (err) {
    return { ok: false, error: 'Sin conexión a internet' };
  }
}

// ── Ventanas ─────────────────────────────────────────────────
let splashWin     = null;
let activationWin = null;
let mainWin       = null;

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

  // FIX H1: Limpiar referencia si el usuario cierra la ventana durante validación
  activationWin.on('closed', () => {
    activationWin = null;
  });
}

// ── Página de error offline (sin conexión) ───────────────────
// FIX H3: Mostrar página útil cuando no hay internet en vez de pantalla en blanco
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
    <button onclick="location.reload()">Reintentar</button>
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

  // Limpiar cache antes de cargar para garantizar versión más reciente
  mainWin.webContents.session.clearCache().then(() => {
    mainWin.loadURL(PROD_URL).catch((err) => {
      log.warn('[mainWin] loadURL error:', err.message);
    });
  });

  // FIX H3: Manejar fallos de carga (sin internet / error de red)
  mainWin.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    // -3 = ERR_ABORTED (navegación normal cancelada), ignorar
    if (errorCode === -3) return;
    log.warn('[mainWin] did-fail-load:', errorCode, errorDescription);
    closeSplash();
    mainWin.webContents.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(OFFLINE_HTML)}`
    );
    if (!mainWin.isVisible()) mainWin.show();
  });

  // FIX C3: Manejo de errores del autoUpdater
  autoUpdater.on('error', (err) => {
    log.error('[autoUpdater] Error:', err.message);
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('update-error', err.message);
    }
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      log.warn('[autoUpdater] checkForUpdates falló:', err.message);
    });
  }, 3000);

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

  // Cuando la página cargó: cerrar splash y mostrar la app
  mainWin.webContents.once('did-finish-load', () => {
    closeSplash();
    mainWin.show();
  });

  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('whatsapp://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // FIX: Limpiar referencia cuando la ventana se cierra
  mainWin.on('closed', () => {
    mainWin = null;
  });
}

// ── Segunda instancia: enfocar ventana existente ─────────────
app.on('second-instance', () => {
  if (mainWin && !mainWin.isDestroyed()) {
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.focus();
  } else if (activationWin && !activationWin.isDestroyed()) {
    activationWin.focus();
  }
});

// ── Flujo principal al arrancar ─────────────────────────────
app.whenReady().then(async () => {
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
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC: validar código de activación ───────────────────────
ipcMain.handle('validate-activation', async (event, codigo) => {
  // FIX C4/H2: Validar formato del código antes de procesar
  if (typeof codigo !== 'string' || !/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(codigo)) {
    return { ok: false, error: 'Formato de código inválido' };
  }

  const deviceId = getOrCreateDeviceId();
  const result   = await validateCodeWithAPI(codigo, deviceId);

  if (result.ok) {
    saveActivation({ code: codigo, deviceId });

    // FIX H1: Verificar que activationWin todavía existe antes de usarla
    if (activationWin && !activationWin.isDestroyed()) {
      setTimeout(() => {
        if (activationWin && !activationWin.isDestroyed()) {
          activationWin.close();
          activationWin = null;
        }
        createMainWindow();
      }, 1200);
    } else {
      // Ventana ya cerrada — abrir main directamente
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

// ── IPC: auto-update (descarga e instalación) ────────────────
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

// ── IPC: copiar PDF al portapapeles y abrir WhatsApp Desktop ─
// FIX C1: execFile + EncodedCommand (sin inyección de shell)
// FIX C2: eliminar archivo temporal siempre (finally)
// FIX C4: validar todos los parámetros de entrada + límite de tamaño
const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB

ipcMain.handle('send-pdf-whatsapp', async (event, payload) => {
  // FIX C4: Validar que el payload sea un objeto
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Parámetros inválidos' };
  }

  const { base64, filename, phone, message } = payload;

  if (typeof base64 !== 'string' || base64.length === 0) {
    return { ok: false, error: 'PDF inválido' };
  }

  // FIX C4: Limitar tamaño para evitar agotamiento de memoria
  // base64 es ~37% más grande que el binario original
  if (base64.length > MAX_PDF_BYTES * 1.4) {
    return { ok: false, error: 'El archivo PDF es demasiado grande (máx. 25 MB)' };
  }

  let tmpPath = null;

  try {
    const cleanB64 = base64.includes(',') ? base64.split(',')[1] : base64;

    // FIX C1: Sanitizar nombre de archivo — solo caracteres seguros
    const safeName = ((typeof filename === 'string' ? filename : '') || 'documento.pdf')
      .replace(/[^a-zA-Z0-9._\- ]/g, '_')
      .replace(/\.{2,}/g, '_')   // evitar path traversal (..)
      .slice(0, 120);

    tmpPath = path.join(os.tmpdir(), `paytrack_${Date.now()}_${safeName}`);
    fs.writeFileSync(tmpPath, Buffer.from(cleanB64, 'base64'));

    // FIX C1: Usar execFile con EncodedCommand para evitar inyección en PowerShell
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

    // Abrir WhatsApp Desktop con el número y mensaje
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
    // FIX C2: Siempre eliminar el archivo temporal
    if (tmpPath) {
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    }
  }
});
