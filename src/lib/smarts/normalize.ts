/**
 * SMARTS render-time normalization — shared by excel-export and walkthrough.
 *
 * Capture-page defaults today still store the pre-normalization strings
 * ('su', 'pH field', 'Hach 2100Q', qualifier '='). Both export targets
 * map those to the SMARTS dropdown values via the helpers below so the
 * demo data ports cleanly. See KNOWN DRIFT in the step-11 commit
 * message for the underlying capture-default cleanup that's deferred.
 */

/**
 * Map a stored units value to the SMARTS dropdown string.
 *   'su' → 'SU' (pH)
 *   'NTU' / etc. pass through unchanged.
 */
export function normalizeUnits(units: string): string {
  if (units === 'su') return 'SU';
  return units;
}

/**
 * Map a stored analytical-method value to the EXACT SMARTS dropdown
 * option text. Casing and spelling matter: the sync bot selects these
 * dropdowns by option text, so any mismatch halts the fill. The target
 * strings below were read from the live SMARTS Raw Data form DOM
 * (pH: A4500HB / E150.2 / pH_Field / pH_Paper; turbidity: E180.1 /
 * A2130B) — note there is NO "EPA 180.1" or "pH_field" in SMARTS.
 *
 *   'pH field'  → 'pH_Field'  (underscored, capital F — SMARTS form)
 *   'Hach 2100Q'→ 'E180.1'    (instrument name → the EPA 180.1 method,
 *                              which SMARTS lists as "E180.1")
 *   'EPA 180.1' → 'E180.1'    (long-form alias)
 *   'EPA 150.2' → 'E150.2'    (long-form alias)
 *   Everything else passes through.
 */
export function normalizeMethod(method: string): string {
  if (method === 'pH field') return 'pH_Field';
  if (method === 'Hach 2100Q') return 'E180.1';
  if (method === 'EPA 180.1') return 'E180.1';
  if (method === 'EPA 150.2') return 'E150.2';
  return method;
}

/**
 * SMARTS uses a blank qualifier for normal (equality) measurements and
 * literal strings ('ND', 'DNQ') for the non-detect and detected-not-
 * quantified cases. Our schema stores '=' as a placeholder for "no
 * qualifier" — map back to blank at render time.
 */
export function normalizeQualifier(qualifier: string): string {
  if (qualifier === '=') return '';
  return qualifier;
}

/**
 * Split an ISO 8601 datetime into separate MM/DD/YYYY + HH:MM (24-hour)
 * strings in local time. SMARTS treats date and time as separate fields
 * in its UI; this split makes both renderers (Excel cells, walkthrough
 * text) align with the data-entry person's typing flow.
 */
export function splitIsoDate(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  const HH = String(d.getHours()).padStart(2, '0');
  const MM = String(d.getMinutes()).padStart(2, '0');
  return {
    date: `${mm}/${dd}/${yyyy}`,
    time: `${HH}:${MM}`,
  };
}
