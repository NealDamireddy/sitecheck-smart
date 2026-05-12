export type ActivityType = 'drone' | 'inspection' | 'alert' | 'weather' | 'document' | 'deficiency';

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: string;
  severity?: 'info' | 'warning' | 'critical';
  linkedEntityId?: string;
  linkedEntityType?: string;
  metadata?: Record<string, unknown>;
}
