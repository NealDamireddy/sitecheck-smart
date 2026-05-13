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
 * Map a stored analytical-method value to the SMARTS dropdown string.
 *   'pH field' → 'pH_field' (underscore is the SMARTS form)
 *   'Hach 2100Q' → 'EPA 180.1' (Hach 2100Q is an instrument, not an EPA method)
 *   Everything else passes through.
 */
export function normalizeMethod(method: string): string {
  if (method === 'pH field') return 'pH_field';
  if (method === 'Hach 2100Q') return 'EPA 180.1';
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
