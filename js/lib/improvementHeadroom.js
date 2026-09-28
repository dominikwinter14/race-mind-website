// ══════════════════════════════════════════
// Improvement headroom — the app mirror of
// supabase/functions/_shared/improvement-headroom.ts (Phase 2,
// docs/plan-level-forecast-2026-09.md): how much faster an athlete gets by race
// day, from their thresholds instead of their level. The onboarding forecast
// and the website calculator read it through lib/onboardingRaceDay.ts.
//
// No imports on purpose: the Deno parity test
// (supabase/functions/_test/improvement-headroom-parity.test.ts) reads this
// file as it is, and an import without a file extension breaks it. The race
// predictor comes in as a parameter instead. The same test compares the
// tables and every function's result with the edge copy.
//
// One deliberate difference: the app never prices a standalone bike race, so
// the FTP is never derived from the run threshold here.
// ══════════════════════════════════════════
const LEGS = ['swim', 'bike', 'run'];
const LEG_HOURS = { swim: 'swim_hours', bike: 'bike_hours', run: 'run_hours' };
const CASES = ['worst', 'probable', 'best'];
/** Run: age grade → share of the run time gained in 12 months. */
export const RUN_HEADROOM = [
    { at: 0.35, worst: 0.15, probable: 0.18, best: 0.20 },
    { at: 0.42, worst: 0.13, probable: 0.155, best: 0.18 },
    { at: 0.50, worst: 0.09, probable: 0.105, best: 0.12 },
    { at: 0.60, worst: 0.05, probable: 0.065, best: 0.08 },
    { at: 0.70, worst: 0.03, probable: 0.04, best: 0.05 },
    { at: 0.80, worst: 0.015, probable: 0.02, best: 0.03 },
    { at: 0.90, worst: 0.005, probable: 0.01, best: 0.015 },
];
/** Bike: W/kg (age-adjusted) → FTP gained in 12 months. The bike time follows
 *  from the race predictor's own power balance, no exponent of its own. */
export const BIKE_FTP_GAIN = [
    { at: 1.5, worst: 0.20, probable: 0.24, best: 0.27 },
    { at: 2.0, worst: 0.15, probable: 0.18, best: 0.21 },
    { at: 2.4, worst: 0.10, probable: 0.125, best: 0.15 },
    { at: 2.8, worst: 0.08, probable: 0.10, best: 0.12 },
    { at: 3.5, worst: 0.04, probable: 0.06, best: 0.08 },
    { at: 4.2, worst: 0.02, probable: 0.03, best: 0.045 },
    { at: 4.6, worst: 0.01, probable: 0.02, best: 0.035 },
];
/** Swim: CSS per 100 m in seconds (age-adjusted) → share of the swim time. */
export const SWIM_HEADROOM = [
    { at: 90, worst: 0.01, probable: 0.015, best: 0.02 },
    { at: 100, worst: 0.015, probable: 0.025, best: 0.03 },
    { at: 120, worst: 0.045, probable: 0.06, best: 0.07 },
    { at: 150, worst: 0.08, probable: 0.10, best: 0.12 },
    { at: 180, worst: 0.12, probable: 0.15, best: 0.18 },
    { at: 210, worst: 0.14, probable: 0.17, best: 0.20 },
];
/** Age factors of the 2025 road age-grading tables (A. Jones, USATF MLDR),
 *  10 km, men — for bike and swim as an approximation. 1.0 up to 33; held at
 *  the 70-year value above, where the tables are thin for our athletes. */
export const AGE_FACTOR = [
    { at: 33, factor: 1.0 },
    { at: 35, factor: 0.991 },
    { at: 40, factor: 0.964 },
    { at: 45, factor: 0.926 },
    { at: 50, factor: 0.889 },
    { at: 60, factor: 0.814 },
    { at: 70, factor: 0.739 },
];
/** The threshold pace that is ~100 % age grade for a 30-year-old man: the
 *  10 km standard 26:24 (158 s/km), a threshold ~3 % slower. Our derivation. */
export const RUN_THRESHOLD_FULL_GRADE_SEC_KM = 163;
/** Without a threshold: a trainer's rule of thumb per level for 12 months,
 *  worst and best FALLBACK_SPREAD either side (Dominik, 28.09.2026). */
export const FALLBACK_HEADROOM = { beginner: 0.12, intermediate: 0.07, advanced: 0.04 };
export const FALLBACK_SPREAD = 0.2;
/** A threshold that is still an onboarding chip (a 5 km band, never measured)
 *  gets worst and best this many times as far from probable. */
export const CHIP_SPREAD = 1.5;
/** Without a weight the bike's power balance uses 75 kg, as the prognosis of
 *  today does (update-baseline estimateBikeHours, lib/realismCheck.ts). */
export const DEFAULT_WEIGHT_KG = 75;
/** Months to 63 % of the curve: 6 for probable and worst; best puts almost
 *  everything into the first 6 months (Rocha 2026, Scharhag-Rosenberger 2009). */
