let connectedClients = [];

// Se exporta esta función para setear la lista de clientes conectados
export function setConnectedClients(clients) {
  connectedClients = clients;
}

/**
 * Envía a todos los clientes conectados el mensaje para iniciar el escaneo de huella
 * @param {Object} data - Datos del usuario { uid, nombre, email }
 */
export function requestFingerprintRegistration(data) {
  if (!data.uid || !data.nombre || !data.email) {
    throw new Error('Faltan datos obligatorios para registrar huella');
  }

  const payload = {
    action: 'registrar_huella',
    uid: data.uid,
    nombre: data.nombre,
    email: data.email
  };

  if (connectedClients.length === 0) {
    console.warn('⚠️ No hay clientes WebSocket conectados para enviar la solicitud de huella');
    return;
  }

  console.log('📡 Enviando solicitud de registro de huella a los clientes conectados:', payload);

  connectedClients.forEach((ws) => {
    if (ws.readyState === ws.OPEN) {
      console.log(`➡️ Enviando solicitud a cliente WebSocket con ID: ${ws._id}`);
      ws.send(JSON.stringify(payload));
    } else {
      console.warn(`❌ Cliente WebSocket con ID ${ws._id} no está abierto (estado: ${ws.readyState})`);
    }
  });
}

/**
 * Esta función es la que se llama desde el endpoint en index.js
 * Maneja la solicitud de registro de huella
 * @param {Object} data - Datos del usuario { uid, nombre, email }
 */
export async function handleFingerprintRegister(data) {
  try {
    requestFingerprintRegistration(data);
  } catch (error) {
    console.error('❗ Error en el registro de huella:', error.message);
    throw error; // Se vuelve a lanzar para que el endpoint lo capture si es necesario
  }
}
