import { Router, Request, Response } from 'express';
import * as adv from '../services/advancedService.js';
import { analyzePlan } from '../services/planAnalyzer.js';
import { comparePlans } from '../services/planComparator.js';

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

// Plan analysis (15 rules)
router.post('/analyze-plan', async (req: Request, res: Response) => {
  try {
    const { plan } = req.body;
    res.json(analyzePlan(plan));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Plan comparison (per-node diff)
router.post('/compare-plans', async (req: Request, res: Response) => {
  try {
    const { oldPlan, newPlan, threshold } = req.body;
    res.json(comparePlans(oldPlan, newPlan, threshold));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Primary key columns (for row editing)
router.get('/pk/:connId/:schema/:table', async (req: Request, res: Response) => {
  try {
    res.json(await adv.getPrimaryKeyColumns(req.params.connId, req.params.schema, req.params.table));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// VACUUM table
router.post('/vacuum', async (req: Request, res: Response) => {
  try {
    const { connectionId, schema, table } = req.body;
    res.json(await adv.vacuumTable(connectionId, schema, table));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Active Sessions
router.get('/sessions/:connId', async (req: Request, res: Response) => {
  try { res.json(await adv.getActiveSessions(req.params.connId)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post('/sessions/terminate', async (req: Request, res: Response) => {
  try {
    const { connectionId, pid, mode } = req.body;
    res.json(await adv.terminateSession(connectionId, pid, mode));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Lock Monitor
router.get('/locks/:connId', async (req: Request, res: Response) => {
  try { res.json(await adv.getLocks(req.params.connId)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Replication Monitor
router.get('/replication/:connId', async (req: Request, res: Response) => {
  try { res.json(await adv.getReplicationStatus(req.params.connId)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Disk Usage
router.get('/disk-usage/:connId', async (req: Request, res: Response) => {
  try { res.json(await adv.getDiskUsage(req.params.connId)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Roles & Permissions
router.get('/roles/:connId', async (req: Request, res: Response) => {
  try { res.json(await adv.getRoles(req.params.connId)); }
  catch (e: any) {
    console.error('[Roles] GET /roles/:connId failed:', e.message, e.stack);
    res.status(400).json({ error: e.message });
  }
});

router.get('/grants/:connId/:schema', async (req: Request, res: Response) => {
  try { res.json(await adv.getTableGrants(req.params.connId, req.params.schema)); }
  catch (e: any) {
    console.error('[Grants] GET /grants/:connId/:schema failed:', e.message, e.stack);
    res.status(400).json({ error: e.message });
  }
});

// Server Configuration
router.get('/server-config/:connId', async (req: Request, res: Response) => {
  try { res.json(await adv.getServerConfig(req.params.connId)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Extensions
router.get('/extensions/:connId', async (req: Request, res: Response) => {
  try { res.json(await adv.getExtensions(req.params.connId)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post('/extensions/manage', async (req: Request, res: Response) => {
  try {
    const { connectionId, name, action } = req.body;
    res.json(await adv.manageExtension(connectionId, name, action));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Triggers & Rules
router.get('/triggers/:connId/:schema', async (req: Request, res: Response) => {
  try { res.json(await adv.getTriggers(req.params.connId, req.params.schema)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Maintenance
router.post('/maintenance', async (req: Request, res: Response) => {
  try {
    const { connectionId, action, schema, table } = req.body;
    res.json(await adv.runMaintenance(connectionId, action, schema, table));
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Tablespaces
router.get('/tablespaces/:connId', async (req: Request, res: Response) => {
  try { res.json(await adv.getTablespaces(req.params.connId)); }
  catch (e: any) { res.status(400).json({ error: e.message }); }
});

export default router;
