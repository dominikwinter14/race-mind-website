const LEGS = ['swim', 'bike', 'run'];
const RAW = { swim: 'swim_prognose_hours', bike: 'bike_prognose_hours', run: 'run_prognose_hours' };
const ADJUSTED = { swim: 'adjusted_swim_hours', bike: 'adjusted_bike_hours', run: 'adjusted_run_hours' };
const COURSE_FACTOR = { swim: 'course_factor_swim', bike: 'course_factor_bike', run: 'course_factor_run' };
function hours(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}
function round4(n) {
    return Math.round(n * 10000) / 10000;
}
/** True when the race has a leg (distance > 0) the prognosis has no hours for. */
export function missingLeg(legs, dist) {
    return LEGS.some((leg) => dist[leg] > 0 && hours(legs[RAW[leg]]) == null);
}
/**
 * Raw and course-adjusted total over the race's legs and transitions, or null
 * while a leg the race has is unpriced. A leg without an adjusted value counts
 * with its raw hours.
 */
export function legTotals(legs, dist) {
    if (missingLeg(legs, dist))
        return null;
    const transitions = (dist.t1_min + dist.t2_min) / 60;
    let raw = transitions;
    let adjusted = transitions;
    for (const leg of LEGS) {
        const legRaw = dist[leg] > 0 ? hours(legs[RAW[leg]]) : null;
        if (legRaw == null)
            continue;
        raw += legRaw;
        adjusted += hours(legs[ADJUSTED[leg]]) ?? legRaw;
    }
    return { raw: round4(raw), adjusted: round4(adjusted) };
}
/**
 * Puts the baseline's legs into a prognosis recalculated from thresholds.
 * `baselineFirst` (no threshold edited): a baseline leg replaces the
 * recalculated one, as a complete baseline is used whole. Otherwise a baseline
 * leg only fills a leg the thresholds could not price. `filled` says whether a
 * leg changed, so the caller sums the total again.
 */
export function fillLegsFromBaseline(prognosis, baseline, dist, baselineFirst) {
    const next = { ...prognosis };
    let filled = false;
    for (const leg of LEGS) {
        const stored = dist[leg] > 0 ? hours(baseline[RAW[leg]]) : null;
        if (stored == null || stored === prognosis[RAW[leg]])
            continue;
        if (!baselineFirst && hours(prognosis[RAW[leg]]) != null)
            continue;
        next[RAW[leg]] = stored;
        next[ADJUSTED[leg]] = hours(baseline[ADJUSTED[leg]]) ?? round4(stored * next[COURSE_FACTOR[leg]]);
        filled = true;
    }
    return { prognosis: next, filled };
}
/** Clears the total and its ranges of a prognosis that lacks a leg of the race (mutates, like its caller). */
export function clearTotalWithoutLeg(prognosis, dist) {
    if (!missingLeg(prognosis, dist))
        return;
    prognosis.total_prognose_hours = null;
    prognosis.adjusted_total_hours = null;
    prognosis.best_case_hours = null;
    prognosis.worst_case_hours = null;
    prognosis.adjusted_best_hours = null;
    prognosis.adjusted_worst_hours = null;
}
