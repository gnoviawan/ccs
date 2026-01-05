/**
 * Remote Usage Transformer
 *
 * Transforms CLIProxyAPI /v0/management/usage response to existing analytics types.
 * Used when dashboard is running in remote mode (connected to remote CLIProxyAPI).
 */

import type { DailyUsage, HourlyUsage, MonthlyUsage, ModelBreakdown } from './types';
import { getModelPricing } from '../model-pricing';
import {
  getProxyTarget,
  buildProxyUrl,
  buildProxyHeaders,
} from '../../cliproxy/proxy-target-resolver';

// ============================================================================
// Raw API Response Types (from CLIProxyAPI /v0/management/usage)
// ============================================================================

/** Token details from a single request */
interface RequestTokens {
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  total_tokens: number;
}

/** Single request detail from CLIProxyAPI */
interface RequestDetail {
  timestamp: string;
  source: string;
  auth_index: string | number;
  tokens: RequestTokens;
  failed: boolean;
}

/** Model data with request details */
interface ModelData {
  total_requests?: number;
  total_tokens?: number;
  details?: RequestDetail[];
}

/** Provider/API data */
interface ProviderData {
  total_requests?: number;
  total_tokens?: number;
  models?: Record<string, ModelData>;
}

/** Raw usage response from CLIProxyAPI */
export interface RawCliproxyUsage {
  failed_requests?: number;
  usage?: {
    total_requests?: number;
    success_count?: number;
    failure_count?: number;
    total_tokens?: number;
    apis?: Record<string, ProviderData>;
  };
}

// ============================================================================
// Summary Types for handleSummary
// ============================================================================

/** Summary data transformed from CLIProxyAPI */
export interface RemoteUsageSummary {
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  totalCost: number;
  totalDays: number;
  averageTokensPerDay: number;
  averageCostPerDay: number;
  tokenBreakdown: {
    input: { tokens: number; cost: number };
    output: { tokens: number; cost: number };
    cacheCreation: { tokens: number; cost: number };
    cacheRead: { tokens: number; cost: number };
  };
}

// ============================================================================
// Fetch Raw Usage Data
// ============================================================================

/**
 * Fetch raw usage data from CLIProxyAPI management API
 * Returns the full response including request details with timestamps.
 */
export async function fetchRawCliproxyUsage(): Promise<RawCliproxyUsage | null> {
  const TIMEOUT_MS = 5000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const target = getProxyTarget();
    const url = buildProxyUrl(target, '/v0/management/usage');
    const headers = buildProxyHeaders(target);

    const response = await fetch(url, {
      signal: controller.signal,
      headers,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`CLIProxyAPI usage fetch failed: ${response.status} ${response.statusText}`);
      return null;
    }

    return (await response.json()) as RawCliproxyUsage;
  } catch (error) {
    clearTimeout(timeoutId);

    // Provide specific error messages for common failure modes
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.error(
          `CLIProxyAPI usage fetch timed out after ${TIMEOUT_MS}ms. Check network connectivity.`
        );
      } else if (error.message.includes('ECONNREFUSED')) {
        console.error('CLIProxyAPI connection refused. Is the server running?');
      } else if (error.message.includes('ENOTFOUND')) {
        console.error('CLIProxyAPI host not found. Check the configured hostname.');
      } else {
        console.error('Failed to fetch CLIProxyAPI usage:', error.message);
      }
    } else {
      console.error('Failed to fetch CLIProxyAPI usage:', error);
    }
    return null;
  }
}

// ============================================================================
// Transform Helpers
// ============================================================================

/**
 * Extract all request details from nested API structure
 */
function extractAllDetails(usage: RawCliproxyUsage): Array<RequestDetail & { model: string }> {
  const details: Array<RequestDetail & { model: string }> = [];

  if (!usage.usage?.apis) return details;

  for (const providerData of Object.values(usage.usage.apis)) {
    if (!providerData.models) continue;

    for (const [model, modelData] of Object.entries(providerData.models)) {
      if (!modelData.details) continue;

      for (const detail of modelData.details) {
        details.push({ ...detail, model });
      }
    }
  }

  return details;
}

/**
 * Calculate cost for given token counts and model
 */
