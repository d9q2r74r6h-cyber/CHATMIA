require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');

const app = express();

app.use(cors());
app.use(express.json());

let supabase = null;

if (
  process.env.SUPABASE_URL &&
  process.env.SUPABASE_SERVICE_ROLE_KEY
) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

app.get('/', (req, res) => {
  res.send('ChatMia server running');
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

let waitingSocketId = null;

const partners = new Map();
const users = new Map();

const messageRateLimit = new Map();
const nextRateLimit = new Map();

const bannedWords = [
  'puta',
  'puto',
  'mierda',
  'maricon',
  'maricón',
  'nazi',
  'kill',
  'suicide',
];

function emitOnlineCount() {
  io.emit('online-count', io.engine.clientsCount);
}

function containsBannedWord(text) {
  const normalized = text.toLowerCase();

  return bannedWords.some((word) =>
    normalized.includes(word)
  );
}

function removeWaiting(socketId) {
  if (waitingSocketId === socketId) {
    waitingSocketId = null;
  }
}

function disconnectPair(socketId) {
  const partnerId = partners.get(socketId);

  if (!partnerId) return;

  partners.delete(socketId);
  partners.delete(partnerId);

  io.to(partnerId).emit('partner-left');
}

io.on('connection', (socket) => {
  console.log('CONNECTED:', socket.id);

  emitOnlineCount();

  socket.on('find-partner', ({ gender, country, email }) => {
    console.log('FIND:', socket.id, gender, country?.code);

    users.set(socket.id, {
      email: email || null,
      gender: gender || null,
      country: country?.name || country?.code || null,
      flag: country?.flag || '',
    });

    removeWaiting(socket.id);
    disconnectPair(socket.id);

    if (waitingSocketId && waitingSocketId !== socket.id) {
      const partnerId = waitingSocketId;
      waitingSocketId = null;

      partners.set(socket.id, partnerId);
      partners.set(partnerId, socket.id);

      console.log('MATCHED:', socket.id, partnerId);

      socket.emit('matched', {
        partnerId,
        initiator: true,
        partner: users.get(partnerId) || null,
      });

      io.to(partnerId).emit('matched', {
        partnerId: socket.id,
        initiator: false,
        partner: users.get(socket.id) || null,
      });

      return;
    }

    waitingSocketId = socket.id;

    console.log('WAITING:', socket.id);
  });

  socket.on('signal', ({ to, signal }) => {
    io.to(to).emit('signal', { signal });
  });

  socket.on('chat-message', ({ message }) => {
    const now = Date.now();

    const lastMessage =
      messageRateLimit.get(socket.id) || 0;

    if (now - lastMessage < 1000) return;

    messageRateLimit.set(socket.id, now);

    const partnerId = partners.get(socket.id);

    if (!partnerId || !message) return;

    const cleanMessage = message.trim();

    if (!cleanMessage) return;

    if (cleanMessage.length > 300) return;

    if (containsBannedWord(cleanMessage)) {
      console.log(
        'BLOCKED MESSAGE:',
        socket.id,
        cleanMessage
      );

      socket.emit('message-blocked');

      return;
    }

    io.to(partnerId).emit('chat-message', {
      message: cleanMessage,
    });

    if (supabase) {
      supabase
        .from('chat_messages')
        .insert({
          chat_id: [socket.id, partnerId]
            .sort()
            .join('_'),

          sender_socket: socket.id,
          sender_email:
            users.get(socket.id)?.email || null,
          message: cleanMessage,
        })
        .then(({ error }) => {
          if (error) {
            console.error(
              'CHAT MESSAGE INSERT ERROR:',
              error
            );
          }
        });
    }
  });

  socket.on('reaction', ({ emoji }) => {
    const partnerId = partners.get(socket.id);

    if (!partnerId) return;

    io.to(partnerId).emit('reaction', {
      emoji,
    });
  });

  socket.on('typing', () => {
    const partnerId = partners.get(socket.id);

    if (!partnerId) return;

    io.to(partnerId).emit('typing');
  });

  socket.on('next', () => {
    console.log('NEXT:', socket.id);

    const now = Date.now();

    const nextData =
      nextRateLimit.get(socket.id) || {
        count: 0,
        time: now,
      };

    if (now - nextData.time > 10000) {
      nextData.count = 0;
      nextData.time = now;
    }

    nextData.count++;

    nextRateLimit.set(socket.id, nextData);

    if (nextData.count > 5) return;

    removeWaiting(socket.id);
    disconnectPair(socket.id);
  });

  socket.on('disconnect', () => {
    console.log('DISCONNECTED:', socket.id);

    removeWaiting(socket.id);
    disconnectPair(socket.id);

    users.delete(socket.id);
    messageRateLimit.delete(socket.id);
    nextRateLimit.delete(socket.id);

    emitOnlineCount();
  });
});

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`ChatMia server running on port ${PORT}`);
});