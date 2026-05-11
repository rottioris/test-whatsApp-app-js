# TDP - Terminal Deployment & Performance

Ecosistema de automatización para gestión de servicios técnicos informáticos con bot de WhatsApp y dashboard admin.

## Estructura

```
tdp/
├── bot/                 # Bot de WhatsApp (Baileys)
│   ├── src/
│   │   ├── index.js    # Entry point
│   │   ├── bot.js      # Cliente Baileys
│   │   ├── database.js # SQLite
│   │   └── handlers/
│   │       └── flow.js # Lógica del menú
│   ├── session/        # Sesiones de WhatsApp
│   └── package.json
├── dashboard/           # Panel Admin
│   ├── server.js       # Express + Socket.io
│   ├── public/
│   │   └── index.html  # UI Terminal-style
│   ├── src/
│   │   └── socket.js
│   └── package.json
├── data/                # Base de datos SQLite
└── .env.example         # Variables de entorno
```

## Instalación

```bash
# Instalar dependencias del bot
cd bot && npm install

# Instalar dependencias del dashboard
cd ../dashboard && npm install
```

## Ejecución

```bash
# Terminal 1: Iniciar el bot
cd bot && npm start

# Terminal 2: Iniciar el dashboard
cd dashboard && npm start
```

## Uso

1. **Dashboard**: http://localhost:3000
2. **WhatsApp**: Escanea el QR desde la pestaña "QR WhatsApp"
3. **Tickets**: Los clientes crean tickets desde WhatsApp, los gestionas desde el dashboard
4. **Configuración**: Edita mensajes y servicios desde la pestaña "Configuración"

## Flujo del Bot

1. Cliente escribe "Hola"
2. Bot muestra menú de servicios
3. Cliente selecciona servicio
4. Bot muestra precio + descripción
5. Cliente acepta
6. Bot pide nombre y descripción del problema
7. Se crea ticket en la base de datos

## Tech Stack

- **WhatsApp**: Baileys (más ligero que whatsapp-web.js)
- **Base de datos**: SQLite (local)
- **Dashboard**: Express + Socket.io
- **Estética**: Terminal Dark Mode (#000, #0f0)

## Producción

Para producción en Railway:
1. Crear cuenta en Railway
2. Conectar repositorio GitHub
3. Agregar переменные de entorno
4. Railway detectará npm start automáticamente