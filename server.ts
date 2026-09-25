import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  const DATA_DIR = path.join(process.cwd(), 'data');
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
  const USERS_FILE = path.join(DATA_DIR, 'users.json');

  // API: Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API: Get shared backend configuration
  app.get('/api/config', (req, res) => {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        res.json({ success: true, data });
      } else {
        const defaultGasUrl = (process.env.VITE_GAS_URL || '').trim();
        res.json({ success: true, data: { gasUrl: defaultGasUrl } });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API: Save shared backend configuration (Google Apps Script Web App URL)
  app.post('/api/config', (req, res) => {
    try {
      const { gasUrl } = req.body;
      const cleanUrl = (gasUrl || '').trim();
      const config = {
        gasUrl: cleanUrl,
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
      res.json({ success: true, data: config });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API: Get shared users
  app.get('/api/users', (req, res) => {
    try {
      if (fs.existsSync(USERS_FILE)) {
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
        res.json({ success: true, data: users });
      } else {
        res.json({ success: true, data: [] });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API: Save or update shared users
  app.post('/api/users', (req, res) => {
    try {
      const { users, user } = req.body;
      let currentUsers: any[] = [];
      if (fs.existsSync(USERS_FILE)) {
        try {
          currentUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
        } catch {
          currentUsers = [];
        }
      }

      if (Array.isArray(users)) {
        const map = new Map<string, any>();
        for (const u of currentUsers) {
          if (u.email) map.set(u.email.toLowerCase().trim(), u);
        }
        for (const u of users) {
          if (u.email) map.set(u.email.toLowerCase().trim(), u);
        }
        currentUsers = Array.from(map.values());
      } else if (user && user.email) {
        const cleanEmail = user.email.toLowerCase().trim();
        const idx = currentUsers.findIndex(u => (u.email || '').toLowerCase().trim() === cleanEmail);
        if (idx !== -1) {
          currentUsers[idx] = { ...currentUsers[idx], ...user };
        } else {
          currentUsers.push(user);
        }
      }

      fs.writeFileSync(USERS_FILE, JSON.stringify(currentUsers, null, 2), 'utf-8');
      res.json({ success: true, data: currentUsers });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
