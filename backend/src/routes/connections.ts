import { Router, Request, Response } from 'express';
import {
  saveConnection, getSavedConnections, deleteConnection,
  testConnection, connectPool, disconnectPool, isConnected,
  type ConnectionConfig,
} from '../services/connectionManager.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json(getSavedConnections());
});

router.post('/', (req: Request, res: Response) => {
  const config: ConnectionConfig = req.body;
  if (!config.name || !config.host || !config.database || !config.user || !config.password) {
    res.status(400).json({ error: 'Missing required fields' }); return;
  }
  const saved = saveConnection(config);
  res.json({ id: saved.id, name: saved.name, host: saved.host, port: saved.port, database: saved.database });
});

router.delete('/:id', (req: Request, res: Response) => {
  deleteConnection(req.params.id);
  res.json({ success: true });
});

router.post('/test', async (req: Request, res: Response) => {
  const result = await testConnection(req.body);
  res.json(result);
});

router.post('/:id/connect', async (req: Request, res: Response) => {
  const result = await connectPool(req.params.id);
  res.json(result);
});

router.post('/:id/disconnect', (req: Request, res: Response) => {
  disconnectPool(req.params.id);
  res.json({ success: true });
});

router.get('/:id/status', (req: Request, res: Response) => {
  res.json({ connected: isConnected(req.params.id) });
});

export default router;
