'use client';

import { useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useWeatherStore } from '@/stores/weather-store';
import { formatDate } from '@/lib/format';
import { CheckCircle, Minus, CloudRain, ExternalLink, AlertTriangle } from 'lucide-react';

export function PrecipitationEvents() {
  const forecast = useWeatherStore((s) => s.forecast);
  const qpEvents = useWeatherStore((s) => s.qpEvents);
  const fetchWeather = useWeatherStore((s) => s.fetchWeather);

  useEffect(() => {
    if (forecast.length === 0) fetchWeather();
  }, [forecast.length, fetchWeather]);

  const upcomingQPE = forecast.find((day) => day.isQPE);

  return (
    <Card className="border-border bg-surface">
      <CardHeader>
        <CardTitle className="text-foreground">Precipitation Events</CardTitle>
        <CardDescription>
          Qualifying precipitation events and triggered inspections
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {upcomingQPE && (
            <div className="rounded-lg border-2 border-amber-500/40 bg-amber-500/5 p-4">
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                </span>
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] font-bold uppercase tracking-wider">
                  Upcoming
                </Badge>
              </div>
              <p className="text-sm font-medium text-foreground">
                Forecasted QPE &mdash; {formatDate(upcomingQPE.date)}
              </p>
              <div className="mt-1.5 flex items-baseline gap-1">
                <span className="font-heading text-2xl font-bold text-amber-500">
                  {upcomingQPE.precipitationInches}&quot;
                </span>
                <span className="text-xs text-muted-foreground">expected</span>
              </div>
              <p className="mt-2 text-xs text-amber-400/80">
                Pre-storm inspection required within 48 hours of event. Post-storm inspection
                required within 24 hours after event concludes.
              </p>
            </div>
          )}

          {qpEvents.map((event) => (
            <div
              key={event.id}
              className={`rounded-lg border p-4 ${
                event.totalPrecipitation >= 0.5
                  ? 'border-amber-500/30 bg-amber-500/5'
                  : 'border-[#2A2A2A] bg-[#1C1C1C]'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CloudRain className="h-3.5 w-3.5 text-blue-400" />
                    <span className="text-xs font-medium text-muted-foreground">{event.id}</span>
                  </div>
                  <p className="mt-1 text-sm text-foreground">
                    {formatDate(event.startDate)} &mdash; {formatDate(event.endDate)}
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-heading text-2xl font-bold text-blue-400">
                    {event.totalPrecipitation}&quot;
                  </span>
                  <p className="text-[10px] text-muted-foreground">total precip</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-[#2A2A2A] pt-3">
                <div className="flex items-center gap-2">
                  {event.inspectionTriggered ? (
                    <>
                      <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      <span className="text-xs text-green-400">Inspection completed</span>
                    </>
                  ) : (
                    <>
                      <Minus className="h-3.5 w-3.5 text-gray-500" />
                      <span className="text-xs text-muted-foreground">
                        No inspection triggered
                      </span>
                    </>
                  )}
                </div>
                {event.inspectionTriggered && event.inspectionId && (
                  <a
                    href={`/checkpoints?inspection=${event.inspectionId}`}
                    className="flex items-center gap-1 text-xs text-amber-500 hover:text-amber-400 transition-colors"
                  >
                    {event.inspectionId}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
