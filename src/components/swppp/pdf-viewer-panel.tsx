'use client';

import { useMemo, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  FileText,
  MapPin,
  ClipboardList,
  Shield,
  BookOpen,
  Award,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useCheckpointStore } from '@/stores/checkpoint-store';
import { BMP_CATEGORY_LABELS } from '@/lib/constants';
import type { Checkpoint } from '@/types/checkpoint';

const TOTAL_PAGES = 42;

interface PageContent {
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  sections: { heading: string; body: string }[];
}

function getStaticPageContent(page: number): PageContent | null {
  const pages: Record<number, PageContent> = {
    1: {
      title: 'STORM WATER POLLUTION PREVENTION PLAN',
      subtitle: 'Riverside Mixed-Use Development Project',
      icon: FileText,
      sections: [
        {
          heading: 'Project Owner',
          body: 'Riverside Development Group, LLC\n1200 Commerce Boulevard, Suite 400\nFresno, CA 93721',
        },
        {
          heading: 'SWPPP Prepared By',
          body: 'Environmental Compliance Associates\nSWPPP Document Version 3.1\nEffective Date: September 15, 2025',
        },
        {
          heading: 'WDID Number',
          body: '5A15C000001\nOrder No. 2022-0057-DWQ\nNPDES No. CAS000002',
        },
      ],
    },
    2: {
      title: 'TABLE OF CONTENTS',
      icon: BookOpen,
      sections: [
        {
          heading: '',
          body: '1. Site Description ......................... 3\n2. Project Information ...................... 4\n3. Regulatory Requirements ................. 5\n4. BMP Location Plan ....................... 6\n5. BMP Schedule ............................ 11\n6. Individual BMP Details .................. 12\n7. Monitoring Plans ........................ 26\n8. Sampling Procedures ..................... 30\n9. Appendices .............................. 36\n10. Certifications ......................... 40',
        },
      ],
    },
    3: {
      title: 'SECTION 1: SITE DESCRIPTION',
      icon: MapPin,
      sections: [
        {
          heading: '1.1 Project Location',
          body: 'The project site is located at the intersection of Riverside Boulevard and North Cedar Avenue in the City of Fresno, Fresno County, California. The site is bounded by Riverside Boulevard to the east, commercial properties to the south, agricultural land to the west, and a service road to the north.',
        },
        {
          heading: '1.2 Site Characteristics',
          body: 'Total disturbed area: 18.4 acres\nExisting land use: Vacant / Agriculture\nSoil type: Sandy loam (Type B)\nSlope range: 1% to 8%\nDirectional drainage: Southwest toward Fancher Creek',
        },
        {
          heading: '1.3 Receiving Waters',
          body: 'Primary: Fancher Creek Detention Basin\nSecondary: Kings River Watershed (HUC 18030012)\nImpaired water body status: Listed for pesticides and sediment under CWA Section 303(d)',
        },
      ],
    },
    4: {
      title: 'SECTION 2: PROJECT INFORMATION',
      icon: ClipboardList,
      sections: [
        {
          heading: '2.1 Construction Activities',
          body: 'Phase 1: Mass grading and utility installation\nPhase 2: Building pad preparation and foundations\nPhase 3: Vertical construction\nPhase 4: Hardscape, landscape, and final stabilization',
        },
        {
          heading: '2.2 Project Schedule',
          body: 'Construction start: September 2025\nEstimated completion: March 2027\nCurrent phase: Phase 2 (Building pad and foundations)',
        },
        {
          heading: '2.3 Responsible Parties',
          body: 'QSP: Maria Santos, CPESC #7842\nQSD: James Rivera, PE #C-61542\nContractor: Meridian Construction, Inc.',
        },
      ],
    },
    5: {
      title: 'SECTION 3: REGULATORY REQUIREMENTS',
      icon: Shield,
      sections: [
        {
          heading: '3.1 Applicable Permits',
          body: 'California Construction General Permit (CGP)\nOrder No. 2022-0057-DWQ\nRisk Level 2 (Sediment Risk: Medium, Receiving Water Risk: High)',
        },
        {
          heading: '3.2 Numeric Effluent Limits',
          body: 'pH: 6.0 - 9.0\nTurbidity: 250 NTU (daily average)\nNon-visible pollutants: Per Basin Plan objectives',
        },
        {
          heading: '3.3 Inspection Requirements',
          body: 'Routine inspections: Weekly minimum\nPre-storm inspections: Within 48 hours of forecast event\nPost-storm inspections: Within 48 hours after qualifying event\nQPE threshold: 0.5 inches in 24 hours',
        },
      ],
    },
    6: {
      title: 'SECTION 4: BMP LOCATION PLAN',
      subtitle: 'Overview Map - All BMP Installations',
      icon: MapPin,
      sections: [
        {
          heading: 'BMP Location Key',
          body: 'SC = Sediment Control (8 installations)\nEC = Erosion Control (7 installations)\nTC = Tracking Control (4 installations)\nWE = Wind Erosion Control (3 installations)\nMM = Materials Management (7 installations)\nNS = Non-Storm Water Management (5 installations)',
        },
        {
          heading: 'Map Reference',
          body: 'See Sheet C-SWPPP-01 for full-size BMP location plan.\nAll BMP locations are referenced to the project coordinate grid.\nGPS coordinates provided for each installation in subsequent sections.',
        },
      ],
    },
    7: {
      title: 'BMP LOCATION PLAN - NORTH ZONE',
      icon: MapPin,
      sections: [
        {
          heading: 'North Zone Installations',
          body: 'SC-1: Silt Fence - North Perimeter (820 LF)\nSC-7: Sediment Trap - NW Corner\nEC-4: Slope Drain - North Cut\nTC-4: Construction Exit - North Service Road\nWE-3: Wind Fencing - Stockpile Perimeter\nMM-2: Fuel Storage - Equipment Yard\nMM-5: Stockpile - Import Fill\nMM-7: Stockpile - Aggregate Base\nNS-4: Wash Water Containment',
        },
      ],
    },
    8: {
      title: 'BMP LOCATION PLAN - EAST ZONE',
      icon: MapPin,
      sections: [
        {
          heading: 'East Zone Installations',
          body: 'SC-2: Silt Fence - East Slope (460 LF)\nSC-5: Inlet Protection - Storm Drain #1\nEC-7: Geotextile Cover - Utility Trench\nTC-1: Construction Entrance - Main Gate\nTC-3: Street Sweeping - Riverside Blvd\nMM-3: Paint & Solvent Storage\nNS-2: Dewatering - Utility Trench',
        },
      ],
    },
    9: {
      title: 'BMP LOCATION PLAN - SOUTH & WEST ZONES',
      icon: MapPin,
      sections: [
        {
          heading: 'South Zone Installations',
          body: 'SC-3: Sediment Basin - SW Outfall\nSC-6: Inlet Protection - Storm Drain #2\nSC-8: Fiber Roll - South Perimeter\nEC-5: Hydroseeding - South Berm\nTC-2: Tire Wash Station - Secondary Exit\nNS-5: Saw-Cutting Slurry Containment',
        },
        {
          heading: 'West Zone Installations',
          body: 'EC-1: Hydroseeding - West Slope\nEC-6: Erosion Control Blanket - Detention Basin\nWE-2: Wind Fencing - West Property Line\nMM-4: Concrete Washout - Secondary\nNS-3: Potable Water Management',
        },
      ],
    },
    10: {
      title: 'BMP LOCATION PLAN - CENTRAL ZONE',
      icon: MapPin,
      sections: [
        {
          heading: 'Central Zone Installations',
          body: 'SC-4: Fiber Roll - Grading Area B\nEC-2: Erosion Control Blanket - Channel A\nEC-3: Soil Binder - Exposed Pad Area\nWE-1: Watering Schedule - Active Grading\nMM-1: Concrete Washout - Primary\nMM-6: Hazmat Spill Kit - Main Yard\nNS-1: Dewatering - Foundation Excavation A',
        },
      ],
    },
    11: {
      title: 'SECTION 5: BMP IMPLEMENTATION SCHEDULE',
      icon: ClipboardList,
      sections: [
        {
          heading: 'Phase 1 BMPs (Sep - Oct 2025)',
          body: 'Perimeter sediment controls (silt fences, fiber rolls)\nConstruction entrances and tracking controls\nFuel storage and spill prevention\nInitial erosion control measures',
        },
        {
          heading: 'Phase 2 BMPs (Nov 2025 - Mar 2026)',
          body: 'Sediment basins and traps\nSlope drains and erosion blankets\nConcrete washout facilities\nDewatering systems',
        },
        {
          heading: 'Phase 3 BMPs (Apr 2026 - Forward)',
          body: 'Hydroseeding and permanent vegetation\nPermanent drainage structures\nPost-construction BMPs\nFinal stabilization measures',
        },
      ],
    },
    26: {
      title: 'SECTION 7: MONITORING PLANS',
      icon: BarChart3,
      sections: [
        {
          heading: '7.1 Visual Monitoring',
          body: 'All BMPs shall be visually inspected weekly and before/after qualifying precipitation events. Drone-assisted aerial inspections supplement ground-level observations for enhanced coverage.',
        },
        {
          heading: '7.2 Sampling Triggers',
          body: 'Sampling required when:\n- Discharge occurs from the site\n- Turbidity exceeds visual threshold\n- pH appears outside 6.0-9.0 range\n- Non-storm water discharge is detected',
        },
      ],
    },
    27: {
      title: 'MONITORING PLANS (CONTINUED)',
      icon: BarChart3,
      sections: [
        {
          heading: '7.3 Drone Inspection Protocol',
          body: 'Automated drone flights conducted weekly at 200-foot altitude. AI-powered image analysis cross-references BMP conditions with SWPPP requirements. Confidence scoring applied to each assessment.',
        },
        {
          heading: '7.4 Monitoring Equipment',
          body: 'Turbidity: Hach 2100Q portable turbidimeter\npH: YSI Pro10 pH meter\nFlow: Staff gauges at basin outlets\nDrone: DJI Matrice 350 RTK with Zenmuse H30T',
        },
      ],
    },
    28: {
      title: 'SAMPLING PROCEDURES',
      icon: ClipboardList,
      sections: [
        {
          heading: '8.1 Sample Collection',
          body: 'Grab samples collected at each active discharge point within 1 hour of observed discharge initiation. Chain of custody maintained for all laboratory samples.',
        },
        {
          heading: '8.2 Analytical Methods',
          body: 'Turbidity: EPA Method 180.1\npH: EPA Method 150.1\nTSS: EPA Method 160.2\nOil & Grease: EPA Method 1664B',
        },
      ],
    },
    36: {
      title: 'APPENDIX A: SITE PHOTOGRAPHS',
      icon: FileText,
      sections: [
        {
          heading: 'Photo Documentation',
          body: 'Pre-construction site photographs taken September 12, 2025. Progress photographs updated monthly. Drone aerial photographs captured weekly during active construction phases.',
        },
      ],
    },
    37: {
      title: 'APPENDIX B: BMP SPECIFICATION SHEETS',
      icon: FileText,
      sections: [
        {
          heading: 'Manufacturer Specifications',
          body: 'Silt fence: ASTM D6461 Type 1\nFiber rolls: Caltrans Standard Type 2\nErosion blankets: ECTC approved products\nInlet protection: Per local jurisdiction standards',
        },
      ],
    },
    38: {
      title: 'APPENDIX C: LABORATORY REPORTS',
      icon: FileText,
      sections: [
        {
          heading: 'Analytical Results',
          body: 'All laboratory analytical reports for storm water samples are maintained in this appendix. Reports are organized chronologically by sampling event date.',
        },
      ],
    },
    39: {
      title: 'APPENDIX D: INSPECTION RECORDS',
      icon: ClipboardList,
      sections: [
        {
          heading: 'Inspection Log',
          body: 'Weekly inspection reports, pre-storm and post-storm inspection forms, and corrective action records are maintained in this appendix. Digital copies available through the SiteCheck platform.',
        },
      ],
    },
    40: {
      title: 'SECTION 10: CERTIFICATIONS',
      icon: Award,
      sections: [
        {
          heading: 'SWPPP Preparer Certification',
          body: 'I certify under penalty of law that this document and all attachments were prepared under my direction or supervision in accordance with a system designed to assure that qualified personnel properly gather and evaluate the information submitted.',
        },
        {
          heading: 'QSD Certification',
          body: 'Qualified SWPPP Developer: James Rivera, PE\nLicense No.: C-61542\nExpiration: June 30, 2027\nDate: September 10, 2025',
        },
      ],
    },
    41: {
      title: 'OPERATOR CERTIFICATION',
      icon: Award,
      sections: [
        {
          heading: 'Legally Responsible Person',
          body: 'Name: Robert Chen, Project Director\nOrganization: Riverside Development Group, LLC\nTitle: Authorized Signatory\nDate: September 12, 2025',
        },
        {
          heading: 'Contractor Acknowledgment',
          body: 'Meridian Construction, Inc. acknowledges receipt of this SWPPP and agrees to implement all BMPs as specified herein. All subcontractors will be briefed on SWPPP requirements prior to commencing work.',
        },
      ],
    },
    42: {
      title: 'AMENDMENT LOG',
      icon: FileText,
      sections: [
        {
          heading: 'SWPPP Amendments',
          body: 'Rev 1.0 - Sep 15, 2025: Initial SWPPP\nRev 2.0 - Dec 01, 2025: Added Phase 2 BMPs\nRev 3.0 - Feb 15, 2026: Dewatering plan update\nRev 3.1 - Mar 10, 2026: Secondary washout addition',
        },
      ],
    },
  };

  return pages[page] || null;
}

