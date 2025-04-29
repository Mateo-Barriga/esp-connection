import express from 'express';
import { WebSocketServer } from 'ws';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import http from 'http';
import { handleFingerprintRegister, setConnectedClients } from './fingerprintRegister.js';

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
setConnectedClients(connectedClients); // se pasa la referencia

wss.on('connection', (ws) => {
  console.log('🚀 Nueva conexión WebSocket');

  // 🔧 Asigna un identificador temporal a la conexión (solo para debug)
  ws._id = Date.now(); // También podrías usar uuid si deseas más robustez
  console.log(`🆔 Cliente conectado con ID temporal: ${ws._id}`);

  // Si ya hay un cliente conectado, ciérralo de forma segura
  if (connectedClients.length > 0) {
    console.log('⚠️ Cliente existente encontrado, cerrándolo para aceptar nueva conexión...');
  
    connectedClients.forEach(client => {
      console.log(`🔌 Cerrando cliente anterior con ID: ${client._id}`);
      client.close(1000, 'Reemplazo por nueva conexión');
    });
  
    setTimeout(() => {
      connectedClients.length = 0;
      connectedClients.push(ws);
      console.log('✅ Cliente WebSocket agregado. Total clientes:', connectedClients.length);
      console.log(`🆕 Cliente activo tras reinicio de ESP32: ID = ${ws._id}`); // 👈 Este es el log nuevo que pediste
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

        console.log(`Enviando token a ESP32: ${tokenQR} - ${title} - ${action}`);
        connectedClients.forEach(ws => {
          ws.send(JSON.stringify({ tokenQR, title, action }));
        });
      }
    });
  });

// ✅ Nuevo endpoint para registrar huella
app.use(express.json());

app.post('/trigger-fingerprint-scan', async (req, res) => {
  try {
    const { uid, nombre, email } = req.body;

    if (!uid || !nombre || !email) {
      return res.status(400).json({ error: 'Faltan datos obligatorios: uid, nombre o correo' });
    }

    await handleFingerprintRegister({ uid, nombre, email });

    res.status(200).json({ message: 'Solicitud enviada a ESP32' });
  } catch (error) {
    console.error('Error en trigger-fingerprint-scan:', error);
    res.status(500).json({ error: 'Error interno al enviar solicitud de registro de huella' });
  }
});

