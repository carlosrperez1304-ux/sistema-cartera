const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const log = require('electron-log');

const AUTH_DIR = path.join(app.getPath('userData'), 'baileys-auth');

let sock = null;
let qrCallback = null;
let statusCallback = null;
let conectado = false;

async function iniciarBaileys() {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

  const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = await import('@whiskeysockets/baileys');
  const QRCode = await import('qrcode');

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: { level: 'silent', trace:()=>{}, debug:()=>{}, info:()=>{}, warn:()=>{}, error:()=>{}, fatal:()=>{}, child:()=>({ level:'silent', trace:()=>{}, debug:()=>{}, info:()=>{}, warn:()=>{}, error:()=>{}, fatal:()=>{} }) },
    browser: ['PayTrack', 'Chrome', '1.0'],
    connectTimeoutMs: 30000,
    defaultQueryTimeoutMs: 30000,
    keepAliveIntervalMs: 15000,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      log.info('[Baileys] QR generado');
      try {
        const qrImage = await QRCode.default.toDataURL(qr);
        if (qrCallback) qrCallback(qrImage);
      } catch(e) { log.error('[Baileys] Error QR:', e.message); }
    }

    if (connection === 'open') {
      conectado = true;
      log.info('[Baileys] Conectado');
      if (statusCallback) statusCallback({ conectado: true });
    }

    if (connection === 'close') {
      conectado = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      log.warn('[Baileys] Desconectado, código:', code);
      if (statusCallback) statusCallback({ conectado: false, code });
      if (code !== DisconnectReason.loggedOut) {
        log.info('[Baileys] Reconectando...');
        setTimeout(() => iniciarBaileys(), 5000);
      } else {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      }
    }
  });
}

function onQR(cb) { qrCallback = cb; }
function onStatus(cb) { statusCallback = cb; }
function estaConectado() { return conectado; }

async function esperarConexion(maxMs = 30000) {
  if (conectado) return true;
  const inicio = Date.now();
  return new Promise(resolve => {
    const interval = setInterval(() => {
      if (conectado) { clearInterval(interval); resolve(true); }
      else if (Date.now() - inicio >= maxMs) { clearInterval(interval); resolve(false); }
    }, 1000);
  });
}

function formatearNumero(numero) {
  let num = numero.replace(/\D/g, '');
  // Si tiene 10 dígitos y empieza con 8 o 9, agregar código de RD
  if (num.length === 10 && (num.startsWith('8') || num.startsWith('9'))) {
    num = '1' + num;
  }
  // Si tiene 11 dígitos y empieza con 1, está correcto
  return num;
}

async function enviarMensaje(numero, mensaje) {
  if (!sock || !conectado) throw new Error('WhatsApp no conectado');
  const jid = formatearNumero(numero) + '@s.whatsapp.net';
  await sock.sendMessage(jid, { text: mensaje });
}

async function enviarPDF(numero, pdfPath, nombreArchivo, mensaje) {
  if (!sock || !conectado) throw new Error('WhatsApp no conectado');
  const jid = formatearNumero(numero) + '@s.whatsapp.net';
  const buffer = fs.readFileSync(pdfPath);
  if (mensaje) {
    await sock.sendMessage(jid, { text: mensaje });
    await new Promise(r => setTimeout(r, 2000));
  }
  await sock.sendMessage(jid, {
    document: buffer,
    mimetype: 'application/pdf',
    fileName: nombreArchivo || 'documento.pdf'
  });
}

async function cerrarSesion() {
  if (sock) { await sock.logout(); sock = null; conectado = false; }
  fs.rmSync(AUTH_DIR, { recursive: true, force: true });
}

module.exports = { iniciarBaileys, onQR, onStatus, estaConectado, esperarConexion, enviarMensaje, enviarPDF, cerrarSesion };
