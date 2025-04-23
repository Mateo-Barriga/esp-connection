import express from 'express';
import { WebSocketServer } from 'ws';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS_JSON);

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const app = express();
const port = process.env.PORT || 3000;

const server = app.listen(port, () => {
  console.log(`Servidor WebSocket escuchando en el puerto ${port}`);
});

const wss = new WebSocketServer({ server });

let connectedClients = [];

wss.on('connection', (ws) => {
  console.log('ESP32 conectada por WebSocket');
  connectedClients.push(ws);

  ws.on('close', () => {
    connectedClients = connectedClients.filter(client => client !== ws);
    console.log('ESP32 desconectada');
  });
});

// Firestore listener
db.collection('reuniones')
  .where('status', '==', 'in_progress')
  .onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added' || change.type === 'modified') {
        const tokenQR = change.doc.data().tokenQR;
        console.log('Enviando token a ESP32:', tokenQR);
        connectedClients.forEach(ws => {
          ws.send(JSON.stringify({ tokenQR }));
        });
      }
    });
  });