function getBmpPageContent(page: number, cps: Checkpoint[]): PageContent | null {
  const matching = cps.filter((c) => c.swpppPage === page);
  if (matching.length === 0) return null;

  return {
    title: `BMP DETAIL - ${matching[0].id}`,
    subtitle: matching[0].name,
    icon: Shield,
    sections: matching.map((cp) => ({
      heading: `${cp.id}: ${cp.name}`,
      body: `Category: ${BMP_CATEGORY_LABELS[cp.bmpType]}\nCGP Reference: ${cp.cgpSection}\nInstall Date: ${cp.installDate}${cp.zone ? `\nZone: ${cp.zone.charAt(0).toUpperCase() + cp.zone.slice(1)}` : ''}${cp.stationLabel ? `\nStation: ${cp.stationLabel}` : ''}\nPriority: ${cp.priority.charAt(0).toUpperCase() + cp.priority.slice(1)}\n\n${cp.description}`,
    })),
  };
}

function getPageContent(page: number, cps: Checkpoint[]): PageContent {
  const staticContent = getStaticPageContent(page);
  if (staticContent) return staticContent;

  const bmpContent = getBmpPageContent(page, cps);
  if (bmpContent) return bmpContent;

  // Fallback for pages without specific content
  if (page >= 12 && page <= 25) {
    return {
      title: `BMP DETAILS (CONTINUED)`,
      subtitle: `Page ${page}`,
      icon: Shield,
      sections: [
        {
          heading: 'BMP Specifications',
          body: 'Refer to the BMP location plan (Section 4) for installation coordinates and the BMP schedule (Section 5) for implementation timeline. Detailed specifications for each BMP follow the standard format including design criteria, installation requirements, and maintenance procedures.',
        },
      ],
    };
  }

  if (page >= 26 && page <= 35) {
    return {
      title: 'MONITORING AND SAMPLING',
      subtitle: `Page ${page}`,
      icon: BarChart3,
      sections: [
        {
          heading: 'Continued Procedures',
          body: 'This section contains additional monitoring parameters, sampling locations, and reporting requirements as specified in the Construction General Permit.',
        },
      ],
    };
  }

  return {
    title: 'APPENDIX',
    subtitle: `Page ${page}`,
    icon: FileText,
    sections: [
      {
        heading: 'Supporting Documentation',
        body: 'This page contains supporting documentation, reference materials, and supplementary information for the SWPPP.',
      },
    ],
  };
}

