const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/tdp.db');

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

let db = null;

async function initDatabase() {
    // Modo de escritura inmediata y WAL para concurrencia
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
        CREATE TABLE IF NOT EXISTS servicios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL UNIQUE,
            descripcion TEXT,
            precio REAL DEFAULT 0,
            activo INTEGER DEFAULT 1,
            orden INTEGER DEFAULT 0,
            imagen TEXT
        );

        CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telefono TEXT NOT NULL UNIQUE,
            nombre TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id INTEGER NOT NULL,
            servicio_id INTEGER,
            servicio_nombre TEXT NOT NULL,
            descripcion TEXT,
            estado TEXT DEFAULT 'pendiente',
            notas TEXT,
            extra_cost REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
            FOREIGN KEY (servicio_id) REFERENCES servicios(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS configuraciones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clave TEXT NOT NULL UNIQUE,
            valor TEXT,
            imagen TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT,
            contenido TEXT,
            telefono TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Índices para optimización
        CREATE INDEX IF NOT EXISTS idx_clientes_telefono ON clientes(telefono);
        CREATE INDEX IF NOT EXISTS idx_tickets_cliente ON tickets(cliente_id);
        CREATE INDEX IF NOT EXISTS idx_tickets_estado ON tickets(estado);
    `);

    const serviciosCount = db.prepare('SELECT COUNT(*) as count FROM servicios').get().count;
    if (serviciosCount === 0) {
        const insertServicio = db.prepare('INSERT INTO servicios (nombre, descripcion, precio, orden) VALUES (?, ?, ?, ?)');
        const servicios = [
            ['ASESORÍA', 'Consultas sobre armados de PC y equipos', 0, 1],
            ['MANTENIMIENTO', 'Solución de errores hardware y software', 0, 2],
            ['LIMPIEZA', 'Limpieza de componentes + cambio de pasta térmica', 0, 3],
            ['ENSAMBLES', 'Armado de PC nuevo', 0, 4],
            ['INSTALACIÓN', 'Sistemas operativos y software', 0, 5],
            ['COMBOS', 'Paquetes de servicios', 0, 6]
        ];
        servicios.forEach(s => insertServicio.run(s));
    }

    const configCount = db.prepare('SELECT COUNT(*) as count FROM configuraciones').get().count;
    if (configCount === 0) {
        const insertConfig = db.prepare('INSERT INTO configuraciones (clave, valor) VALUES (?, ?)');
        const configs = [
            ['bienvenida', '👋 *Bienvenido a TDP - Servicios Técnicos*\n\nEstamos aquí para ayudarte con el mantenimiento, reparación y ensamble de tus equipos.'],
            ['menu_servicios', '¿En qué podemos ayudarte hoy?\n\nSelecciona una opción escribiendo el *número* o el *nombre*:'],
            ['aceptacion', '✅ *Excelente elección.*\n\nPara generar tu ticket y asignarte un técnico, por favor envíanos:\n\n1️⃣ Tu *Nombre completo*\n2️⃣ Una *Descripción breve* del problema'],
            ['pedir_datos', 'Por favor, proporciónanos:\n\n📝 *Nombre:*\n🔧 *Problema del equipo:*'],
            ['confirmacion_ticket', '🎉 *¡Ticket creado con éxito!*\n\nUn técnico revisará tu caso pronto. Te notificaremos por aquí cuando tu equipo esté listo para entrega.'],
            ['notificacion_entrega', '📢 *¡Tu equipo está listo!*\n\nHola, te informamos que el servicio técnico de tu equipo ha finalizado con éxito y ya puedes pasar por él.\n\n📍 *Ubicación:* [Tu Dirección Aquí]\n⏰ *Horario:* Lunes a Viernes 9am - 6pm\n\nSi tienes dudas, puedes escribir:\n1️⃣ Ver Ubicación\n2️⃣ Horarios de atención\n3️⃣ Hablar con un técnico']
        ];
        configs.forEach(c => insertConfig.run(c));
    }

    console.log('[DB] Base de datos persistente lista en:', DB_PATH);
    return db;
}

function queryAll(sql, params = []) {
    return db.prepare(sql).all(params);
}

function queryOne(sql, params = []) {
    return db.prepare(sql).get(params);
}

function run(sql, params = []) {
    const info = db.prepare(sql).run(params);
    return { lastInsertRowid: info.lastInsertRowid, changes: info.changes };
}

function getServicios() {
    return queryAll('SELECT * FROM servicios WHERE activo = 1 ORDER BY orden');
}

function getConfig(clave) {
    return queryOne('SELECT * FROM configuraciones WHERE clave = ?', [clave]);
}

function setConfig(clave, valor, imagen = null) {
    const exists = queryOne('SELECT id FROM configuraciones WHERE clave = ?', [clave]);
    if (exists) {
        run("UPDATE configuraciones SET valor = ?, imagen = ?, updated_at = CURRENT_TIMESTAMP WHERE clave = ?", [valor, imagen, clave]);
    } else {
        run('INSERT INTO configuraciones (clave, valor, imagen) VALUES (?, ?, ?)', [clave, valor, imagen]);
    }
}

function getOrCreateCliente(telefono, nombre = null) {
    let cliente = queryOne('SELECT * FROM clientes WHERE telefono = ?', [telefono]);

    if (!cliente) {
        const result = run('INSERT INTO clientes (telefono, nombre) VALUES (?, ?)', [telefono, nombre]);
        cliente = { id: result.lastInsertRowid, telefono, nombre };
    } else if (nombre && !cliente.nombre) {
        run('UPDATE clientes SET nombre = ? WHERE id = ?', [nombre, cliente.id]);
        cliente.nombre = nombre;
    }

    return cliente;
}

function createTicket(clienteId, servicioNombre, descripcion, servicioId = null) {
    const result = run('INSERT INTO tickets (cliente_id, servicio_id, servicio_nombre, descripcion, estado) VALUES (?, ?, ?, ?, ?)',
        [clienteId, servicioId, servicioNombre, descripcion, 'pendiente']);

    return { id: result.lastInsertRowid, cliente_id: clienteId, servicio_nombre: servicioNombre, descripcion, estado: 'pendiente' };
}

function getTickets() {
    return queryAll(`
        SELECT t.*, c.telefono, c.nombre as cliente_nombre, t.servicio_nombre as servicio,
               COALESCE(s.precio, 0) as servicio_precio
        FROM tickets t
        LEFT JOIN clientes c ON t.cliente_id = c.id
        LEFT JOIN servicios s ON t.servicio_id = s.id
        ORDER BY t.created_at DESC
    `);
}

function updateTicketDetails(ticketId, data) {
    const { estado, notas, extra_cost } = data;
    run("UPDATE tickets SET estado = ?, notas = ?, extra_cost = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", 
        [estado, notas, extra_cost, ticketId]);
    return getTicketById(ticketId);
}

function updateTicketEstado(ticketId, estado) {
    run("UPDATE tickets SET estado = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [estado, ticketId]);
    return queryOne('SELECT * FROM tickets WHERE id = ?', [ticketId]);
}

function addLog(tipo, contenido, telefono) {
    try {
        run('INSERT INTO logs (tipo, contenido, telefono) VALUES (?, ?, ?)', [tipo, contenido, telefono]);
    } catch (e) {
        console.error('[DB] Error adding log:', e.message);
    }
}

function getLogs(limit = 100) {
    return queryAll('SELECT * FROM logs ORDER BY created_at DESC LIMIT ?', [limit]);
}

function getTicketById(id) {
    return queryOne(`
        SELECT t.*, c.telefono, c.nombre as cliente_nombre, t.servicio_nombre as servicio,
               COALESCE(s.precio, 0) as servicio_precio
        FROM tickets t
        LEFT JOIN clientes c ON t.cliente_id = c.id
        LEFT JOIN servicios s ON t.servicio_id = s.id
        WHERE t.id = ?
    `, [id]);
}

module.exports = {
    initDatabase,
    queryAll,
    queryOne,
    run,
    getServicios,
    getConfig,
    setConfig,
    getOrCreateCliente,
    createTicket,
    getTickets,
    updateTicketDetails,
    updateTicketEstado,
    addLog,
    getLogs,
    getTicketById
};
