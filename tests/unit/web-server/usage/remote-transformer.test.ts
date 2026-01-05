/**
 * Unit tests for remote-transformer.ts
 *
 * Tests transformation of CLIProxyAPI usage data to analytics types.
 */
import { describe, it, expect } from 'bun:test';
import {
  transformToUsageSummary,
  transformToDailyUsage,
  transformToHourlyUsage,
  transformToModelUsage,
  transformToMonthlyUsage,
  type RawCliproxyUsage,
} from '../../../../src/web-server/usage/remote-transformer';

// Sample CLIProxyAPI response for testing
const sampleUsage: RawCliproxyUsage = {
  usage: {
    total_requests: 5,
    success_count: 4,
    failure_count: 1,
    total_tokens: 100000,
    apis: {
      'ccs-internal-managed': {
        total_requests: 5,
        total_tokens: 100000,
        models: {
          'claude-sonnet-4-5': {
            total_requests: 3,
            total_tokens: 60000,
            details: [
              {
                timestamp: '2026-01-04T10:00:00.000Z',
                source: 'user@test.com',
                auth_index: 'abc123',
                tokens: {
                  input_tokens: 10000,
                  output_tokens: 5000,
                  reasoning_tokens: 0,
                  cached_tokens: 1000,
                  total_tokens: 15000,
                },
                failed: false,
              },
              {
                timestamp: '2026-01-04T14:30:00.000Z',
                source: 'user@test.com',
                auth_index: 'abc123',
                tokens: {
                  input_tokens: 20000,
                  output_tokens: 10000,
                  reasoning_tokens: 0,
                  cached_tokens: 2000,
                  total_tokens: 30000,
                },
                failed: false,
              },
              {
                timestamp: '2026-01-05T09:00:00.000Z',
                source: 'user@test.com',
                auth_index: 'abc123',
                tokens: {
                  input_tokens: 8000,
                  output_tokens: 7000,
                  reasoning_tokens: 0,
                  cached_tokens: 500,
                  total_tokens: 15000,
                },
                failed: false,
              },
            ],
          },
          'claude-opus-4-5-20251101': {
            total_requests: 2,
            total_tokens: 40000,
            details: [
              {
                timestamp: '2026-01-04T16:00:00.000Z',
                source: 'user@test.com',
                auth_index: 'def456',
                tokens: {
                  input_tokens: 15000,
                  output_tokens: 10000,
                  reasoning_tokens: 0,
                  cached_tokens: 0,
                  total_tokens: 25000,
                },
                failed: false,
              },
              {
                timestamp: '2026-01-05T11:00:00.000Z',
                source: 'user@test.com',
                auth_index: 'def456',
                tokens: {
                  input_tokens: 10000,
                  output_tokens: 5000,
                  reasoning_tokens: 0,
                  cached_tokens: 500,
                  total_tokens: 15000,
                },
                failed: true,
              },
            ],
          },
        },
      },
    },
  },
};

