require('dotenv').config();
const PORT = process.env.PORT || 3000;
const path = require('path');
const fs = require('fs');

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const basicAuth = require('express-basic-auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Seguridad: Basic Auth
app.use(basicAuth({
    users: { 'admin': process.env.ADMIN_PASS || 'admin123' },
    challenge: true,
    realm: 'TDP Dashboard'
}));

// Configuración de Multer para subida de archivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, 'public/uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint para subir imágenes
app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });
    res.json({ url: `/uploads/${req.file.filename}`, path: req.file.path });
});

let db = null;

async function start() {
    const database = require('../bot/src/database');
    const bot = require('../bot/src/bot');
    const { FlowManager } = require('../bot/src/handlers/flow');
    
    await database.initDatabase();
    db = database;
    const flowManager = new FlowManager();
    console.log('[DB] Lista');

    // Iniciar bot automáticamente
    const botStart = async () => {
        try {
            await bot.createBot(
                async (telefono, mensaje) => {
                    return await flowManager.handleMessage(telefono, mensaje);
                },
                (qr) => io.emit('qr_update', qr),
                (status) => {
                    io.emit('connection_status', { status });
                    // Si se conecta, forzar limpieza de QR en el cliente
                    if (status === 'connected') io.emit('qr_update', null);
                }
            );
        } catch (e) {
            console.error('[Bot] Error al iniciar:', e);
        }
    };

    botStart();

    // Rutas API
    app.get('/api/status', (req, res) => res.json({ db: 'connected', timestamp: new Date().toISOString() }));

    app.get('/api/tickets', (req, res) => res.json(db.getTickets()));

    app.get('/api/tickets/:id', (req, res) => {
        const t = db.getTicketById(parseInt(req.params.id));
        t ? res.json(t) : res.status(404).json({ error: 'No encontrado' });
    });

    app.post('/api/tickets', (req, res) => {
        const { telefono, nombre, servicio_id, descripcion } = req.body;
        const servicio = db.queryOne('SELECT * FROM servicios WHERE id = ?', [servicio_id]);
        if (!servicio) return res.status(400).json({ error: 'Servicio no válido' });
        
        const cliente = db.getOrCreateCliente(telefono, nombre);
        const ticket = db.createTicket(cliente.id, servicio.nombre, descripcion, servicio.id);
        
        io.emit('ticket_actualizado', ticket);
        res.json(ticket);
    });

    app.patch('/api/tickets/:id', (req, res) => {
        const t = db.getTicketById(parseInt(req.params.id));
        if (!t) return res.status(404).json({ error: 'No encontrado' });
        
        const updated = db.updateTicketDetails(parseInt(req.params.id), {
            estado: req.body.estado || t.estado,
            notas: req.body.notas !== undefined ? req.body.notas : t.notas,
            extra_cost: req.body.extra_cost !== undefined ? req.body.extra_cost : t.extra_cost
        });
        
        // Notificar al cliente si el ticket se completó
        if (req.body.estado === 'completado' && t.estado !== 'completado') {
            // Buscar mensaje personalizado del servicio
            const servicio = db.queryOne('SELECT mensaje_completado, imagen FROM servicios WHERE id = ?', [t.servicio_id]);
            
            let msg, img;
            
            if (servicio && servicio.mensaje_completado) {
                msg = servicio.mensaje_completado;
                img = servicio.imagen;
            } else {
                const config = db.getConfig('notificacion_entrega');
                msg = config ? config.valor : 'Tu equipo está listo para entrega.';
                img = config ? config.imagen : null;
            }

            const bot = require('../bot/src/bot');
            bot.sendMessage(t.telefono, msg, img).catch(console.error);
        }

        io.emit('ticket_actualizado', updated);
        res.json(updated);
    });

    app.delete('/api/tickets/:id', (req, res) => {
        db.run('DELETE FROM tickets WHERE id = ?', [parseInt(req.params.id)]);
        res.json({ success: true });
    });

    app.get('/api/servicios', (req, res) => res.json(db.getServicios()));

    app.put('/api/servicios/:id', (req, res) => {
        const { nombre, descripcion, precio, activo, imagen, mensaje_completado } = req.body;
        db.run('UPDATE servicios SET nombre=?, descripcion=?, precio=?, activo=?, imagen=?, mensaje_completado=? WHERE id=?',
            [nombre, descripcion, precio, activo ? 1 : 0, imagen, mensaje_completado, parseInt(req.params.id)]);
        res.json({ success: true });
    });

    app.get('/api/configuraciones', (req, res) => {
        const rows = db.queryAll('SELECT * FROM configuraciones');
        const config = {};
        rows.forEach(r => config[r.clave] = { valor: r.valor, imagen: r.imagen });
        res.json(config);
    });

    app.put('/api/configuraciones/:clave', (req, res) => {
        db.setConfig(req.params.clave, req.body.valor, req.body.imagen);
        io.emit('config_actualizada', { clave: req.params.clave, valor: req.body.valor, imagen: req.body.imagen });
        res.json({ success: true });
    });

    app.get('/api/logs', (req, res) => res.json(db.getLogs(parseInt(req.query.limit) || 50)));

    app.get('/api/stats', (req, res) => {
        const tickets = db.getTickets();
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        
        const pendiente = tickets.filter(t => t.estado === 'pendiente').length;
        const enProceso = tickets.filter(t => t.estado === 'en_proceso').length;
        const completado = tickets.filter(t => t.estado === 'completado').length;
        const nuevosHoy = tickets.filter(t => t.created_at.startsWith(todayStr)).length;
        
        // Calcular ingresos de tickets completados hoy
        const completadosHoy = tickets.filter(t => 
            t.estado === 'completado' && t.updated_at.startsWith(todayStr)
        );
        
        const ingresosHoy = completadosHoy.reduce((sum, t) => {
            return sum + (t.servicio_precio || 0) + (t.extra_cost || 0);
        }, 0);

        res.json({ 
            total: tickets.length, 
            pendiente, 
            enProceso, 
            completado, 
            nuevosHoy, 
            completadosHoy: completadosHoy.length,
            ingresosHoy 
        });
    });

    app.get('/api/connection', (req, res) => {
        res.json(bot.getConnectionStatus());
    });

    app.post('/api/bot/disconnect', (req, res) => {
        bot.disconnectBot().then(() => {
            io.emit('connection_status', { status: 'disconnected', qr: null, device: null });
            // Re-iniciar el bot para que genere un nuevo QR inmediatamente
            botStart();
            res.json({ success: true });
        }).catch(e => res.status(500).json({ error: e.message }));
    });

    app.post('/api/bot/reconnect', (req, res) => {
        bot.reconnectBot(
            async (telefono, mensaje) => {
                return await flowManager.handleMessage(telefono, mensaje);
            },
            (qr) => io.emit('qr_update', qr),
            (status) => io.emit('connection_status', { status })
        ).then(() => res.json({ success: true }))
        .catch(e => res.status(500).json({ error: e.message }));
    });

    // Socket
    io.on('connection', (socket) => {
        console.log('[Socket] Cliente conectado');
        // Enviar estado actual al conectar
        socket.emit('connection_status', bot.getConnectionStatus());
    });

    setInterval(() => {
        if (db) {
            try { io.emit('refresh_tickets', db.getTickets()); } catch (e) {}
        }
    }, 3000);

    server.listen(PORT, () => {
        console.log(`[Dashboard] http://localhost:${PORT}`);
    });
}

start().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});