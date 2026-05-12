import type { BMPCategory, Zone } from './checkpoint';

export interface ExtractedCheckpoint {
  id: string;
  name: string;
  bmpType: BMPCategory;
  description: string;
  cgpSection: string;
  zone: Zone;
  lat: number;
  lng: number;
}

export interface SiteInfo {
  projectName: string;
  address: string;
  totalAcres: number;
  riskLevel: string;
  centerLat: number;
  centerLng: number;
}

export interface SwpppScanResponse {
  siteInfo: SiteInfo;
  checkpoints: ExtractedCheckpoint[];
}

export interface GenerateMissionRequest {
  checkpoints: Array<{
    id: string;
    name: string;
    bmpType: BMPCategory;
    lat: number;
    lng: number;
  }>;
  siteInfo: {
    centerLat: number;
    centerLng: number;
  };
}
