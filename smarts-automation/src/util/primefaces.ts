import type { Page } from "playwright";

export const PF_TIMEOUT_MS = 30_000;

export interface JsfSelectArgs {
  optionText: string;
  preferredId: string | null;
  // Match the select by its `name` attribute (JSF/PrimeFaces row-indexed names
  // like `constAdhocForm:CGPAdhocRawData:j_idt288:0:j_idt298` — stable per row
  // index even when `j_idt###` drifts, since the row index is structural).
  preferredName: string | null;
  point: { x: number; y: number } | null;
}

export interface JsfSelectResult {
  found: boolean;
  optionFound: boolean;
  selectId: string | null;
  value: string | null;
  matchedBy: "id" | "name" | "option-text" | null;
}

/**
 * Set a JSF/PrimeFaces selectOneMenu's value by directly driving the hidden
 * native <select> and dispatching a bubbling "change" event.
 *
 * PrimeFaces hides the real <select> (aria-hidden, styled behind a div) and its
 * onchange="mojarra.ab(...)" triggers the JSF partial-page AJAX update. Clicking
 * the visual widget is unreliable; setting select.value + dispatching "change"
 * fires the same AJAX deterministically.
 *
 * Resolution order:
 *   1. preferredSelectId (exact element id), if present and it has a matching option;
 *   2. otherwise, any <select> that has an <option> whose text matches optionText
 *      (nearest to `point` when several match and a point is given).
 *
 * Runs entirely in the page context so the browser's own Event/onchange fires.
 */
export async function setJsfSelectByText(
  page: Page,
  optionText: string,
  preferredSelectId?: string,
  point?: { x: number; y: number },
  preferredSelectName?: string,
): Promise<JsfSelectResult> {
  const args: JsfSelectArgs = {
    optionText,
    preferredId: preferredSelectId ?? null,
    preferredName: preferredSelectName ?? null,
    point: point ?? null,
  };
  // IMPORTANT: this callback is serialized and run in the browser, so it must be
  // a *plain inline arrow with no named inner helpers and no TS annotations*.
  // tsx/esbuild (keepNames) wraps any named function/const-arrow with
  // `__name(fn, "name")`; that wrapper is undefined in the page context and
  // throws `ReferenceError: __name is not defined` inside page.evaluate.
  // `jsfSelectInBrowser` (below) is the same logic kept as a named export so it
  // can be unit-tested in Node — keep the two in sync.
  const result = (await page.evaluate((a) => {
    const optionText = a.optionText;
    const preferredId = a.preferredId;
    const preferredName = a.preferredName;
    const point = a.point;
    const allSelects = Array.from(document.querySelectorAll("select"));

    let select = null;
    let matchedBy = null;

    if (preferredId) {
      const byId = allSelects.find((s) => s.id === preferredId);
      if (byId) {
        const opts = Array.from(byId.options);
        const m =
          opts.find((o) => o.text.trim() === optionText) ||
          opts.find((o) => o.value === optionText) ||
          opts.find((o) => o.text.includes(optionText));
        if (m) {
          select = byId;
          matchedBy = "id";
        }
      }
    }

    if (!select && preferredName) {
      const byName = allSelects.find((s) => s.name === preferredName);
      if (byName) {
        const opts = Array.from(byName.options);
        const m =
          opts.find((o) => o.text.trim() === optionText) ||
          opts.find((o) => o.value === optionText) ||
          opts.find((o) => o.text.includes(optionText));
        if (m) {
          select = byName;
          matchedBy = "name";
        }
      }
    }

    if (!select) {
      const candidates = allSelects.filter((s) => {
        const opts = Array.from(s.options);
        return (
          opts.some((o) => o.text.trim() === optionText) ||
          opts.some((o) => o.value === optionText) ||
          opts.some((o) => o.text.includes(optionText))
        );
      });
      if (candidates.length > 0) {
        if (point && candidates.length > 1) {
          let best = null;
          for (const s of candidates) {
            const r = s.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            const d = Math.hypot(cx - point.x, cy - point.y);
            if (!best || d < best.distance) best = { select: s, distance: d };
          }
          select = best ? best.select : null;
        } else {
          select = candidates[0] || null;
        }
        if (select) matchedBy = "option-text";
      }
    }

    if (!select) {
      return {
        found: false,
        optionFound: false,
        selectId: null,
        value: null,
        matchedBy: null,
      };
    }

    const finalOpts = Array.from(select.options);
    const opt =
      finalOpts.find((o) => o.text.trim() === optionText) ||
      finalOpts.find((o) => o.value === optionText) ||
      finalOpts.find((o) => o.text.includes(optionText));

    if (!opt) {
      return {
        found: true,
        optionFound: false,
        selectId: select.id || null,
        value: null,
        matchedBy: matchedBy,
      };
    }

    select.value = opt.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return {
      found: true,
      optionFound: true,
      selectId: select.id || null,
      value: opt.value,
      matchedBy: matchedBy,
    };
  }, args)) as JsfSelectResult;
  console.log(
    `[pf] setJsfSelect "${optionText}" (preferredId=${
      args.preferredId ?? "none"
    }): found=${result.found} optionFound=${result.optionFound} id=${
      result.selectId
    } value=${result.value} matchedBy=${result.matchedBy}`,
  );
  return result;
}