interface PdfViewerPanelProps {
  activePage: number;
  onPageChange: (page: number) => void;
  selectedCheckpointId: string | null;
}

export function PdfViewerPanel({
  activePage,
  onPageChange,
  selectedCheckpointId,
}: PdfViewerPanelProps) {
  const checkpoints = useCheckpointStore((s) => s.checkpoints);
  const fetchCheckpoints = useCheckpointStore((s) => s.fetchCheckpoints);

  useEffect(() => {
    if (checkpoints.length === 0) fetchCheckpoints();
  }, [checkpoints.length, fetchCheckpoints]);

  const content = useMemo(
    () => getPageContent(activePage, checkpoints),
    [activePage, checkpoints]
  );

  const selectedCheckpoint = selectedCheckpointId
    ? checkpoints.find((c) => c.id === selectedCheckpointId)
    : null;
  const isHighlighted = selectedCheckpoint?.swpppPage === activePage;
  const PageIcon = content.icon;

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-white/5 bg-[#141414] px-3 py-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onPageChange(Math.max(1, activePage - 1))}
            disabled={activePage <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Input
              className="h-6 w-10 border-white/10 bg-white/5 px-1 text-center text-xs"
              value={activePage}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1 && val <= TOTAL_PAGES) {
                  onPageChange(val);
                }
              }}
            />
            <span>of {TOTAL_PAGES}</span>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onPageChange(Math.min(TOTAL_PAGES, activePage + 1))}
            disabled={activePage >= TOTAL_PAGES}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ZoomIn className="h-3.5 w-3.5" />
          <span>100%</span>
        </div>
      </div>

      {/* Document area */}
      <div className="flex-1 overflow-auto bg-[#1C1C1C] p-6">
        <div className="mx-auto max-w-[640px]">
          {/* Paper */}
          <div
            className="min-h-[800px] rounded-sm border border-black/20 p-10 shadow-2xl"
            style={{ backgroundColor: '#F5F5F0' }}
          >
            {/* Page header decoration */}
            <div className="mb-6 flex items-center justify-between border-b border-neutral-300 pb-3">
              <div className="flex items-center gap-2">
                <PageIcon className="h-4 w-4 text-neutral-500" />
                <span className="text-[10px] font-medium tracking-widest text-neutral-500 uppercase">
                  SWPPP v3.1
                </span>
              </div>
              <span className="text-[10px] text-neutral-400">
                Page {activePage} of {TOTAL_PAGES}
              </span>
            </div>

            {/* Title */}
            {activePage === 1 ? (
              <div className="mb-10 mt-16 text-center">
                <div className="mx-auto mb-6 h-px w-32 bg-neutral-300" />
                <h1 className="text-xl font-bold tracking-wide text-neutral-800">
                  {content.title}
                </h1>
                {content.subtitle && (
                  <p className="mt-3 text-sm text-neutral-500">
                    {content.subtitle}
                  </p>
                )}
                <div className="mx-auto mt-6 h-px w-32 bg-neutral-300" />
              </div>
            ) : (
              <div className="mb-6">
                <h2 className="text-lg font-bold text-neutral-800">
                  {content.title}
                </h2>
                {content.subtitle && (
                  <p className="mt-1 text-sm font-medium text-neutral-500">
                    {content.subtitle}
                  </p>
                )}
              </div>
            )}

            {/* Highlight band for selected checkpoint */}
            {isHighlighted && (
              <div className="mb-4 rounded border border-amber-300 bg-amber-100/60 px-3 py-2">
                <p className="text-[11px] font-medium text-amber-700">
                  AI-Identified BMP: {selectedCheckpoint?.id} - {selectedCheckpoint?.name}
                </p>
              </div>
            )}

            {/* Sections */}
            <div className="space-y-6">
              {content.sections.map((section, i) => (
                <div key={i}>
                  {section.heading && (
                    <h3 className="mb-2 text-sm font-semibold text-neutral-700">
                      {section.heading}
                    </h3>
                  )}
                  <div className="whitespace-pre-line text-xs leading-relaxed text-neutral-600">
                    {section.body}
                  </div>
                </div>
              ))}
            </div>

            {/* Page footer */}
            <div className="mt-12 border-t border-neutral-300 pt-3">
              <div className="flex items-center justify-between text-[9px] text-neutral-400">
                <span>Riverside Mixed-Use Development - SWPPP v3.1</span>
                <span>Confidential</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
