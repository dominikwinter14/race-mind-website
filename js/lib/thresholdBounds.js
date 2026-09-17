// Pure on purpose: lib/realismCheck.ts needs the band too, and importing
// lib/thresholds.ts from there drags the Supabase client into every module that
// only wants a prognosis (the integration Jest project cannot load it).
/**
 * What a threshold may be before we stop believing it.
 *
 * One band per quantity, for every screen that writes one — the settings sheet
 * and the onboarding check both go through `isInBounds`. Until 19.08.2026 only
 * the settings sheet did, which is how a CSS of 12234 s/100m entered a baseline
 * through onboarding and came out as a 951-minute swim in a plan.
 *
 * The numbers were re-derived on 19.08.2026 against production (100 athletes
 * with a CSS, 136 with a run threshold, 98 with an FTP) and against the
 * estimator's own bands in supabase/functions/_shared/update-baseline.ts, which
 * are the ones that actually clamp the stored value. Where the two disagreed,
 * the estimator won: it is the side with a written derivation, and a screen
 * that refuses what the estimator would accept is the worse failure — it turns
 * an athlete away over a number that is simply true of them.
 *
 *  * `css_pace_100m` 70-240, was 60-180. Production runs 66 to 204, so both
 *    ends of the old band were wrong: 180 rejects a real 3:24/100 m beginner,
 *    and 60 admits the one athlete at 66 whose watch reports world-class pace
 *    over 3 km — almost certainly a pool length set to double the real one, and
 *    the case `cssInBand` was written to catch.
 *  * `run_threshold_pace_sec_km` 150-600, was 180-600. Matches
 *    RUN_PACE_MIN_SEC_KM/MAX. Production runs 210 to 570, so the change is
 *    headroom rather than a decision about anyone real.
 *  * `ftp_watts` 50-600, unchanged. The estimator has no absolute counterpart —
 *    its ceiling is W/kg against the athlete's own weight and level — so there
 *    was nothing to reconcile with. Production runs 80 to 336, well inside.
 */
export const THRESHOLD_BOUNDS = {
    ftp_watts: { min: 50, max: 600 },
    run_threshold_pace_sec_km: { min: 150, max: 600 },
    css_pace_100m: { min: 70, max: 240 },
};
export function isInBounds(field, value) {
    const { min, max } = THRESHOLD_BOUNDS[field];
    return Number.isFinite(value) && value >= min && value <= max;
}
