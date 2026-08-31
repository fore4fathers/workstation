import { Server } from 'socket.io';
import { verifyToken } from './auth.js';
import { query } from './db.js';

export function setupSocket(httpServer, app) {
  const io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
  });
  app.set('io', io);

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('unauthorized'));
      const payload = verifyToken(token);
      const { rows } = await query(
        'SELECT id, role, display_name FROM users WHERE id = $1 AND is_active = TRUE',
        [payload.id],
      );
      if (!rows[0]) return next(new Error('unauthorized'));
      socket.user = rows[0];
      next();
    } catch (err) {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    socket.join(`user:${socket.user.id}`);
    if (socket.user.role === 'admin') socket.join('admin');
    else {
      const { rows } = await query(
        `INSERT INTO conversations (worker_id) VALUES ($1)
         ON CONFLICT (worker_id) DO UPDATE SET worker_id = EXCLUDED.worker_id
         RETURNING id`,
        [socket.user.id],
      );
      socket.join(`conv:${rows[0].id}`);
    }

    socket.on('typing', (payload) => {
      const conversationId = payload?.conversation_id;
      if (!conversationId) return;
      socket.to(`conv:${conversationId}`).to('admin').emit('typing', {
        conversation_id: conversationId,
        user_id: socket.user.id,
      });
    });

    socket.on('join_conv', (id) => {
      if (socket.user.role === 'admin' && id) socket.join(`conv:${id}`);
    });
  });

  return io;
}