/**
 * Node-side mirror of the inline resolver in {@link setJsfSelectByText}. Kept as
 * a named export purely so the resolution logic can be unit-tested in Node
 * (where `__name` exists). The real browser path uses an inline arrow inside
 * page.evaluate — this function is NOT passed to page.evaluate. Keep both in sync.
 *
 * Match priority for an <option>: exact trimmed text, then exact value, then
 * substring text. (Value matching lets callers select by the option's value,
 * e.g. "2025" for the "2025 - 2026" reporting year.)
 */
export function jsfSelectInBrowser(args: JsfSelectArgs): JsfSelectResult {
  const { optionText, preferredId, preferredName, point } = args;

  const matchOption = (sel: HTMLSelectElement): HTMLOptionElement | null => {
    const opts = Array.from(sel.options);
    return (
      opts.find((o) => o.text.trim() === optionText) ??
      opts.find((o) => o.value === optionText) ??
      opts.find((o) => o.text.includes(optionText)) ??
      null
    );
  };

  let select: HTMLSelectElement | null = null;
  let matchedBy: "id" | "name" | "option-text" | null = null;

  if (preferredId) {
    const el = document.getElementById(preferredId);
    if (el && el.tagName === "SELECT") {
      const sel = el as HTMLSelectElement;
      if (matchOption(sel)) {
        select = sel;
        matchedBy = "id";
      }
    }
  }

  if (!select && preferredName) {
    const byName = Array.from(document.querySelectorAll("select")).find(
      (s) => s.name === preferredName,
    );
    if (byName && matchOption(byName)) {
      select = byName;
      matchedBy = "name";
    }
  }

  if (!select) {
    const candidates = Array.from(document.querySelectorAll("select")).filter(
      (s) => matchOption(s),
    );
    if (candidates.length > 0) {
      if (point && candidates.length > 1) {
        let best: { s: HTMLSelectElement; d: number } | null = null;
        for (const s of candidates) {
          const r = s.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const d = Math.hypot(cx - point.x, cy - point.y);
          if (!best || d < best.d) best = { s, d };
        }
        select = best ? best.s : null;
      } else {
        select = candidates[0] ?? null;
      }
      if (select) matchedBy = "option-text";
    }
  }

  if (!select) {
    return {
      found: false,
      optionFound: false,
      selectId: null,
      value: null,
      matchedBy: null,
    };
  }

  const opt = matchOption(select);
  if (!opt) {
    return {
      found: true,
      optionFound: false,
      selectId: select.id || null,
      value: null,
      matchedBy,
    };
  }

  select.value = opt.value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return {
    found: true,
    optionFound: true,
    selectId: select.id || null,
    value: opt.value,
    matchedBy,
  };
}
