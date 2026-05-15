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
            imagen TEXT,
            mensaje_completado TEXT
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
            servicio_precio REAL DEFAULT 0,
            descripcion TEXT,
            estado TEXT DEFAULT 'pendiente',
            notas TEXT,
            extra_cost REAL DEFAULT 0,
            imagenes TEXT,
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

        CREATE TABLE IF NOT EXISTS ticket_extras (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id INTEGER NOT NULL,
            descripcion TEXT NOT NULL,
            costo REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_clientes_telefono ON clientes(telefono);
        CREATE INDEX IF NOT EXISTS idx_tickets_cliente ON tickets(cliente_id);
        CREATE INDEX IF NOT EXISTS idx_tickets_estado ON tickets(estado);
    `);

    return db;
}

function queryAll(sql, params = []) { return db.prepare(sql).all(params); }
function queryOne(sql, params = []) { return db.prepare(sql).get(params); }
function run(sql, params = []) {
    const info = db.prepare(sql).run(params);
    return { lastInsertRowid: info.lastInsertRowid, changes: info.changes };
}

function getServicios(all = false) { return queryAll('SELECT * FROM servicios ' + (all ? '' : 'WHERE activo = 1 ') + 'ORDER BY orden'); }
function getConfig(clave) { return queryOne('SELECT * FROM configuraciones WHERE clave = ?', [clave]); }
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

function createTicket(clienteId, servicioNombre, descripcion, servicioId = null, imagenes = null, servicioPrecio = 0) {
    const result = run('INSERT INTO tickets (cliente_id, servicio_id, servicio_nombre, servicio_precio, descripcion, estado, imagenes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [clienteId, servicioId, servicioNombre, servicioPrecio, descripcion, 'pendiente', imagenes]);
    return { id: result.lastInsertRowid, cliente_id: clienteId, servicio_nombre: servicioNombre, servicio_precio: servicioPrecio, descripcion, estado: 'pendiente', imagenes };
}

function getTicketExtras(ticketId) { return queryAll('SELECT * FROM ticket_extras WHERE ticket_id = ? ORDER BY created_at ASC', [ticketId]); }
function addTicketExtra(ticketId, descripcion, costo) { return run('INSERT INTO ticket_extras (ticket_id, descripcion, costo) VALUES (?, ?, ?)', [ticketId, descripcion, costo]); }
function deleteTicketExtra(id) { return run('DELETE FROM ticket_extras WHERE id = ?', [id]); }

function getTickets() {
    return queryAll(`
        SELECT t.*, c.telefono, c.nombre as cliente_nombre, t.servicio_nombre as servicio,
               COALESCE((SELECT SUM(costo) FROM ticket_extras WHERE ticket_id = t.id), 0) as total_extras
        FROM tickets t
        LEFT JOIN clientes c ON t.cliente_id = c.id
        ORDER BY t.created_at DESC
    `);
}

function updateTicketDetails(ticketId, data) {
    const { estado, notas } = data;
    run("UPDATE tickets SET estado = ?, notas = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [estado, notas, ticketId]);
    return getTicketById(ticketId);
}

function updateTicketEstado(ticketId, estado) {
    run("UPDATE tickets SET estado = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [estado, ticketId]);
    return getTicketById(ticketId);
}

function addLog(tipo, contenido, telefono) {
    try { run('INSERT INTO logs (tipo, contenido, telefono) VALUES (?, ?, ?)', [tipo, contenido, telefono]); } catch (e) {}
}

function getLogs(limit = 100) { return queryAll('SELECT * FROM logs ORDER BY created_at DESC LIMIT ?', [limit]); }

function getTicketById(id) {
    return queryOne(`
        SELECT t.*, c.telefono, c.nombre as cliente_nombre, t.servicio_nombre as servicio
        FROM tickets t
        LEFT JOIN clientes c ON t.cliente_id = c.id
        WHERE t.id = ?
    `, [id]);
}

module.exports = {
    initDatabase, queryAll, queryOne, run, getServicios, getConfig, setConfig,
    getOrCreateCliente, createTicket, getTickets, updateTicketDetails,
    updateTicketEstado, addLog, getLogs, getTicketById, getTicketExtras,
    addTicketExtra, deleteTicketExtra
};