function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number,
  cacheReadTokens: number
): number {
  const pricing = getModelPricing(model);
  return (
    (inputTokens / 1_000_000) * pricing.inputPerMillion +
    (outputTokens / 1_000_000) * pricing.outputPerMillion +
    (cacheCreationTokens / 1_000_000) * pricing.cacheCreationPerMillion +
    (cacheReadTokens / 1_000_000) * pricing.cacheReadPerMillion
  );
}

/**
 * Format date from ISO timestamp to YYYY-MM-DD
 */
function formatDate(timestamp: string): string {
  return timestamp.slice(0, 10);
}

/**
 * Format hour from ISO timestamp to YYYY-MM-DD HH:00
 */
function formatHour(timestamp: string): string {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:00`;
}

/**
 * Format month from ISO timestamp to YYYY-MM
 */
function formatMonth(timestamp: string): string {
  return timestamp.slice(0, 7);
}

// ============================================================================
// Transform Functions
// ============================================================================

/**
 * Transform CLIProxyAPI usage to summary data
 */
export function transformToUsageSummary(usage: RawCliproxyUsage): RemoteUsageSummary {
  const details = extractAllDetails(usage);

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const totalCacheCreationTokens = 0;
  let totalCacheReadTokens = 0;

  const dateSet = new Set<string>();

  for (const detail of details) {
    totalInputTokens += detail.tokens.input_tokens;
    totalOutputTokens += detail.tokens.output_tokens;
    // CLIProxyAPI doesn't distinguish cache creation vs read - cached_tokens is read
    totalCacheReadTokens += detail.tokens.cached_tokens;
    dateSet.add(formatDate(detail.timestamp));
  }

  const totalTokens = totalInputTokens + totalOutputTokens;
  const totalDays = dateSet.size || 1;

  // Calculate costs using model-specific pricing via shared calculateCost function
  let totalCost = 0;
  for (const detail of details) {
    totalCost += calculateCost(
      detail.model,
      detail.tokens.input_tokens,
      detail.tokens.output_tokens,
      0, // CLIProxyAPI doesn't track cache creation
      detail.tokens.cached_tokens
    );
  }

  // Calculate individual category costs for breakdown
  let inputCost = 0;
  let outputCost = 0;
  const cacheCreationCost = 0;
  let cacheReadCost = 0;

  for (const detail of details) {
    const pricing = getModelPricing(detail.model);
    inputCost += (detail.tokens.input_tokens / 1_000_000) * pricing.inputPerMillion;
    outputCost += (detail.tokens.output_tokens / 1_000_000) * pricing.outputPerMillion;
    cacheReadCost += (detail.tokens.cached_tokens / 1_000_000) * pricing.cacheReadPerMillion;
  }

  return {
    totalTokens,
    totalInputTokens,
    totalOutputTokens,
    totalCacheTokens: totalCacheCreationTokens + totalCacheReadTokens,
    totalCacheCreationTokens,
    totalCacheReadTokens,
    totalCost: Math.round(totalCost * 100) / 100,
    totalDays,
    averageTokensPerDay: Math.round(totalTokens / totalDays),
    averageCostPerDay: Math.round((totalCost / totalDays) * 100) / 100,
    tokenBreakdown: {
      input: { tokens: totalInputTokens, cost: Math.round(inputCost * 100) / 100 },
      output: { tokens: totalOutputTokens, cost: Math.round(outputCost * 100) / 100 },
      cacheCreation: {
        tokens: totalCacheCreationTokens,
        cost: Math.round(cacheCreationCost * 100) / 100,
      },
      cacheRead: { tokens: totalCacheReadTokens, cost: Math.round(cacheReadCost * 100) / 100 },
    },
  };
}

/**
 * Transform CLIProxyAPI usage to daily usage data
 */
export function transformToDailyUsage(usage: RawCliproxyUsage): DailyUsage[] {
  const details = extractAllDetails(usage);

  // Group by date
  const dailyMap = new Map<
    string,
    {
      inputTokens: number;
      outputTokens: number;
      cacheCreationTokens: number;
      cacheReadTokens: number;
      modelBreakdowns: Map<string, ModelBreakdown>;
    }
  >();

  for (const detail of details) {
    const date = formatDate(detail.timestamp);
    const existing = dailyMap.get(date) || {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      modelBreakdowns: new Map(),
    };

    existing.inputTokens += detail.tokens.input_tokens;
    existing.outputTokens += detail.tokens.output_tokens;
    existing.cacheReadTokens += detail.tokens.cached_tokens;

    // Update model breakdown
    const modelBreakdown = existing.modelBreakdowns.get(detail.model) || {
      modelName: detail.model,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      cost: 0,
    };
    modelBreakdown.inputTokens += detail.tokens.input_tokens;
    modelBreakdown.outputTokens += detail.tokens.output_tokens;
    modelBreakdown.cacheReadTokens += detail.tokens.cached_tokens;
    existing.modelBreakdowns.set(detail.model, modelBreakdown);

    dailyMap.set(date, existing);
  }

  // Convert to DailyUsage array
  const result: DailyUsage[] = [];

  for (const [date, data] of dailyMap) {
    const modelBreakdowns: ModelBreakdown[] = [];
    let totalCost = 0;

    for (const breakdown of data.modelBreakdowns.values()) {
      breakdown.cost = calculateCost(
        breakdown.modelName,
        breakdown.inputTokens,
        breakdown.outputTokens,
        breakdown.cacheCreationTokens,
        breakdown.cacheReadTokens
      );
      totalCost += breakdown.cost;
      modelBreakdowns.push(breakdown);
    }

    result.push({
      date,
      source: 'remote',
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      cacheCreationTokens: data.cacheCreationTokens,
      cacheReadTokens: data.cacheReadTokens,
      cost: totalCost,
      totalCost,
      modelsUsed: modelBreakdowns.map((m) => m.modelName),
      modelBreakdowns,
    });
  }

  // Sort by date descending
  return result.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Transform CLIProxyAPI usage to hourly usage data
 */
export function transformToHourlyUsage(usage: RawCliproxyUsage): HourlyUsage[] {
  const details = extractAllDetails(usage);

  // Group by hour
  const hourlyMap = new Map<
    string,
    {
      inputTokens: number;
      outputTokens: number;
      cacheCreationTokens: number;
      cacheReadTokens: number;
      modelBreakdowns: Map<string, ModelBreakdown>;
    }
  >();

  for (const detail of details) {
    const hour = formatHour(detail.timestamp);
    const existing = hourlyMap.get(hour) || {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      modelBreakdowns: new Map(),
    };

    existing.inputTokens += detail.tokens.input_tokens;
    existing.outputTokens += detail.tokens.output_tokens;
    existing.cacheReadTokens += detail.tokens.cached_tokens;

    // Update model breakdown
    const modelBreakdown = existing.modelBreakdowns.get(detail.model) || {
      modelName: detail.model,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      cost: 0,
    };
    modelBreakdown.inputTokens += detail.tokens.input_tokens;
    modelBreakdown.outputTokens += detail.tokens.output_tokens;
    modelBreakdown.cacheReadTokens += detail.tokens.cached_tokens;
    existing.modelBreakdowns.set(detail.model, modelBreakdown);

    hourlyMap.set(hour, existing);
  }

  // Convert to HourlyUsage array
  const result: HourlyUsage[] = [];

  for (const [hour, data] of hourlyMap) {
    const modelBreakdowns: ModelBreakdown[] = [];
    let totalCost = 0;

    for (const breakdown of data.modelBreakdowns.values()) {
      breakdown.cost = calculateCost(
        breakdown.modelName,
        breakdown.inputTokens,
        breakdown.outputTokens,
        breakdown.cacheCreationTokens,
        breakdown.cacheReadTokens
      );
      totalCost += breakdown.cost;
      modelBreakdowns.push(breakdown);
    }

    result.push({
      hour,
      source: 'remote',
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      cacheCreationTokens: data.cacheCreationTokens,
      cacheReadTokens: data.cacheReadTokens,
      cost: totalCost,
      totalCost,
      modelsUsed: modelBreakdowns.map((m) => m.modelName),
      modelBreakdowns,
    });
  }

  // Sort by hour descending
  return result.sort((a, b) => b.hour.localeCompare(a.hour));
}

/**
 * Transform CLIProxyAPI usage to model usage data
 * Returns aggregated model breakdowns for handleModels
 */
export function transformToModelUsage(usage: RawCliproxyUsage): ModelBreakdown[] {
  const details = extractAllDetails(usage);

  // Aggregate by model
  const modelMap = new Map<string, ModelBreakdown>();

  for (const detail of details) {
    const existing = modelMap.get(detail.model) || {
      modelName: detail.model,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      cost: 0,
    };

    existing.inputTokens += detail.tokens.input_tokens;
    existing.outputTokens += detail.tokens.output_tokens;
    existing.cacheReadTokens += detail.tokens.cached_tokens;

    modelMap.set(detail.model, existing);
  }

  // Calculate costs
  for (const breakdown of modelMap.values()) {
    breakdown.cost = calculateCost(
      breakdown.modelName,
      breakdown.inputTokens,
      breakdown.outputTokens,
      breakdown.cacheCreationTokens,
      breakdown.cacheReadTokens
    );
  }

  // Return sorted by total tokens
  return Array.from(modelMap.values()).sort(
    (a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens)
  );
}

/**
 * Transform CLIProxyAPI usage to monthly usage data
 */
export function transformToMonthlyUsage(usage: RawCliproxyUsage): MonthlyUsage[] {
  const details = extractAllDetails(usage);

  // Group by month
  const monthlyMap = new Map<
    string,
    {
      inputTokens: number;
      outputTokens: number;
      cacheCreationTokens: number;
      cacheReadTokens: number;
      modelBreakdowns: Map<string, ModelBreakdown>;
    }
  >();

  for (const detail of details) {
    const month = formatMonth(detail.timestamp);
    const existing = monthlyMap.get(month) || {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      modelBreakdowns: new Map(),
    };

    existing.inputTokens += detail.tokens.input_tokens;
    existing.outputTokens += detail.tokens.output_tokens;
    existing.cacheReadTokens += detail.tokens.cached_tokens;

    // Update model breakdown
    const modelBreakdown = existing.modelBreakdowns.get(detail.model) || {
      modelName: detail.model,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      cost: 0,
    };
    modelBreakdown.inputTokens += detail.tokens.input_tokens;
    modelBreakdown.outputTokens += detail.tokens.output_tokens;
    modelBreakdown.cacheReadTokens += detail.tokens.cached_tokens;
    existing.modelBreakdowns.set(detail.model, modelBreakdown);

    monthlyMap.set(month, existing);
  }

  // Convert to MonthlyUsage array
  const result: MonthlyUsage[] = [];

  for (const [month, data] of monthlyMap) {
    const modelBreakdowns: ModelBreakdown[] = [];
    let totalCost = 0;

    for (const breakdown of data.modelBreakdowns.values()) {
      breakdown.cost = calculateCost(
        breakdown.modelName,
        breakdown.inputTokens,
        breakdown.outputTokens,
        breakdown.cacheCreationTokens,
        breakdown.cacheReadTokens
      );
      totalCost += breakdown.cost;
      modelBreakdowns.push(breakdown);
    }

    result.push({
      month,
      source: 'remote',
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      cacheCreationTokens: data.cacheCreationTokens,
      cacheReadTokens: data.cacheReadTokens,
      totalCost,
      modelsUsed: modelBreakdowns.map((m) => m.modelName),
      modelBreakdowns,
    });
  }

  // Sort by month ascending
  return result.sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Filter request details by date range
 * Used for applying date filters to remote data before transformation
 */
export function filterDetailsByDateRange(
  usage: RawCliproxyUsage,
  since?: string,
  until?: string
): RawCliproxyUsage {
  if (!since && !until) return usage;
  if (!usage.usage?.apis) return usage;

  const filteredApis: Record<string, ProviderData> = {};

  for (const [providerName, providerData] of Object.entries(usage.usage.apis)) {
    if (!providerData.models) continue;

    const filteredModels: Record<string, ModelData> = {};

    for (const [modelName, modelData] of Object.entries(providerData.models)) {
      if (!modelData.details) continue;

      const filteredDetails = modelData.details.filter((detail) => {
        const dateStr = formatDate(detail.timestamp).replace(/-/g, '');
        if (since && dateStr < since) return false;
        if (until && dateStr > until) return false;
        return true;
      });

      if (filteredDetails.length > 0) {
        filteredModels[modelName] = {
          ...modelData,
          details: filteredDetails,
          total_requests: filteredDetails.length,
          total_tokens: filteredDetails.reduce((sum, d) => sum + d.tokens.total_tokens, 0),
        };
      }
    }

    if (Object.keys(filteredModels).length > 0) {
      filteredApis[providerName] = {
        ...providerData,
        models: filteredModels,
      };
    }
  }

  return {
    ...usage,
    usage: {
      ...usage.usage,
      apis: filteredApis,
    },
  };
}
