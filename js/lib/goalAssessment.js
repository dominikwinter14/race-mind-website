// ══════════════════════════════════════════
// Goal-time classifier (App copy) — mirror of
// supabase/functions/_shared/goal-assessment.ts.
//
// Extracted verbatim from realismCheck.ts so the onboarding forecast and the
// plan engine share ONE classification. Parity with the edge copy is pinned
// by supabase/functions/_test/goal-assessment-parity.test.ts (same precedent
// as the race-duration predictor mirror). Keep the two byte-identical.
// ══════════════════════════════════════════
function round2(n) {
    return Math.round(n * 100) / 100;
}
function formatTime(hours) {
    if (!hours)
        return null;
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return h + ':' + String(m).padStart(2, '0');
}
/** Pure goal-vs-projection classifier. Uses the projected best/probable/worst
 *  spread as the zone boundaries. See the edge copy for the full table. */
export function classifyGoalTime(goalHours, projectedBest, projectedProb, projectedWorst) {
    const goal = goalHours;
    const gapHours = projectedProb - goal;
    const gapPct = round2((gapHours / goal) * 100);
    let scalePosition;
    let scaleLabel;
    let likelihood;
    if (formatTime(goal) === formatTime(projectedProb)) {
        scalePosition = 0.05;
        scaleLabel = 'comfortable';
        likelihood = 0.90;
    }
    else if (goal >= projectedProb && goal <= (projectedWorst ?? Infinity)) {
        scalePosition = 0.05;
        scaleLabel = 'comfortable';
        likelihood = 0.90;
    }
    else if (goal >= (projectedBest ?? -Infinity) && goal < projectedProb) {
        const range = projectedProb - (projectedBest ?? projectedProb);
        const posInRange = range > 0 ? (projectedProb - goal) / range : 0.5;
        scalePosition = round2(0.20 + 0.20 * posInRange);
        scaleLabel = 'stretch';
        likelihood = range > 0 ? round2(0.50 + 0.20 * (1 - posInRange)) : 0.60;
    }
    else if (goal < (projectedBest ?? projectedProb)) {
        const overshootPct = ((((projectedBest ?? projectedProb) - goal) / (projectedBest ?? projectedProb))) * 100;
        if (overshootPct <= 3) {
            scalePosition = 0.50;
            scaleLabel = 'high_effort';
            likelihood = 0.40;
        }
        else if (overshootPct <= 8) {
            scalePosition = 0.65 + (overshootPct - 3) / 5 * 0.15;
            scaleLabel = 'high_effort';
            likelihood = Math.max(0.10, 0.40 - (overshootPct - 3) * 0.06);
        }
        else {
            scalePosition = Math.min(0.95, 0.80 + (overshootPct - 8) / 10 * 0.15);
            scaleLabel = 'unrealistic';
            likelihood = Math.max(0.02, 0.10 - (overshootPct - 8) * 0.01);
        }
    }
    else {
        const undershootPct = ((goal - (projectedWorst ?? projectedProb)) / (projectedWorst ?? projectedProb)) * 100;
        if (undershootPct > 3) {
            scalePosition = 0.0;
            scaleLabel = 'too_easy';
            likelihood = Math.min(0.99, 0.97 + undershootPct * 0.002);
        }
        else {
            scalePosition = 0.0;
            scaleLabel = 'comfortable';
            likelihood = 0.95;
        }
    }
    likelihood = round2(Math.max(0, Math.min(1, likelihood)));
    scalePosition = round2(Math.max(0, Math.min(1, scalePosition)));
    return { scale_label: scaleLabel, scale_position: scalePosition, likelihood, gap_hours: round2(gapHours), gap_pct: gapPct };
}
// ── Limiting split + ★ recommendation (mirror of the edge copy) ──
const TYPICAL_SPLIT_SHARE = {
    ironman: { swim: 0.10, bike: 0.55, run: 0.35 },
    half_ironman: { swim: 0.11, bike: 0.52, run: 0.37 },
    olympic_tri: { swim: 0.16, bike: 0.52, run: 0.32 },
    sprint_tri: { swim: 0.17, bike: 0.51, run: 0.32 },
};
export function deriveLimitingSplit(raceType, splits) {
    if (raceType === 'marathon' || raceType === 'half_marathon' || raceType === '10k' || raceType === '5k') {
        return splits.run != null ? 'run' : null;
    }
    const typical = TYPICAL_SPLIT_SHARE[raceType];
    if (!typical)
        return null;
    const total = (splits.swim ?? 0) + (splits.bike ?? 0) + (splits.run ?? 0);
    if (total <= 0)
        return null;
    let limiter = null;
    let worstRatio = -Infinity;
    for (const d of ['swim', 'bike', 'run']) {
        const v = splits[d];
        if (v == null)
            continue;
        const actualShare = v / total;
        const ratio = actualShare / typical[d];
        if (ratio > worstRatio) {
            worstRatio = ratio;
            limiter = d;
        }
    }
    return limiter;
}
const AMBITIOUS_GOALS = new Set(['stretch', 'high_effort', 'unrealistic']);
/** Per-discipline training responsiveness (§16.2 constraintCap). See edge copy. */
const TRAINABILITY = { bike: 1.0, run: 0.85, swim: 0.55 };
/** §16.2 leverScore = headroom × zeitAnteil × trainability. See edge copy. */
export function computeLeverScores(raceType, splits) {
    const typical = TYPICAL_SPLIT_SHARE[raceType];
    if (!typical)
        return {};
    const total = (splits.swim ?? 0) + (splits.bike ?? 0) + (splits.run ?? 0);
    if (total <= 0)
        return {};
    const scores = {};
    for (const d of ['swim', 'bike', 'run']) {
        const v = splits[d];
        if (v == null)
            continue;
        const actualShare = v / total;
        const headroom = actualShare / typical[d];
        scores[d] = headroom * actualShare * TRAINABILITY[d];
    }
    return scores;
}
/** ★ recommended default_sport_focus (advisory, opt-in). See edge copy. */
export function recommendSportFocus(raceType, strategy, splits) {
    if (!TYPICAL_SPLIT_SHARE[raceType])
        return 'balanced';
    if (strategy == null || !AMBITIOUS_GOALS.has(strategy))
        return 'balanced';
    const scores = computeLeverScores(raceType, splits);
    let best = null;
    let bestScore = -Infinity;
    for (const d of ['swim', 'bike', 'run']) {
        const s = scores[d];
        if (s != null && s > bestScore) {
            bestScore = s;
            best = d;
        }
    }
    if (best == null)
        return 'balanced';
    return best === 'run' ? 'run_focus' : best === 'bike' ? 'bike_focus' : 'swim_focus';
}
/** Minimum general-phase block count before the ★ focus rotates per block. Below
 *  this the lead window is too short to sequence — the single top lever is kept
 *  on every block (identical to the pre-sequence behaviour). */
