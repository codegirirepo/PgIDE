import { Router, Request, Response } from 'express';
import { dumpDatabase, importSQL, getDumpSchemas } from '../services/dumpService.js';

const router = Router();

// Get available schemas for dump
router.get('/schemas/:connId', async (req: Request, res: Response) => {
  try {
    res.json(await getDumpSchemas(req.params.connId));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Dump database to SQL
router.post('/export', async (req: Request, res: Response) => {
  try {
    const { connectionId, schemaOnly, dataOnly, tables, schema } = req.body;
    const sql = await dumpDatabase(connectionId, { schemaOnly, dataOnly, tables, schema });
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="dump_${Date.now()}.sql"`);
    res.send(sql);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Import SQL
router.post('/import', async (req: Request, res: Response) => {
  try {
    const { connectionId, sql } = req.body;
    res.json(await importSQL(connectionId, sql));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

export default router;
