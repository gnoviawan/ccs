/**
 * Analytics Header Component
 *
 * Title, date filter, 24H button, refresh controls, and data source indicator.
 */

import type { DateRange } from 'react-day-picker';
import { subDays, startOfMonth } from 'date-fns';
import { Button } from '@/components/ui/button';
import { DateRangeFilter } from '@/components/analytics/date-range-filter';
import { RefreshCw, Server, HardDrive } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

/** Response from /api/usage/source endpoint */
interface DataSourceResponse {
  success: boolean;
  data: {
    source: 'local' | 'remote';
    host?: string;
  };
}

interface AnalyticsHeaderProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  onTodayClick: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  lastUpdatedText: string | null;
  viewMode: 'daily' | 'hourly';
}

export function AnalyticsHeader({
  dateRange,
  onDateRangeChange,
  onTodayClick,
  onRefresh,
  isRefreshing,
  lastUpdatedText,
  viewMode,
}: AnalyticsHeaderProps) {
  // Fetch data source info
  const { data: sourceData } = useQuery<DataSourceResponse>({
    queryKey: ['usage-source'],
    queryFn: async () => {
      const res = await fetch('/api/usage/source');
      if (!res.ok) throw new Error('Failed to fetch data source');
      return res.json();
    },
    staleTime: 60 * 1000, // Cache for 1 minute
    retry: false,
  });

  const isRemote = sourceData?.data?.source === 'remote';
  const remoteHost = sourceData?.data?.host;

  return (
    <div className="flex items-center justify-between shrink-0">
      <div>
        <h1 className="text-xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">Track usage & insights</p>
      </div>
      <div className="flex items-center gap-2">
        {/* Data Source Indicator */}
        {sourceData && (
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${
              isRemote
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                : 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
            }`}
            title={
              isRemote
                ? `Data from remote CLIProxyAPI at ${remoteHost}`
                : 'Data from local JSONL files'
            }
          >
            {isRemote ? (
              <>
                <Server className="w-3 h-3" />
                <span>Remote{remoteHost ? `: ${remoteHost}` : ''}</span>
              </>
            ) : (
              <>
                <HardDrive className="w-3 h-3" />
                <span>Local</span>
              </>
            )}
          </div>
        )}

        <Button
          variant={viewMode === 'hourly' ? 'default' : 'outline'}
          size="sm"
          className="h-8"
          onClick={onTodayClick}
        >
          24H
        </Button>
        <DateRangeFilter
          value={dateRange}
          onChange={onDateRangeChange}
          presets={[
            { label: '7D', range: { from: subDays(new Date(), 7), to: new Date() } },
            { label: '30D', range: { from: subDays(new Date(), 30), to: new Date() } },
            { label: 'Month', range: { from: startOfMonth(new Date()), to: new Date() } },
            { label: 'All Time', range: { from: undefined, to: new Date() } },
          ]}
        />

        {lastUpdatedText && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            Updated {lastUpdatedText}
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          className="gap-2 h-8"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>
    </div>
  );
}
