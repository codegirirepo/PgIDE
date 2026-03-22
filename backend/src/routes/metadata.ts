import { Router, Request, Response } from 'express';
import * as meta from '../services/metadataService.js';
import { getPgVectorStatus, analyzeVectorSQL } from '../services/pgvectorService.js';

const router = Router();

router.get('/:connId/databases', async (req: Request, res: Response) => {
  try { res.json(await meta.getDatabases(req.params.connId)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get('/:connId/schemas', async (req: Request, res: Response) => {
  try { res.json(await meta.getSchemas(req.params.connId)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get('/:connId/schemas/:schema/tables', async (req: Request, res: Response) => {
  try { res.json(await meta.getTables(req.params.connId, req.params.schema)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get('/:connId/schemas/:schema/views', async (req: Request, res: Response) => {
  try { res.json(await meta.getViews(req.params.connId, req.params.schema)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get('/:connId/schemas/:schema/functions', async (req: Request, res: Response) => {
  try { res.json(await meta.getFunctions(req.params.connId, req.params.schema)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get('/:connId/schemas/:schema/tables/:table/columns', async (req: Request, res: Response) => {
  try { res.json(await meta.getColumns(req.params.connId, req.params.schema, req.params.table)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get('/:connId/schemas/:schema/tables/:table/indexes', async (req: Request, res: Response) => {
  try { res.json(await meta.getIndexes(req.params.connId, req.params.schema, req.params.table)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get('/:connId/schemas/:schema/tables/:table/constraints', async (req: Request, res: Response) => {
  try { res.json(await meta.getConstraints(req.params.connId, req.params.schema, req.params.table)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get('/:connId/schemas/:schema/functions/:func/definition', async (req: Request, res: Response) => {
  try {
    const args = (req.query.args as string) || '';
    const definition = await meta.getFunctionDefinition(req.params.connId, req.params.schema, req.params.func, args);
    res.json({ definition });
  }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get('/:connId/schemas/:schema/functions/:func/parameters', async (req: Request, res: Response) => {
  try {
    const args = (req.query.args as string) || '';
    const result = await meta.getFunctionParameters(req.params.connId, req.params.schema, req.params.func, args);
    res.json(result);
  }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get('/:connId/autocomplete', async (req: Request, res: Response) => {
  try { res.json(await meta.getAutocompleteSuggestions(req.params.connId)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get('/:connId/pgvector', async (req: Request, res: Response) => {
  try { res.json(await getPgVectorStatus(req.params.connId)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post('/:connId/pgvector/analyze', async (req: Request, res: Response) => {
  try {
    const { sql } = req.body;
    const hints = analyzeVectorSQL(sql || '');
    res.json({ hints });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

export default router;
