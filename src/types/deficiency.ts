export interface Deficiency {
  id: string;
  checkpointId: string;
  detectedDate: string;
  description: string;
  cgpViolation: string;
  correctiveAction: string;
  deadline: string;
  status: 'open' | 'in-progress' | 'resolved';
  resolvedDate?: string;
  resolvedNotes?: string;
}
