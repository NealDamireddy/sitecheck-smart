import { create } from 'zustand';
import { WeatherDay, QPEvent } from '@/types';
import { WeatherSnapshot } from '@/types/weather';
import {
  currentWeather as staticCurrent,
  forecast as staticForecast,
  qpEvents as staticQpEvents,
} from '@/data/weather';
import { isDemoSession } from '@/lib/demo/start-demo';

interface WeatherStore {
  forecast: WeatherDay[];
  qpEvents: QPEvent[];
  current: WeatherSnapshot | null;
  selectedDay: string | null;
  loading: boolean;
  error: string | null;
  setSelectedDay: (date: string | null) => void;
  fetchWeather: () => Promise<void>;
}

export const useWeatherStore = create<WeatherStore>((set, get) => ({
  // Start empty for a deterministic SSR/hydration match. fetchWeather
  // (called from an effect, post-mount) fills in real data, or the demo
  // fallback when in a demo session.
  forecast: [],
  qpEvents: [],
  current: null,
  selectedDay: null,
  loading: false,
  error: null,
  setSelectedDay: (date) => set({ selectedDay: date }),
  fetchWeather: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    // Bundled demo weather only stands in for a backend during a demo
    // session — it's pinned to the demo site's location.
    const demo = isDemoSession();
    try {
      const [currentRes, forecastRes, qpeRes] = await Promise.all([
        fetch('/api/weather/current'),
        fetch('/api/weather/forecast'),
        fetch('/api/weather/qpe-events'),
      ]);

      if (!currentRes.ok || !forecastRes.ok || !qpeRes.ok) {
        throw new Error('Failed to fetch weather data');
      }

      const [current, forecast, qpEvents] = await Promise.all([
        currentRes.json(),
        forecastRes.json(),
        qpeRes.json(),
      ]);

      set({
        current: current ?? (demo ? staticCurrent : null),
        forecast:
          Array.isArray(forecast) && forecast.length > 0
            ? forecast
            : demo
              ? staticForecast
              : [],
        qpEvents:
          Array.isArray(qpEvents) && qpEvents.length > 0
            ? qpEvents
            : demo
              ? staticQpEvents
              : [],
        loading: false,
      });
    } catch {
      // API unavailable (demo mode, offline). Demo fallback or empty.
      set({
        current: demo ? staticCurrent : null,
        forecast: demo ? staticForecast : [],
        qpEvents: demo ? staticQpEvents : [],
        loading: false,
        error: null,
      });
    }
  },
}));
