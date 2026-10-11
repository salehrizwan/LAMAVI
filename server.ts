import express from 'express';
import { createServer as createHttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import {
  createApiApp,
  db,
  saveDatabase,
  sanitizeUserForViewer,
  isBlockedBetween,
  purgeExpiredRecords,
} from './api/index';

async function startServer() {
  const userSockets = new Map<string, Set<WebSocket>>();

  function sendToUser(userId: string, event: string, payload: unknown) {
    const sockets = userSockets.get(userId);
    if (!sockets) return;
    const message = JSON.stringify({ event, payload });
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  function isUserConnectedRealtime(userId: string): boolean {
    return userSockets.has(userId) && (userSockets.get(userId)?.size || 0) > 0;
  }

  function broadcastPresenceChange(userId: string) {
    const user = db.users.find((u) => u.id === userId);
    if (!user) return;
    for (const [viewerId] of userSockets.entries()) {
      if (viewerId === userId) continue;
      const sanitized = sanitizeUserForViewer(user, viewerId);
      sendToUser(viewerId, 'presence:update', {
        userId: user.id,
        isOnline: sanitized.isOnline,
        lastSeen: sanitized.lastSeen,
      });
    }
  }

  const app = createApiApp(sendToUser, isUserConnectedRealtime);
  const httpServer = createHttpServer(app);

  // Run 7-day retention cleanup periodically
  setInterval(purgeExpiredRecords, 15 * 60 * 1000);

  // --- WEBSOCKET SERVER FOR REAL-TIME PRESENCE, TYPING, AND MESSAGES ---
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    if (url.pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws, request) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const token = url.searchParams.get('token') || '';
    const now = new Date().toISOString();
    const session = db.sessions.find(
      (s) => s.token === token && s.expiresAt > now
    );
    if (!session) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const user = db.users.find((u) => u.id === session.userId);
    if (!user) {
      ws.close(4001, 'User not found');
      return;
    }

    const userId = user.id;
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)!.add(ws);

    user.isOnline = true;
    user.lastSeen = new Date().toISOString();
    saveDatabase();
    broadcastPresenceChange(userId);

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(String(raw));
        if (data.event === 'typing' && data.payload?.conversationId) {
          const conv = db.conversations.find(
            (c) => c.id === data.payload.conversationId
          );
          if (conv && conv.participantIds.includes(userId)) {
            const otherId =
              conv.participantIds[0] === userId
                ? conv.participantIds[1]
                : conv.participantIds[0];
            if (!isBlockedBetween(userId, otherId).blocked) {
              sendToUser(otherId, 'typing', {
                conversationId: conv.id,
                userId,
                isTyping: !!data.payload.isTyping,
              });
            }
          }
        }
      } catch {
        // Ignore malformed WS packets
      }
    });

    ws.on('close', () => {
      const set = userSockets.get(userId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) {
          userSockets.delete(userId);
          const u = db.users.find((usr) => usr.id === userId);
          if (u) {
            u.isOnline = false;
            u.lastSeen = new Date().toISOString();
            saveDatabase();
            broadcastPresenceChange(userId);
          }
        }
      }
    });
  });

  // --- VITE MIDDLEWARE OR PRODUCTION STATIC ASSETS ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true' ? { server: httpServer } : false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`LAMAVI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