export const CURVE_TAU_MONTHS = { worst: 6, probable: 6, best: 3 };
/** Taper on top: probable as before (≤ 1.5 %, 15 % of the gain), best the
 *  literature's size (≤ 3 %, 25 %), worst none. */
export const TAPER = {
    worst: { max: 0, share: 0 },
    probable: { max: 0.015, share: 0.15 },
    best: { max: 0.03, share: 0.25 },
};
const HEADROOM_MONTHS = 12;
// ── Pieces ──
function lerp(points, x, c) {
    if (x <= points[0].at)
        return points[0][c];
    const last = points[points.length - 1];
    if (x >= last.at)
        return last[c];
    const i = points.findIndex((p) => p.at >= x);
    const lo = points[i - 1];
    const hi = points[i];
    return lo[c] + (hi[c] - lo[c]) * (x - lo.at) / (hi.at - lo.at);
}
/** The age factor at an age in years; 1 when unknown. */
export function ageFactor(ageYears) {
    if (ageYears == null || !Number.isFinite(ageYears))
        return 1;
    if (ageYears <= AGE_FACTOR[0].at)
        return 1;
    const last = AGE_FACTOR[AGE_FACTOR.length - 1];
    if (ageYears >= last.at)
        return last.factor;
    const i = AGE_FACTOR.findIndex((p) => p.at >= ageYears);
    const lo = AGE_FACTOR[i - 1];
    const hi = AGE_FACTOR[i];
    return lo.factor + (hi.factor - lo.factor) * (ageYears - lo.at) / (hi.at - lo.at);
}
/** Age in years at a date, from profiles.birth_date (YYYY-MM-DD); null when unknown. */
export function ageYearsAt(birthDate, at) {
    if (!birthDate)
        return null;
    const born = Date.parse(birthDate.slice(0, 10));
    if (!Number.isFinite(born))
        return null;
    return (at.getTime() - born) / (365.25 * 86400000);
}
/** Share of the 12-month headroom reached after `months`: 1 at 12, a little
 *  more after (the curve flattens, it does not stop). */
export function curveReached(months, tau) {
    if (!(months > 0))
        return 0;
    return (1 - Math.exp(-months / tau)) / (1 - Math.exp(-HEADROOM_MONTHS / tau));
}
/** The curve's rate today in share of the headroom per month — the prior a
 *  measured trend is weighed against (race-day-projection.ts). */
export function curveRateToday(tau) {
    return (1 / tau) / (1 - Math.exp(-HEADROOM_MONTHS / tau));
}
function spreadOf(pick) {
    return { worst: pick('worst'), probable: pick('probable'), best: pick('best') };
}
function widen(s, factor) {
    return {
        worst: Math.max(0, s.probable - factor * (s.probable - s.worst)),
        probable: s.probable,
        best: s.probable + factor * (s.best - s.probable),
    };
}
/** Share of each leg's time gained in 12 months, per case. */
export function disciplineHeadroom(input, predict) {
    const { thresholds, raceType, level } = input;
    const af = ageFactor(input.ageYears);
    const fallback = FALLBACK_HEADROOM[level] ?? FALLBACK_HEADROOM.intermediate;
    const standIn = {
        worst: fallback * (1 - FALLBACK_SPREAD), probable: fallback, best: fallback * (1 + FALLBACK_SPREAD),
    };
    const chip = (leg, s) => input.chips?.[leg] ? widen(s, CHIP_SPREAD) : s;
    const pace = thresholds.run_threshold_pace_sec_km;
    const run = pace && pace > 0
        ? chip('run', spreadOf((c) => lerp(RUN_HEADROOM, (RUN_THRESHOLD_FULL_GRADE_SEC_KM / pace) / af, c)))
        : standIn;
    const css = thresholds.css_pace_sec_per_100m;
    const swim = css && css > 0 ? chip('swim', spreadOf((c) => lerp(SWIM_HEADROOM, css * af, c))) : standIn;
    const weight = thresholds.weight_kg && thresholds.weight_kg > 0 ? thresholds.weight_kg : DEFAULT_WEIGHT_KG;
    const ftp = thresholds.ftp_watts && thresholds.ftp_watts > 0 ? thresholds.ftp_watts : null;
    let bike = standIn;
    if (ftp && ftp > 0) {
        const bikeHours = (watts) => predict({ run_threshold_pace_sec_km: null, ftp_watts: watts, css_pace_sec_per_100m: null, weight_kg: weight }, { raceType, level, execution: input.execution, ...(input.distances ? { distances: input.distances } : {}) }).bike_hours;
        const now = bikeHours(ftp);
        if (now > 0) {
            bike = chip('bike', spreadOf((c) => 1 - bikeHours(ftp * (1 + lerp(BIKE_FTP_GAIN, ftp / weight / af, c))) / now));
        }
    }
    return { swim, bike, run };
}
/** Volume sufficiency: soft ramp hMin→hNorm (0→1), diminishing returns hNorm→hCap (1→1.15). */
export function volumeEffect(hours, rp) {
    if (hours < rp.hMin)
        return 0;
    if (hours <= rp.hNorm)
        return (hours - rp.hMin) / (rp.hNorm - rp.hMin);
    if (hours <= rp.hCap)
        return 1 + 0.15 * (hours - rp.hNorm) / (rp.hCap - rp.hNorm);
    return 1.15;
}
/** The volume behind the headroom: the weekly goal's effect, lightly dampened
 *  by the jump from today's hours (the plan engine handles ramp safety). */
