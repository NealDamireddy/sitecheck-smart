import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { fetchCurrentWeather } from '@/lib/weather-api';
import { resolveProjectId, DEFAULT_PROJECT_ID } from '@/lib/project-context';

const CACHE_DURATION_MINUTES = 15;

// Transform snake_case database row to camelCase
function transformSnapshotToClient(row: Record<string, unknown>) {
  return {
    temperature: row.temperature,
    condition: row.condition,
    windSpeedMph: row.wind_speed_mph,
    humidity: row.humidity,
    fetchedAt: row.fetched_at,
  };
}

// GET /api/weather/current - Get current weather with caching
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId') || DEFAULT_PROJECT_ID;

    // Check for cached data
    const { data: cached, error: cacheError } = await supabase
      .from('weather_snapshots')
      .select('*')
      .eq('project_id', projectId)
      .single();

    if (cacheError && cacheError.code !== 'PGRST116') {
      console.error('Error checking weather cache:', cacheError);
    }

    // Check if cache is fresh (less than 15 minutes old)
    if (cached) {
      const fetchedAt = new Date(cached.fetched_at as string);
      const now = new Date();
      const ageMinutes = (now.getTime() - fetchedAt.getTime()) / (1000 * 60);

      if (ageMinutes < CACHE_DURATION_MINUTES) {
        // Return cached data
        return NextResponse.json(transformSnapshotToClient(cached));
      }
    }

    // Fetch fresh data from OpenWeatherMap
    const weatherData = await fetchCurrentWeather();

    // Upsert into cache
    const { data: upserted, error: upsertError } = await supabase
      .from('weather_snapshots')
      .upsert({
        project_id: projectId,
        temperature: weatherData.temperature,
        condition: weatherData.condition,
        wind_speed_mph: weatherData.windSpeedMph,
        humidity: weatherData.humidity,
        fetched_at: new Date().toISOString(),
      }, {
        onConflict: 'project_id',
      })
      .select()
      .single();

    if (upsertError) {
      console.error('Error caching weather data:', upsertError);
      // Return the fetched data even if caching failed
      return NextResponse.json({
        ...weatherData,
        fetchedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json(transformSnapshotToClient(upserted));
  } catch (error) {
    console.error('Unexpected error in GET /api/weather/current:', error);

    // If OpenWeatherMap fails, try to return stale cached data
    try {
      const fallbackAuth = await requireAuth();
      if (fallbackAuth.error) return fallbackAuth.error;
      const { supabase } = fallbackAuth;
      const { searchParams } = new URL(request.url);
      const projectId = searchParams.get('projectId') || DEFAULT_PROJECT_ID;

      const { data: staleCache } = await supabase
        .from('weather_snapshots')
        .select('*')
        .eq('project_id', projectId)
        .single();

      if (staleCache) {
        return NextResponse.json({
          ...transformSnapshotToClient(staleCache),
          stale: true,
        });
      }
    } catch {
      // Ignore secondary errors
    }

    return NextResponse.json(
      { error: 'Failed to fetch weather data' },
      { status: 500 }
    );
  }
}
