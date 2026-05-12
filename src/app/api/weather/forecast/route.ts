import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { fetchForecast } from '@/lib/weather-api';
import { WeatherDay } from '@/types/weather';
import { resolveProjectId, DEFAULT_PROJECT_ID } from '@/lib/project-context';

const CACHE_DURATION_MINUTES = 60; // 1 hour

// Transform snake_case database row to camelCase
function transformForecastToClient(row: Record<string, unknown>): WeatherDay {
  return {
    date: row.date as string,
    high: row.high as number,
    low: row.low as number,
    precipitationInches: Number(row.precipitation_inches),
    precipitationChance: row.precipitation_chance as number,
    windSpeedMph: row.wind_speed_mph as number,
    windDirection: row.wind_direction as string,
    condition: row.condition as WeatherDay['condition'],
    humidity: row.humidity as number,
    isQPE: row.is_qpe as boolean,
  };
}

// GET /api/weather/forecast - Get 7-day forecast with caching
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId') || DEFAULT_PROJECT_ID;

    // Check for cached data
    const { data: cached, error: cacheError } = await supabase
      .from('weather_forecasts')
      .select('*')
      .eq('project_id', projectId)
      .order('date', { ascending: true });

    if (cacheError) {
      console.error('Error checking forecast cache:', cacheError);
    }

    // Check if cache is fresh (less than 1 hour old)
    if (cached && cached.length > 0) {
      const fetchedAt = new Date(cached[0].fetched_at as string);
      const now = new Date();
      const ageMinutes = (now.getTime() - fetchedAt.getTime()) / (1000 * 60);

      if (ageMinutes < CACHE_DURATION_MINUTES) {
        // Return cached data
        const forecasts = cached.map(transformForecastToClient);
        return NextResponse.json(forecasts);
      }
    }

    // Fetch fresh data from OpenWeatherMap
    const forecastData = await fetchForecast();

    // Delete old forecasts for this project
    const { error: deleteError } = await supabase
      .from('weather_forecasts')
      .delete()
      .eq('project_id', projectId);

    if (deleteError) {
      console.error('Error deleting old forecasts:', deleteError);
    }

    // Insert new forecasts
    const forecastRecords = forecastData.map((day) => ({
      project_id: projectId,
      date: day.date,
      high: day.high,
      low: day.low,
      precipitation_inches: day.precipitationInches,
      precipitation_chance: day.precipitationChance,
      wind_speed_mph: day.windSpeedMph,
      wind_direction: day.windDirection,
      condition: day.condition,
      humidity: day.humidity,
      is_qpe: day.isQPE,
      fetched_at: new Date().toISOString(),
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('weather_forecasts')
      .upsert(forecastRecords, {
        onConflict: 'project_id,date',
      })
      .select();

    if (insertError) {
      console.error('Error caching forecast data:', insertError);
      // Return the fetched data even if caching failed
      return NextResponse.json(forecastData);
    }

    const forecasts = (inserted || []).map(transformForecastToClient);
    return NextResponse.json(forecasts);
  } catch (error) {
    console.error('Unexpected error in GET /api/weather/forecast:', error);

    // If OpenWeatherMap fails, try to return stale cached data
    try {
      const fallbackAuth = await requireAuth();
      if (fallbackAuth.error) return fallbackAuth.error;
      const { supabase } = fallbackAuth;
      const { searchParams } = new URL(request.url);
      const projectId = searchParams.get('projectId') || DEFAULT_PROJECT_ID;

      const { data: staleCache } = await supabase
        .from('weather_forecasts')
        .select('*')
        .eq('project_id', projectId)
        .order('date', { ascending: true });

      if (staleCache && staleCache.length > 0) {
        const forecasts = staleCache.map(transformForecastToClient);
        return NextResponse.json(forecasts.map(f => ({ ...f, stale: true })));
      }
    } catch {
      // Ignore secondary errors
    }

    return NextResponse.json(
      { error: 'Failed to fetch forecast data' },
      { status: 500 }
    );
  }
}
