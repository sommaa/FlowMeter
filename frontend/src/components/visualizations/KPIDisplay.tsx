import React, { useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { PlotDataResponse, VisualizationConfig } from '@/types';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface KPIDisplayProps {
  data: PlotDataResponse;
  config: VisualizationConfig;
  height?: number;
}

const COLS_CLASS: Record<number, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
  5: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
  6: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6',
};

const KPIDisplay: React.FC<KPIDisplayProps> = ({ data, config, height = 500 }) => {
  const payload = data.kpi;

  const cols = useMemo(() => {
    const requested = payload?.columns_per_row ?? config.kpi?.columns_per_row ?? 3;
    return Math.max(1, Math.min(6, requested));
  }, [payload?.columns_per_row, config.kpi?.columns_per_row]);

  if (!payload || payload.values.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground text-sm"
        style={{ minHeight: height }}
      >
        Add a metric to display.
      </div>
    );
  }

  const compact = payload.compact;
  const valueClass = compact ? 'text-2xl' : 'text-3xl';
  const padding = compact ? 'p-4' : 'p-5';

  return (
    <div className="flex flex-col h-full" style={{ minHeight: height }}>
      <div
        className={cn(
          'grid grid-cols-1 gap-4 flex-1 content-start',
          COLS_CLASS[cols] ?? COLS_CLASS[3],
        )}
      >
        {payload.values.map((m) => {
          const hasError = !!m.error;
          return (
            <Card
              key={m.id}
              className={cn(
                'flex flex-col justify-between',
                padding,
                hasError && 'border-destructive/40',
              )}
              title={hasError ? m.error : undefined}
            >
              <div className="text-xs uppercase tracking-wide text-muted-foreground truncate">
                {m.label}
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span
                  className={cn(
                    valueClass,
                    'font-semibold leading-tight',
                    hasError && 'text-destructive',
                  )}
                  style={!hasError && m.color ? { color: m.color } : undefined}
                >
                  {m.formatted}
                </span>
                {hasError && (
                  <AlertCircle className="w-4 h-4 text-destructive" aria-label="Computation error" />
                )}
              </div>
              {hasError && (
                <div className="mt-2 text-xs text-destructive/80 line-clamp-2">
                  {m.error}
                </div>
              )}
            </Card>
          );
        })}
      </div>
      <div className="mt-3 text-xs text-muted-foreground">
        Computed over {payload.sample_count.toLocaleString()} rows
      </div>
    </div>
  );
};

export default KPIDisplay;
