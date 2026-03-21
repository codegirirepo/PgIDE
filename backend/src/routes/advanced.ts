import { Router, Request, Response } from 'express';
import * as adv from '../services/advancedService.js';

const router = Router();

// EXPLAIN Analyzer
router.post('/explain', async (req: Request, res: Response) => {
  try {
    const { connectionId, sql } = req.body;
    const plan = await adv.getExplainPlan(connectionId, sql);
    res.json(plan);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Index Advisor
router.post('/index-advice', async (req: Request, res: Response) => {
  try {
    const { connectionId, sql } = req.body;
    const result = await adv.getIndexAdvice(connectionId, sql);
    res.json(result);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Table Stats Dashboard
router.get('/table-stats/:connId', async (req: Request, res: Response) => {
  try {
    res.json(await adv.getTableStats(req.params.connId));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Schema Diff
router.post('/schema-diff', async (req: Request, res: Response) => {
  try {
    const { sourceConnId, targetConnId } = req.body;
    res.json(await adv.getSchemaDiff(sourceConnId, targetConnId));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Migration Generator
router.post('/migration', async (req: Request, res: Response) => {
  try {
    const { sourceConnId, targetConnId } = req.body;
    res.json(await adv.generateMigration(sourceConnId, targetConnId));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// pg_stat_statements
router.get('/slow-queries/:connId', async (req: Request, res: Response) => {
  try {
    res.json(await adv.getSlowQueries(req.params.connId));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ER Diagram
router.get('/er-diagram/:connId/:schema', async (req: Request, res: Response) => {
  try {
    res.json(await adv.getERDiagram(req.params.connId, req.params.schema));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// EXPLAIN with custom settings (parameter testing)
router.post('/explain-with-settings', async (req: Request, res: Response) => {
  try {
    const { connectionId, sql, settings } = req.body;
    const plan = await adv.getExplainWithSettings(connectionId, sql, settings);
    res.json(plan);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Plan history
router.post('/plan-history', async (req: Request, res: Response) => {
  try {
    const { connectionId, sql, plan, settings } = req.body;
    res.json(adv.savePlanToHistory(connectionId, sql, plan, settings));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get('/plan-history/:connId?', async (req: Request, res: Response) => {
  try {
    res.json(adv.getPlanHistory(req.params.connId));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete('/plan-history', async (_req: Request, res: Response) => {
  try {
    adv.clearPlanHistory();
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Primary key columns (for row editing)
router.get('/pk/:connId/:schema/:table', async (req: Request, res: Response) => {
  try {
    res.json(await adv.getPrimaryKeyColumns(req.params.connId, req.params.schema, req.params.table));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

export default router;
