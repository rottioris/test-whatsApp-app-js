# Contexto del Proyecto: TDP - Terminal Deployment & Performance

## 📝 Resumen del Estado Actual
El proyecto es un ecosistema funcional de gestión de servicios técnicos que integra un **Bot de WhatsApp** (automatización de tickets) con un **Dashboard Administrativo** (gestión visual y configuración). El sistema ha sido migrado de Supabase a **SQLite** para garantizar portabilidad y facilidad de pruebas locales.

## 🛠️ Stack Tecnológico
- **Backend/Bot**: Node.js con `@whiskeysockets/baileys` (v7.0.0-rc10).
- **Dashboard**: Express.js + Socket.io (Tiempo real).
- **Base de Datos**: SQLite (`data/tdp.db`) usando `sql.js`.
- **Frontend**: HTML5/Vanilla CSS/JS (Estilo Terminal/Moderno).

## 🚀 Cambios y Mejoras Implementadas

### 1. Integración y Estabilidad
- **Unificación**: El bot ahora se inicia automáticamente junto con el dashboard (`dashboard/server.js`).
- **Prevención de Duplicados**: Implementación de un `messageCache` de 10 segundos para evitar que el bot responda dos veces al mismo mensaje en ráfagas de WhatsApp.
- **Detección de Dispositivo**: El sistema captura y muestra el nombre del dispositivo conectado (ej: "iPhone de Juan") y la plataforma.

### 2. Experiencia del Usuario (Bot)
- **Flujo Profesional**: Mensajes con negritas, emojis y estructura clara.
- **Navegación**: Comandos globales como "atrás", "menú" o "cancelar" disponibles en todo momento.
- **Precios Dinámicos**: Consulta automática de precios en la DB.
- **Imágenes**: Soporte para enviar imágenes en mensajes de bienvenida, menús, servicios y notificaciones de entrega.

### 3. Dashboard (Panel Admin)
- **Kanban Interactivo**: Implementación de **Drag & Drop** para mover tickets entre columnas (Pendiente -> En Proceso -> Completado) con el mouse.
- **Gestión de Sesión**: Botones de "Reconectar" y "Cerrar Sesión" (Desvincular WhatsApp) integrados en el panel y en la sección de QR.
- **UI/UX Mejorada**: Nueva sección de configuración con diseño de rejilla (grid) y campos específicos para URLs de imágenes.

### 4. Automatización
- **Notificaciones de Entrega**: Al pasar un ticket a "Completado", el bot envía automáticamente un mensaje al cliente con ubicación, horarios y opciones de contacto.
- **Script de Inicio**: Creación de `start.sh` para facilitar el arranque del servicio y limpieza de puertos.

## 📁 Estructura Clave
- `bot/src/bot.js`: Lógica del cliente de WhatsApp.
- `bot/src/handlers/flow.js`: Lógica de la conversación y estados.
- `bot/src/database.js`: Gestión de la base de datos SQLite.
- `dashboard/server.js`: Servidor API y Sockets.
- `dashboard/public/index.html`: Interfaz del panel.
- `start.sh`: Script de arranque rápido.

## 📌 Configuración de Puertos
- **Puerto actual**: 3001 (Configurado en `.env` para evitar conflictos con el 3000).
- **URL**: `http://localhost:3001`

---
*Documento generado el 11 de mayo de 2026.*
