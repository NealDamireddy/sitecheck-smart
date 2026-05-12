export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

export const DEFAULT_MAP_STYLE = 'mapbox://styles/mapbox/satellite-streets-v12';

export const SITE_VIEW = {
  longitude: -119.4161,
  latitude: 36.7801,
  zoom: 16,
  pitch: 0,
  bearing: 0,
};

export const MAP_BOUNDS: [[number, number], [number, number]] = [
  [-119.420, 36.776],
  [-119.412, 36.784],
];
