import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { authRouter } from './src/server/routes/auth.ts';
import { emailRouter } from './src/server/routes/emails.ts';
import { slackRouter } from './src/server/routes/slack.ts';
import { adminRouter } from './src/server/routes/admin.ts';
import { queueService } from './src/server/queue.ts';
import { etherealService } from './src/server/ethereal.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PID_FILE = path.resolve(__dirname, 'data/.server.pid');

function writePidFile() {
  try {
    fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
    fs.writeFileSync(PID_FILE, String(process.pid), 'utf-8');
  } catch (err) {
    console.warn('[Server] Could not write pid file:', err);
  }
}

function removePidFile() {
  try {
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
  } catch {
    /* ignore */
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    removePidFile();
    process.exit(0);
  });
}
process.on('exit', removePidFile);

async function startServer() {
  const app = express();
  // Platforms (Render, Railway, etc.) inject PORT and route traffic to it —
  // honour it, fall back to 3000 for local runs (see DEPLOY.md).
  const PORT = parseInt(process.env.PORT || '3000', 10);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // Mount API Routers
  app.use('/api/auth', authRouter);
  app.use('/api/emails', emailRouter);
  app.use('/api/slack', slackRouter);
  app.use('/api/admin', adminRouter);

  // Health check
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'ReachInbox Email Job Scheduler',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // Start background Ethereal init & pending jobs recovery
  try {
    await etherealService.init();
    await queueService.recoverPendingJobs();
  } catch (err) {
    console.error('[Server] Init error:', err);
  }

  // Vite integration
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[ReachInbox Scheduler] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Server Fatal] Startup failed:', err);
  process.exit(1);
});
