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
        const bienvenida = await db.getConfig('bienvenida') || { valor: '👋 *Bienvenido a TDP*', imagen: null };
        const introMenu = await db.getConfig('menu_servicios') || { valor: 'Selecciona un servicio:', imagen: null };
        const servicios = await db.getServicios();
        
        let menuStr = `${bienvenida.valor}\n\n${introMenu.valor}\n\n`;
        
        // Solo agregar la lista si el introMenu no parece tenerla ya
        if (!introMenu.valor.includes('1️⃣')) {
            servicios.forEach((s, i) => {
                menuStr += `${i + 1}️⃣ *${s.nombre}*\n`;
            });
            menuStr += `\n_Escribe el número de la opción deseada._`;
        }
        
        return { text: menuStr, image: bienvenida.imagen };
    }

    async handleMenu(telefono, session, text) {
        const servicios = await db.getServicios();
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

    async handleDatos(telefono, session, text) {
        // Si no tenemos nombre, el primer mensaje es el nombre
        if (!session.nombre) {
            session.nombre = text;
            const config = await db.getConfig('pedir_datos');
            return { text: '📝 *Gracias.*\n\nAhora, por favor describe brevemente el problema o lo que necesitas para tu equipo:', image: config ? config.imagen : null };
        }

        // Si ya tenemos nombre, este mensaje es la descripción
        session.descripcionProblema = text;

        try {
            const cliente = await db.getOrCreateCliente(telefono, session.nombre);
            const ticket = await db.createTicket(
                cliente.id, 
                session.servicio.nombre, 
                session.descripcionProblema,
                session.servicio.id
            );

            await db.addLog('ticket', `Ticket #${ticket.id} creado: ${session.servicio.nombre}`, telefono);

            const confirmacion = await db.getConfig('confirmacion_ticket');
            this.resetSession(telefono);
            
            const responseText = `${confirmacion.valor}\n\n*Ticket ID:* #${ticket.id}\n*Servicio:* ${session.servicio.nombre}`;
            return { text: responseText, image: confirmacion.imagen };
        } catch (error) {
            console.error('Error creando ticket:', error);
            return '❌ *Lo sentimos.*\n\nHubo un error al procesar tu solicitud. Por favor, intenta de nuevo más tarde.';
        }
    }
}

module.exports = { FlowManager, ESTADOS };