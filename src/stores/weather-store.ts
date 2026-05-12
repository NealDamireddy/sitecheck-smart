import { create } from 'zustand';
import { WeatherDay, QPEvent } from '@/types';
import { WeatherSnapshot } from '@/types/weather';
import {
  currentWeather as staticCurrent,
  forecast as staticForecast,
  qpEvents as staticQpEvents,
} from '@/data/weather';

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
  // Seed with static demo data so /weather (current conditions, 7-day chart,
  // alerts, timeline) renders immediately and stays populated when the API
  // is unavailable (e.g. demo mode).
  forecast: staticForecast,
  qpEvents: staticQpEvents,
  current: staticCurrent,
  selectedDay: null,
  loading: false,
  error: null,
  setSelectedDay: (date) => set({ selectedDay: date }),
  fetchWeather: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
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
        current: current ?? staticCurrent,
        forecast: Array.isArray(forecast) && forecast.length > 0 ? forecast : staticForecast,
        qpEvents: Array.isArray(qpEvents) && qpEvents.length > 0 ? qpEvents : staticQpEvents,
        loading: false,
      });
    } catch {
      // Fall back to static demo data when the API is unavailable.
      set({
        current: staticCurrent,
        forecast: staticForecast,
        qpEvents: staticQpEvents,
        loading: false,
        error: null,
      });
    }
  },
}));
