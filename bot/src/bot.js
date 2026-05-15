const { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const SESSION_DIR = process.env.SESSION_DIR || path.join(__dirname, '../../bot/session');

let sock = null;
let qrCodeImage = null;
let connectionStatus = 'disconnected';
let deviceInfo = null;
const messageCache = new Set();

function getConnectionStatus() {
    return {
        status: connectionStatus,
        qr: qrCodeImage,
        device: deviceInfo
    };
}

async function generateQRImage(qrText) {
    try {
        return await QRCode.toDataURL(qrText, {
            width: 300,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' }
        });
    } catch (err) {
        console.error('[Bot] ❌ Error generando imagen QR:', err);
        return null;
    }
}

async function createBot(onMessage, onQR, onConnectionChange) {
    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    console.log('[Bot] 🔌 Iniciando conexión con WhatsApp...');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // También en terminal para depurar
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Desktop'), // Más estable para vinculación
        keepAliveIntervalMs: 30000,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('[Bot] 📱 Nuevo código QR recibido');
            connectionStatus = 'qr';
            qrCodeImage = await generateQRImage(qr);
            if (onQR) onQR(qrCodeImage);
            if (onConnectionChange) onConnectionChange('qr');
        }

        if (connection === 'close') {
            const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            console.log(`[Bot] ⚠️ Conexión cerrada. Razón: ${reason}`);
            
            connectionStatus = 'disconnected';
            qrCodeImage = null;
            deviceInfo = null;
            if (onConnectionChange) onConnectionChange('disconnected');

            if (reason !== DisconnectReason.loggedOut) {
                console.log('[Bot] 🔄 Intentando reconexión automática...');
                setTimeout(() => createBot(onMessage, onQR, onConnectionChange), 5000);
            } else {
                console.log('[Bot] 🚪 Sesión cerrada por el usuario.');
            }
        } else if (connection === 'open') {
            console.log('[Bot] ✅ Conexión establecida con éxito');
            connectionStatus = 'connected';
            qrCodeImage = null;
            deviceInfo = {
                name: sock.user.name || 'Lumio Bot',
                id: sock.user.id.split(':')[0],
                platform: 'Lumio Dashboard'
            };
            if (onConnectionChange) onConnectionChange('connected');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe) continue;
            
            const msgId = msg.key.id;
            if (messageCache.has(msgId)) continue;
            messageCache.add(msgId);
            setTimeout(() => messageCache.delete(msgId), 10000);

            const jid = msg.key.remoteJid;
            const texto = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

            if (texto.trim()) {
                // Notificar "escribiendo"
                await sock.sendPresenceUpdate('composing', jid);
                const respuesta = await onMessage(jid, texto);
                
                if (respuesta) {
                    await new Promise(r => setTimeout(r, 1000)); // Simular humano
                    if (typeof respuesta === 'object') {
                        await sendMessage(jid, respuesta.text, respuesta.image);
                    } else {
                        await sendMessage(jid, respuesta);
                    }
                }
                await sock.sendPresenceUpdate('paused', jid);
            }
        }
    });

    return sock;
}

async function sendMessage(jid, mensaje, imagen = null) {
    if (sock && connectionStatus === 'connected') {
        try {
            if (imagen) {
                let imageSource;
                if (imagen.startsWith('/') || imagen.startsWith('dashboard')) {
                    const fullPath = imagen.startsWith('/') ? imagen : path.join(__dirname, '../../', imagen);
                    imageSource = fs.existsSync(fullPath) ? { url: fullPath } : { url: imagen };
                } else {
                    imageSource = { url: imagen };
                }
                await sock.sendMessage(jid, { image: imageSource, caption: mensaje });
            } else {
                await sock.sendMessage(jid, { text: mensaje });
            }
        } catch (e) {
            console.error('[Bot] ❌ Error enviando mensaje:', e.message);
        }
    }
}

async function disconnectBot() {
    console.log('[Bot] 🗑️ Eliminando sesión actual...');
    if (sock) {
        try { await sock.logout(); } catch (e) { try { sock.end(undefined); } catch (err) {} }
        sock = null;
    }
    connectionStatus = 'disconnected';
    qrCodeImage = null;
    deviceInfo = null;
    
    // Limpiar carpeta de sesión de forma segura
    if (fs.existsSync(SESSION_DIR)) {
        const files = fs.readdirSync(SESSION_DIR);
        for (const file of files) {
            try { fs.unlinkSync(path.join(SESSION_DIR, file)); } catch (e) {}
        }
    }
}

async function reconnectBot(onMessage, onQR, onConnectionChange) {
    if (sock) {
        try { sock.end(undefined); } catch (e) {}
        sock = null;
    }
    connectionStatus = 'disconnected';
    qrCodeImage = null;
    await new Promise(r => setTimeout(r, 1000));
    return await createBot(onMessage, onQR, onConnectionChange);
}

async function requestPairingCode(phoneNumber) {
    if (connectionStatus === 'connected') throw new Error('Bot ya conectado');
    if (!sock) throw new Error('El bot se está iniciando, espera 5 segundos...');
    
    try {
        const code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
        return code;
    } catch (e) {
        console.error('[Bot] ❌ Error en Pairing Code:', e.message);
        throw new Error('WhatsApp rechazó la solicitud. Intenta de nuevo en 1 minuto.');
    }
}

module.exports = { createBot, sendMessage, disconnectBot, getConnectionStatus, reconnectBot, requestPairingCode };