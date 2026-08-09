import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { fetchCurrentWeather } from '@/lib/weather-api';
import { fetchTomorrowCurrent } from '@/lib/weather/tomorrow';
import { resolveProjectId, resolveProjectCoords } from '@/lib/project-context';
import { log } from '@/lib/logger';

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
    const projectId = resolveProjectId(request);
    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }

    // Check for cached data
    const { data: cached, error: cacheError } = await supabase
      .from('weather_snapshots')
      .select('*')
      .eq('project_id', projectId)
      .single();

    if (cacheError && cacheError.code !== 'PGRST116') {
      log.error('Error checking weather cache', { cacheError });
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

    // Fetch fresh data at the project's real location.
    //
    // Tomorrow.io first when configured: it answers at the exact coordinates
    // rather than the nearest NOAA gridpoint, which matters for a site-level
    // display. It returns null — never throws — when unconfigured or
    // unavailable, so NOAA remains the fallback and the only hard dependency.
    //
    // Display only. The QPE determination stays on NOAA observations
    // (src/lib/qpe/observed.ts); see the note at the top of
    // src/lib/weather/tomorrow.ts for why.
    const coords = await resolveProjectCoords(supabase, projectId);
    const weatherData =
      (await fetchTomorrowCurrent(coords)) ?? (await fetchCurrentWeather(coords));

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
      log.error('Error caching weather data', { upsertError });
      // Return the fetched data even if caching failed
      return NextResponse.json({
        ...weatherData,
        fetchedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json(transformSnapshotToClient(upserted));
  } catch (error) {
    log.error('Unexpected error in GET /api/weather/current', { error });

    // If OpenWeatherMap fails, try to return stale cached data
    try {
      const fallbackAuth = await requireAuth();
      if (fallbackAuth.error) return fallbackAuth.error;
      const { supabase } = fallbackAuth;
      const projectId = resolveProjectId(request);
      if (!projectId) {
        return NextResponse.json(
          { error: 'Failed to fetch weather data' },
          { status: 500 }
        );
      }

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
