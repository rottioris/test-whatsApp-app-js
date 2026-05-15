const db = require('../database');

const ESTADOS = {
    INICIO: 'inicio',
    MENU: 'menu',
    DETALLE_SERVICIO: 'detalle_servicio',
    ESPERANDO_DATOS: 'esperando_datos'
};

class FlowManager {
    constructor() {
        this.sessions = new Map();
    }

    getSession(telefono) {
        if (!this.sessions.has(telefono)) {
            this.sessions.set(telefono, {
                estado: ESTADOS.INICIO,
                servicio: null,
                nombre: null,
                descripcionProblema: null
            });
        }
        return this.sessions.get(telefono);
    }

    resetSession(telefono) {
        this.sessions.delete(telefono);
    }

    async handleMessage(telefono, mensaje) {
        const session = this.getSession(telefono);
        const text = mensaje.trim();
        const normalizeStr = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        const textNormalized = normalizeStr(text);
        const saludos = ['hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'inicio', 'menu', 'hey', 'hi'];

        await db.addLog('mensaje', text, telefono);

        // Si es el inicio, solo responder si es un saludo
        if (session.estado === ESTADOS.INICIO) {
            if (saludos.some(s => textNormalized.includes(s))) {
                return this.handleInicio(telefono, session);
            }
            return null; // No responder a otros mensajes si no hay sesión activa
        }

        // Comandos globales para resetear
        if (['menu', 'inicio', 'hola', 'cancelar', 'atras', 'atras'].includes(textNormalized)) {
            this.resetSession(telefono);
            return this.handleInicio(telefono, this.getSession(telefono));
        }

        switch (session.estado) {
            case ESTADOS.MENU:
                return this.handleMenu(telefono, session, text);

            case ESTADOS.DETALLE_SERVICIO:
                return this.handleDetalle(telefono, session, textNormalized);

            case ESTADOS.ESPERANDO_DATOS:
                return this.handleDatos(telefono, session, text);

            default:
                return this.handleInicio(telefono, session);
        }
    }

    async handleInicio(telefono, session) {
        session.estado = ESTADOS.MENU;
        const bienvenida = await db.getConfig('bienvenida') || { valor: '👋 *Bienvenido a Lumio*', imagen: null };
        const introMenu = await db.getConfig('menu_servicios') || { valor: '¿En qué podemos ayudarte hoy?', imagen: null };
        const modCombos = await db.getConfig('mod_combos');
        
        let servicios = await db.getServicios();
        if (modCombos && modCombos.valor === 'false') {
            servicios = servicios.filter(s => !s.nombre.toLowerCase().includes('combo'));
        }
        
        let menuStr = `${bienvenida.valor}\n\n${introMenu.valor}\n\n`;
        servicios.forEach((s, i) => {
            const emoji = s.nombre.toLowerCase().includes('combo') ? '📦' : '🛠️';
            menuStr += `${i + 1}️⃣ ${emoji} *${s.nombre}*\n`;
        });
        menuStr += `\n_Responde con el número de la opción._`;
        
        return { text: menuStr, image: bienvenida.imagen };
    }

    async handleMenu(telefono, session, text) {
        let servicios = await db.getServicios();
        const modCombos = await db.getConfig('mod_combos');
        if (modCombos && modCombos.valor === 'false') {
            servicios = servicios.filter(s => !s.nombre.toLowerCase().includes('combo'));
        }
        
        const index = parseInt(text) - 1;
        let servicio = null;
        
        const normalizeStr = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

        if (!isNaN(index) && servicios[index]) {
            servicio = servicios[index];
        } else {
            // Buscar por nombre normalizado (ignorar tildes y mayúsculas)
            const normalizedInput = normalizeStr(text);
            servicio = servicios.find(s => normalizeStr(s.nombre) === normalizedInput);
        }

        if (!servicio) {
            return '❌ *Opción no válida.*\n\nPor favor, selecciona un número del menú o escribe el nombre del servicio correctamente.';
        }

        session.servicio = servicio;
        session.estado = ESTADOS.DETALLE_SERVICIO;

        const precioStr = servicio.precio > 0 ? `*Precio:* $${servicio.precio}` : '*Precio:* Consultar presupuesto';
        
        const responseText = `🛠️ *${servicio.nombre}*\n\n${servicio.descripcion || 'Sin descripción disponible.'}\n\n${precioStr}\n\n---\n¿Deseas contratar este servicio?\n\n✅ Escribe *SÍ* para continuar\n❌ Escribe *ATRÁS* para volver al menú`;

        return { text: responseText, image: servicio.imagen };
    }

    async handleDetalle(telefono, session, normalizedInput) {
        if (['si', 'aceptar', 'ok', 'continuar'].includes(normalizedInput)) {
            session.estado = ESTADOS.ESPERANDO_DATOS;
            const config = await db.getConfig('aceptacion');
            return { text: config.valor, image: config.imagen };
        } else if (['no', 'atras', 'volver'].includes(normalizedInput)) {
            session.estado = ESTADOS.MENU;
            return this.handleInicio(telefono, session);
        } else {
            return 'Por favor, responde *SÍ* para continuar o *ATRÁS* para volver al menú.';
        }
    }

    async handleDatos(jid, session, text) {
        // Si no tenemos nombre, el primer mensaje es el nombre
        if (!session.nombre) {
            session.nombre = text;
            const config = await db.getConfig('pedir_datos');
            return { text: '📝 *Gracias.*\n\nAhora, por favor describe brevemente el problema o lo que necesitas para tu equipo:', image: config ? config.imagen : null };
        }

        // Si ya tenemos nombre, este mensaje es la descripción
        session.descripcionProblema = text;

        try {
            // Extraer número limpio (solo dígitos antes del @)
            const numeroLimpio = jid.split('@')[0].split(':')[0];
            
            const cliente = await db.getOrCreateCliente(numeroLimpio, session.nombre);
            const ticket = await db.createTicket(
                cliente.id, 
                session.servicio.nombre, 
                session.descripcionProblema,
                session.servicio.id,
                null, // imagenes
                session.servicio.precio || 0
            );

            await db.addLog('ticket', `Ticket #${ticket.id} creado: ${session.servicio.nombre}`, jid);

            const confirmacion = await db.getConfig('confirmacion_ticket') || { valor: '✅ *Ticket creado con éxito.*', imagen: null };
            this.resetSession(jid);
            
            const responseText = `${confirmacion.valor}\n\n*ID:* #${ticket.id}\n*Estado:* Pendiente\n*Soporte:* Lumio Tech`;
            return { text: responseText, image: confirmacion.imagen };
        } catch (error) {
            console.error('Error creando ticket:', error);
            return '❌ *Lo sentimos.*\n\nHubo un error al procesar tu solicitud. Por favor, intenta de nuevo más tarde.';
        }
    }
}

module.exports = { FlowManager, ESTADOS };