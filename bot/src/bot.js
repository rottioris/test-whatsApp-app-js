const { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const QRCode = require('qrcode');
const path = require('path');

const SESSION_DIR = process.env.SESSION_DIR || './session';

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
        const dataUrl = await QRCode.toDataURL(qrText, {
            width: 300,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        });
        return dataUrl;
    } catch (err) {
        console.error('[Bot] Error generando QR:', err);
        return null;
    }
}

async function createBot(onMessage, onQR, onConnectionChange) {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu('Chrome'),
        keepAliveIntervalMs: 30000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            connectionStatus = 'qr';
            const qrImage = await generateQRImage(qr);
            qrCodeImage = qrImage;
            onQR && onQR(qrImage);
            console.log('[Bot] QR generado - Escanea con WhatsApp');
        }

        if (connection === 'close') {
            const reason = (lastDisconnect?.error)?.output?.statusCode;
            const shouldReconnect = reason !== DisconnectReason.loggedOut;

            console.log(`[Bot] Conexión cerrada. Razón: ${reason}, Reintentando: ${shouldReconnect}`);
            
            connectionStatus = 'disconnected';
            qrCodeImage = null;
            onConnectionChange && onConnectionChange('disconnected');

            if (shouldReconnect) {
                setTimeout(() => createBot(onMessage, onQR, onConnectionChange), 5000);
            }
        } else if (connection === 'open') {
            connectionStatus = 'connected';
            qrCodeImage = null;
            
            // Capturar info del dispositivo
            deviceInfo = {
                name: sock.user.name || 'WhatsApp Web',
                id: sock.user.id.split(':')[0],
                platform: sock.browserDescription ? sock.browserDescription[0] : 'Desconocida'
            };

            onConnectionChange && onConnectionChange('connected');
            console.log(`[Bot] ✅ Conectado como: ${deviceInfo.name} (${deviceInfo.id})`);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe) continue;
            
            // ID único para evitar duplicados en ráfagas
            const msgId = msg.key.id;
            if (messageCache.has(msgId)) continue;
            messageCache.add(msgId);
            setTimeout(() => messageCache.delete(msgId), 10000); // Limpiar después de 10s

            const telefono = msg.key.remoteJid;
            const texto = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

            if (texto.trim()) {
                console.log(`[Bot] Mensaje de ${telefono}: ${texto.substring(0, 50)}`);
                const respuesta = await onMessage(telefono, texto);

                if (respuesta) {
                    if (typeof respuesta === 'object') {
                        await sendMessage(telefono, respuesta.text, respuesta.image);
                    } else {
                        await sendMessage(telefono, respuesta);
                    }
                    console.log(`[Bot] Respuesta enviada a ${telefono}`);
                }
            }
        }
    });

    return sock;
}

async function sendMessage(telefono, mensaje, imagen = null) {
    if (sock && connectionStatus === 'connected') {
        if (imagen) {
            let imageSource;
            // Si es una ruta local del sistema (empieza por /home o dashboard/public)
            if (imagen.startsWith('/') || imagen.startsWith('dashboard')) {
                const fs = require('fs');
                const fullPath = imagen.startsWith('/') ? imagen : path.join(__dirname, '../../', imagen);
                if (fs.existsSync(fullPath)) {
                    imageSource = { url: fullPath }; // Baileys soporta file paths locales en url
                } else {
                    console.error('[Bot] Imagen local no encontrada:', fullPath);
                    // Intentar como URL por si acaso
                    imageSource = { url: imagen };
                }
            } else {
                imageSource = { url: imagen };
            }

            await sock.sendMessage(telefono, { 
                image: imageSource, 
                caption: mensaje 
            });
        } else {
            await sock.sendMessage(telefono, { text: mensaje });
        }
    }
}

async function disconnectBot() {
    if (sock) {
        try {
            await sock.logout();
        } catch (e) {
            console.error('[Bot] Error al cerrar sesión:', e);
            sock.end(undefined);
        }
        sock = null;
        connectionStatus = 'disconnected';
        qrCodeImage = null;
        deviceInfo = null;
        
        // Limpiar carpeta de sesión para asegurar que pida QR nuevo
        const fs = require('fs');
        if (fs.existsSync(SESSION_DIR)) {
            try {
                fs.rmSync(SESSION_DIR, { recursive: true, force: true });
                fs.mkdirSync(SESSION_DIR, { recursive: true });
            } catch (e) { console.error('[Bot] Error limpiando sesión:', e); }
        }
    }
}

async function reconnectBot(onMessage, onQR, onConnectionChange) {
    if (sock) {
        sock.end(undefined);
    }
    connectionStatus = 'disconnected';
    qrCodeImage = null;
    await createBot(onMessage, onQR, onConnectionChange);
}

module.exports = {
    createBot,
    sendMessage,
    disconnectBot,
    getConnectionStatus,
    reconnectBot
};