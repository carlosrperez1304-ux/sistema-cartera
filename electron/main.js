const { app, BrowserWindow, ipcMain, shell, screen } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { exec } = require('child_process');
const crypto = require('crypto');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// ── Auto-updater config ─────────────────────────────────────
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = false;
// ───────────────────────────────────────────────────────────

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
  // Guardar solo el deviceId por ahora (sin código aún)
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
    height: 420,
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
}

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
  mainWin.loadURL(PROD_URL);
  mainWin.setMenuBarVisibility(false);

  // Cuando la página cargó: cerrar splash y mostrar la app
  mainWin.webContents.once('did-finish-load', () => {
    closeSplash();
    mainWin.show();
    // Verificar actualizaciones 3s después de abrir
    setTimeout(() => autoUpdater.checkForUpdates().catch(e => log.warn('[updater]', e.message)), 3000);
  });

  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') || url.startsWith('whatsapp')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

// ── Flujo principal al arrancar ─────────────────────────────
app.whenReady().then(async () => {
  // Mostrar splash de inmediato
  createSplashWindow();

  const deviceId = getOrCreateDeviceId();
  const saved    = loadActivation();

  if (saved?.code) {
    // Ya tiene código guardado — validar contra la API (splash visible mientras)
    const result = await validateCodeWithAPI(saved.code, deviceId);
    if (result.ok) {
      createMainWindow();  // splash se cierra solo cuando main carga
      return;
    }
    console.warn('[activation] Validación fallida:', result.error);
  }

  // Sin código o inválido: cerrar splash y mostrar activación
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
  const deviceId = getOrCreateDeviceId();
  const result   = await validateCodeWithAPI(codigo, deviceId);

  if (result.ok) {
    // Guardar activación localmente
    saveActivation({ code: codigo, deviceId });

    // Cerrar ventana de activación y abrir la app
    if (activationWin) {
      setTimeout(() => {
        activationWin.close();
        activationWin = null;
        createMainWindow();
      }, 1200); // pequeña pausa para mostrar el mensaje de éxito
    }
  }

  return result;
});

// ── Auto-updater events ──────────────────────────────────────
autoUpdater.on('update-available', (info) => {
  if (mainWin) mainWin.webContents.send('update-available', info.version);
});

autoUpdater.on('update-not-available', () => {
  log.info('[updater] App actualizada');
});

autoUpdater.on('download-progress', (progress) => {
  if (mainWin) mainWin.webContents.send('download-progress', Math.round(progress.percent));
});

autoUpdater.on('update-downloaded', () => {
  if (mainWin) mainWin.webContents.send('update-downloaded');
});

autoUpdater.on('error', (err) => {
  log.error('[updater]', err.message);
});

// IPC — iniciar descarga
ipcMain.on('start-download', () => autoUpdater.downloadUpdate());

// IPC — instalar y reiniciar
ipcMain.on('install-update', () => autoUpdater.quitAndInstall());

// ── IPC: controles de ventana ────────────────────────────────
ipcMain.on('window-minimize', () => { const win = BrowserWindow.getFocusedWindow() || mainWin; if (win) win.minimize(); });
ipcMain.on('window-maximize', () => { const win = BrowserWindow.getFocusedWindow() || mainWin; if (win) win.isMaximized() ? win.unmaximize() : win.maximize(); });
ipcMain.on('window-close',    () => { const win = BrowserWindow.getFocusedWindow() || mainWin; if (win) win.close(); });

// ── IPC: modo mini ───────────────────────────────────────────
ipcMain.handle('toggle-mini', () => {
  const win = BrowserWindow.getFocusedWindow() || mainWin;
  if (!win) return;
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
ipcMain.handle('send-pdf-whatsapp', async (event, { base64, filename, phone, message }) => {
  try {
    // 1. Decodificar base64 y guardar como PDF temporal
    const cleanB64 = base64.includes(',') ? base64.split(',')[1] : base64;
    const safeName = (filename || 'documento.pdf').replace(/[<>:"/\\|?*]/g, '_');
    const tmpPath  = path.join(os.tmpdir(), safeName);
    fs.writeFileSync(tmpPath, Buffer.from(cleanB64, 'base64'));

    // 2. Copiar el archivo al portapapeles de Windows via PowerShell
    const escaped = tmpPath.replace(/'/g, "''");
    await new Promise((resolve, reject) => {
      exec(
        `powershell -NoProfile -NonInteractive -command "Set-Clipboard -Path '${escaped}'"`,
        { timeout: 8000 },
        (err) => (err ? reject(err) : resolve())
      );
    });

    // 3. Abrir WhatsApp Desktop con el número y el mensaje pre-llenado
    const num = (phone || '').replace(/\D/g, '');
    if (num) {
      const url = message
        ? `whatsapp://send?phone=${num}&text=${encodeURIComponent(message)}`
        : `whatsapp://send?phone=${num}`;
      await shell.openExternal(url);
    }

    return { ok: true };
  } catch (err) {
    console.error('[send-pdf-whatsapp]', err.message);
    return { ok: false, error: err.message };
  }
});
