import { Router, Request, Response } from 'express';
import { executeQuery } from '../services/queryExecutor.js';
import { cancelRunningQuery } from '../services/connectionManager.js';

const router = Router();

router.post('/execute', async (req: Request, res: Response) => {
  const { connectionId, sql, offset, limit, timeout } = req.body;
  if (!connectionId || !sql) {
    res.status(400).json({ error: 'connectionId and sql are required' }); return;
  }
  try {
    const result = await executeQuery({ connectionId, sql, offset, limit, timeout });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/cancel', (req: Request, res: Response) => {
  const { queryId } = req.body;
  const cancelled = cancelRunningQuery(queryId);
  res.json({ cancelled });
});

export default router;
