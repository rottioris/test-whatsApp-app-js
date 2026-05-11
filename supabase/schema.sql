-- TDP Database Schema for Supabase
-- Execute this in Supabase SQL Editor

-- Tabla: servicios (configuración de servicios)
CREATE TABLE IF NOT EXISTS servicios (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    descripcion TEXT,
    precio DECIMAL(10,2),
    activo BOOLEAN DEFAULT true,
    orden INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla: clientes
CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telefono TEXT NOT NULL UNIQUE,
    nombre TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla: tickets
CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID REFERENCES clientes(id),
    servicio TEXT NOT NULL,
    descripcion TEXT,
    estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_proceso', 'completado')),
    notas TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla: configuraciones (mensajes editables del bot)
CREATE TABLE IF NOT EXISTS configuraciones (
    id SERIAL PRIMARY KEY,
    clave TEXT NOT NULL UNIQUE,
    valor TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla: logs
CREATE TABLE IF NOT EXISTS logs (
    id SERIAL PRIMARY KEY,
    tipo TEXT CHECK (tipo IN ('mensaje', 'ticket', 'estado', 'error')),
    contenido TEXT,
    telefono TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar servicios por defecto
INSERT INTO servicios (nombre, descripcion, precio, orden) VALUES
('ASESORÍA', 'Consultas sobre armados y equipos', 0, 1),
('MANTENIMIENTO', 'Solución de errores hardware y software', 0, 2),
('LIMPIEZA', 'Limpieza de componentes + cambio de pasta térmica', 0, 3),
('ENSAMBLES', 'Armado de PC nuevo', 0, 4),
('INSTALACIÓN', 'Sistemas operativos y software', 0, 5),
('COMBOS', 'Paquetes de servicios', 0, 6)
ON CONFLICT (nombre) DO NOTHING;

-- Insertar configuraciones por defecto
INSERT INTO configuraciones (clave, valor) VALUES
('bienvenida', '👋 Hola! Bienvenido a TDP - Servicios Técnicos'),
('menu_servicios', '¿Qué servicio necesitas?\n\n1️⃣ ASESORÍA\n2️⃣ MANTENIMIENTO\n3️⃣ LIMPIEZA\n4️⃣ ENSAMBLES\n5️⃣ INSTALACIÓN\n6️⃣ COMBOS'),
('pedir_datos', 'Para crear tu ticket necesito:\n\n📝 Tu nombre:\n🔧 Describe el problema de tu equipo:'),
('confirmacion_ticket', '✅ Ticket creado exitosamente!\n\nTe avisaremos cuando esté listo para entrega.'),
('notificacion_entrega', 'Tu equipo ha pasado las pruebas TDP y está listo para entrega. 📱')
ON CONFLICT (clave) DO NOTHING;

-- Habilitar Realtime para tablas
ALTER PUBLICATION supabase_realtime ADD TABLE tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE clientes;
ALTER PUBLICATION supabase_realtime ADD TABLE logs;
ALTER PUBLICATION supabase_realtime ADD TABLE configuraciones;
ALTER PUBLICATION supabase_realtime ADD TABLE servicios;