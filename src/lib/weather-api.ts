import { WeatherSnapshot, WeatherDay, WeatherCondition } from '@/types/weather';

const FRESNO_LAT = 36.7378;
const FRESNO_LON = -119.7871;
const OWM_BASE_URL = 'https://api.openweathermap.org/data/2.5';

// Map OpenWeatherMap condition codes to app's WeatherCondition type
function mapOWMCondition(main: string, description?: string): WeatherCondition {
  const mainLower = main.toLowerCase();
  const descLower = (description || '').toLowerCase();

  switch (mainLower) {
    case 'clear':
      return 'clear';
    case 'clouds':
      if (descLower.includes('few') || descLower.includes('scattered')) {
        return 'partly-cloudy';
      }
      return 'cloudy';
    case 'rain':
    case 'drizzle':
      if (descLower.includes('light') || descLower.includes('drizzle')) {
        return 'light-rain';
      }
      if (descLower.includes('heavy') || descLower.includes('extreme')) {
        return 'heavy-rain';
      }
      return 'rain';
    case 'thunderstorm':
      return 'thunderstorm';
    case 'mist':
    case 'fog':
    case 'haze':
    case 'smoke':
    case 'dust':
    case 'sand':
      return 'fog';
    case 'snow':
      return 'cloudy'; // Treat snow as cloudy for construction site context
    default:
      return 'partly-cloudy';
  }
}

// Convert wind speed from m/s to mph
function msToMph(ms: number): number {
  return Math.round(ms * 2.237);
}

// Convert mm to inches
function mmToInches(mm: number): number {
  return mm / 25.4;
}

interface OWMCurrentResponse {
  main: {
    temp: number;
    humidity: number;
  };
  weather: Array<{
    main: string;
    description: string;
  }>;
  wind: {
    speed: number;
    deg?: number;
  };
}

interface OWMForecastItem {
  dt: number;
  dt_txt: string;
  main: {
    temp: number;
    temp_min: number;
    temp_max: number;
    humidity: number;
  };
  weather: Array<{
    main: string;
    description: string;
  }>;
  wind: {
    speed: number;
    deg?: number;
  };
  pop?: number; // Probability of precipitation (0-1)
  rain?: {
    '3h'?: number; // Rain volume for last 3 hours, mm
  };
}

interface OWMForecastResponse {
  list: OWMForecastItem[];
}

// Get wind direction from degrees
function getWindDirection(deg: number | undefined): string {
  if (deg === undefined) return 'N';
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(deg / 45) % 8;
  return directions[index];
}

/**
 * Fetch current weather from OpenWeatherMap
 */
export async function fetchCurrentWeather(): Promise<WeatherSnapshot> {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY;

  if (!apiKey) {
    throw new Error('OPENWEATHERMAP_API_KEY environment variable is not set');
  }

  const url = `${OWM_BASE_URL}/weather?lat=${FRESNO_LAT}&lon=${FRESNO_LON}&appid=${apiKey}&units=imperial`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
    },
    next: { revalidate: 300 }, // Cache for 5 minutes
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenWeatherMap API error: ${response.status} - ${errorText}`);
  }

  const data: OWMCurrentResponse = await response.json();

  return {
    temperature: Math.round(data.main.temp),
    condition: mapOWMCondition(
      data.weather[0]?.main || 'Clear',
      data.weather[0]?.description
    ),
    windSpeedMph: msToMph(data.wind.speed),
    humidity: data.main.humidity,
  };
}

/**
 * Fetch 7-day forecast from OpenWeatherMap
 * OpenWeatherMap free tier provides 5-day/3-hour forecast
 * We request 56 data points (7 days * 8 intervals/day)
 */
export async function fetchForecast(): Promise<WeatherDay[]> {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY;

  if (!apiKey) {
    throw new Error('OPENWEATHERMAP_API_KEY environment variable is not set');
  }

  // Note: Free tier only provides 5 days, but we request 56 for 7 days
  const url = `${OWM_BASE_URL}/forecast?lat=${FRESNO_LAT}&lon=${FRESNO_LON}&appid=${apiKey}&units=imperial&cnt=56`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
    },
    next: { revalidate: 1800 }, // Cache for 30 minutes
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenWeatherMap API error: ${response.status} - ${errorText}`);
  }

  const data: OWMForecastResponse = await response.json();

  // Group forecast items by day
  const dayGroups: Map<string, OWMForecastItem[]> = new Map();

  for (const item of data.list) {
    // Extract date (YYYY-MM-DD) from dt_txt which is in format "2024-01-01 12:00:00"
    const dateStr = item.dt_txt.split(' ')[0];

    if (!dayGroups.has(dateStr)) {
      dayGroups.set(dateStr, []);
    }
    dayGroups.get(dateStr)!.push(item);
  }

  // Process each day
  const forecasts: WeatherDay[] = [];

  for (const [dateStr, items] of dayGroups) {
    // Skip if we already have 7 days
    if (forecasts.length >= 7) break;

    // Calculate aggregates for the day
    let high = -Infinity;
    let low = Infinity;
    let totalPrecipMm = 0;
    let maxPrecipChance = 0;
    let maxWindSpeed = 0;
    let totalHumidity = 0;
    let maxWindDeg: number | undefined;

    // Track most severe weather condition
    const conditionCounts: Map<string, number> = new Map();

    for (const item of items) {
      // Temperature extremes
      if (item.main.temp_max > high) high = item.main.temp_max;
      if (item.main.temp_min < low) low = item.main.temp_min;

      // Precipitation
      if (item.rain?.['3h']) {
        totalPrecipMm += item.rain['3h'];
      }
      if (item.pop !== undefined) {
        maxPrecipChance = Math.max(maxPrecipChance, item.pop);
      }

      // Wind
      if (item.wind.speed > maxWindSpeed) {
        maxWindSpeed = item.wind.speed;
        maxWindDeg = item.wind.deg;
      }

      // Humidity
      totalHumidity += item.main.humidity;

      // Track weather conditions
      const condition = item.weather[0]?.main || 'Clear';
      conditionCounts.set(condition, (conditionCounts.get(condition) || 0) + 1);
    }

    // Find most common weather condition
    let mostCommonCondition = 'Clear';
    let maxCount = 0;
    for (const [condition, count] of conditionCounts) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonCondition = condition;
      }
    }

    // Calculate averages
    const avgHumidity = Math.round(totalHumidity / items.length);
    const totalPrecipInches = mmToInches(totalPrecipMm);

    // QPE threshold: 0.5 inches (12.7mm)
    const isQPE = totalPrecipInches >= 0.5;

    forecasts.push({
      date: dateStr,
      high: Math.round(high),
      low: Math.round(low),
      precipitationInches: Math.round(totalPrecipInches * 100) / 100,
      precipitationChance: Math.round(maxPrecipChance * 100),
      windSpeedMph: msToMph(maxWindSpeed),
      windDirection: getWindDirection(maxWindDeg),
      condition: mapOWMCondition(mostCommonCondition),
      humidity: avgHumidity,
      isQPE,
    });
  }

  // Ensure we have at least something even if API returns less data
  return forecasts;
}

/**
 * Fetch both current weather and forecast
 */
export async function fetchWeatherData(): Promise<{
  current: WeatherSnapshot;
  forecast: WeatherDay[];
}> {
  const [current, forecast] = await Promise.all([
    fetchCurrentWeather(),
    fetchForecast(),
  ]);

  return { current, forecast };
}
