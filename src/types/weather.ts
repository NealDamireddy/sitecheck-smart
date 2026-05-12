export type WeatherCondition =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'light-rain'
  | 'rain'
  | 'heavy-rain'
  | 'thunderstorm'
  | 'fog';

export interface WeatherSnapshot {
  temperature: number;
  condition: WeatherCondition;
  windSpeedMph: number;
  humidity: number;
}

export interface WeatherDay {
  date: string;
  high: number;
  low: number;
  precipitationInches: number;
  precipitationChance: number;
  windSpeedMph: number;
  windDirection: string;
  condition: WeatherCondition;
  humidity: number;
  isQPE: boolean;
}

export interface QPEvent {
  id: string;
  startDate: string;
  endDate: string;
  totalPrecipitation: number;
  inspectionTriggered: boolean;
  inspectionId?: string;
}
