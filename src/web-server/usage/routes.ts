/**
 * Usage Analytics API Routes
 *
 * Provides REST endpoints for Claude Code usage analytics.
 * Supports daily, monthly, and session-based usage data aggregation.
 *
 * Route handlers are in ./handlers.ts
 */

import { Router } from 'express';
import {
  handleSummary,
  handleDaily,
  handleHourly,
  handleModels,
  handleSessions,
  handleMonthly,
  handleRefresh,
  handleStatus,
  handleInsights,
  handleSource,
} from './handlers';

export { prewarmUsageCache, clearUsageCache, getLastFetchTimestamp } from './aggregator';

export const usageRoutes = Router();

// Summary endpoint
usageRoutes.get('/summary', handleSummary);

// Daily usage endpoint
usageRoutes.get('/daily', handleDaily);

// Hourly usage endpoint
usageRoutes.get('/hourly', handleHourly);

// Models usage endpoint
usageRoutes.get('/models', handleModels);

// Sessions endpoint
usageRoutes.get('/sessions', handleSessions);

// Monthly usage endpoint
usageRoutes.get('/monthly', handleMonthly);

// Cache refresh endpoint
usageRoutes.post('/refresh', handleRefresh);

// Status endpoint
usageRoutes.get('/status', handleStatus);

// Data source endpoint (local vs remote)
usageRoutes.get('/source', handleSource);

// Insights endpoint (anomaly detection)
usageRoutes.get('/insights', handleInsights);
