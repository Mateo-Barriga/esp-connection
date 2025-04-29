let connectedClients = []; // Esto será sobreescrito desde index.js

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

  console.log('📡 Enviando solicitud de registro de huella a los clientes conectados:', payload);

  connectedClients.forEach((ws) => {
    console.log(`➡️ Enviando solicitud a cliente WebSocket con ID: ${ws._id}`);
    ws.send(JSON.stringify(payload));
  });
}

/**
 * Esta función es la que se llama desde el endpoint en index.js
 * Maneja la solicitud de registro de huella
 * @param {Object} data - Datos del usuario { uid, nombre, email }
 */
export async function handleFingerprintRegister(data) {
  try {
    requestFingerprintRegistration(data);  // Llama a la función para enviar el mensaje a ESP32
  } catch (error) {
    console.error('Error en el registro de huella:', error);
  }
}
