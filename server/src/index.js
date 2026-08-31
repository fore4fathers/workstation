import express from 'express';
import cors from 'cors';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config } from './config.js';
import { setupSocket } from './socket.js';
import { authRouter, meRouter } from './routes/auth.js';
import { tasksRouter } from './routes/tasks.js';
import { submissionsRouter } from './routes/submissions.js';
import { walletRouter, leadersRouter } from './routes/wallet.js';
import { chatRouter } from './routes/chat.js';
import { adminRouter } from './routes/admin.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(here, '../../web');

export const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '5mb' }));

fs.mkdirSync(config.uploadDir, { recursive: true });
app.use('/uploads', express.static(config.uploadDir));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'ai-workstation' });
});

app.use('/api/auth', authRouter);
app.use('/api/me', meRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/tasks', submissionsRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/leaders', leadersRouter);
app.use('/api/chat', chatRouter);
app.use('/api/admin', adminRouter);

app.use(express.static(webDir));
app.get(/^\/(?!api\/|uploads\/|health).*/, (_req, res) => {
  res.sendFile(path.join(webDir, 'index.html'));
});

export function createHttpServer() {
  const server = http.createServer(app);
  setupSocket(server, app);
  return server;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const server = createHttpServer();
  server.listen(config.port, '127.0.0.1', () => {
    console.log(`ai-workstation on http://127.0.0.1:${config.port}`);
  });
}
