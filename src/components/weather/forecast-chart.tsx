'use client';

import { useEffect } from 'react';
import { format } from 'date-fns';
import {
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useWeatherStore } from '@/stores/weather-store';
import { WEATHER_ICONS } from '@/lib/constants';
import { useAppMode } from '@/hooks/use-app-mode';
import { cn } from '@/lib/utils';

interface ChartEntry {
  day: string;
  date: string;
  high: number;
  low: number;
  precipitation: number;
  precipChance: number;
  isQPE: boolean;
  condition: string;
  icon: string;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string; payload: ChartEntry }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload;

  return (
    <div className="rounded-lg border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-2.5 shadow-xl">
      <p className="mb-1.5 text-xs font-medium text-white">
        {data.icon} {data.date} ({label})
      </p>
      <div className="space-y-1 text-xs">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          <span className="text-muted-foreground">High:</span>
          <span className="font-medium text-white">{data.high}&#176;F</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-gray-500" />
          <span className="text-muted-foreground">Low:</span>
          <span className="font-medium text-white">{data.low}&#176;F</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          <span className="text-muted-foreground">Precip:</span>
          <span className="font-medium text-white">{data.precipitation}&quot;</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-blue-300/50" />
          <span className="text-muted-foreground">Chance:</span>
          <span className="font-medium text-white">{data.precipChance}%</span>
        </div>
        {data.isQPE && (
          <div className="mt-1 rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-center text-[10px] font-semibold text-red-400">
            QPE THRESHOLD EXCEEDED
          </div>
        )}
      </div>
    </div>
  );
}

export function ForecastChart() {
  const { isApp } = useAppMode();
  const forecast = useWeatherStore((s) => s.forecast);
  const fetchWeather = useWeatherStore((s) => s.fetchWeather);

  useEffect(() => {
    if (forecast.length === 0) fetchWeather();
  }, [forecast.length, fetchWeather]);

  const chartData = forecast.map((day) => ({
    day: format(new Date(day.date), 'EEE'),
    date: format(new Date(day.date), 'MMM d'),
    high: day.high,
    low: day.low,
    precipitation: day.precipitationInches,
    precipChance: day.precipitationChance,
    isQPE: day.isQPE,
    condition: day.condition,
    icon: WEATHER_ICONS[day.condition] || '',
  }));

  if (forecast.length === 0) {
    return (
      <Card className="border-border bg-surface">
        <CardContent className="pt-4">
          <div className={cn('h-[300px] animate-pulse rounded bg-muted', isApp && 'h-[180px]')} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-surface">
      <CardHeader>
        <CardTitle className="text-foreground">7-Day Forecast</CardTitle>
        <CardDescription>
          Temperature trends, precipitation amounts, and qualifying precipitation events
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className={cn('h-[300px] w-full', isApp && 'h-[180px]')}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fill: '#9CA3AF', fontSize: 12 }}
                axisLine={{ stroke: '#2A2A2A' }}
                tickLine={false}
              />
              <YAxis
                yAxisId="temp"
                orientation="left"
                tick={{ fill: '#9CA3AF', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                domain={['auto', 'auto']}
                tickFormatter={(v: number) => `${v}\u00B0`}
              />
              <YAxis
                yAxisId="precip"
                orientation="right"
                tick={{ fill: '#9CA3AF', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                domain={[0, 'auto']}
                tickFormatter={(v: number) => `${v}"`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                yAxisId="precip"
                type="monotone"
                dataKey="precipChance"
                fill="#3B82F6"
                fillOpacity={0.08}
                stroke="none"
              />
              <Bar yAxisId="precip" dataKey="precipitation" barSize={20} radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.isQPE ? '#3B82F6' : '#3B82F6'}
                    stroke={entry.isQPE ? '#EF4444' : 'none'}
                    strokeWidth={entry.isQPE ? 2 : 0}
                  />
                ))}
              </Bar>
              <Line
                yAxisId="temp"
                type="monotone"
                dataKey="high"
                stroke="#F59E0B"
                strokeWidth={2}
                dot={{ fill: '#F59E0B', r: 4, strokeWidth: 0 }}
                activeDot={{ r: 6, fill: '#F59E0B', strokeWidth: 2, stroke: '#0A0A0A' }}
              />
              <Line
                yAxisId="temp"
                type="monotone"
                dataKey="low"
                stroke="#6B7280"
                strokeWidth={2}
                strokeDasharray="4 2"
                dot={{ fill: '#6B7280', r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#6B7280', strokeWidth: 2, stroke: '#0A0A0A' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {!isApp && (
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#2A2A2A] pt-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-0.5 w-4 bg-amber-500" />
              High Temp
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-0.5 w-4 border-t-2 border-dashed border-gray-500" />
              Low Temp
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-3 w-3 rounded-sm bg-blue-500" />
              Precipitation (in)
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-3 w-3 rounded-sm bg-blue-500/10" />
              Precip Chance
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-3 w-3 rounded-sm border-2 border-red-500 bg-blue-500" />
              QPE Day
            </div>
          </div>
        )}
        {!isApp && (
          <p className="mt-2 text-[11px] text-muted-foreground/70">
            QPE = Qualifying Precipitation Event (&#8805; 0.5&quot; in 24 hours). Triggers mandatory post-storm inspection within 24 hours per CGP requirements.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
