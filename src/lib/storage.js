function mkStore(getArea) {
  let area = null;
  try { area = getArea(); area && area.getItem('__t'); } catch { area = null; }
  return {
    get(k, d) { try { const v = area?.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { area?.setItem(k, JSON.stringify(v)); return true; } catch (e) { console.warn(e); return false; } },
    del(k) { try { area?.removeItem(k); } catch { /* ignore */ } },
    keys() { try { return area ? Object.keys(area) : []; } catch { return []; } }
  };
}
export const LS = mkStore(() => window.localStorage);
export const SS = mkStore(() => window.sessionStorage);

/** Remove trend caches older than 3 days. */
export function cleanTrendCache() {
  for (const k of LS.keys()) {
    if (!k.startsWith('fss_trend_')) continue;
    const v = LS.get(k, null);
    if (!v || Date.now() - v.ts > 3 * 24 * 3600e3) LS.del(k);
  }
}
