import { AIAnalysis } from '@/types/drone';

export const aiAnalyses: AIAnalysis[] = [
  // ── Sediment Control ─────────────────────────────────────────────────
  {
    checkpointId: 'SC-1',
    summary:
      'Silt fence along the north perimeter is intact and properly anchored. No visible undercutting, tears, or sediment overtopping detected in the drone imagery.',
    status: 'compliant',
    confidence: 95,
    details: [
      'Geotextile fabric shows no visible tears or punctures along the 820-foot run.',
      'Steel T-posts remain upright and evenly spaced at approximately 6-foot intervals.',
      'No sediment overtopping or bypass observed at any point along the fence line.',
      'Toe burial appears intact with no signs of undercutting from recent runoff.',
    ],
    cgpReference:
      'CGP Section X.H.1.a \u2014 Sediment barriers shall be properly installed, maintained, and replaced as needed to prevent sediment-laden runoff from leaving the site.',
  },
  {
    checkpointId: 'SC-2',
    summary:
      'East slope reinforced silt fence is in good condition. Wire backing provides adequate structural support and no sediment bypass is visible around the end posts.',
    status: 'compliant',
    confidence: 93,
    details: [
      'Wire mesh backing is intact and providing adequate structural reinforcement.',
      'Fabric is taut with no sagging or billowing sections detected.',
      'End posts are properly wrapped to prevent bypass at fence terminations.',
      'Accumulated sediment on the upslope side is below 30% of fence height.',
    ],
    cgpReference:
      'CGP Section X.H.1.a \u2014 Sediment barriers must be inspected and maintained to ensure continued effectiveness.',
  },
  {
    checkpointId: 'SC-3',
    summary:
      'Sediment basin at the southwest outfall shows two critical issues: the outlet riser pipe is partially blocked with woody debris, and accumulated sediment has exceeded the 50% depth marker, indicating cleanout is overdue.',
    status: 'deficient',
    confidence: 88,
    details: [
      'Outlet riser pipe is approximately 40% obstructed with branches and construction debris.',
      'Sediment accumulation depth exceeds the 50% design storage marker painted on the basin wall.',
      'Emergency spillway is currently unobstructed but sediment is within 8 inches of the spillway invert.',
      'Perforated decant holes on the lower section of the riser are fully buried in sediment.',
      'Basin perimeter embankment appears stable with no signs of erosion or piping.',
    ],
    cgpReference:
      'CGP Section X.H.2.b \u2014 Sediment basins must be cleaned out when sediment accumulation reaches 50% of the design storage capacity. Outlet structures shall be maintained free of obstructions.',
    recommendations: [
      'Immediately remove debris from the outlet riser pipe to restore full discharge capacity.',
      'Schedule sediment cleanout to return basin to design capacity within 72 hours.',
      'Verify discharge rates post-cleanout meet design specifications.',
      'Install a debris rack upstream of the riser pipe to prevent future blockage.',
    ],
  },
  {
    checkpointId: 'SC-4',
    summary:
      'Fiber rolls in grading area B are well-positioned along contour lines and effectively trapping sediment. Stakes are in place and rolls show normal sediment loading.',
    status: 'compliant',
    confidence: 91,
    details: [
      'Fiber rolls are aligned along contour lines at approximately 15-foot intervals.',
      'Wooden stakes are holding rolls firmly in contact with the ground surface.',
      'Sediment accumulation on the upslope side is moderate and within acceptable limits.',
      'No visible gaps or displacement from recent runoff events.',
    ],
    cgpReference:
      'CGP Section X.H.1.c \u2014 Fiber rolls shall be installed along contour lines and maintained in contact with the soil surface.',
  },
  {
    checkpointId: 'SC-5',
    summary:
      'Storm drain inlet SD-1 protection is functioning as designed. Gravel bags are properly stacked and filter fabric shows no signs of failure or bypass.',
    status: 'compliant',
    confidence: 96,
    details: [
      'Gravel bags stacked two courses high with tight joints between bags.',
      'Non-woven geotextile fabric liner is intact and covering the inlet grate.',
      'No sediment bypass observed around the perimeter of the protection.',
      'Ponding area upstream of the protection appears to be draining as intended.',
    ],
    cgpReference:
      'CGP Section X.H.1.f \u2014 Storm drain inlet protection shall prevent sediment from entering the storm drain system while allowing flow to pass through.',
  },
  {
    checkpointId: 'SC-6',
    summary:
      'Manufactured drop-inlet filter at SD-2 is properly seated and functional. Flow-through capacity appears unimpeded and the filter media shows acceptable sediment loading.',
    status: 'compliant',
    confidence: 94,
    details: [
      'Dandy Bag filter is properly seated in the inlet frame with no gaps.',
      'Filter media shows moderate sediment loading but remains permeable.',
      'No standing water observed above the filter, indicating adequate flow-through.',
      'Lifting straps are accessible for maintenance and replacement.',
    ],
    cgpReference:
      'CGP Section X.H.1.f \u2014 Inlet protection devices must be maintained to ensure sediment capture without causing flooding.',
  },
  {
    checkpointId: 'SC-7',
    summary:
      'Northwest corner sediment trap is in good condition. Riprap outlet is clean and geotextile underliner is visible and intact around the perimeter.',
    status: 'compliant',
    confidence: 92,
    details: [
      'Rock-lined sediment trap is collecting runoff effectively from the excavation area.',
      'Riprap outlet stones are in place with no displacement.',
      'Geotextile underliner is visible and intact at the trap perimeter.',
      'Sediment accumulation is approximately 25% of capacity.',
    ],
    cgpReference:
      'CGP Section X.H.2.a \u2014 Sediment traps shall be maintained and cleaned out when sediment reaches 50% of the design depth.',
  },
  {
    checkpointId: 'SC-8',
    summary:
      'South perimeter coconut coir fiber rolls are secure and performing well. Good ground contact maintained along the full length of the installation.',
    status: 'compliant',
    confidence: 90,
    details: [
      'Coconut coir rolls maintain firm ground contact along the southern boundary.',
      'Wooden stakes are intact at 4-foot intervals with no leaning or displacement.',
      'Moderate sediment accumulation on the upslope side indicates effective trapping.',
      'No visible gaps between adjacent rolls at splice points.',
    ],
    cgpReference:
      'CGP Section X.H.1.c \u2014 Fiber rolls shall be staked and maintained in continuous contact with the ground surface.',
  },

  // ── Erosion Control ──────────────────────────────────────────────────
  {
    checkpointId: 'EC-1',
    summary:
      'Hydroseed application on the west slope shows good germination coverage at approximately 80%. Mulch layer is intact and providing effective erosion protection.',
    status: 'compliant',
    confidence: 89,
    details: [
      'Germination coverage estimated at 80% with consistent grass stand density.',
      'Wood fiber mulch layer remains visible between emerging vegetation.',
      'No rill or gully erosion visible on the 2.5:1 slope surface.',
      'Tackifier appears to be holding mulch in place despite recent wind events.',
    ],
    cgpReference:
      'CGP Section X.H.3.a \u2014 Vegetative cover shall achieve 70% or greater coverage to be considered effective erosion control.',
  },
  {
    checkpointId: 'EC-2',
    summary:
      'Erosion control blanket in drainage channel A is well-secured and showing no displacement. Staple pattern is holding and blanket edges are properly overlapped.',
    status: 'compliant',
    confidence: 94,
    details: [
      'Straw-coconut blanket is intact across the full 3,200 sq ft channel area.',
      'U-shaped staples are holding at the 3-foot grid pattern.',
      'Longitudinal overlaps are shingled in the direction of flow.',
      'No undermining or uplift at blanket edges along channel banks.',
      'Vegetation is beginning to establish through the blanket openings.',
    ],
    cgpReference:
      'CGP Section X.H.3.b \u2014 Erosion control blankets shall be installed per manufacturer specifications and maintained until vegetation is established.',
  },
  {
    checkpointId: 'EC-3',
    summary:
      'Soil binder application on the exposed building pad is performing well. Surface crusting is intact with no visible wind or water erosion damage.',
    status: 'compliant',
    confidence: 87,
    details: [
      'Polymer soil binder crust is intact across the 2.1-acre pad area.',
      'No visible dust generation or surface erosion in the drone imagery.',
      'Tire tracks from equipment show only minor surface disruption.',
      'Last application was approximately 18 days ago; re-application due in 12 days.',
    ],
    cgpReference:
      'CGP Section X.H.3.c \u2014 Chemical stabilizers shall be applied and reapplied per manufacturer recommendations to maintain effective soil stabilization.',
  },
  {
    checkpointId: 'EC-4',
    summary:
      'Slope drain on the north cut is properly secured and conveying flow without leakage. Anchor bags are in place and the pipe shows no damage or displacement.',
    status: 'compliant',
    confidence: 93,
    details: [
      'Corrugated polyethylene pipe is intact with no visible cracks or separations.',
      'Gravel-filled anchor bags are in position at the top and along the pipe run.',
      'Energy dissipation at the pipe outlet appears functional.',
      'No side leakage or erosion around the pipe inlet observed.',
    ],
    cgpReference:
      'CGP Section X.H.3.d \u2014 Slope drains shall be securely anchored and maintained to prevent concentrated erosion on slopes.',
  },
  {
    checkpointId: 'EC-5',
    summary:
      'Hydroseed on the south berm shows inconsistent germination with bare patches covering approximately 30% of the treated area. Coverage may be below the 70% threshold. On-site verification recommended.',
    status: 'needs-review',
    confidence: 76,
    details: [
      'Germination coverage is inconsistent, estimated at 55-70% from aerial imagery.',
      'Several bare patches of 4-6 sq ft detected on the berm crown and south face.',
      'Possible foot traffic damage visible as linear bare areas along the berm top.',
      'Mulch layer appears thin or absent in the bare patches.',
      'AI confidence is reduced due to image resolution limitations on this slope angle.',
    ],
    cgpReference:
      'CGP Section X.H.3.a \u2014 Vegetative cover shall achieve 70% or greater coverage. Areas below threshold require re-application or supplemental erosion control.',
    recommendations: [
      'Conduct field walkdown to verify actual germination percentage.',
      'If below 70% coverage, re-apply hydroseed to bare patches within 14 days.',
      'Install temporary fiber rolls along berm crown to prevent further foot traffic damage.',
      'Consider signage or barrier tape to redirect pedestrian traffic away from the treated area.',
    ],
  },
  {
    checkpointId: 'EC-6',
    summary:
      'Excelsior erosion control blanket on the detention basin slopes is intact and properly installed. Early vegetation establishment is visible through the blanket matrix.',
    status: 'compliant',
    confidence: 91,
    details: [
      'Excelsior blanket is intact on all interior basin slopes.',
      'Staples are holding at 2-foot spacing on the steeper sections.',
      'Photodegradable netting is still intact, providing structural support.',
      'Early grass shoots are visible growing through the blanket matrix.',
    ],
    cgpReference:
      'CGP Section X.H.3.b \u2014 Erosion control blankets in permanent features shall be maintained until target vegetation density is achieved.',
  },
  {
    checkpointId: 'EC-7',
    summary:
      'Geotextile cover on the utility trench backfill is in place and secured by sandbags. No exposed soil or wind displacement detected.',
    status: 'compliant',
    confidence: 88,
    details: [
      'Non-woven geotextile fabric is covering the trench backfill area completely.',
      'Sandbag weights are in place at approximately 8-foot intervals.',
      'No wind displacement or flapping observed in the drone imagery.',
      'Fabric edges overlap adjacent paving by a minimum of 12 inches.',
    ],
    cgpReference:
      'CGP Section X.H.3.e \u2014 Temporary soil covers shall be secured to prevent wind displacement and shall cover all exposed soil.',
  },

  // ── Tracking Control ─────────────────────────────────────────────────
  {
    checkpointId: 'TC-1',
    summary:
      'Main construction entrance on Riverside Blvd is in good condition. Aggregate pad is thick and clean, and the rumble strip grate appears functional.',
    status: 'compliant',
    confidence: 95,
    details: [
      'Aggregate pad extends the full 50-foot length and 24-foot width.',
      'Clean angular rock layer appears to be at adequate thickness.',
      'Rumble strip grate at the exit point is in place and free of debris.',
      'No visible sediment tracking on the adjacent public road surface.',
      'Geotextile fabric is not visible, indicating adequate aggregate depth.',
    ],
    cgpReference:
      'CGP Section X.H.4.a \u2014 Stabilized construction entrance/exit shall prevent tracking of sediment onto public roads.',
  },
  {
    checkpointId: 'TC-2',
    summary:
      'Tire wash station at the secondary exit may be non-operational. Water supply hose appears disconnected in aerial imagery and the recirculation basin shows elevated sediment. Field verification needed.',
    status: 'needs-review',
    confidence: 78,
    details: [
      'Water supply hose appears to be disconnected or coiled near the wash rack.',
      'Recirculation basin shows turbid water with visible sediment accumulation.',
      'Tire wash rack grate is in place but may not be receiving water flow.',
      'Some sediment tracking visible on the paved surface beyond the exit point.',
      'AI confidence limited by aerial viewing angle of the wash station components.',
    ],
    cgpReference:
      'CGP Section X.H.4.b \u2014 Tire wash facilities shall be maintained in operational condition and the sediment collection system shall be cleaned regularly.',
    recommendations: [
      'Verify water supply connection and test wash rack operation.',
      'Clean recirculation basin and check pump function.',
      'Sweep sediment tracking from the paved exit area.',
      'Consider switching to the main gate until the wash station is restored.',
    ],
  },
  {
    checkpointId: 'TC-3',
    summary:
      'Riverside Blvd frontage is clean with no visible sediment tracking. Street sweeping records and visual conditions indicate compliance.',
    status: 'compliant',
    confidence: 97,
    details: [
      'No visible sediment, mud, or debris on Riverside Blvd frontage road.',
      'Curb and gutter area is clean with no accumulated soil.',
      'Road surface shows recent sweeping marks indicating recent maintenance.',
    ],
    cgpReference:
      'CGP Section X.H.4.c \u2014 Public streets adjacent to the site shall be swept as needed to prevent sediment accumulation.',
  },
  {
    checkpointId: 'TC-4',
    summary:
      'North service road construction exit aggregate pad is in good condition. Cattle guard grate is functional and no significant tracking observed on the service road.',
    status: 'compliant',
    confidence: 92,
    details: [
      'Aggregate pad is intact and extends the full 40-foot length.',
      'Cattle guard grate is level and free of debris.',
      'No significant sediment tracking visible on the north service road.',
      'Pad thickness appears adequate with clean rock surface.',
    ],
    cgpReference:
      'CGP Section X.H.4.a \u2014 All points of construction traffic egress shall be stabilized to prevent sediment tracking.',
  },

  // ── Wind Erosion ─────────────────────────────────────────────────────
  {
    checkpointId: 'WE-1',
    summary:
      'Dust conditions in the central pad area appear dry during the afternoon capture window. Surface moisture content looks low and some visible dust plumes were detected near the active grading zone. Watering schedule compliance needs field verification.',
    status: 'needs-review',
    confidence: 75,
    details: [
      'Surface appears dry in the central grading area during the afternoon drone pass.',
      'Minor dust plume visible near active equipment operations at the northeast corner.',
      'No water truck visible in the imagery during the 11:30 AM capture.',
      'Morning passes showed adequately moist soil surfaces.',
      'Ambient wind at time of capture was 8 mph from the NW, below the 25-mph threshold.',
    ],
    cgpReference:
      'CGP Section X.H.5.a \u2014 Water or other dust suppressants shall be applied to exposed soil surfaces as needed to prevent visible dust emissions.',
    recommendations: [
      'Verify water truck is completing all three scheduled afternoon passes.',
      'Review watering log for the past 7 days to check schedule compliance.',
      'Consider increasing watering frequency during periods of low humidity and wind.',
      'Install a visible dust monitoring flag or windsock to help operators gauge conditions.',
    ],
  },
  {
    checkpointId: 'WE-2',
    summary:
      'Wind fencing along the west property line is intact and properly tensioned. No damage or displacement from recent wind events.',
    status: 'compliant',
    confidence: 90,
    details: [
      'Polypropylene wind fence fabric is taut with no tears or sagging.',
      'Steel posts appear plumb and evenly spaced at 10-foot intervals.',
      'Fence height is consistent at approximately 6 feet.',
      'No debris accumulation against the fence that would impede airflow.',
    ],
    cgpReference:
      'CGP Section X.H.5.b \u2014 Wind barriers shall be installed and maintained as needed to reduce wind erosion on exposed soil areas.',
  },
  {
    checkpointId: 'WE-3',
    summary:
      'Portable wind screen panels around the stockpile area are in place and providing 360-degree coverage. Weighted bases appear stable.',
    status: 'compliant',
    confidence: 89,
    details: [
      'All wind screen panels are upright and connected in a continuous perimeter.',
      'Weighted bases appear stable with no tipping or shifting visible.',
      'Panel height of 8 feet provides adequate coverage for the stockpile.',
      'No gaps between panels that would allow wind-driven erosion.',
    ],
    cgpReference:
      'CGP Section X.H.5.b \u2014 Stockpiled materials shall be protected from wind erosion using covers, barriers, or other effective measures.',
  },

  // ── Materials Management ─────────────────────────────────────────────
  {
    checkpointId: 'MM-1',
    summary:
      'Primary concrete washout pit is properly lined and at approximately 30% capacity. No visible leaks or overflow, and the pit perimeter is clearly delineated with signage.',
    status: 'compliant',
    confidence: 94,
    details: [
      'Polyethylene liner is visible and appears intact with no punctures.',
      'Washout pit is at approximately 30% capacity with scheduled cleanout this week.',
      'Perimeter signage ("Concrete Washout Only") is visible in the imagery.',
      'No evidence of washout material outside the contained area.',
      'Access for cleanout equipment is clear on the north side.',
    ],
    cgpReference:
      'CGP Section X.H.6.a \u2014 Concrete washout areas shall be lined and maintained to prevent discharge of wash water to the storm drain system.',
  },
  {
    checkpointId: 'MM-2',
    summary:
      'Fuel storage area in the north equipment yard shows proper containment and safety measures. Double-walled tank and secondary containment berm appear intact.',
    status: 'compliant',
    confidence: 96,
    details: [
      'Double-walled diesel storage tank appears intact with no visible staining.',
      'Secondary containment berm is intact with no cracks or gaps.',
      'Impervious concrete pad shows no fuel staining or spill evidence.',
      'SPCC signage is posted and visible from the access approach.',
      'Spill kit station is visible adjacent to the tank.',
    ],
    cgpReference:
      'CGP Section X.H.6.b \u2014 Fuel and oil storage shall include secondary containment capable of holding 110% of the largest container volume.',
  },
  {
    checkpointId: 'MM-3',
    summary:
      'Paint and solvent storage area near Building C is properly housed in a covered, bermed staging area. Storage cabinet is visible and the area appears well-organized.',
    status: 'compliant',
    confidence: 90,
    details: [
      'Flammable materials cabinet is visible under the covered staging area.',
      'Bermed containment area shows no spills or staining.',
      'Cover structure provides rain protection for the storage area.',
      'Area appears organized with no loose containers visible outside the cabinet.',
    ],
    cgpReference:
      'CGP Section X.H.6.c \u2014 Paints, solvents, and other liquid materials shall be stored in covered areas with secondary containment.',
  },
  {
    checkpointId: 'MM-4',
    summary:
      'Secondary concrete washout near the west retaining wall is overflowing. Wash water has pooled on the surrounding soil surface approximately 8-10 feet beyond the containment boundary, creating a potential discharge pathway to the storm drain.',
    status: 'deficient',
    confidence: 86,
    details: [
      'Steel washout container is visibly full with wash water at or above the rim.',
      'Pooled wash water detected on the ground surface extending 8-10 feet south of the container.',
      'Alkaline wash water staining visible on adjacent soil, indicating repeated overflow.',
      'No secondary containment berm around the prefabricated container.',
      'Overflow pathway trends toward the storm drain inlet approximately 60 feet downslope.',
    ],
    cgpReference:
      'CGP Section X.H.6.a \u2014 Concrete washout facilities must be maintained to prevent overflow and discharge of high-pH wash water. Washout shall be cleaned when 75% full.',
    recommendations: [
      'Immediately pump out the washout container to restore capacity.',
      'Clean up pooled wash water from the surrounding soil surface.',
      'Install a temporary containment berm (sandbags or earthen) around the container.',
      'Increase cleanout frequency to prevent future overflows.',
      'Consider upsizing to a larger washout facility given the volume of west wall pours.',
    ],
  },
  {
    checkpointId: 'MM-5',
    summary:
      'Import fill stockpile is properly contained with perimeter silt fence and fiber rolls. Polyethylene cover is in place and anchored.',
    status: 'compliant',
    confidence: 91,
    details: [
      'Silt fence is intact around the full stockpile perimeter.',
      'Fiber rolls provide secondary sediment containment.',
      'Polyethylene sheeting is covering the stockpile and anchored with sandbags.',
      'No erosion rills or washout visible at the stockpile base.',
    ],
    cgpReference:
      'CGP Section X.H.6.d \u2014 Stockpiled materials shall be protected from erosion and sediment transport using appropriate BMPs.',
  },
  {
    checkpointId: 'MM-6',
    summary:
      'Hazmat spill kit station in the main yard is visible, accessible, and appears to be fully stocked based on the external condition of the cabinet.',
    status: 'compliant',
    confidence: 86,
    details: [
      'Spill response cabinet is visible and appears to be in good condition.',
      'Emergency contact information placard is posted on the cabinet.',
      'Cabinet location is accessible from the main equipment parking area.',
      'No evidence of recent spill response use (clean surrounding area).',
    ],
    cgpReference:
      'CGP Section X.H.6.e \u2014 Spill prevention and response materials shall be available on-site at all times.',
  },
  {
    checkpointId: 'MM-7',
    summary:
      'Aggregate base stockpile is contained with fiber rolls and appears stable. Self-draining material does not require cover per SWPPP specifications.',
    status: 'compliant',
    confidence: 93,
    details: [
      'Fiber rolls are in place around the stockpile perimeter.',
      'Aggregate material appears clean and free of fines.',
      'No sediment runoff visible from the stockpile base.',
      'Stockpile height and slope appear stable with no sloughing.',
    ],
    cgpReference:
      'CGP Section X.H.6.d \u2014 Non-erodible stockpiled materials (e.g., aggregate) may be exempt from cover requirements if contained by perimeter controls.',
  },

  // ── Non-Storm Water ──────────────────────────────────────────────────
  {
    checkpointId: 'NS-1',
    summary:
      'Foundation dewatering system for Building A is operating properly. Baker tank and weir tank are visible and discharge to the sediment basin appears controlled.',
    status: 'compliant',
    confidence: 92,
    details: [
      'Submersible pump is operational with discharge hose connected to the Baker tank.',
      'Baker tank (21,000 gal) is upright and appears to have adequate settling capacity.',
      'Weir tank discharge to the sediment basin is visible with controlled flow.',
      'No turbid discharge visible at the sediment basin discharge point.',
      'Continuous turbidity monitor housing is visible at the discharge point.',
    ],
    cgpReference:
      'CGP Section X.H.7.a \u2014 Construction dewatering discharges shall be treated to remove pollutants prior to discharge and shall not cause erosion.',
  },
  {
    checkpointId: 'NS-2',
    summary:
      'Utility trench dewatering at NS-2 shows turbid discharge downstream of the filter bag system. Turbidity readings from the most recent sampling exceeded 250 NTU, indicating the filter bag system is not providing adequate treatment.',
    status: 'deficient',
    confidence: 82,
    details: [
      'Pump is discharging groundwater through a filter bag system as designed.',
      'Visible turbidity in the discharge water downstream of the filter bags.',
      'Filter bag fabric appears clogged or saturated, reducing filtration effectiveness.',
      'Last sampling event recorded 280 NTU, exceeding the 250 NTU discharge limit.',
      'Discharge pooling area shows turbid standing water approximately 15 feet from the bags.',
    ],
    cgpReference:
      'CGP Section X.H.7.a \u2014 Non-storm water discharges from dewatering activities shall not exceed numeric effluent limitations for turbidity.',
    recommendations: [
      'Immediately replace saturated filter bags with new bags.',
      'Add a secondary treatment step such as a chitosan-enhanced flocculation system.',
      'Increase sampling frequency to every 4 hours until turbidity is consistently below 250 NTU.',
      'Consider routing dewatering discharge through the Baker tank treatment system at NS-1.',
      'Document all corrective actions in the SWPPP amendment log.',
    ],
  },
  {
    checkpointId: 'NS-3',
    summary:
      'Potable water management for irrigation testing is properly contained. Flex hose routing to the vegetated infiltration area is visible and no direct discharge to storm drains detected.',
    status: 'compliant',
    confidence: 88,
    details: [
      'Flex hose is routed from the irrigation test zone to the vegetated area.',
      'No pooling or runoff visible on paved surfaces near the irrigation test.',
      'Vegetated infiltration area shows moist conditions indicating proper discharge routing.',
      'No direct connection to the storm drain system observed.',
    ],
    cgpReference:
      'CGP Section X.H.7.b \u2014 Potable water discharges shall be routed to prevent erosion and shall not discharge to the storm drain system without treatment.',
  },
  {
    checkpointId: 'NS-4',
    summary:
      'Equipment wash-down area in the north yard is properly bermed and draining to the holding tank. Oil-water separator appears functional.',
    status: 'compliant',
    confidence: 91,
    details: [
      'Bermed containment pad is intact with no visible cracks or gaps.',
      'Oil-water separator is in place between the wash pad and holding tank.',
      'No wash water observed outside the bermed area.',
      'Holding tank appears to have adequate remaining capacity.',
    ],
    cgpReference:
      'CGP Section X.H.7.c \u2014 Vehicle and equipment wash water shall be contained, treated, and properly disposed of. No discharge to the storm drain system.',
  },
  {
    checkpointId: 'NS-5',
    summary:
      'Saw-cutting slurry containment using vacuum recovery is effective. No visible slurry on paved surfaces and the disposal connection to the concrete washout is functional.',
    status: 'compliant',
    confidence: 89,
    details: [
      'Vacuum recovery unit is present at the saw-cutting operation area.',
      'No visible slurry residue on the paved surface beyond the immediate work zone.',
      'Slurry transfer hose to the concrete washout pit is connected.',
      'Work area is clean with no evidence of slurry discharge to the storm drain.',
    ],
    cgpReference:
      'CGP Section X.H.7.d \u2014 Saw-cutting slurry and grinding residue shall be collected and properly disposed of. No discharge to the storm drain system.',
  },
];
