#!/bin/bash

# TDP - Terminal Deployment & Performance
# Script de inicio rápido

echo "🚀 Iniciando ecosistema TDP..."

# Verificar si existe .env, si no, avisar
if [ ! -f .env ]; then
    echo "⚠️ Archivo .env no encontrado. Asegúrate de configurar tus variables."
    exit 1
fi

# Cargar variables de entorno (opcional para el script)
export $(grep -v '^#' .env | xargs)

# Matar procesos previos en el puerto configurado (por seguridad)
PORT_TO_CLEAN=${PORT:-3001}
echo "Clean port $PORT_TO_CLEAN..."
fuser -k $PORT_TO_CLEAN/tcp 2>/dev/null

# Iniciar el servicio
echo "📦 Arrancando Dashboard y Bot en puerto $PORT_TO_CLEAN..."
node dashboard/server.js