describe('remote-transformer', () => {
  describe('transformToUsageSummary', () => {
    it('should calculate total tokens correctly', () => {
      const summary = transformToUsageSummary(sampleUsage);

      // Total input: 10000 + 20000 + 8000 + 15000 + 10000 = 63000
      expect(summary.totalInputTokens).toBe(63000);

      // Total output: 5000 + 10000 + 7000 + 10000 + 5000 = 37000
      expect(summary.totalOutputTokens).toBe(37000);

      // Total: 63000 + 37000 = 100000
      expect(summary.totalTokens).toBe(100000);
    });

    it('should calculate cache tokens correctly', () => {
      const summary = transformToUsageSummary(sampleUsage);

      // Total cached: 1000 + 2000 + 500 + 0 + 500 = 4000
      expect(summary.totalCacheReadTokens).toBe(4000);
      expect(summary.totalCacheCreationTokens).toBe(0); // CLIProxyAPI doesn't track creation
    });

    it('should count unique days correctly', () => {
      const summary = transformToUsageSummary(sampleUsage);
      // Two unique days: 2026-01-04 and 2026-01-05
      expect(summary.totalDays).toBe(2);
    });

    it('should calculate averages correctly', () => {
      const summary = transformToUsageSummary(sampleUsage);
      expect(summary.averageTokensPerDay).toBe(50000); // 100000 / 2
    });

    it('should include token breakdown', () => {
      const summary = transformToUsageSummary(sampleUsage);
      expect(summary.tokenBreakdown).toBeDefined();
      expect(summary.tokenBreakdown.input.tokens).toBe(63000);
      expect(summary.tokenBreakdown.output.tokens).toBe(37000);
      expect(summary.tokenBreakdown.cacheRead.tokens).toBe(4000);
    });

    it('should handle empty usage data', () => {
      const emptyUsage: RawCliproxyUsage = { usage: {} };
      const summary = transformToUsageSummary(emptyUsage);

      expect(summary.totalTokens).toBe(0);
      expect(summary.totalInputTokens).toBe(0);
      expect(summary.totalDays).toBe(1); // Default to 1 to avoid division by zero
    });
  });

  describe('transformToDailyUsage', () => {
    it('should group data by date', () => {
      const daily = transformToDailyUsage(sampleUsage);

      expect(daily.length).toBe(2);
      const dates = daily.map((d) => d.date).sort();
      expect(dates).toEqual(['2026-01-04', '2026-01-05']);
    });

    it('should aggregate tokens per day', () => {
      const daily = transformToDailyUsage(sampleUsage);

      const jan4 = daily.find((d) => d.date === '2026-01-04');
      expect(jan4).toBeDefined();

      // Jan 4: 10000+5000 + 20000+10000 + 15000+10000 = 70000
      expect(jan4!.inputTokens + jan4!.outputTokens).toBe(70000);
    });

    it('should include model breakdowns per day', () => {
      const daily = transformToDailyUsage(sampleUsage);

      const jan4 = daily.find((d) => d.date === '2026-01-04');
      expect(jan4!.modelBreakdowns.length).toBe(2);
      expect(jan4!.modelsUsed).toContain('claude-sonnet-4-5');
      expect(jan4!.modelsUsed).toContain('claude-opus-4-5-20251101');
    });

    it('should sort by date descending', () => {
      const daily = transformToDailyUsage(sampleUsage);
      expect(daily[0].date).toBe('2026-01-05');
      expect(daily[1].date).toBe('2026-01-04');
    });

    it('should handle empty data', () => {
      const emptyUsage: RawCliproxyUsage = { usage: {} };
      const daily = transformToDailyUsage(emptyUsage);
      expect(daily).toEqual([]);
    });
  });

  describe('transformToHourlyUsage', () => {
    it('should group data by hour', () => {
      const hourly = transformToHourlyUsage(sampleUsage);

      // 5 requests across 5 different hours
      expect(hourly.length).toBe(5);
    });

    it('should format hour correctly', () => {
      const hourly = transformToHourlyUsage(sampleUsage);

      const hours = hourly.map((h) => h.hour).sort();
      expect(hours).toContain('2026-01-04 10:00');
      expect(hours).toContain('2026-01-04 14:00');
    });

    it('should include model breakdowns per hour', () => {
      const hourly = transformToHourlyUsage(sampleUsage);

      const tenAm = hourly.find((h) => h.hour === '2026-01-04 10:00');
      expect(tenAm).toBeDefined();
      expect(tenAm!.modelBreakdowns.length).toBe(1);
    });

    it('should handle empty data', () => {
      const emptyUsage: RawCliproxyUsage = { usage: {} };
      const hourly = transformToHourlyUsage(emptyUsage);
      expect(hourly).toEqual([]);
    });
  });

  describe('transformToModelUsage', () => {
    it('should aggregate by model', () => {
      const models = transformToModelUsage(sampleUsage);

      expect(models.length).toBe(2);
      const modelNames = models.map((m) => m.modelName);
      expect(modelNames).toContain('claude-sonnet-4-5');
      expect(modelNames).toContain('claude-opus-4-5-20251101');
    });

    it('should sum tokens across all requests for each model', () => {
      const models = transformToModelUsage(sampleUsage);

      const sonnet = models.find((m) => m.modelName === 'claude-sonnet-4-5');
      expect(sonnet).toBeDefined();

      // Sonnet: 3 requests with input 10000+20000+8000=38000, output 5000+10000+7000=22000
      expect(sonnet!.inputTokens).toBe(38000);
      expect(sonnet!.outputTokens).toBe(22000);
    });

    it('should sort by total tokens descending', () => {
      const models = transformToModelUsage(sampleUsage);

      // Sonnet has more tokens (60000) than Opus (40000)
      expect(models[0].modelName).toBe('claude-sonnet-4-5');
    });

    it('should calculate costs', () => {
      const models = transformToModelUsage(sampleUsage);

      for (const model of models) {
        expect(typeof model.cost).toBe('number');
        expect(model.cost).toBeGreaterThan(0);
      }
    });

    it('should handle empty data', () => {
      const emptyUsage: RawCliproxyUsage = { usage: {} };
      const models = transformToModelUsage(emptyUsage);
      expect(models).toEqual([]);
    });
  });

  describe('transformToMonthlyUsage', () => {
    it('should group data by month', () => {
      const monthly = transformToMonthlyUsage(sampleUsage);

      // All data is in January 2026
      expect(monthly.length).toBe(1);
      expect(monthly[0].month).toBe('2026-01');
    });

    it('should aggregate all tokens for the month', () => {
      const monthly = transformToMonthlyUsage(sampleUsage);

      const jan = monthly[0];
      expect(jan.inputTokens + jan.outputTokens).toBe(100000);
    });

    it('should include model breakdowns', () => {
      const monthly = transformToMonthlyUsage(sampleUsage);

      expect(monthly[0].modelBreakdowns.length).toBe(2);
      expect(monthly[0].modelsUsed).toContain('claude-sonnet-4-5');
    });

    it('should handle data across multiple months', () => {
      const multiMonthUsage: RawCliproxyUsage = {
        usage: {
          apis: {
            test: {
              models: {
                'claude-sonnet-4-5': {
                  details: [
                    {
                      timestamp: '2025-12-15T10:00:00.000Z',
                      source: 'test',
                      auth_index: '1',
                      tokens: {
                        input_tokens: 1000,
                        output_tokens: 500,
                        reasoning_tokens: 0,
                        cached_tokens: 0,
                        total_tokens: 1500,
                      },
                      failed: false,
                    },
                    {
                      timestamp: '2026-01-05T10:00:00.000Z',
                      source: 'test',
                      auth_index: '1',
                      tokens: {
                        input_tokens: 2000,
                        output_tokens: 1000,
                        reasoning_tokens: 0,
                        cached_tokens: 0,
                        total_tokens: 3000,
                      },
                      failed: false,
                    },
                  ],
                },
              },
            },
          },
        },
      };

      const monthly = transformToMonthlyUsage(multiMonthUsage);
      expect(monthly.length).toBe(2);

      const months = monthly.map((m) => m.month).sort();
      expect(months).toEqual(['2025-12', '2026-01']);
    });

    it('should handle empty data', () => {
      const emptyUsage: RawCliproxyUsage = { usage: {} };
      const monthly = transformToMonthlyUsage(emptyUsage);
      expect(monthly).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should handle null/undefined nested fields', () => {
      const partialUsage: RawCliproxyUsage = {
        usage: {
          apis: {
            test: {
              models: {
                'test-model': {
                  // No details array
                },
              },
            },
          },
        },
      };

      const summary = transformToUsageSummary(partialUsage);
      expect(summary.totalTokens).toBe(0);

      const daily = transformToDailyUsage(partialUsage);
      expect(daily).toEqual([]);
    });

    it('should handle missing token fields gracefully', () => {
      const partialTokens: RawCliproxyUsage = {
        usage: {
          apis: {
            test: {
              models: {
                'test-model': {
                  details: [
                    {
                      timestamp: '2026-01-04T10:00:00.000Z',
                      source: 'test',
                      auth_index: '1',
                      tokens: {
                        input_tokens: 100,
                        output_tokens: 50,
                        reasoning_tokens: 0,
                        cached_tokens: 0,
                        total_tokens: 150,
                      },
                      failed: false,
                    },
                  ],
                },
              },
            },
          },
        },
      };

      const summary = transformToUsageSummary(partialTokens);
      expect(summary.totalInputTokens).toBe(100);
      expect(summary.totalOutputTokens).toBe(50);
    });
  });
});