export function goalVolume(goalHours, currentHours, rp) {
    return volumeEffect(goalHours, rp) / (1 + 0.05 * Math.max(0, goalHours / currentHours - 1));
}
/** Below the distance's hMin the level does not grow by race day either
 *  (Dominik, 28.09.2026): the run off the bike and the bike's intensity rest on
 *  endurance too, and the forecast already calls improvement unlikely there. */
export function levelGrowsAt(goalHours, rp) {
    return goalHours >= rp.hMin;
}
// ── Race day ──
/** How the race-day execution changes each leg and the transitions, against
 *  today's (the predictor twice, seat at today's both times). A leg
 *  priced without a threshold keeps ratio 1: the fallback tables have no
 *  execution to glide. */
export function executionShift(params, predict) {
    const { thresholds, raceType, level, today, raceDay } = params;
    const opts = { raceType, level, seat: today, ...(params.distances ? { distances: params.distances } : {}) };
    // Without a weight, 75 kg as in disciplineHeadroom: today's bike leg is priced so.
    const weighed = thresholds.weight_kg && thresholds.weight_kg > 0 ? thresholds : { ...thresholds, weight_kg: DEFAULT_WEIGHT_KG };
    const now = predict(weighed, { ...opts, execution: today });
    const then = predict(weighed, { ...opts, execution: raceDay });
    const ratioOf = (leg) => {
        const key = LEG_HOURS[leg];
        return now[key] > 0 && !now.fallback_disciplines.includes(leg) ? then[key] / now[key] : 1;
    };
    return {
        ratio: { swim: ratioOf('swim'), bike: ratioOf('bike'), run: ratioOf('run') },
        transitionHours: then.transition_hours - now.transition_hours,
    };
}
/**
 * Today's finish per case, taken to race day: each leg at the race-day
 * execution (worst: today's), less its headroom on the curve times volume and
 * trend, less the taper, times the ageing. Null without a leg to project.
 */
export function projectRaceDay(input) {
    const legSum = LEGS.reduce((s, leg) => s + Math.max(0, input.legs[leg] || 0), 0);
    const today = legSum + Math.max(0, input.transitionHours);
    if (!(legSum > 0) || !(today > 0))
        return null;
    const hours = {};
    const improvement = {};
    const taper = {};
    const breakdown = {
        level: { swim: 0, bike: 0, run: 0 }, headroom: { swim: 0, bike: 0, run: 0 }, transitions: 0, taper: 0, ageing: 0,
    };
    for (const c of CASES) {
        // A measured trend moves the curve, but never past the table: the headroom
        // is the most there is (Dominik, 28.09.2026). A long run-up at high volume
        // may already sit above it, and the trend does not add to that either.
        const reach = curveReached(input.monthsToRace, CURVE_TAU_MONTHS[c]) * input.volume;
        const k = Math.min(reach * input.trendScale, Math.max(1, reach));
        const shifted = c !== 'worst';
        let after = 0;
        let gained = 0;
        const perLeg = { level: {}, headroom: {} };
        for (const leg of LEGS) {
            const now = Math.max(0, input.legs[leg] || 0);
            const executed = now * (shifted ? input.shift.ratio[leg] : 1);
            const gain = executed * Math.max(0, input.headroom[leg][c]) * k;
            after += executed - gain;
            gained += gain;
            perLeg.level[leg] = now - executed;
            perLeg.headroom[leg] = gain;
        }
        const transitions = Math.max(0, input.transitionHours + (shifted ? input.shift.transitionHours : 0));
        after += transitions;
        taper[c] = Math.min(TAPER[c].max, TAPER[c].share * gained / today);
        const share = (after / today - taper[c]) * input.ageing;
        hours[c] = input.base[c] * share;
        improvement[c] = 1 - share;
        if (c === 'probable') {
            const scale = input.base.probable / today;
            for (const leg of LEGS) {
                breakdown.level[leg] = perLeg.level[leg] * scale;
                breakdown.headroom[leg] = perLeg.headroom[leg] * scale;
            }
            breakdown.transitions = (Math.max(0, input.transitionHours) - transitions) * scale;
            breakdown.taper = taper[c] * input.base.probable;
            breakdown.ageing = input.base.probable * (after / today - taper[c]) * (1 - input.ageing);
        }
    }
    return { hours, improvement, taper, breakdown };
}
