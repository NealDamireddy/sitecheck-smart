import { Project } from '@/types/project';

export const project: Project = {
  id: 'riverside-phase2',
  name: 'Riverside Commercial \u2014 Phase 2',
  address: '4200 Riverside Blvd, Fresno, CA 93722',
  permitNumber: 'CAS000001',
  wdid: '5B39C123456',
  riskLevel: 2,
  qsp: {
    name: 'Sarah Chen',
    licenseNumber: 'QSP-4521',
    company: 'Pacific Environmental Consulting',
    phone: '(559) 555-0142',
    email: 'schen@pacenviro.com',
  },
  status: 'active',
  startDate: '2025-09-15',
  estimatedCompletion: '2027-03-01',
  acreage: 12.4,
  coordinates: { lat: 36.7801, lng: -119.4161 },
  bounds: [[36.776, -119.420], [36.784, -119.412]],
};
