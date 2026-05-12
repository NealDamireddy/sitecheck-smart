/**
 * SiteCheck Database Seed Script
 *
 * Seeds the Supabase database with static data from the application.
 * Run with: npm run db:seed
 *
 * Options:
 *   --reset    Clear all tables before seeding
 *   --dry-run  Log what would be inserted without actually inserting
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required environment variables:');
  if (!SUPABASE_URL) console.error('  - NEXT_PUBLIC_SUPABASE_URL');
  if (!SUPABASE_SERVICE_KEY) console.error('  - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ============================================================================
// CLI Arguments
// ============================================================================
const args = process.argv.slice(2);
const RESET_MODE = args.includes('--reset');
const DRY_RUN = args.includes('--dry-run');

// ============================================================================
// Static Data (embedded to avoid TS path alias issues)
// ============================================================================

const PROJECT_ID = 'riverside-phase2';

const project = {
  id: PROJECT_ID,
  name: 'Riverside Commercial — Phase 2',
  address: '4200 Riverside Blvd, Fresno, CA 93722',
  permit_number: 'CAS000001',
  wdid: '5B39C123456',
  risk_level: 2,
  qsp_name: 'Sarah Chen',
  qsp_license_number: 'QSP-4521',
  qsp_company: 'Pacific Environmental Consulting',
  qsp_phone: '(559) 555-0142',
  qsp_email: 'schen@pacenviro.com',
  status: 'active',
  start_date: '2025-09-15',
  estimated_completion: '2027-03-01',
  acreage: 12.4,
  center_lat: 36.7801,
  center_lng: -119.4161,
  bounds_sw_lat: 36.776,
  bounds_sw_lng: -119.420,
  bounds_ne_lat: 36.784,
  bounds_ne_lng: -119.412,
};

const checkpoints = [
  { id: 'SC-1', name: 'Silt Fence — North Perimeter', bmp_type: 'sediment-control', status: 'compliant', priority: 'high', zone: 'north', description: 'Type 1 woven geotextile silt fence installed along the northern property boundary to intercept sheet flow runoff before it reaches the adjacent drainage channel. 820 linear feet with steel T-posts at 6-foot spacing.', cgp_section: 'Section X.H.1.a', lat: 36.7825, lng: -119.4170, last_inspection_date: '2026-03-28T09:15:00Z', last_inspection_photo: '/images/drone/sc-01.jpg', install_date: '2025-10-02', swppp_page: 12 },
  { id: 'SC-2', name: 'Silt Fence — East Slope', bmp_type: 'sediment-control', status: 'compliant', priority: 'high', zone: 'east', description: 'Reinforced silt fence with wire backing along the eastern cut slope. Prevents sediment migration toward the storm drain inlet on Riverside Blvd. 460 linear feet with trenched toe burial at 6-inch depth.', cgp_section: 'Section X.H.1.a', lat: 36.7808, lng: -119.4140, last_inspection_date: '2026-03-28T09:22:00Z', last_inspection_photo: '/images/drone/sc-02.jpg', install_date: '2025-10-05', swppp_page: 13 },
  { id: 'SC-3', name: 'Sediment Basin — SW Outfall', bmp_type: 'sediment-control', status: 'deficient', priority: 'high', zone: 'south', description: 'Primary sediment basin at the southwest outfall point. Designed for 3,600 cubic feet of storage treating a 4.2-acre drainage area. Riser-pipe outlet structure with perforated decant system and emergency spillway.', cgp_section: 'Section X.H.2.b', lat: 36.7782, lng: -119.4178, last_inspection_date: '2026-03-28T09:35:00Z', last_inspection_photo: '/images/drone/sc-03.jpg', install_date: '2025-10-12', swppp_page: 15 },
  { id: 'SC-4', name: 'Fiber Roll — Grading Area B', bmp_type: 'sediment-control', status: 'compliant', priority: 'medium', zone: 'central', description: 'Straw fiber rolls (9-inch diameter) staked along contour lines in grading area B to slow sheet flow and trap sediment on intermediate slopes. Installed at 15-foot intervals on the 3:1 slope.', cgp_section: 'Section X.H.1.c', lat: 36.7800, lng: -119.4158, last_inspection_date: '2026-03-28T09:42:00Z', last_inspection_photo: '/images/drone/sc-04.jpg', install_date: '2025-11-03', swppp_page: 17 },
  { id: 'SC-5', name: 'Inlet Protection — Storm Drain #1', bmp_type: 'sediment-control', status: 'compliant', priority: 'high', zone: 'east', description: 'Gravel bag and filter fabric inlet protection around storm drain inlet SD-1 on the east side of the project. Gravel bags stacked two courses high with non-woven geotextile fabric liner.', cgp_section: 'Section X.H.1.f', lat: 36.7812, lng: -119.4142, last_inspection_date: '2026-03-28T09:50:00Z', last_inspection_photo: '/images/drone/sc-05.jpg', install_date: '2025-10-08', swppp_page: 19 },
  { id: 'SC-6', name: 'Inlet Protection — Storm Drain #2', bmp_type: 'sediment-control', status: 'compliant', priority: 'high', zone: 'south', description: 'Manufactured drop-inlet sediment filter (Dandy Bag type) installed in storm drain inlet SD-2 near the south parking area. Rated for 2.5 cfs flow-through capacity.', cgp_section: 'Section X.H.1.f', lat: 36.7785, lng: -119.4155, last_inspection_date: '2026-03-28T09:58:00Z', last_inspection_photo: '/images/drone/sc-06.jpg', install_date: '2025-10-08', swppp_page: 20 },
  { id: 'SC-7', name: 'Sediment Trap — NW Corner', bmp_type: 'sediment-control', status: 'compliant', priority: 'medium', zone: 'north', description: 'Rock-lined sediment trap at the northwest corner of the site, collecting runoff from the parking structure excavation area. 12-inch riprap outlet with geotextile underliner.', cgp_section: 'Section X.H.2.a', lat: 36.7822, lng: -119.4185, last_inspection_date: '2026-03-28T10:05:00Z', last_inspection_photo: '/images/drone/sc-07.jpg', install_date: '2025-10-20', swppp_page: 22 },
  { id: 'SC-8', name: 'Fiber Roll — South Perimeter', bmp_type: 'sediment-control', status: 'compliant', priority: 'medium', zone: 'south', description: 'Coconut coir fiber rolls installed along the southern property line adjacent to the existing retail center. 12-inch diameter rolls staked at 4-foot intervals with wooden stakes.', cgp_section: 'Section X.H.1.c', lat: 36.7780, lng: -119.4162, last_inspection_date: '2026-03-28T10:12:00Z', last_inspection_photo: '/images/drone/sc-08.jpg', install_date: '2025-11-10', swppp_page: 23 },
  { id: 'EC-1', name: 'Hydroseeding — West Slope', bmp_type: 'erosion-control', status: 'compliant', priority: 'medium', zone: 'west', description: 'Hydraulic mulch seeding applied to the western slope (2.5:1 grade) using a native grass seed mix with tackifier and wood fiber mulch at 2,000 lbs/acre. Applied to 1.8 acres of finished grade.', cgp_section: 'Section X.H.3.a', lat: 36.7805, lng: -119.4188, last_inspection_date: '2026-03-28T10:20:00Z', last_inspection_photo: '/images/drone/ec-01.jpg', install_date: '2026-01-15', swppp_page: 28 },
  { id: 'EC-2', name: 'Erosion Control Blanket — Channel A', bmp_type: 'erosion-control', status: 'compliant', priority: 'high', zone: 'central', description: 'Straw-coconut erosion control blanket (SC150BN) installed in the on-site drainage channel A. Secured with 6-inch U-shaped staples at 3-foot grid spacing. Covers 3,200 sq ft of channel bottom and banks.', cgp_section: 'Section X.H.3.b', lat: 36.7798, lng: -119.4165, last_inspection_date: '2026-03-28T10:28:00Z', last_inspection_photo: '/images/drone/ec-02.jpg', install_date: '2025-12-01', swppp_page: 30 },
  { id: 'EC-3', name: 'Soil Binder — Exposed Pad Area', bmp_type: 'erosion-control', status: 'compliant', priority: 'medium', zone: 'central', description: 'Polymer-based soil binder (PAM) applied to 2.1 acres of exposed graded building pad to stabilize soil surface between grading phases. Application rate of 50 gal/acre with re-application every 30 days.', cgp_section: 'Section X.H.3.c', lat: 36.7802, lng: -119.4152, last_inspection_date: '2026-03-27T14:10:00Z', last_inspection_photo: '/images/drone/ec-03.jpg', install_date: '2026-02-20', swppp_page: 32 },
  { id: 'EC-4', name: 'Slope Drain — North Cut', bmp_type: 'erosion-control', status: 'compliant', priority: 'high', zone: 'north', description: 'Temporary slope drain (12-inch corrugated polyethylene pipe) installed on the northern cut slope to convey concentrated flow from the top of the cut to the sediment trap below. Secured with gravel-filled anchor bags.', cgp_section: 'Section X.H.3.d', lat: 36.7820, lng: -119.4160, last_inspection_date: '2026-03-28T10:36:00Z', last_inspection_photo: '/images/drone/ec-04.jpg', install_date: '2025-10-25', swppp_page: 34 },
  { id: 'EC-5', name: 'Hydroseeding — South Berm', bmp_type: 'erosion-control', status: 'needs-review', priority: 'medium', zone: 'south', description: 'Hydroseed application on the southern containment berm. Coverage appears thin in some areas and germination is inconsistent, possibly due to foot traffic from subcontractors. Needs field verification.', cgp_section: 'Section X.H.3.a', lat: 36.7783, lng: -119.4168, last_inspection_date: '2026-03-28T10:44:00Z', last_inspection_photo: '/images/drone/ec-05.jpg', install_date: '2026-02-01', swppp_page: 36 },
  { id: 'EC-6', name: 'Erosion Control Blanket — Detention Basin Slope', bmp_type: 'erosion-control', status: 'compliant', priority: 'medium', zone: 'west', description: 'Excelsior (curled wood fiber) erosion control blanket on the interior slopes of the permanent detention basin. Single-net photodegradable netting with staples at 2-foot spacing on slopes steeper than 3:1.', cgp_section: 'Section X.H.3.b', lat: 36.7795, lng: -119.4182, last_inspection_date: '2026-03-28T10:52:00Z', last_inspection_photo: '/images/drone/ec-06.jpg', install_date: '2026-01-08', swppp_page: 37 },
  { id: 'EC-7', name: 'Geotextile Cover — Utility Trench', bmp_type: 'erosion-control', status: 'compliant', priority: 'low', zone: 'east', description: 'Non-woven geotextile fabric covering open utility trench backfill along the eastern utility corridor. Weighted with sandbags at 8-foot intervals to prevent wind displacement. Temporary until paving.', cgp_section: 'Section X.H.3.e', lat: 36.7810, lng: -119.4145, last_inspection_date: '2026-03-27T15:20:00Z', last_inspection_photo: '/images/drone/ec-07.jpg', install_date: '2026-03-10', swppp_page: 38 },
  { id: 'TC-1', name: 'Construction Entrance — Main Gate', bmp_type: 'tracking-control', status: 'compliant', priority: 'high', zone: 'east', description: 'Stabilized construction entrance at the main gate on Riverside Blvd. 50-foot long, 24-foot wide aggregate pad with 3-inch clean angular rock over geotextile fabric. Rumble strip grate at exit point.', cgp_section: 'Section X.H.4.a', lat: 36.7806, lng: -119.4140, last_inspection_date: '2026-03-28T11:00:00Z', last_inspection_photo: '/images/drone/tc-01.jpg', install_date: '2025-09-20', swppp_page: 42 },
  { id: 'TC-2', name: 'Tire Wash Station — Secondary Exit', bmp_type: 'tracking-control', status: 'needs-review', priority: 'medium', zone: 'south', description: 'Tire wash rack at the secondary construction exit on the south side. AI imagery suggests water supply hose may be disconnected and the recirculation basin shows elevated sediment levels. Field check required.', cgp_section: 'Section X.H.4.b', lat: 36.7781, lng: -119.4150, last_inspection_date: '2026-03-28T11:08:00Z', last_inspection_photo: '/images/drone/tc-02.jpg', install_date: '2025-10-15', swppp_page: 44 },
  { id: 'TC-3', name: 'Street Sweeping — Riverside Blvd Frontage', bmp_type: 'tracking-control', status: 'compliant', priority: 'medium', zone: 'east', description: 'Mechanical street sweeping of Riverside Blvd frontage road and adjacent public streets. Performed daily during active hauling operations and at minimum weekly. Sweeping logs maintained on-site.', cgp_section: 'Section X.H.4.c', lat: 36.7808, lng: -119.4138, last_inspection_date: '2026-03-28T11:15:00Z', last_inspection_photo: '/images/drone/tc-03.jpg', install_date: '2025-09-18', swppp_page: 45 },
  { id: 'TC-4', name: 'Construction Exit — North Service Road', bmp_type: 'tracking-control', status: 'compliant', priority: 'medium', zone: 'north', description: 'Secondary stabilized construction exit on the north service road. 40-foot aggregate pad with cattle guard grate. Used primarily by concrete delivery and dump trucks.', cgp_section: 'Section X.H.4.a', lat: 36.7824, lng: -119.4158, last_inspection_date: '2026-03-28T11:22:00Z', last_inspection_photo: '/images/drone/tc-04.jpg', install_date: '2025-09-22', swppp_page: 46 },
  { id: 'WE-1', name: 'Watering Schedule — Active Grading', bmp_type: 'wind-erosion', status: 'needs-review', priority: 'medium', zone: 'central', description: 'Water truck dust suppression for active grading areas. Standard schedule calls for 3 passes per day minimum. Recent drone imagery shows potentially dry conditions in the central pad area during afternoon hours. Needs verification of afternoon watering schedule compliance.', cgp_section: 'Section X.H.5.a', lat: 36.7801, lng: -119.4161, last_inspection_date: '2026-03-28T11:30:00Z', last_inspection_photo: '/images/drone/we-01.jpg', install_date: '2025-09-15', swppp_page: 50 },
  { id: 'WE-2', name: 'Wind Fencing — West Property Line', bmp_type: 'wind-erosion', status: 'compliant', priority: 'low', zone: 'west', description: 'Permeable wind fence (50% porosity) along the western property line to reduce wind erosion from prevailing westerly winds. 6-foot tall polypropylene fabric on steel posts at 10-foot spacing. 540 linear feet.', cgp_section: 'Section X.H.5.b', lat: 36.7800, lng: -119.4192, last_inspection_date: '2026-03-27T16:00:00Z', last_inspection_photo: '/images/drone/we-02.jpg', install_date: '2025-10-01', swppp_page: 52 },
  { id: 'WE-3', name: 'Wind Fencing — Stockpile Perimeter', bmp_type: 'wind-erosion', status: 'compliant', priority: 'medium', zone: 'north', description: 'Portable wind screen panels surrounding the soil stockpile area in the north yard. 8-foot tall panels on weighted bases providing 360-degree wind protection for import/export soil stockpiles.', cgp_section: 'Section X.H.5.b', lat: 36.7818, lng: -119.4172, last_inspection_date: '2026-03-28T11:38:00Z', last_inspection_photo: '/images/drone/we-03.jpg', install_date: '2025-11-20', swppp_page: 53 },
  { id: 'MM-1', name: 'Concrete Washout — Primary', bmp_type: 'materials-management', status: 'compliant', priority: 'high', zone: 'central', description: 'Primary concrete washout area with lined pit (10 ft x 10 ft x 3 ft deep) and 20-mil polyethylene liner. Located adjacent to the batch staging area. Currently at approximately 30% capacity with scheduled cleanout this week.', cgp_section: 'Section X.H.6.a', lat: 36.7803, lng: -119.4148, last_inspection_date: '2026-03-28T11:45:00Z', last_inspection_photo: '/images/drone/mm-01.jpg', install_date: '2025-10-10', swppp_page: 58 },
  { id: 'MM-2', name: 'Fuel Storage — Equipment Yard', bmp_type: 'materials-management', status: 'compliant', priority: 'high', zone: 'north', description: 'Double-walled 500-gallon diesel fuel storage tank with 110% secondary containment berm. Located in the north equipment yard on an impervious concrete pad with spill kit station. SPCC signage posted.', cgp_section: 'Section X.H.6.b', lat: 36.7819, lng: -119.4165, last_inspection_date: '2026-03-28T11:52:00Z', last_inspection_photo: '/images/drone/mm-02.jpg', install_date: '2025-09-25', swppp_page: 60 },
  { id: 'MM-3', name: 'Paint & Solvent Storage — Building C', bmp_type: 'materials-management', status: 'compliant', priority: 'medium', zone: 'east', description: 'Flammable materials storage cabinet (Justrite 45-gallon capacity) housed within a covered, bermed staging area near Building C. Contains latex paints, solvents, and adhesives. Inventory log maintained daily.', cgp_section: 'Section X.H.6.c', lat: 36.7810, lng: -119.4148, last_inspection_date: '2026-03-27T13:30:00Z', last_inspection_photo: '/images/drone/mm-03.jpg', install_date: '2026-01-20', swppp_page: 62 },
  { id: 'MM-4', name: 'Concrete Washout — Secondary', bmp_type: 'materials-management', status: 'deficient', priority: 'high', zone: 'west', description: 'Secondary concrete washout facility near the west retaining wall pour area. Prefabricated steel washout container (10 cu yd capacity). Currently overflowing with wash water pooling outside the containment area.', cgp_section: 'Section X.H.6.a', lat: 36.7796, lng: -119.4180, last_inspection_date: '2026-03-28T12:00:00Z', last_inspection_photo: '/images/drone/mm-04.jpg', install_date: '2026-02-05', swppp_page: 64 },
  { id: 'MM-5', name: 'Stockpile — Import Fill', bmp_type: 'materials-management', status: 'compliant', priority: 'medium', zone: 'north', description: 'Import fill soil stockpile (approximately 1,200 cu yd) in the north staging area. Perimeter lined with silt fence and fiber rolls. Covered with anchored polyethylene sheeting when inactive for more than 14 days.', cgp_section: 'Section X.H.6.d', lat: 36.7821, lng: -119.4175, last_inspection_date: '2026-03-28T12:08:00Z', last_inspection_photo: '/images/drone/mm-05.jpg', install_date: '2025-11-15', swppp_page: 65 },
  { id: 'MM-6', name: 'Hazmat Spill Kit — Main Yard', bmp_type: 'materials-management', status: 'compliant', priority: 'medium', zone: 'central', description: 'Emergency spill response station in the main equipment yard containing oil-only sorbent pads (100 count), absorbent socks (12 count), disposal bags, PPE, and emergency contact information. Inspected and restocked weekly.', cgp_section: 'Section X.H.6.e', lat: 36.7804, lng: -119.4155, last_inspection_date: '2026-03-27T10:15:00Z', last_inspection_photo: '/images/drone/mm-06.jpg', install_date: '2025-09-18', swppp_page: 66 },
  { id: 'MM-7', name: 'Stockpile — Aggregate Base', bmp_type: 'materials-management', status: 'compliant', priority: 'low', zone: 'north', description: 'Class II aggregate base stockpile (approximately 800 cu yd) for roadway and parking area subgrade. Perimeter contained with 18-inch fiber rolls. Material is self-draining and does not require cover.', cgp_section: 'Section X.H.6.d', lat: 36.7816, lng: -119.4168, last_inspection_date: '2026-03-28T12:15:00Z', last_inspection_photo: '/images/drone/mm-07.jpg', install_date: '2025-12-10', swppp_page: 67 },
  { id: 'NS-1', name: 'Dewatering — Foundation Excavation A', bmp_type: 'non-storm-water', status: 'compliant', priority: 'high', zone: 'central', description: 'Groundwater dewatering system for Building A foundation excavation. Submersible pump discharging through a Baker tank (21,000 gallon) for settling, then through a weir tank before discharge to the sediment basin. Turbidity monitored continuously.', cgp_section: 'Section X.H.7.a', lat: 36.7799, lng: -119.4160, last_inspection_date: '2026-03-28T12:22:00Z', last_inspection_photo: '/images/drone/ns-01.jpg', install_date: '2026-02-15', swppp_page: 72 },
  { id: 'NS-2', name: 'Dewatering — Utility Trench', bmp_type: 'non-storm-water', status: 'deficient', priority: 'high', zone: 'east', description: 'Dewatering discharge from the sanitary sewer trench excavation. Pump is discharging to a filter bag system but turbidity readings from the last sampling event exceeded 250 NTU, which is above the allowable discharge limit of 250 NTU.', cgp_section: 'Section X.H.7.a', lat: 36.7807, lng: -119.4143, last_inspection_date: '2026-03-28T12:30:00Z', last_inspection_photo: '/images/drone/ns-02.jpg', install_date: '2026-03-05', swppp_page: 74 },
  { id: 'NS-3', name: 'Potable Water Management — Irrigation Test', bmp_type: 'non-storm-water', status: 'compliant', priority: 'low', zone: 'west', description: 'Temporary containment and diversion for landscape irrigation system testing on the western landscape areas. Discharge routed via flex hose to the nearest vegetated infiltration area. No direct discharge to storm drain.', cgp_section: 'Section X.H.7.b', lat: 36.7794, lng: -119.4185, last_inspection_date: '2026-03-27T11:00:00Z', last_inspection_photo: '/images/drone/ns-03.jpg', install_date: '2026-03-01', swppp_page: 76 },
  { id: 'NS-4', name: 'Wash Water Containment — Equipment Wash', bmp_type: 'non-storm-water', status: 'compliant', priority: 'medium', zone: 'north', description: 'Designated equipment wash-down area on the north equipment yard with bermed containment pad and oil-water separator. Wash water collected in a 2,000-gallon holding tank for periodic vacuum truck removal.', cgp_section: 'Section X.H.7.c', lat: 36.7817, lng: -119.4162, last_inspection_date: '2026-03-28T12:38:00Z', last_inspection_photo: '/images/drone/ns-04.jpg', install_date: '2025-10-28', swppp_page: 78 },
  { id: 'NS-5', name: 'Saw-Cutting Slurry Containment', bmp_type: 'non-storm-water', status: 'compliant', priority: 'medium', zone: 'south', description: 'Vacuum recovery system for concrete saw-cutting operations in the south parking area. Slurry collected by wet-vac and disposed of in the concrete washout pit. No discharge to the storm drain system.', cgp_section: 'Section X.H.7.d', lat: 36.7784, lng: -119.4158, last_inspection_date: '2026-03-28T12:45:00Z', last_inspection_photo: '/images/drone/ns-05.jpg', install_date: '2026-03-15', swppp_page: 80 },
].map(cp => ({ ...cp, project_id: PROJECT_ID }));

const aiAnalyses = [
  { checkpoint_id: 'SC-1', summary: 'Silt fence along the north perimeter is intact and properly anchored. No visible undercutting, tears, or sediment overtopping detected in the drone imagery.', status: 'compliant', confidence: 95, details: ['Geotextile fabric shows no visible tears or punctures along the 820-foot run.', 'Steel T-posts remain upright and evenly spaced at approximately 6-foot intervals.', 'No sediment overtopping or bypass observed at any point along the fence line.', 'Toe burial appears intact with no signs of undercutting from recent runoff.'], cgp_reference: 'CGP Section X.H.1.a — Sediment barriers shall be properly installed, maintained, and replaced as needed to prevent sediment-laden runoff from leaving the site.' },
  { checkpoint_id: 'SC-2', summary: 'East slope reinforced silt fence is in good condition. Wire backing provides adequate structural support and no sediment bypass is visible around the end posts.', status: 'compliant', confidence: 93, details: ['Wire mesh backing is intact and providing adequate structural reinforcement.', 'Fabric is taut with no sagging or billowing sections detected.', 'End posts are properly wrapped to prevent bypass at fence terminations.', 'Accumulated sediment on the upslope side is below 30% of fence height.'], cgp_reference: 'CGP Section X.H.1.a — Sediment barriers must be inspected and maintained to ensure continued effectiveness.' },
  { checkpoint_id: 'SC-3', summary: 'Sediment basin at the southwest outfall shows two critical issues: the outlet riser pipe is partially blocked with woody debris, and accumulated sediment has exceeded the 50% depth marker, indicating cleanout is overdue.', status: 'deficient', confidence: 88, details: ['Outlet riser pipe is approximately 40% obstructed with branches and construction debris.', 'Sediment accumulation depth exceeds the 50% design storage marker painted on the basin wall.', 'Emergency spillway is currently unobstructed but sediment is within 8 inches of the spillway invert.', 'Perforated decant holes on the lower section of the riser are fully buried in sediment.', 'Basin perimeter embankment appears stable with no signs of erosion or piping.'], cgp_reference: 'CGP Section X.H.2.b — Sediment basins must be cleaned out when sediment accumulation reaches 50% of the design storage capacity. Outlet structures shall be maintained free of obstructions.', recommendations: ['Immediately remove debris from the outlet riser pipe to restore full discharge capacity.', 'Schedule sediment cleanout to return basin to design capacity within 72 hours.', 'Verify discharge rates post-cleanout meet design specifications.', 'Install a debris rack upstream of the riser pipe to prevent future blockage.'] },
  { checkpoint_id: 'SC-4', summary: 'Fiber rolls in grading area B are well-positioned along contour lines and effectively trapping sediment. Stakes are in place and rolls show normal sediment loading.', status: 'compliant', confidence: 91, details: ['Fiber rolls are aligned along contour lines at approximately 15-foot intervals.', 'Wooden stakes are holding rolls firmly in contact with the ground surface.', 'Sediment accumulation on the upslope side is moderate and within acceptable limits.', 'No visible gaps or displacement from recent runoff events.'], cgp_reference: 'CGP Section X.H.1.c — Fiber rolls shall be installed along contour lines and maintained in contact with the soil surface.' },
  { checkpoint_id: 'SC-5', summary: 'Storm drain inlet SD-1 protection is functioning as designed. Gravel bags are properly stacked and filter fabric shows no signs of failure or bypass.', status: 'compliant', confidence: 96, details: ['Gravel bags stacked two courses high with tight joints between bags.', 'Non-woven geotextile fabric liner is intact and covering the inlet grate.', 'No sediment bypass observed around the perimeter of the protection.', 'Ponding area upstream of the protection appears to be draining as intended.'], cgp_reference: 'CGP Section X.H.1.f — Storm drain inlet protection shall prevent sediment from entering the storm drain system while allowing flow to pass through.' },
  { checkpoint_id: 'SC-6', summary: 'Manufactured drop-inlet filter at SD-2 is properly seated and functional. Flow-through capacity appears unimpeded and the filter media shows acceptable sediment loading.', status: 'compliant', confidence: 94, details: ['Dandy Bag filter is properly seated in the inlet frame with no gaps.', 'Filter media shows moderate sediment loading but remains permeable.', 'No standing water observed above the filter, indicating adequate flow-through.', 'Lifting straps are accessible for maintenance and replacement.'], cgp_reference: 'CGP Section X.H.1.f — Inlet protection devices must be maintained to ensure sediment capture without causing flooding.' },
  { checkpoint_id: 'SC-7', summary: 'Northwest corner sediment trap is in good condition. Riprap outlet is clean and geotextile underliner is visible and intact around the perimeter.', status: 'compliant', confidence: 92, details: ['Rock-lined sediment trap is collecting runoff effectively from the excavation area.', 'Riprap outlet stones are in place with no displacement.', 'Geotextile underliner is visible and intact at the trap perimeter.', 'Sediment accumulation is approximately 25% of capacity.'], cgp_reference: 'CGP Section X.H.2.a — Sediment traps shall be maintained and cleaned out when sediment reaches 50% of the design depth.' },
  { checkpoint_id: 'SC-8', summary: 'South perimeter coconut coir fiber rolls are secure and performing well. Good ground contact maintained along the full length of the installation.', status: 'compliant', confidence: 90, details: ['Coconut coir rolls maintain firm ground contact along the southern boundary.', 'Wooden stakes are intact at 4-foot intervals with no leaning or displacement.', 'Moderate sediment accumulation on the upslope side indicates effective trapping.', 'No visible gaps between adjacent rolls at splice points.'], cgp_reference: 'CGP Section X.H.1.c — Fiber rolls shall be staked and maintained in continuous contact with the ground surface.' },
  { checkpoint_id: 'EC-1', summary: 'Hydroseed application on the west slope shows good germination coverage at approximately 80%. Mulch layer is intact and providing effective erosion protection.', status: 'compliant', confidence: 89, details: ['Germination coverage estimated at 80% with consistent grass stand density.', 'Wood fiber mulch layer remains visible between emerging vegetation.', 'No rill or gully erosion visible on the 2.5:1 slope surface.', 'Tackifier appears to be holding mulch in place despite recent wind events.'], cgp_reference: 'CGP Section X.H.3.a — Vegetative cover shall achieve 70% or greater coverage to be considered effective erosion control.' },
  { checkpoint_id: 'EC-2', summary: 'Erosion control blanket in drainage channel A is well-secured and showing no displacement. Staple pattern is holding and blanket edges are properly overlapped.', status: 'compliant', confidence: 94, details: ['Straw-coconut blanket is intact across the full 3,200 sq ft channel area.', 'U-shaped staples are holding at the 3-foot grid pattern.', 'Longitudinal overlaps are shingled in the direction of flow.', 'No undermining or uplift at blanket edges along channel banks.', 'Vegetation is beginning to establish through the blanket openings.'], cgp_reference: 'CGP Section X.H.3.b — Erosion control blankets shall be installed per manufacturer specifications and maintained until vegetation is established.' },
  { checkpoint_id: 'EC-3', summary: 'Soil binder application on the exposed building pad is performing well. Surface crusting is intact with no visible wind or water erosion damage.', status: 'compliant', confidence: 87, details: ['Polymer soil binder crust is intact across the 2.1-acre pad area.', 'No visible dust generation or surface erosion in the drone imagery.', 'Tire tracks from equipment show only minor surface disruption.', 'Last application was approximately 18 days ago; re-application due in 12 days.'], cgp_reference: 'CGP Section X.H.3.c — Chemical stabilizers shall be applied and reapplied per manufacturer recommendations to maintain effective soil stabilization.' },
  { checkpoint_id: 'EC-4', summary: 'Slope drain on the north cut is properly secured and conveying flow without leakage. Anchor bags are in place and the pipe shows no damage or displacement.', status: 'compliant', confidence: 93, details: ['Corrugated polyethylene pipe is intact with no visible cracks or separations.', 'Gravel-filled anchor bags are in position at the top and along the pipe run.', 'Energy dissipation at the pipe outlet appears functional.', 'No side leakage or erosion around the pipe inlet observed.'], cgp_reference: 'CGP Section X.H.3.d — Slope drains shall be securely anchored and maintained to prevent concentrated erosion on slopes.' },
  { checkpoint_id: 'EC-5', summary: 'Hydroseed on the south berm shows inconsistent germination with bare patches covering approximately 30% of the treated area. Coverage may be below the 70% threshold. On-site verification recommended.', status: 'needs-review', confidence: 76, details: ['Germination coverage is inconsistent, estimated at 55-70% from aerial imagery.', 'Several bare patches of 4-6 sq ft detected on the berm crown and south face.', 'Possible foot traffic damage visible as linear bare areas along the berm top.', 'Mulch layer appears thin or absent in the bare patches.', 'AI confidence is reduced due to image resolution limitations on this slope angle.'], cgp_reference: 'CGP Section X.H.3.a — Vegetative cover shall achieve 70% or greater coverage. Areas below threshold require re-application or supplemental erosion control.', recommendations: ['Conduct field walkdown to verify actual germination percentage.', 'If below 70% coverage, re-apply hydroseed to bare patches within 14 days.', 'Install temporary fiber rolls along berm crown to prevent further foot traffic damage.', 'Consider signage or barrier tape to redirect pedestrian traffic away from the treated area.'] },
  { checkpoint_id: 'EC-6', summary: 'Excelsior erosion control blanket on the detention basin slopes is intact and properly installed. Early vegetation establishment is visible through the blanket matrix.', status: 'compliant', confidence: 91, details: ['Excelsior blanket is intact on all interior basin slopes.', 'Staples are holding at 2-foot spacing on the steeper sections.', 'Photodegradable netting is still intact, providing structural support.', 'Early grass shoots are visible growing through the blanket matrix.'], cgp_reference: 'CGP Section X.H.3.b — Erosion control blankets in permanent features shall be maintained until target vegetation density is achieved.' },
  { checkpoint_id: 'EC-7', summary: 'Geotextile cover on the utility trench backfill is in place and secured by sandbags. No exposed soil or wind displacement detected.', status: 'compliant', confidence: 88, details: ['Non-woven geotextile fabric is covering the trench backfill area completely.', 'Sandbag weights are in place at approximately 8-foot intervals.', 'No wind displacement or flapping observed in the drone imagery.', 'Fabric edges overlap adjacent paving by a minimum of 12 inches.'], cgp_reference: 'CGP Section X.H.3.e — Temporary soil covers shall be secured to prevent wind displacement and shall cover all exposed soil.' },
  { checkpoint_id: 'TC-1', summary: 'Main construction entrance on Riverside Blvd is in good condition. Aggregate pad is thick and clean, and the rumble strip grate appears functional.', status: 'compliant', confidence: 95, details: ['Aggregate pad extends the full 50-foot length and 24-foot width.', 'Clean angular rock layer appears to be at adequate thickness.', 'Rumble strip grate at the exit point is in place and free of debris.', 'No visible sediment tracking on the adjacent public road surface.', 'Geotextile fabric is not visible, indicating adequate aggregate depth.'], cgp_reference: 'CGP Section X.H.4.a — Stabilized construction entrance/exit shall prevent tracking of sediment onto public roads.' },
  { checkpoint_id: 'TC-2', summary: 'Tire wash station at the secondary exit may be non-operational. Water supply hose appears disconnected in aerial imagery and the recirculation basin shows elevated sediment. Field verification needed.', status: 'needs-review', confidence: 78, details: ['Water supply hose appears to be disconnected or coiled near the wash rack.', 'Recirculation basin shows turbid water with visible sediment accumulation.', 'Tire wash rack grate is in place but may not be receiving water flow.', 'Some sediment tracking visible on the paved surface beyond the exit point.', 'AI confidence limited by aerial viewing angle of the wash station components.'], cgp_reference: 'CGP Section X.H.4.b — Tire wash facilities shall be maintained in operational condition and the sediment collection system shall be cleaned regularly.', recommendations: ['Verify water supply connection and test wash rack operation.', 'Clean recirculation basin and check pump function.', 'Sweep sediment tracking from the paved exit area.', 'Consider switching to the main gate until the wash station is restored.'] },
  { checkpoint_id: 'TC-3', summary: 'Riverside Blvd frontage is clean with no visible sediment tracking. Street sweeping records and visual conditions indicate compliance.', status: 'compliant', confidence: 97, details: ['No visible sediment, mud, or debris on Riverside Blvd frontage road.', 'Curb and gutter area is clean with no accumulated soil.', 'Road surface shows recent sweeping marks indicating recent maintenance.'], cgp_reference: 'CGP Section X.H.4.c — Public streets adjacent to the site shall be swept as needed to prevent sediment accumulation.' },
  { checkpoint_id: 'TC-4', summary: 'North service road construction exit aggregate pad is in good condition. Cattle guard grate is functional and no significant tracking observed on the service road.', status: 'compliant', confidence: 92, details: ['Aggregate pad is intact and extends the full 40-foot length.', 'Cattle guard grate is level and free of debris.', 'No significant sediment tracking visible on the north service road.', 'Pad thickness appears adequate with clean rock surface.'], cgp_reference: 'CGP Section X.H.4.a — All points of construction traffic egress shall be stabilized to prevent sediment tracking.' },
  { checkpoint_id: 'WE-1', summary: 'Dust conditions in the central pad area appear dry during the afternoon capture window. Surface moisture content looks low and some visible dust plumes were detected near the active grading zone. Watering schedule compliance needs field verification.', status: 'needs-review', confidence: 75, details: ['Surface appears dry in the central grading area during the afternoon drone pass.', 'Minor dust plume visible near active equipment operations at the northeast corner.', 'No water truck visible in the imagery during the 11:30 AM capture.', 'Morning passes showed adequately moist soil surfaces.', 'Ambient wind at time of capture was 8 mph from the NW, below the 25-mph threshold.'], cgp_reference: 'CGP Section X.H.5.a — Water or other dust suppressants shall be applied to exposed soil surfaces as needed to prevent visible dust emissions.', recommendations: ['Verify water truck is completing all three scheduled afternoon passes.', 'Review watering log for the past 7 days to check schedule compliance.', 'Consider increasing watering frequency during periods of low humidity and wind.', 'Install a visible dust monitoring flag or windsock to help operators gauge conditions.'] },
  { checkpoint_id: 'WE-2', summary: 'Wind fencing along the west property line is intact and properly tensioned. No damage or displacement from recent wind events.', status: 'compliant', confidence: 90, details: ['Polypropylene wind fence fabric is taut with no tears or sagging.', 'Steel posts appear plumb and evenly spaced at 10-foot intervals.', 'Fence height is consistent at approximately 6 feet.', 'No debris accumulation against the fence that would impede airflow.'], cgp_reference: 'CGP Section X.H.5.b — Wind barriers shall be installed and maintained as needed to reduce wind erosion on exposed soil areas.' },
  { checkpoint_id: 'WE-3', summary: 'Portable wind screen panels around the stockpile area are in place and providing 360-degree coverage. Weighted bases appear stable.', status: 'compliant', confidence: 89, details: ['All wind screen panels are upright and connected in a continuous perimeter.', 'Weighted bases appear stable with no tipping or shifting visible.', 'Panel height of 8 feet provides adequate coverage for the stockpile.', 'No gaps between panels that would allow wind-driven erosion.'], cgp_reference: 'CGP Section X.H.5.b — Stockpiled materials shall be protected from wind erosion using covers, barriers, or other effective measures.' },
  { checkpoint_id: 'MM-1', summary: 'Primary concrete washout pit is properly lined and at approximately 30% capacity. No visible leaks or overflow, and the pit perimeter is clearly delineated with signage.', status: 'compliant', confidence: 94, details: ['Polyethylene liner is visible and appears intact with no punctures.', 'Washout pit is at approximately 30% capacity with scheduled cleanout this week.', 'Perimeter signage ("Concrete Washout Only") is visible in the imagery.', 'No evidence of washout material outside the contained area.', 'Access for cleanout equipment is clear on the north side.'], cgp_reference: 'CGP Section X.H.6.a — Concrete washout areas shall be lined and maintained to prevent discharge of wash water to the storm drain system.' },
  { checkpoint_id: 'MM-2', summary: 'Fuel storage area in the north equipment yard shows proper containment and safety measures. Double-walled tank and secondary containment berm appear intact.', status: 'compliant', confidence: 96, details: ['Double-walled diesel storage tank appears intact with no visible staining.', 'Secondary containment berm is intact with no cracks or gaps.', 'Impervious concrete pad shows no fuel staining or spill evidence.', 'SPCC signage is posted and visible from the access approach.', 'Spill kit station is visible adjacent to the tank.'], cgp_reference: 'CGP Section X.H.6.b — Fuel and oil storage shall include secondary containment capable of holding 110% of the largest container volume.' },
  { checkpoint_id: 'MM-3', summary: 'Paint and solvent storage area near Building C is properly housed in a covered, bermed staging area. Storage cabinet is visible and the area appears well-organized.', status: 'compliant', confidence: 90, details: ['Flammable materials cabinet is visible under the covered staging area.', 'Bermed containment area shows no spills or staining.', 'Cover structure provides rain protection for the storage area.', 'Area appears organized with no loose containers visible outside the cabinet.'], cgp_reference: 'CGP Section X.H.6.c — Paints, solvents, and other liquid materials shall be stored in covered areas with secondary containment.' },
  { checkpoint_id: 'MM-4', summary: 'Secondary concrete washout near the west retaining wall is overflowing. Wash water has pooled on the surrounding soil surface approximately 8-10 feet beyond the containment boundary, creating a potential discharge pathway to the storm drain.', status: 'deficient', confidence: 86, details: ['Steel washout container is visibly full with wash water at or above the rim.', 'Pooled wash water detected on the ground surface extending 8-10 feet south of the container.', 'Alkaline wash water staining visible on adjacent soil, indicating repeated overflow.', 'No secondary containment berm around the prefabricated container.', 'Overflow pathway trends toward the storm drain inlet approximately 60 feet downslope.'], cgp_reference: 'CGP Section X.H.6.a — Concrete washout facilities must be maintained to prevent overflow and discharge of high-pH wash water. Washout shall be cleaned when 75% full.', recommendations: ['Immediately pump out the washout container to restore capacity.', 'Clean up pooled wash water from the surrounding soil surface.', 'Install a temporary containment berm (sandbags or earthen) around the container.', 'Increase cleanout frequency to prevent future overflows.', 'Consider upsizing to a larger washout facility given the volume of west wall pours.'] },
  { checkpoint_id: 'MM-5', summary: 'Import fill stockpile is properly contained with perimeter silt fence and fiber rolls. Polyethylene cover is in place and anchored.', status: 'compliant', confidence: 91, details: ['Silt fence is intact around the full stockpile perimeter.', 'Fiber rolls provide secondary sediment containment.', 'Polyethylene sheeting is covering the stockpile and anchored with sandbags.', 'No erosion rills or washout visible at the stockpile base.'], cgp_reference: 'CGP Section X.H.6.d — Stockpiled materials shall be protected from erosion and sediment transport using appropriate BMPs.' },
  { checkpoint_id: 'MM-6', summary: 'Hazmat spill kit station in the main yard is visible, accessible, and appears to be fully stocked based on the external condition of the cabinet.', status: 'compliant', confidence: 86, details: ['Spill response cabinet is visible and appears to be in good condition.', 'Emergency contact information placard is posted on the cabinet.', 'Cabinet location is accessible from the main equipment parking area.', 'No evidence of recent spill response use (clean surrounding area).'], cgp_reference: 'CGP Section X.H.6.e — Spill prevention and response materials shall be available on-site at all times.' },
  { checkpoint_id: 'MM-7', summary: 'Aggregate base stockpile is contained with fiber rolls and appears stable. Self-draining material does not require cover per SWPPP specifications.', status: 'compliant', confidence: 93, details: ['Fiber rolls are in place around the stockpile perimeter.', 'Aggregate material appears clean and free of fines.', 'No sediment runoff visible from the stockpile base.', 'Stockpile height and slope appear stable with no sloughing.'], cgp_reference: 'CGP Section X.H.6.d — Non-erodible stockpiled materials (e.g., aggregate) may be exempt from cover requirements if contained by perimeter controls.' },
  { checkpoint_id: 'NS-1', summary: 'Foundation dewatering system for Building A is operating properly. Baker tank and weir tank are visible and discharge to the sediment basin appears controlled.', status: 'compliant', confidence: 92, details: ['Submersible pump is operational with discharge hose connected to the Baker tank.', 'Baker tank (21,000 gal) is upright and appears to have adequate settling capacity.', 'Weir tank discharge to the sediment basin is visible with controlled flow.', 'No turbid discharge visible at the sediment basin discharge point.', 'Continuous turbidity monitor housing is visible at the discharge point.'], cgp_reference: 'CGP Section X.H.7.a — Construction dewatering discharges shall be treated to remove pollutants prior to discharge and shall not cause erosion.' },
  { checkpoint_id: 'NS-2', summary: 'Utility trench dewatering at NS-2 shows turbid discharge downstream of the filter bag system. Turbidity readings from the most recent sampling exceeded 250 NTU, indicating the filter bag system is not providing adequate treatment.', status: 'deficient', confidence: 82, details: ['Pump is discharging groundwater through a filter bag system as designed.', 'Visible turbidity in the discharge water downstream of the filter bags.', 'Filter bag fabric appears clogged or saturated, reducing filtration effectiveness.', 'Last sampling event recorded 280 NTU, exceeding the 250 NTU discharge limit.', 'Discharge pooling area shows turbid standing water approximately 15 feet from the bags.'], cgp_reference: 'CGP Section X.H.7.a — Non-storm water discharges from dewatering activities shall not exceed numeric effluent limitations for turbidity.', recommendations: ['Immediately replace saturated filter bags with new bags.', 'Add a secondary treatment step such as a chitosan-enhanced flocculation system.', 'Increase sampling frequency to every 4 hours until turbidity is consistently below 250 NTU.', 'Consider routing dewatering discharge through the Baker tank treatment system at NS-1.', 'Document all corrective actions in the SWPPP amendment log.'] },
  { checkpoint_id: 'NS-3', summary: 'Potable water management for irrigation testing is properly contained. Flex hose routing to the vegetated infiltration area is visible and no direct discharge to storm drains detected.', status: 'compliant', confidence: 88, details: ['Flex hose is routed from the irrigation test zone to the vegetated area.', 'No pooling or runoff visible on paved surfaces near the irrigation test.', 'Vegetated infiltration area shows moist conditions indicating proper discharge routing.', 'No direct connection to the storm drain system observed.'], cgp_reference: 'CGP Section X.H.7.b — Potable water discharges shall be routed to prevent erosion and shall not discharge to the storm drain system without treatment.' },
  { checkpoint_id: 'NS-4', summary: 'Equipment wash-down area in the north yard is properly bermed and draining to the holding tank. Oil-water separator appears functional.', status: 'compliant', confidence: 91, details: ['Bermed containment pad is intact with no visible cracks or gaps.', 'Oil-water separator is in place between the wash pad and holding tank.', 'No wash water observed outside the bermed area.', 'Holding tank appears to have adequate remaining capacity.'], cgp_reference: 'CGP Section X.H.7.c — Vehicle and equipment wash water shall be contained, treated, and properly disposed of. No discharge to the storm drain system.' },
  { checkpoint_id: 'NS-5', summary: 'Saw-cutting slurry containment using vacuum recovery is effective. No visible slurry on paved surfaces and the disposal connection to the concrete washout is functional.', status: 'compliant', confidence: 89, details: ['Vacuum recovery unit is present at the saw-cutting operation area.', 'No visible slurry residue on the paved surface beyond the immediate work zone.', 'Slurry transfer hose to the concrete washout pit is connected.', 'Work area is clean with no evidence of slurry discharge to the storm drain.'], cgp_reference: 'CGP Section X.H.7.d — Saw-cutting slurry and grinding residue shall be collected and properly disposed of. No discharge to the storm drain system.' },
];

const deficiencies = [
  { id: 'DEF-001', checkpoint_id: 'SC-3', project_id: PROJECT_ID, detected_date: '2026-03-28T14:23:00Z', description: 'Sediment basin SC-3 outlet structure is partially blocked with debris, reducing discharge capacity by approximately 40%. Accumulated sediment has exceeded the 50% depth marker, requiring cleanout. The perforated decant holes on the lower section of the riser pipe are fully buried, and the emergency spillway is within 8 inches of being engaged.', cgp_violation: 'Section X.H.2.b — Sediment Basin Maintenance', corrective_action: 'Remove debris from outlet structure, perform sediment cleanout to restore basin to design capacity. Verify discharge rates meet design specifications. Install upstream debris rack to prevent future blockage. Document pre- and post-cleanout basin depth measurements.', deadline: '2026-03-31T14:23:00Z', status: 'open' },
  { id: 'DEF-002', checkpoint_id: 'MM-4', project_id: PROJECT_ID, detected_date: '2026-03-28T14:45:00Z', description: 'Secondary concrete washout container (MM-4) near the west retaining wall is overflowing. High-pH wash water has pooled on the surrounding soil surface approximately 8-10 feet beyond the containment boundary. Alkaline staining on adjacent soil indicates this has occurred multiple times. The overflow creates a potential discharge pathway to storm drain inlet SD-2 located approximately 60 feet downslope.', cgp_violation: 'Section X.H.6.a — Concrete Washout Containment', corrective_action: 'Immediately pump out the washout container to restore capacity. Clean up pooled wash water from the surrounding ground surface using vacuum truck or absorbent material. Install a temporary containment berm (sandbags) around the container perimeter. Increase cleanout frequency to prevent future overflows. Evaluate whether a larger washout facility is needed for the ongoing west wall pours.', deadline: '2026-03-30T14:45:00Z', status: 'open' },
  { id: 'DEF-003', checkpoint_id: 'NS-2', project_id: PROJECT_ID, detected_date: '2026-03-28T15:10:00Z', description: 'Dewatering discharge from the sanitary sewer trench excavation at NS-2 exceeded the numeric effluent limitation for turbidity. The most recent grab sample recorded 280 NTU, which exceeds the 250 NTU threshold established in the project SWPPP and CGP discharge requirements. The filter bag system appears clogged with fine-grained soils, reducing filtration effectiveness. Turbid standing water observed approximately 15 feet downstream of the filter bags.', cgp_violation: 'Section X.H.7.a — Non-Storm Water Discharge Limits', corrective_action: 'Immediately cease dewatering discharge until turbidity can be brought into compliance. Replace saturated filter bags with new units. Add a secondary treatment step such as a chitosan-enhanced flocculation system or route discharge through the Baker tank treatment train at NS-1. Increase sampling frequency to every 4 hours until three consecutive readings are below 250 NTU. Document all corrective actions and sampling results in the SWPPP amendment log.', deadline: '2026-03-30T15:10:00Z', status: 'open' },
];

const droneMissions = [
  {
    id: 'MISSION-001',
    project_id: PROJECT_ID,
    name: 'Alpha Survey — Full Site',
    status: 'completed',
    date: '2026-03-28',
    inspection_type: 'routine',
    flight_time_minutes: 42,
    altitude: 120,
    battery_start: 78,
    battery_end: 24,
    weather_temperature: 68,
    weather_condition: 'clear',
    weather_wind_speed_mph: 6,
    weather_humidity: 42,
    flight_path: [[-119.4165,36.7819],[-119.4170,36.7822],[-119.4175,36.7824],[-119.4180,36.7825],[-119.4185,36.7824],[-119.4188,36.7822],[-119.4190,36.7820],[-119.4192,36.7818],[-119.4192,36.7815],[-119.4190,36.7812],[-119.4188,36.7808],[-119.4186,36.7805],[-119.4182,36.7805],[-119.4178,36.7806],[-119.4174,36.7806],[-119.4170,36.7805],[-119.4165,36.7805],[-119.4160,36.7806],[-119.4155,36.7808],[-119.4150,36.7808],[-119.4145,36.7808],[-119.4140,36.7808],[-119.4140,36.7805],[-119.4141,36.7802],[-119.4142,36.7800],[-119.4148,36.7800],[-119.4152,36.7801],[-119.4158,36.7800],[-119.4162,36.7800],[-119.4168,36.7799],[-119.4172,36.7798],[-119.4178,36.7797],[-119.4182,36.7796],[-119.4186,36.7795],[-119.4185,36.7792],[-119.4184,36.7790],[-119.4182,36.7788],[-119.4178,36.7787],[-119.4172,36.7786],[-119.4168,36.7785],[-119.4162,36.7785],[-119.4158,36.7784],[-119.4152,36.7784],[-119.4148,36.7783],[-119.4143,36.7783],[-119.4145,36.7781],[-119.4150,36.7780],[-119.4158,36.7780],[-119.4165,36.7780],[-119.4172,36.7781],[-119.4178,36.7782],[-119.4175,36.7790],[-119.4170,36.7800],[-119.4165,36.7810],[-119.4165,36.7819]],
  },
];

const waypoints = [
  { mission_id: 'MISSION-001', checkpoint_id: 'SC-1', number: 1, lat: 36.7825, lng: -119.4170, capture_status: 'captured', arrival_time: '2026-03-28T08:47:00Z', photo: '/images/drone/sc-01.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'SC-2', number: 2, lat: 36.7808, lng: -119.4140, capture_status: 'captured', arrival_time: '2026-03-28T08:48:30Z', photo: '/images/drone/sc-02.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'SC-3', number: 3, lat: 36.7782, lng: -119.4178, capture_status: 'captured', arrival_time: '2026-03-28T08:50:15Z', photo: '/images/drone/sc-03.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'SC-4', number: 4, lat: 36.7800, lng: -119.4158, capture_status: 'captured', arrival_time: '2026-03-28T08:52:00Z', photo: '/images/drone/sc-04.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'SC-5', number: 5, lat: 36.7812, lng: -119.4142, capture_status: 'captured', arrival_time: '2026-03-28T08:53:30Z', photo: '/images/drone/sc-05.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'SC-6', number: 6, lat: 36.7785, lng: -119.4155, capture_status: 'captured', arrival_time: '2026-03-28T08:55:00Z', photo: '/images/drone/sc-06.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'SC-7', number: 7, lat: 36.7822, lng: -119.4185, capture_status: 'captured', arrival_time: '2026-03-28T08:56:45Z', photo: '/images/drone/sc-07.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'SC-8', number: 8, lat: 36.7780, lng: -119.4162, capture_status: 'captured', arrival_time: '2026-03-28T08:58:15Z', photo: '/images/drone/sc-08.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'EC-1', number: 9, lat: 36.7805, lng: -119.4188, capture_status: 'captured', arrival_time: '2026-03-28T09:00:00Z', photo: '/images/drone/ec-01.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'EC-2', number: 10, lat: 36.7798, lng: -119.4165, capture_status: 'captured', arrival_time: '2026-03-28T09:01:30Z', photo: '/images/drone/ec-02.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'EC-3', number: 11, lat: 36.7802, lng: -119.4152, capture_status: 'captured', arrival_time: '2026-03-28T09:03:00Z', photo: '/images/drone/ec-03.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'EC-4', number: 12, lat: 36.7820, lng: -119.4160, capture_status: 'captured', arrival_time: '2026-03-28T09:04:30Z', photo: '/images/drone/ec-04.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'EC-5', number: 13, lat: 36.7783, lng: -119.4168, capture_status: 'captured', arrival_time: '2026-03-28T09:06:00Z', photo: '/images/drone/ec-05.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'EC-6', number: 14, lat: 36.7795, lng: -119.4182, capture_status: 'captured', arrival_time: '2026-03-28T09:07:30Z', photo: '/images/drone/ec-06.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'EC-7', number: 15, lat: 36.7810, lng: -119.4145, capture_status: 'captured', arrival_time: '2026-03-28T09:09:00Z', photo: '/images/drone/ec-07.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'TC-1', number: 16, lat: 36.7806, lng: -119.4140, capture_status: 'captured', arrival_time: '2026-03-28T09:10:30Z', photo: '/images/drone/tc-01.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'TC-2', number: 17, lat: 36.7781, lng: -119.4150, capture_status: 'captured', arrival_time: '2026-03-28T09:12:00Z', photo: '/images/drone/tc-02.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'TC-3', number: 18, lat: 36.7808, lng: -119.4138, capture_status: 'captured', arrival_time: '2026-03-28T09:13:15Z', photo: '/images/drone/tc-03.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'TC-4', number: 19, lat: 36.7824, lng: -119.4158, capture_status: 'captured', arrival_time: '2026-03-28T09:14:45Z', photo: '/images/drone/tc-04.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'WE-1', number: 20, lat: 36.7801, lng: -119.4161, capture_status: 'captured', arrival_time: '2026-03-28T09:16:00Z', photo: '/images/drone/we-01.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'WE-2', number: 21, lat: 36.7800, lng: -119.4192, capture_status: 'captured', arrival_time: '2026-03-28T09:17:30Z', photo: '/images/drone/we-02.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'WE-3', number: 22, lat: 36.7818, lng: -119.4172, capture_status: 'captured', arrival_time: '2026-03-28T09:18:45Z', photo: '/images/drone/we-03.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'MM-1', number: 23, lat: 36.7803, lng: -119.4148, capture_status: 'captured', arrival_time: '2026-03-28T09:20:00Z', photo: '/images/drone/mm-01.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'MM-2', number: 24, lat: 36.7819, lng: -119.4165, capture_status: 'captured', arrival_time: '2026-03-28T09:21:15Z', photo: '/images/drone/mm-02.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'MM-3', number: 25, lat: 36.7810, lng: -119.4148, capture_status: 'captured', arrival_time: '2026-03-28T09:22:30Z', photo: '/images/drone/mm-03.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'MM-4', number: 26, lat: 36.7796, lng: -119.4180, capture_status: 'captured', arrival_time: '2026-03-28T09:23:45Z', photo: '/images/drone/mm-04.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'MM-5', number: 27, lat: 36.7821, lng: -119.4175, capture_status: 'captured', arrival_time: '2026-03-28T09:25:00Z', photo: '/images/drone/mm-05.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'MM-6', number: 28, lat: 36.7804, lng: -119.4155, capture_status: 'captured', arrival_time: '2026-03-28T09:26:00Z', photo: '/images/drone/mm-06.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'MM-7', number: 29, lat: 36.7816, lng: -119.4168, capture_status: 'captured', arrival_time: '2026-03-28T09:27:00Z', photo: '/images/drone/mm-07.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'NS-1', number: 30, lat: 36.7799, lng: -119.4160, capture_status: 'captured', arrival_time: '2026-03-28T09:28:15Z', photo: '/images/drone/ns-01.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'NS-2', number: 31, lat: 36.7807, lng: -119.4143, capture_status: 'captured', arrival_time: '2026-03-28T09:29:30Z', photo: '/images/drone/ns-02.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'NS-3', number: 32, lat: 36.7794, lng: -119.4185, capture_status: 'captured', arrival_time: '2026-03-28T09:30:45Z', photo: '/images/drone/ns-03.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'NS-4', number: 33, lat: 36.7817, lng: -119.4162, capture_status: 'captured', arrival_time: '2026-03-28T09:32:00Z', photo: '/images/drone/ns-04.jpg' },
  { mission_id: 'MISSION-001', checkpoint_id: 'NS-5', number: 34, lat: 36.7784, lng: -119.4158, capture_status: 'captured', arrival_time: '2026-03-28T09:33:15Z', photo: '/images/drone/ns-05.jpg' },
];

const inspections = [
  { id: 'INS-001', project_id: PROJECT_ID, date: '2026-01-30T09:00:00Z', type: 'routine', inspector: 'Sarah Chen, QSP-4521', weather_temperature: 55, weather_condition: 'clear', weather_wind_speed_mph: 5, weather_humidity: 52, overall_compliance: 100, mission_id: null },
  { id: 'INS-002', project_id: PROJECT_ID, date: '2026-02-09T16:00:00Z', type: 'pre-storm', inspector: 'Sarah Chen, QSP-4521', weather_temperature: 58, weather_condition: 'cloudy', weather_wind_speed_mph: 12, weather_humidity: 68, overall_compliance: 100, mission_id: null },
  { id: 'INS-003', project_id: PROJECT_ID, date: '2026-02-12T10:00:00Z', type: 'post-storm', inspector: 'Sarah Chen, QSP-4521', weather_temperature: 52, weather_condition: 'partly-cloudy', weather_wind_speed_mph: 8, weather_humidity: 72, overall_compliance: 94, mission_id: null },
  { id: 'INS-004', project_id: PROJECT_ID, date: '2026-03-13T09:00:00Z', type: 'routine', inspector: 'Sarah Chen, QSP-4521', weather_temperature: 64, weather_condition: 'clear', weather_wind_speed_mph: 4, weather_humidity: 40, overall_compliance: 100, mission_id: null },
  { id: 'INS-005', project_id: PROJECT_ID, date: '2026-03-28T08:45:00Z', type: 'routine', inspector: 'Sarah Chen, QSP-4521 (AI-Assisted Drone Survey)', weather_temperature: 68, weather_condition: 'clear', weather_wind_speed_mph: 6, weather_humidity: 42, overall_compliance: 82, mission_id: 'MISSION-001' },
];

const inspectionFindings = [
  // INS-001
  { inspection_id: 'INS-001', checkpoint_id: 'SC-1', status: 'compliant', notes: 'Silt fence intact, no sediment overtopping.' },
  { inspection_id: 'INS-001', checkpoint_id: 'SC-2', status: 'compliant', notes: 'Wire-backed fence in good condition.' },
  { inspection_id: 'INS-001', checkpoint_id: 'SC-3', status: 'compliant', notes: 'Sediment basin at 20% capacity. Outlet clear.' },
  { inspection_id: 'INS-001', checkpoint_id: 'SC-4', status: 'compliant', notes: 'Fiber rolls properly staked.' },
  { inspection_id: 'INS-001', checkpoint_id: 'SC-5', status: 'compliant', notes: 'Gravel bags intact at SD-1.' },
  { inspection_id: 'INS-001', checkpoint_id: 'SC-6', status: 'compliant', notes: 'Drop-inlet filter seated properly.' },
  { inspection_id: 'INS-001', checkpoint_id: 'SC-7', status: 'compliant', notes: 'Sediment trap at 15% capacity.' },
  { inspection_id: 'INS-001', checkpoint_id: 'SC-8', status: 'compliant', notes: 'Coir rolls in ground contact.' },
  { inspection_id: 'INS-001', checkpoint_id: 'EC-1', status: 'compliant', notes: 'Hydroseed germination progressing at 40%.' },
  { inspection_id: 'INS-001', checkpoint_id: 'EC-2', status: 'compliant', notes: 'Erosion blanket stapled securely.' },
  { inspection_id: 'INS-001', checkpoint_id: 'EC-4', status: 'compliant', notes: 'Slope drain anchored, no leaks.' },
  { inspection_id: 'INS-001', checkpoint_id: 'TC-1', status: 'compliant', notes: 'Construction entrance aggregate clean.' },
  { inspection_id: 'INS-001', checkpoint_id: 'TC-3', status: 'compliant', notes: 'Street sweeping current, no tracking.' },
  { inspection_id: 'INS-001', checkpoint_id: 'TC-4', status: 'compliant', notes: 'North exit aggregate pad intact.' },
  { inspection_id: 'INS-001', checkpoint_id: 'WE-2', status: 'compliant', notes: 'Wind fence taut, no damage.' },
  { inspection_id: 'INS-001', checkpoint_id: 'MM-1', status: 'compliant', notes: 'Washout pit at 10% capacity.' },
  { inspection_id: 'INS-001', checkpoint_id: 'MM-2', status: 'compliant', notes: 'Fuel containment berm intact.' },
  { inspection_id: 'INS-001', checkpoint_id: 'MM-5', status: 'compliant', notes: 'Import stockpile covered and contained.' },
  { inspection_id: 'INS-001', checkpoint_id: 'MM-6', status: 'compliant', notes: 'Spill kit fully stocked.' },
  { inspection_id: 'INS-001', checkpoint_id: 'NS-4', status: 'compliant', notes: 'Wash-down area bermed, separator functional.' },
  // INS-002
  { inspection_id: 'INS-002', checkpoint_id: 'SC-1', status: 'compliant', notes: 'Fence secure ahead of storm.' },
  { inspection_id: 'INS-002', checkpoint_id: 'SC-2', status: 'compliant', notes: 'Wire backing holding well.' },
  { inspection_id: 'INS-002', checkpoint_id: 'SC-3', status: 'compliant', notes: 'Basin at 30% capacity, outlet clear. Adequate capacity for forecasted event.' },
  { inspection_id: 'INS-002', checkpoint_id: 'SC-5', status: 'compliant', notes: 'SD-1 inlet protection verified.' },
  { inspection_id: 'INS-002', checkpoint_id: 'SC-6', status: 'compliant', notes: 'SD-2 Dandy Bag replaced with new unit.' },
  { inspection_id: 'INS-002', checkpoint_id: 'SC-7', status: 'compliant', notes: 'Trap clean, capacity available.' },
  { inspection_id: 'INS-002', checkpoint_id: 'EC-2', status: 'compliant', notes: 'Channel blanket secure.' },
  { inspection_id: 'INS-002', checkpoint_id: 'EC-4', status: 'compliant', notes: 'Slope drain outlet functioning.' },
  { inspection_id: 'INS-002', checkpoint_id: 'TC-1', status: 'compliant', notes: 'Entrance aggregate refreshed.' },
  { inspection_id: 'INS-002', checkpoint_id: 'TC-2', status: 'compliant', notes: 'Tire wash operational, basin pumped.' },
  { inspection_id: 'INS-002', checkpoint_id: 'MM-1', status: 'compliant', notes: 'Washout pumped to 5% ahead of rain.' },
  { inspection_id: 'INS-002', checkpoint_id: 'MM-2', status: 'compliant', notes: 'Fuel tank cover secured.' },
  { inspection_id: 'INS-002', checkpoint_id: 'MM-5', status: 'compliant', notes: 'Stockpile cover weighted with extra sandbags.' },
  { inspection_id: 'INS-002', checkpoint_id: 'WE-3', status: 'compliant', notes: 'Wind panels secured for high winds.' },
  // INS-003
  { inspection_id: 'INS-003', checkpoint_id: 'SC-1', status: 'compliant', notes: 'Minor sediment accumulation at base. Fence held.' },
  { inspection_id: 'INS-003', checkpoint_id: 'SC-2', status: 'compliant', notes: 'Some sediment buildup, fence intact.' },
  { inspection_id: 'INS-003', checkpoint_id: 'SC-3', status: 'compliant', notes: 'Basin at 45% post-storm. Outlet functioned as designed. Cleanout scheduled.' },
  { inspection_id: 'INS-003', checkpoint_id: 'SC-5', status: 'needs-review', notes: 'One gravel bag displaced at SD-1. Temporary fix applied, full repair needed.' },
  { inspection_id: 'INS-003', checkpoint_id: 'SC-6', status: 'compliant', notes: 'Drop-inlet filter caught significant sediment. Replaced after inspection.' },
  { inspection_id: 'INS-003', checkpoint_id: 'SC-7', status: 'compliant', notes: 'Trap at 40% capacity post-storm.' },
  { inspection_id: 'INS-003', checkpoint_id: 'EC-2', status: 'compliant', notes: 'Blanket held through 0.78" event. Minor debris accumulation.' },
  { inspection_id: 'INS-003', checkpoint_id: 'EC-4', status: 'compliant', notes: 'Slope drain conveyed flow without issues.' },
  { inspection_id: 'INS-003', checkpoint_id: 'TC-1', status: 'compliant', notes: 'Entrance muddy but contained. Aggregate addition scheduled.' },
  { inspection_id: 'INS-003', checkpoint_id: 'MM-1', status: 'compliant', notes: 'Washout liner intact. Rainwater dilution noted.' },
  { inspection_id: 'INS-003', checkpoint_id: 'MM-5', status: 'compliant', notes: 'Cover held. Minor ponding on sheeting surface.' },
  { inspection_id: 'INS-003', checkpoint_id: 'NS-1', status: 'compliant', notes: 'Dewatering system handled storm inflow. Turbidity within limits.' },
  // INS-004 - many findings
  { inspection_id: 'INS-004', checkpoint_id: 'SC-1', status: 'compliant', notes: 'Fence in good condition post-winter.' },
  { inspection_id: 'INS-004', checkpoint_id: 'SC-2', status: 'compliant', notes: 'Wire backing intact.' },
  { inspection_id: 'INS-004', checkpoint_id: 'SC-3', status: 'compliant', notes: 'Basin cleaned out Feb 20. Currently at 15% capacity.' },
  { inspection_id: 'INS-004', checkpoint_id: 'SC-4', status: 'compliant', notes: 'Fiber rolls effective on slope.' },
  { inspection_id: 'INS-004', checkpoint_id: 'SC-5', status: 'compliant', notes: 'SD-1 protection repaired and verified.' },
  { inspection_id: 'INS-004', checkpoint_id: 'SC-6', status: 'compliant', notes: 'New filter bag installed.' },
  { inspection_id: 'INS-004', checkpoint_id: 'SC-7', status: 'compliant', notes: 'Trap at 20%, performing well.' },
  { inspection_id: 'INS-004', checkpoint_id: 'SC-8', status: 'compliant', notes: 'Coir rolls in good condition.' },
  { inspection_id: 'INS-004', checkpoint_id: 'EC-1', status: 'compliant', notes: 'Hydroseed coverage at 75%. Established.' },
  { inspection_id: 'INS-004', checkpoint_id: 'EC-2', status: 'compliant', notes: 'Blanket intact, vegetation emerging.' },
  { inspection_id: 'INS-004', checkpoint_id: 'EC-3', status: 'compliant', notes: 'Soil binder re-applied March 2.' },
  { inspection_id: 'INS-004', checkpoint_id: 'EC-4', status: 'compliant', notes: 'Slope drain secure.' },
  { inspection_id: 'INS-004', checkpoint_id: 'EC-5', status: 'compliant', notes: 'South berm hydroseed at 72%. Marginal but passing.' },
  { inspection_id: 'INS-004', checkpoint_id: 'EC-6', status: 'compliant', notes: 'Basin blanket intact with good germination.' },
  { inspection_id: 'INS-004', checkpoint_id: 'EC-7', status: 'compliant', notes: 'Geotextile cover secure on trench.' },
  { inspection_id: 'INS-004', checkpoint_id: 'TC-1', status: 'compliant', notes: 'Entrance aggregate refreshed March 1.' },
  { inspection_id: 'INS-004', checkpoint_id: 'TC-2', status: 'compliant', notes: 'Tire wash operational.' },
  { inspection_id: 'INS-004', checkpoint_id: 'TC-3', status: 'compliant', notes: 'Street sweeping current.' },
  { inspection_id: 'INS-004', checkpoint_id: 'TC-4', status: 'compliant', notes: 'North exit pad in good shape.' },
  { inspection_id: 'INS-004', checkpoint_id: 'WE-1', status: 'compliant', notes: 'Watering schedule verified. 3 passes/day.' },
  { inspection_id: 'INS-004', checkpoint_id: 'WE-2', status: 'compliant', notes: 'Wind fence intact.' },
  { inspection_id: 'INS-004', checkpoint_id: 'WE-3', status: 'compliant', notes: 'Wind panels stable.' },
  { inspection_id: 'INS-004', checkpoint_id: 'MM-1', status: 'compliant', notes: 'Washout at 20%. Scheduled cleanout next week.' },
  { inspection_id: 'INS-004', checkpoint_id: 'MM-2', status: 'compliant', notes: 'Fuel storage compliant. No staining.' },
  { inspection_id: 'INS-004', checkpoint_id: 'MM-3', status: 'compliant', notes: 'Paint storage organized, inventory current.' },
  { inspection_id: 'INS-004', checkpoint_id: 'MM-4', status: 'compliant', notes: 'Secondary washout at 40%. Operational.' },
  { inspection_id: 'INS-004', checkpoint_id: 'MM-5', status: 'compliant', notes: 'Stockpile covered and contained.' },
  { inspection_id: 'INS-004', checkpoint_id: 'MM-6', status: 'compliant', notes: 'Spill kit restocked March 10.' },
  { inspection_id: 'INS-004', checkpoint_id: 'MM-7', status: 'compliant', notes: 'Aggregate stockpile stable.' },
  { inspection_id: 'INS-004', checkpoint_id: 'NS-1', status: 'compliant', notes: 'Dewatering system operating within limits.' },
  { inspection_id: 'INS-004', checkpoint_id: 'NS-2', status: 'compliant', notes: 'Trench dewatering at 180 NTU. Compliant.' },
  { inspection_id: 'INS-004', checkpoint_id: 'NS-3', status: 'compliant', notes: 'Irrigation test water managed properly.' },
  { inspection_id: 'INS-004', checkpoint_id: 'NS-4', status: 'compliant', notes: 'Wash-down area clean.' },
  { inspection_id: 'INS-004', checkpoint_id: 'NS-5', status: 'compliant', notes: 'Saw-cutting vacuum recovery effective.' },
  // INS-005 (all 34 checkpoints)
  { inspection_id: 'INS-005', checkpoint_id: 'SC-1', status: 'compliant', notes: 'North perimeter silt fence intact. No overtopping.' },
  { inspection_id: 'INS-005', checkpoint_id: 'SC-2', status: 'compliant', notes: 'East slope fence secure with wire backing.' },
  { inspection_id: 'INS-005', checkpoint_id: 'SC-3', status: 'deficient', notes: 'Outlet blocked ~40%. Sediment above 50% marker. DEF-001 issued.' },
  { inspection_id: 'INS-005', checkpoint_id: 'SC-4', status: 'compliant', notes: 'Fiber rolls aligned and staked.' },
  { inspection_id: 'INS-005', checkpoint_id: 'SC-5', status: 'compliant', notes: 'SD-1 gravel bags stacked, fabric intact.' },
  { inspection_id: 'INS-005', checkpoint_id: 'SC-6', status: 'compliant', notes: 'SD-2 Dandy Bag seated, flow-through clear.' },
  { inspection_id: 'INS-005', checkpoint_id: 'SC-7', status: 'compliant', notes: 'NW sediment trap at 25% capacity.' },
  { inspection_id: 'INS-005', checkpoint_id: 'SC-8', status: 'compliant', notes: 'South coir rolls in ground contact.' },
  { inspection_id: 'INS-005', checkpoint_id: 'EC-1', status: 'compliant', notes: 'West slope hydroseed at 80% coverage.' },
  { inspection_id: 'INS-005', checkpoint_id: 'EC-2', status: 'compliant', notes: 'Channel A blanket secure, vegetation emerging.' },
  { inspection_id: 'INS-005', checkpoint_id: 'EC-3', status: 'compliant', notes: 'Soil binder crust intact on pad.' },
  { inspection_id: 'INS-005', checkpoint_id: 'EC-4', status: 'compliant', notes: 'North slope drain anchored, no leaks.' },
  { inspection_id: 'INS-005', checkpoint_id: 'EC-5', status: 'needs-review', notes: 'South berm hydroseed coverage 55-70%. Bare patches noted. Field check needed.' },
  { inspection_id: 'INS-005', checkpoint_id: 'EC-6', status: 'compliant', notes: 'Detention basin blanket intact.' },
  { inspection_id: 'INS-005', checkpoint_id: 'EC-7', status: 'compliant', notes: 'Trench geotextile cover secured.' },
  { inspection_id: 'INS-005', checkpoint_id: 'TC-1', status: 'compliant', notes: 'Main entrance aggregate pad clean.' },
  { inspection_id: 'INS-005', checkpoint_id: 'TC-2', status: 'needs-review', notes: 'Tire wash may be non-operational. Hose appears disconnected. Field check needed.' },
  { inspection_id: 'INS-005', checkpoint_id: 'TC-3', status: 'compliant', notes: 'Riverside Blvd frontage clean.' },
  { inspection_id: 'INS-005', checkpoint_id: 'TC-4', status: 'compliant', notes: 'North exit aggregate intact.' },
  { inspection_id: 'INS-005', checkpoint_id: 'WE-1', status: 'needs-review', notes: 'Central pad appears dry in afternoon imagery. Watering schedule compliance uncertain.' },
  { inspection_id: 'INS-005', checkpoint_id: 'WE-2', status: 'compliant', notes: 'West wind fence taut, no damage.' },
  { inspection_id: 'INS-005', checkpoint_id: 'WE-3', status: 'compliant', notes: 'Stockpile wind panels stable.' },
  { inspection_id: 'INS-005', checkpoint_id: 'MM-1', status: 'compliant', notes: 'Primary washout at 30%, cleanout scheduled.' },
  { inspection_id: 'INS-005', checkpoint_id: 'MM-2', status: 'compliant', notes: 'Fuel storage compliant, no staining.' },
  { inspection_id: 'INS-005', checkpoint_id: 'MM-3', status: 'compliant', notes: 'Paint storage covered and bermed.' },
  { inspection_id: 'INS-005', checkpoint_id: 'MM-4', status: 'deficient', notes: 'Secondary washout overflowing. Wash water pooled 8-10 ft outside containment. DEF-002 issued.' },
  { inspection_id: 'INS-005', checkpoint_id: 'MM-5', status: 'compliant', notes: 'Import fill stockpile covered.' },
  { inspection_id: 'INS-005', checkpoint_id: 'MM-6', status: 'compliant', notes: 'Spill kit accessible and stocked.' },
  { inspection_id: 'INS-005', checkpoint_id: 'MM-7', status: 'compliant', notes: 'Aggregate stockpile stable, fiber rolls intact.' },
  { inspection_id: 'INS-005', checkpoint_id: 'NS-1', status: 'compliant', notes: 'Foundation dewatering within turbidity limits.' },
  { inspection_id: 'INS-005', checkpoint_id: 'NS-2', status: 'deficient', notes: 'Trench dewatering at 280 NTU, exceeds 250 NTU limit. DEF-003 issued.' },
  { inspection_id: 'INS-005', checkpoint_id: 'NS-3', status: 'compliant', notes: 'Irrigation test water routed properly.' },
  { inspection_id: 'INS-005', checkpoint_id: 'NS-4', status: 'compliant', notes: 'Wash-down containment intact.' },
  { inspection_id: 'INS-005', checkpoint_id: 'NS-5', status: 'compliant', notes: 'Saw-cutting slurry recovery effective.' },
];

const weatherSnapshot = { project_id: PROJECT_ID, temperature: 72, condition: 'partly-cloudy', wind_speed_mph: 8, humidity: 45 };

const weatherForecasts = [
  { project_id: PROJECT_ID, date: '2026-03-29', high: 74, low: 52, precipitation_inches: 0, precipitation_chance: 5, wind_speed_mph: 8, wind_direction: 'NW', condition: 'partly-cloudy', humidity: 45, is_qpe: false },
  { project_id: PROJECT_ID, date: '2026-03-30', high: 76, low: 51, precipitation_inches: 0, precipitation_chance: 0, wind_speed_mph: 6, wind_direction: 'NW', condition: 'clear', humidity: 38, is_qpe: false },
  { project_id: PROJECT_ID, date: '2026-03-31', high: 73, low: 53, precipitation_inches: 0, precipitation_chance: 10, wind_speed_mph: 10, wind_direction: 'SW', condition: 'partly-cloudy', humidity: 48, is_qpe: false },
  { project_id: PROJECT_ID, date: '2026-04-01', high: 65, low: 50, precipitation_inches: 0.3, precipitation_chance: 70, wind_speed_mph: 14, wind_direction: 'S', condition: 'light-rain', humidity: 72, is_qpe: false },
  { project_id: PROJECT_ID, date: '2026-04-02', high: 58, low: 48, precipitation_inches: 0.62, precipitation_chance: 95, wind_speed_mph: 18, wind_direction: 'SSE', condition: 'heavy-rain', humidity: 89, is_qpe: true },
  { project_id: PROJECT_ID, date: '2026-04-03', high: 61, low: 47, precipitation_inches: 0.15, precipitation_chance: 55, wind_speed_mph: 12, wind_direction: 'SW', condition: 'light-rain', humidity: 78, is_qpe: false },
  { project_id: PROJECT_ID, date: '2026-04-04', high: 68, low: 49, precipitation_inches: 0, precipitation_chance: 15, wind_speed_mph: 7, wind_direction: 'NW', condition: 'partly-cloudy', humidity: 52, is_qpe: false },
];

const qpEvents = [
  { id: 'QPE-2026-001', project_id: PROJECT_ID, start_date: '2026-02-10T06:00:00Z', end_date: '2026-02-11T18:00:00Z', total_precipitation: 0.78, inspection_triggered: true, inspection_id: 'INS-003' },
  { id: 'QPE-2026-002', project_id: PROJECT_ID, start_date: '2026-03-04T14:00:00Z', end_date: '2026-03-05T22:00:00Z', total_precipitation: 0.55, inspection_triggered: true, inspection_id: 'INS-005' },
];

const activityEvents = [
  { id: 'EVT-001', project_id: PROJECT_ID, type: 'document', title: 'SWPPP Amendment Uploaded', description: 'SWPPP Amendment #4 uploaded and approved. Updates include revised sediment basin capacity calculations for the southwest outfall and addition of secondary concrete washout facility near the west retaining wall.', timestamp: '2026-03-27T09:30:00Z', severity: 'info', linked_entity_id: 'riverside-phase2', linked_entity_type: 'project' },
  { id: 'EVT-002', project_id: PROJECT_ID, type: 'inspection', title: 'Routine Inspection Scheduled', description: 'Weekly routine BMP inspection scheduled for March 28. All 34 checkpoints queued for drone survey and AI analysis.', timestamp: '2026-03-27T10:15:00Z', severity: 'info', linked_entity_id: 'INS-005', linked_entity_type: 'inspection' },
  { id: 'EVT-003', project_id: PROJECT_ID, type: 'weather', title: 'Storm System Advisory', description: 'National Weather Service has issued an advisory for a Pacific storm system expected to reach the Central Valley by April 1. Estimated rainfall accumulation of 0.5 to 1.0 inches over 48 hours. Pre-storm inspection recommended.', timestamp: '2026-03-27T14:00:00Z', severity: 'warning', linked_entity_id: null, linked_entity_type: null },
  { id: 'EVT-004', project_id: PROJECT_ID, type: 'drone', title: 'Drone Mission Initiated', description: 'Alpha Survey — Full Site mission launched. DJI Matrice 350 RTK departed from launch point at north equipment yard. 34 waypoints programmed for full-site BMP coverage.', timestamp: '2026-03-28T08:45:00Z', severity: 'info', linked_entity_id: 'MISSION-001', linked_entity_type: 'mission' },
  { id: 'EVT-005', project_id: PROJECT_ID, type: 'drone', title: 'Drone Mission Completed', description: 'Alpha Survey — Full Site completed successfully. All 34 waypoints captured. Total flight time: 42 minutes. Battery consumption: 78% to 24%. AI analysis pipeline initiated.', timestamp: '2026-03-28T09:27:00Z', severity: 'info', linked_entity_id: 'MISSION-001', linked_entity_type: 'mission' },
  { id: 'EVT-006', project_id: PROJECT_ID, type: 'deficiency', title: 'Deficiency Detected — SC-3', description: 'AI analysis flagged sediment basin SC-3 at the southwest outfall. Outlet structure partially blocked with debris, and accumulated sediment has exceeded the 50% depth marker. Corrective action required within 72 hours.', timestamp: '2026-03-28T10:02:00Z', severity: 'critical', linked_entity_id: 'SC-3', linked_entity_type: 'checkpoint' },
  { id: 'EVT-007', project_id: PROJECT_ID, type: 'deficiency', title: 'Deficiency Detected — MM-4', description: 'AI analysis identified concrete washout MM-4 (secondary) near the west retaining wall is overflowing. Wash water has pooled outside the containment area. Immediate containment and cleanout required.', timestamp: '2026-03-28T10:08:00Z', severity: 'critical', linked_entity_id: 'MM-4', linked_entity_type: 'checkpoint' },
  { id: 'EVT-008', project_id: PROJECT_ID, type: 'deficiency', title: 'Deficiency Detected — NS-2', description: 'Dewatering discharge at NS-2 (utility trench) exceeded turbidity limits. Last sampling recorded 280 NTU, which is above the 250 NTU threshold. Filter bag system requires replacement or supplemental treatment.', timestamp: '2026-03-28T10:15:00Z', severity: 'critical', linked_entity_id: 'NS-2', linked_entity_type: 'checkpoint' },
  { id: 'EVT-009', project_id: PROJECT_ID, type: 'inspection', title: 'AI Analysis Complete', description: 'Full-site AI analysis completed for all 34 checkpoints. Results: 28 compliant, 3 deficient, 3 needs review. Overall site compliance score: 82%. Three corrective action items generated.', timestamp: '2026-03-28T10:30:00Z', severity: 'info', linked_entity_id: 'INS-005', linked_entity_type: 'inspection' },
  { id: 'EVT-010', project_id: PROJECT_ID, type: 'alert', title: 'Corrective Action Deadline Set', description: 'Corrective action deadlines assigned: SC-3 sediment basin cleanout due by March 31, MM-4 concrete washout containment due by March 30, NS-2 dewatering turbidity correction due by March 30.', timestamp: '2026-03-28T11:00:00Z', severity: 'warning', linked_entity_id: null, linked_entity_type: null },
  { id: 'EVT-011', project_id: PROJECT_ID, type: 'weather', title: 'QPE Forecast Warning', description: 'Updated NWS forecast shows a qualifying precipitation event (QPE) likely on April 2 with an estimated 0.62 inches of rainfall. Post-storm inspection will be required within 24 hours of cessation of storm event per CGP requirements.', timestamp: '2026-03-28T15:30:00Z', severity: 'warning', linked_entity_id: null, linked_entity_type: null },
  { id: 'EVT-012', project_id: PROJECT_ID, type: 'alert', title: 'Pre-Storm Preparation Reminder', description: 'Storm system arriving in 3 days. Recommended actions: verify all BMPs are functional, address open deficiencies before rainfall, confirm sediment basin capacity, check inlet protections, and secure material storage areas.', timestamp: '2026-03-29T07:00:00Z', severity: 'warning', linked_entity_id: null, linked_entity_type: null },
  { id: 'EVT-013', project_id: PROJECT_ID, type: 'inspection', title: 'Compliance Report Generated', description: 'CGP compliance report auto-generated for the March 28 inspection. Report includes AI analysis summaries for all 34 BMPs, 3 deficiency corrective actions, and QSP certification block. Pending QSP signature.', timestamp: '2026-03-29T08:00:00Z', severity: 'info', linked_entity_id: 'INS-005', linked_entity_type: 'inspection' },
  { id: 'EVT-014', project_id: PROJECT_ID, type: 'document', title: 'Rain Gauge Calibration Logged', description: 'On-site rain gauge (Onset HOBO RG3-M) calibration verified. Tipping bucket mechanism confirmed accurate at 0.01-inch resolution. Calibration certificate uploaded to project documents.', timestamp: '2026-03-29T08:30:00Z', severity: 'info', linked_entity_id: 'riverside-phase2', linked_entity_type: 'project' },
];

const notifications = [
  { id: 'NOTIF-001', project_id: PROJECT_ID, type: 'alert', title: 'Storm System Approaching', message: 'Heavy rain forecasted for April 2. Pre-storm inspection required within 48 hours.', timestamp: '2026-03-29T08:00:00Z', read: false, link: '/weather' },
  { id: 'NOTIF-002', project_id: PROJECT_ID, type: 'warning', title: 'Deficiency DEF-001: 72-Hour Deadline', message: 'Sediment basin SC-3 corrective action deadline approaching. 60 hours remaining.', timestamp: '2026-03-29T06:23:00Z', read: false, link: '/checkpoints/SC-3' },
  { id: 'NOTIF-003', project_id: PROJECT_ID, type: 'warning', title: 'Deficiency DEF-002: Urgent', message: 'Concrete washout MM-4 overflow requires immediate attention. 36 hours remaining.', timestamp: '2026-03-29T02:45:00Z', read: false, link: '/checkpoints/MM-4' },
];

// ============================================================================
// Utility Functions
// ============================================================================

function log(message: string, indent = 0) {
  const prefix = '  '.repeat(indent);
  console.log(`${prefix}${message}`);
}

function logSuccess(message: string) {
  console.log(`\x1b[32m✓\x1b[0m ${message}`);
}

function logError(message: string) {
  console.log(`\x1b[31m✗\x1b[0m ${message}`);
}

function logWarning(message: string) {
  console.log(`\x1b[33m!\x1b[0m ${message}`);
}

// ============================================================================
// Database Operations
// ============================================================================

async function clearTable(tableName: string): Promise<void> {
  if (DRY_RUN) {
    log(`[DRY RUN] Would clear table: ${tableName}`, 1);
    return;
  }

  const { error } = await supabase.from(tableName).delete().neq('id', '___impossible___');
  if (error) {
    // Try with different id types for tables with serial ids
    const { error: error2 } = await supabase.from(tableName).delete().gte('id', 0);
    if (error2) {
      throw new Error(`Failed to clear ${tableName}: ${error2.message}`);
    }
  }
}

async function upsertData<T extends Record<string, unknown>>(
  tableName: string,
  data: T[],
  onConflict?: string
): Promise<void> {
  if (data.length === 0) {
    logWarning(`No data to insert into ${tableName}`);
    return;
  }

  if (DRY_RUN) {
    log(`[DRY RUN] Would upsert ${data.length} rows into ${tableName}`, 1);
    return;
  }

  const options = onConflict ? { onConflict } : undefined;
  const { error } = await supabase.from(tableName).upsert(data, options);

  if (error) {
    throw new Error(`Failed to upsert into ${tableName}: ${error.message}`);
  }
}

async function insertData<T extends Record<string, unknown>>(
  tableName: string,
  data: T[]
): Promise<void> {
  if (data.length === 0) {
    logWarning(`No data to insert into ${tableName}`);
    return;
  }

  if (DRY_RUN) {
    log(`[DRY RUN] Would insert ${data.length} rows into ${tableName}`, 1);
    return;
  }

  const { error } = await supabase.from(tableName).insert(data);

  if (error) {
    throw new Error(`Failed to insert into ${tableName}: ${error.message}`);
  }
}

// ============================================================================
// Main Seed Function
// ============================================================================

async function seed() {
  console.log('\n========================================');
  console.log('  SiteCheck Database Seed Script');
  console.log('========================================\n');

  if (DRY_RUN) {
    logWarning('DRY RUN MODE - No data will be modified\n');
  }

  if (RESET_MODE) {
    logWarning('RESET MODE - All existing data will be cleared\n');
  }

  try {
    // Reset tables if requested (in reverse dependency order)
    if (RESET_MODE) {
      log('Clearing existing data...');
      const tablesToClear = [
        'notifications',
        'activity_events',
        'qp_events',
        'weather_forecasts',
        'weather_snapshots',
        'waypoints',
        'inspection_findings',
        'ai_analyses',
        'deficiencies',
        'inspections',
        'drone_missions',
        'checkpoints',
        'reports',
        'projects',
      ];

      for (const table of tablesToClear) {
        try {
          await clearTable(table);
          log(`Cleared ${table}`, 1);
        } catch (e) {
          logWarning(`Could not clear ${table}: ${(e as Error).message}`);
        }
      }
      console.log('');
    }

    // 1. Project
    log('Seeding projects...');
    await upsertData('projects', [project], 'id');
    logSuccess(`Inserted 1 project`);

    // 2. Checkpoints
    log('Seeding checkpoints...');
    await upsertData('checkpoints', checkpoints, 'id');
    logSuccess(`Inserted ${checkpoints.length} checkpoints`);

    // 3. AI Analyses (no id field, use checkpoint_id)
    log('Seeding ai_analyses...');
    if (RESET_MODE || DRY_RUN) {
      await insertData('ai_analyses', aiAnalyses);
    } else {
      // Delete existing and re-insert for idempotency
      await supabase.from('ai_analyses').delete().in('checkpoint_id', aiAnalyses.map(a => a.checkpoint_id));
      await insertData('ai_analyses', aiAnalyses);
    }
    logSuccess(`Inserted ${aiAnalyses.length} AI analyses`);

    // 4. Deficiencies
    log('Seeding deficiencies...');
    await upsertData('deficiencies', deficiencies, 'id');
    logSuccess(`Inserted ${deficiencies.length} deficiencies`);

    // 5. Drone Missions
    log('Seeding drone_missions...');
    await upsertData('drone_missions', droneMissions, 'id');
    logSuccess(`Inserted ${droneMissions.length} drone missions`);

    // 6. Inspections
    log('Seeding inspections...');
    await upsertData('inspections', inspections, 'id');
    logSuccess(`Inserted ${inspections.length} inspections`);

    // 7. Inspection Findings (no text id, serial)
    log('Seeding inspection_findings...');
    if (RESET_MODE || DRY_RUN) {
      await insertData('inspection_findings', inspectionFindings);
    } else {
      // Delete existing findings for these inspections first
      await supabase.from('inspection_findings').delete().in('inspection_id', inspections.map(i => i.id));
      await insertData('inspection_findings', inspectionFindings);
    }
    logSuccess(`Inserted ${inspectionFindings.length} inspection findings`);

    // 8. Waypoints (serial id)
    log('Seeding waypoints...');
    if (RESET_MODE || DRY_RUN) {
      await insertData('waypoints', waypoints);
    } else {
      await supabase.from('waypoints').delete().in('mission_id', droneMissions.map(m => m.id));
      await insertData('waypoints', waypoints);
    }
    logSuccess(`Inserted ${waypoints.length} waypoints`);

    // 9. Weather Snapshot
    log('Seeding weather_snapshots...');
    await upsertData('weather_snapshots', [weatherSnapshot], 'project_id');
    logSuccess(`Inserted 1 weather snapshot`);

    // 10. Weather Forecasts
    log('Seeding weather_forecasts...');
    await upsertData('weather_forecasts', weatherForecasts, 'project_id,date');
    logSuccess(`Inserted ${weatherForecasts.length} weather forecasts`);

    // 11. QP Events
    log('Seeding qp_events...');
    await upsertData('qp_events', qpEvents, 'id');
    logSuccess(`Inserted ${qpEvents.length} QP events`);

    // 12. Activity Events
    log('Seeding activity_events...');
    await upsertData('activity_events', activityEvents, 'id');
    logSuccess(`Inserted ${activityEvents.length} activity events`);

    // 13. Notifications
    log('Seeding notifications...');
    await upsertData('notifications', notifications, 'id');
    logSuccess(`Inserted ${notifications.length} notifications`);

    console.log('\n========================================');
    logSuccess('Database seeding completed successfully!');
    console.log('========================================\n');

  } catch (error) {
    console.log('\n========================================');
    logError(`Seeding failed: ${(error as Error).message}`);
    console.log('========================================\n');
    process.exit(1);
  }
}

// Run the seed
seed();
