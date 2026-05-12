'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Clock, CloudRain, Wind, Thermometer, ExternalLink } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useWeatherStore } from '@/stores/weather-store';
import type { WeatherDay } from '@/types/weather';
import { deficiencies as staticDeficiencies } from '@/data/deficiencies';

interface Alert {
  id: string;
  type: 'storm' | 'deficiency' | 'inspection';
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  icon: React.ElementType;
  actionHref: string;
  actionLabel: string;
}

interface Deficiency {
  id: string;
  checkpointId: string;
  status: string;
  deadline: string;
  cgpViolation: string;
}

function getAlerts(forecast: WeatherDay[], deficiencies: Deficiency[]): Alert[] {
  const alerts: Alert[] = [];

  // Upcoming QPE alert
  const qpeDay = forecast.find((d) => d.isQPE);
  if (qpeDay) {
    alerts.push({
      id: 'alert-qpe',
      type: 'storm',
      severity: 'high',
      title: 'Qualifying Precipitation Event Forecasted',
      description: `${qpeDay.precipitationInches}" expected on ${qpeDay.date}. Pre-storm inspection required within 48 hours. Post-storm inspection required within 24 hours after event.`,
      icon: CloudRain,
      actionHref: '/weather',
      actionLabel: 'View Forecast',
    });
  }

  // High wind alert
  const windyDay = forecast.find((d) => d.windSpeedMph >= 15);
  if (windyDay) {
    alerts.push({
      id: 'alert-wind',
      type: 'storm',
      severity: 'medium',
      title: 'High Wind Advisory',
      description: `Winds up to ${windyDay.windSpeedMph} mph forecast for ${windyDay.date}. Verify wind erosion BMPs and secure loose materials.`,
      icon: Wind,
      actionHref: '/checkpoints',
      actionLabel: 'View Checkpoints',
    });
  }

  // Open deficiency alerts
  const openDefs = deficiencies.filter((d) => d.status === 'open');
  openDefs.forEach((def) => {
    const hoursLeft = Math.max(0, (new Date(def.deadline).getTime() - Date.now()) / 3600000);
    alerts.push({
      id: `alert-def-${def.id}`,
      type: 'deficiency',
      severity: hoursLeft < 24 ? 'high' : 'medium',
      title: `Deficiency ${def.id} — Correction Deadline`,
      description: `${def.cgpViolation}. ${Math.round(hoursLeft)} hours remaining.`,
      icon: AlertTriangle,
      actionHref: `/checkpoints/${def.checkpointId}`,
      actionLabel: 'View Checkpoint',
    });
  });

  // Pre-storm inspection reminder
  const lightRainDay = forecast.find((d) => d.precipitationChance >= 60 && !d.isQPE);
  if (lightRainDay) {
    alerts.push({
      id: 'alert-pre-storm',
      type: 'inspection',
      severity: 'low',
      title: 'Pre-Storm Inspection Recommended',
      description: `${lightRainDay.precipitationChance}% precipitation chance on ${lightRainDay.date}. Consider pre-storm BMP verification.`,
      icon: Clock,
      actionHref: '/checkpoints',
      actionLabel: 'View Checkpoints',
    });
  }

  return alerts.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.severity] - order[b.severity];
  });
}

const severityConfig = {
  high: { badge: 'bg-red-500/10 text-red-500 border-red-500/20', border: 'border-red-500/30', bg: 'bg-red-500/[0.03]' },
  medium: { badge: 'bg-amber-500/10 text-amber-500 border-amber-500/20', border: 'border-amber-500/30', bg: 'bg-amber-500/[0.03]' },
  low: { badge: 'bg-blue-500/10 text-blue-500 border-blue-500/20', border: 'border-blue-500/30', bg: 'bg-blue-500/[0.03]' },
};

export function AlertPanel() {
  const forecast = useWeatherStore((s) => s.forecast);
  const fetchWeather = useWeatherStore((s) => s.fetchWeather);
  const [deficiencies, setDeficiencies] = useState<Deficiency[]>([]);

  useEffect(() => {
    if (forecast.length === 0) fetchWeather();
    fetch('/api/deficiencies')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setDeficiencies(Array.isArray(data) ? data : staticDeficiencies);
      })
      .catch(() => {
        setDeficiencies(staticDeficiencies);
      });
  }, [forecast.length, fetchWeather]);

  const alerts = getAlerts(forecast, deficiencies);

  return (
    <Card className="border-border bg-surface">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-foreground">Active Alerts</CardTitle>
          <Badge className="bg-red-500/10 text-red-500 border-red-500/20 text-[10px]">
            {alerts.filter((a) => a.severity === 'high').length} urgent
          </Badge>
        </div>
        <CardDescription>Weather and compliance alerts sorted by urgency</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {alerts.map((alert) => {
            const config = severityConfig[alert.severity];
            const Icon = alert.icon;
            return (
              <div
                key={alert.id}
                className={`rounded-lg border p-4 ${config.border} ${config.bg}`}
              >
                <div className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{alert.title}</p>
                      <Badge variant="outline" className={`${config.badge} text-[9px] uppercase`}>
                        {alert.severity}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      {alert.description}
                    </p>
                    <Link
                      href={alert.actionHref}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-amber-500 hover:text-amber-400 transition-colors"
                    >
                      {alert.actionLabel}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}

          {alerts.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No active alerts
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
