require('dotenv').config();
const { createBot, getConnectionStatus } = require('./bot');
const { FlowManager } = require('./handlers/flow');
const db = require('./database');

const flowManager = new FlowManager();
let currentQR = null;

async function main() {
    console.log('[TDP Bot] Iniciando...');

    await db.initDatabase();
    console.log('[TDP Bot] Base de datos lista');

    try {
        await createBot(
            async (telefono, mensaje) => {
                const respuesta = await flowManager.handleMessage(telefono, mensaje);
                return respuesta;
            },
            (qr) => {
                currentQR = qr;
                console.log('[TDP Bot] QR generado - Escanea con tu WhatsApp');
            },
            (status) => {
                console.log('[TDP Bot] Estado de conexión:', status);
            }
        );
    } catch (error) {
        console.error('[TDP Bot] Error al iniciar:', error);
        setTimeout(main, 10000);
    }
}

main();

module.exports = { flowManager, getConnectionStatus };