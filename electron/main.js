const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { exec } = require('child_process');

// ── URL de producción en Vercel ─────────────────────────────
// Actualiza esta URL con la dirección real de tu deployment
const PROD_URL = 'https://sistema-cartera.vercel.app';
// ───────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: 'CartaMaster',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(PROD_URL);
  win.setMenuBarVisibility(false);

  // Abrir links externos en el navegador del sistema (no en Electron)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') || url.startsWith('whatsapp')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
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