const MIN_SEQUENCE_BLOCKS = 3;
function focusOf(d) {
    return d === 'run' ? 'run_focus' : d === 'bike' ? 'bike_focus' : 'swim_focus';
}
/** §16.7 ★ focus sequence across general-phase blocks (mirror of edge copy). */
export function recommendSportFocusSequence(raceType, strategy, splits, generalBlockCount) {
    if (generalBlockCount <= 0)
        return [];
    const top = recommendSportFocus(raceType, strategy, splits);
    if (top === 'balanced')
        return Array(generalBlockCount).fill('balanced');
    if (generalBlockCount < MIN_SEQUENCE_BLOCKS)
        return Array(generalBlockCount).fill(top);
    const typical = TYPICAL_SPLIT_SHARE[raceType];
    const total = (splits.swim ?? 0) + (splits.bike ?? 0) + (splits.run ?? 0);
    const scores = computeLeverScores(raceType, splits);
    const weaknesses = ['swim', 'bike', 'run']
        .filter((d) => {
        const v = splits[d];
        if (v == null || total <= 0 || !typical)
            return false;
        return (v / total) / typical[d] > 1;
    })
        .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
    const topDisc = top === 'run_focus' ? 'run' : top === 'bike_focus' ? 'bike' : 'swim';
    const ranked = [topDisc, ...weaknesses.filter((d) => d !== topDisc)];
    return Array.from({ length: generalBlockCount }, (_unused, i) => i < ranked.length ? focusOf(ranked[i]) : 'balanced');
}
