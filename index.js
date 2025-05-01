import express from 'express';
import { WebSocketServer } from 'ws';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import http from 'http';


const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS_JSON);

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const app = express();
const port = process.env.PORT || 3000;
const server = http.createServer(app);
server.listen(port, () => {
  console.log(`Servidor WebSocket escuchando en el puerto ${port}`);
});

const wss = new WebSocketServer({ server });

let connectedClients = [];
 // Se pasa referencia a fingerprintRegister

wss.on('connection', (ws) => {
  console.log('🚀 Nueva conexión WebSocket');
  ws._id = Date.now();
  console.log(`🆔 Cliente conectado con ID temporal: ${ws._id}`);

  // Reemplazar cliente anterior si existe
  if (connectedClients.length > 0) {
    console.log('⚠️ Cliente existente encontrado, cerrándolo...');
    connectedClients.forEach(client => {
      console.log(`🔌 Cerrando cliente anterior con ID: ${client._id}`);
      client.close(1000, 'Reemplazo por nueva conexión');
    });

    setTimeout(() => {
      connectedClients.length = 0;
      connectedClients.push(ws);
      console.log('✅ Cliente WebSocket agregado. Total clientes:', connectedClients.length);
      console.log(`🆕 Cliente activo tras reinicio de ESP32: ID = ${ws._id}`);
    }, 100);
  } else {
    connectedClients.push(ws);
    console.log('✅ Cliente WebSocket agregado. Total clientes:', connectedClients.length);
  }

  ws.on('close', () => {
    if (connectedClients.includes(ws)) {
      console.log(`🔌 Cliente WebSocket desconectado (ID: ${ws._id})`);
      connectedClients = connectedClients.filter(client => client !== ws);
      console.log('💬 Clientes WebSocket activos:', connectedClients.length);
    }
  });

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);
      console.log(`📩 Mensaje recibido de ESP32 (ID: ${ws._id}):`, message);

      if (!message.action) {
        console.warn('⚠️ Mensaje recibido sin action:', message);
        return;
      }

      switch (message.action) {
        case 'resultado_registro_huella':
          console.log('✅ Respuesta de registro de huella:', message);
          if (message.register_status === 'success') {
            await db.collection('usuarios').doc(message.uid).update({
              huella_registrada: true,
              templateId: message.templateId
            });
            console.log('🔥 Usuario actualizado en Firestore');
          } else {
            console.log('❌ Falló registro de huella para UID:', message.uid);
          }
          break;

        case 'resultado_registro_asistencia':
          console.log('🔁 Resultado escaneo huella para asistencia:', message);
          const resolver = asistenciaPendiente.get(message.uid);
          if (resolver) {
            asistenciaPendiente.delete(message.uid);
            resolver(message.match === true); // match: true o false desde ESP32
          } else {
            console.warn('⚠️ No hay promesa pendiente para UID:', message.uid);
          }
          break;

        default:
          console.warn('⚠️ Acción no reconocida en mensaje WebSocket:', message.action);
          break;
      }

    } catch (err) {
      console.error('❗ Error procesando mensaje WebSocket:', err);
    }
  });
});

// 🔄 Firestore listener para mostrar QR en TFT
let firstSnapshot = true;

db.collection('reuniones')
  .where('status', '==', 'in_progress')
  .onSnapshot((snapshot) => {
    if (firstSnapshot) {
      firstSnapshot = false;
      return; // Ignora primer snapshot
    }

    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added' || change.type === 'modified') {
        const data = change.doc.data();
        const tokenQR = data.tokenQR;
        const title = data.title || 'Reunión sin título';
        const action = 'mostrar_qr';

        console.log(`📡 Enviando token a ESP32: ${tokenQR} - ${title}`);
        connectedClients.forEach(ws => {
          ws.send(JSON.stringify({ tokenQR, title, action }));
        });
      }
    });
  });

// ✅ Endpoint HTTP para iniciar registro de huella
app.use(express.json());

app.post('/trigger-fingerprint-scan', async (req, res) => {
  try {
    const { uid, nombre, email } = req.body;

    if (!uid || !nombre || !email) {
      return res.status(400).json({ error: 'Faltan datos obligatorios: uid, nombre o correo' });
    }

    const message = {
      action: 'registrar_huella',
      uid,
      nombre,
      email
    };

    if (connectedClients.length === 0) {
      return res.status(503).json({ error: 'No hay ESP32 conectado' });
    }

    connectedClients.forEach(ws => {
      ws.send(JSON.stringify(message));
    });

    res.status(200).json({ message: 'Solicitud enviada a todos los clientes ESP32' });
  } catch (error) {
    console.error('❌ Error en trigger-fingerprint-scan:', error);
    res.status(500).json({ error: 'Error interno al enviar solicitud de registro de huella' });
  }
});



// 🧠 Mapa temporal para resolver promesas de solicitudes de asistencia
const asistenciaPendiente = new Map();

// ✅ Endpoint para manejar asistencia con validación de huella en tiempo real
app.post('/request_assistance', async (req, res) => {
  try {
    const { uid, nombre, templateId } = req.body;

    if (!uid || !nombre || (templateId === undefined || templateId === null)) {
      return res.status(400).json({ error: 'Faltan uid  o nombre o templateId' });
    }

    if (connectedClients.length === 0) {
      return res.status(503).json({ error: 'No hay ESP32 conectado' });
    }

    const message = {
      action: 'registrar_asistencia',
      uid,
      nombre,
      templateId
    };

    // Enviar solicitud a la ESP
    connectedClients.forEach(ws => {
      ws.send(JSON.stringify(message));
    });

    // Esperar respuesta de la ESP32 con Promise y timeout
    const resultado = await new Promise((resolve, reject) => {
      asistenciaPendiente.set(uid, resolve);

      setTimeout(() => {
        asistenciaPendiente.delete(uid);
        reject(new Error('Tiempo de espera agotado para respuesta de ESP32'));
      }, 15000); // 10 segundos de timeout
    });

    console.log(`📬 Resultado recibido desde ESP32 para UID ${uid}: match = ${resultado}`);
    return res.status(200).json({ match: resultado === true });
  } catch (error) {
    console.error('❌ Error en /request_assistance:', error);
    return res.status(500).json({ error: 'Error interno en el servidor' });
  }
});