// Import filterDetailsByDateRange for testing
import { filterDetailsByDateRange } from '../../../../src/web-server/usage/remote-transformer';

describe('filterDetailsByDateRange', () => {
  const multiDayUsage: RawCliproxyUsage = {
    usage: {
      apis: {
        test: {
          models: {
            'claude-sonnet-4-5': {
              details: [
                {
                  timestamp: '2026-01-03T10:00:00.000Z',
                  source: 'test',
                  auth_index: '1',
                  tokens: {
                    input_tokens: 1000,
                    output_tokens: 500,
                    reasoning_tokens: 0,
                    cached_tokens: 0,
                    total_tokens: 1500,
                  },
                  failed: false,
                },
                {
                  timestamp: '2026-01-04T10:00:00.000Z',
                  source: 'test',
                  auth_index: '1',
                  tokens: {
                    input_tokens: 2000,
                    output_tokens: 1000,
                    reasoning_tokens: 0,
                    cached_tokens: 0,
                    total_tokens: 3000,
                  },
                  failed: false,
                },
                {
                  timestamp: '2026-01-05T10:00:00.000Z',
                  source: 'test',
                  auth_index: '1',
                  tokens: {
                    input_tokens: 3000,
                    output_tokens: 1500,
                    reasoning_tokens: 0,
                    cached_tokens: 0,
                    total_tokens: 4500,
                  },
                  failed: false,
                },
              ],
            },
          },
        },
      },
    },
  };

  it('should return unfiltered data when no date range specified', () => {
    const result = filterDetailsByDateRange(multiDayUsage, undefined, undefined);
    expect(result).toBe(multiDayUsage); // Same reference
  });

  it('should filter by since date', () => {
    const result = filterDetailsByDateRange(multiDayUsage, '20260104', undefined);
    const details = result.usage?.apis?.test?.models?.['claude-sonnet-4-5']?.details;

    expect(details).toBeDefined();
    expect(details!.length).toBe(2); // Jan 4 and Jan 5
  });

  it('should filter by until date', () => {
    const result = filterDetailsByDateRange(multiDayUsage, undefined, '20260104');
    const details = result.usage?.apis?.test?.models?.['claude-sonnet-4-5']?.details;

    expect(details).toBeDefined();
    expect(details!.length).toBe(2); // Jan 3 and Jan 4
  });

  it('should filter by both since and until', () => {
    const result = filterDetailsByDateRange(multiDayUsage, '20260104', '20260104');
    const details = result.usage?.apis?.test?.models?.['claude-sonnet-4-5']?.details;

    expect(details).toBeDefined();
    expect(details!.length).toBe(1); // Only Jan 4
    expect(details![0].timestamp).toBe('2026-01-04T10:00:00.000Z');
  });

  it('should return empty structure when no data matches', () => {
    const result = filterDetailsByDateRange(multiDayUsage, '20260110', '20260115');

    // Should have empty apis since no data matches
    expect(Object.keys(result.usage?.apis || {})).toHaveLength(0);
  });

  it('should handle empty usage data gracefully', () => {
    const emptyUsage: RawCliproxyUsage = { usage: {} };
    const result = filterDetailsByDateRange(emptyUsage, '20260104', '20260104');
    expect(result).toEqual(emptyUsage);
  });

  it('should update total_requests and total_tokens in filtered result', () => {
    const result = filterDetailsByDateRange(multiDayUsage, '20260104', '20260104');
    const modelData = result.usage?.apis?.test?.models?.['claude-sonnet-4-5'];

    expect(modelData?.total_requests).toBe(1);
    expect(modelData?.total_tokens).toBe(3000); // 2000 + 1000
  });
});
