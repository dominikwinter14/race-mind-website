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
/**
 * A threshold derived from a distance + duration, kept inside the band whenever
 * the athlete's own pace is.
 *
 * The derivation shifts the pace by a few percent — a 5 km test sits ~2 % faster
 * than threshold pace, a 100 m swim 18 % — so "5 km in 50 min" (exactly 10:00/km)
 * derived 610 s/km and "100 m in 3:24" 241 s/100m, both just past the band. The
 * screens then refused the athlete with a range their own number was inside,
 * and the save dropped the value (review 24.09.2026, A1). The seed is pulled to
 * the band's edge instead; the server's estimator clamps to the same band.
 *
 * A typed pace outside the band stays unclamped, so the screens still refuse
 * it. Only run and swim: a ride's distance + duration has no pace in watts to
 * hold against the FTP band.
 */
export function seedInBand(field, derived, input) {
    if (derived == null || input?.mode !== 'custom' || !input.distance_m || !input.duration_sec)
        return derived;
    const typedPace = input.duration_sec / (input.distance_m / (field === 'css_pace_100m' ? 100 : 1000));
    if (isInBounds(field, derived) || !isInBounds(field, typedPace))
        return derived;
    const { min, max } = THRESHOLD_BOUNDS[field];
    return Math.min(max, Math.max(min, derived));
}
