/**
 * Race Duration Predictor (App-side mirror).
 *
 * App-side counterpart to `supabase/functions/_shared/race-duration-predictor.ts`.
 * Both files share identical formulas — keep in sync. The Edge version uses
 * Deno-style `.ts` imports; this one uses Metro-friendly imports (none needed).
 *
 * Why two files: Deno requires `.ts` extensions in imports, Metro disallows them.
 * A single shared file is therefore not currently possible without a build step.
 *
 * If you change a formula here, mirror it in the edge predictor and re-run the
 * parity tests in `__tests__/lib/race-duration-predictor.test.ts`.
 */
const RACE_DISTANCES = {
    '5k': { swim: 0, bike: 0, run: 5000, t1_min: 0, t2_min: 0 },
    '10k': { swim: 0, bike: 0, run: 10000, t1_min: 0, t2_min: 0 },
    half_marathon: { swim: 0, bike: 0, run: 21100, t1_min: 0, t2_min: 0 },
    marathon: { swim: 0, bike: 0, run: 42195, t1_min: 0, t2_min: 0 },
    sprint_tri: { swim: 750, bike: 20000, run: 5000, t1_min: 2, t2_min: 1 },
    olympic_tri: { swim: 1500, bike: 40000, run: 10000, t1_min: 3, t2_min: 2 },
    half_ironman: { swim: 1900, bike: 90000, run: 21100, t1_min: 4, t2_min: 2 },
    ironman: { swim: 3800, bike: 180000, run: 42195, t1_min: 5, t2_min: 3 },
    // Open run of an athlete-chosen length (B-race only). The 10 km is a
    // placeholder shape — the real distance arrives via opts.distances.run.
    run_race: { swim: 0, bike: 0, run: 10000, t1_min: 0, t2_min: 0 },
};
/** Transition minutes per level (2026-08-06). The t1_min/t2_min in
 *  RACE_DISTANCES were a single value per race type — a first-timer wrestling
 *  a wetsuit off in an unfamiliar transition area got the same 3 minutes as
 *  someone racing off elastic laces and pre-mounted shoes. Every other split in
 *  this file is level-keyed (RUN_RACE_FACTOR, BIKE_RACE_IF, SWIM_CSS_FACTOR);
 *  the transition was the last one that was not, and it read optimistic for the
 *  exact group least able to afford an optimistic prediction.
 *
 *  The intermediate row IS the old flat value, so nothing moves for that level.
 *  Beginners go up ~50%, advanced down ~40%. Long course carries more because
 *  the transition includes a change tent, not just a helmet swap.
 *  Kept byte-identical with the edge copy (race-duration-parity.test.ts). */
const TRANSITION_MIN = {
    //              ── T1 ──                        ── T2 ──         (total, min)
    sprint_tri: { beginner: { t1: 3.0, t2: 1.5 }, // 4.5
        intermediate: { t1: 2.0, t2: 1.0 }, // 3.0 (unchanged)
        advanced: { t1: 1.25, t2: 0.5 } }, // 1.75
    olympic_tri: { beginner: { t1: 4.5, t2: 3.0 }, // 7.5
        intermediate: { t1: 3.0, t2: 2.0 }, // 5.0 (unchanged)
        advanced: { t1: 2.0, t2: 1.25 } }, // 3.25
    half_ironman: { beginner: { t1: 6.0, t2: 3.0 }, // 9.0
        intermediate: { t1: 4.0, t2: 2.0 }, // 6.0 (unchanged)
        advanced: { t1: 2.5, t2: 1.25 } }, // 3.75
    ironman: { beginner: { t1: 7.5, t2: 4.5 }, // 12.0
        intermediate: { t1: 5.0, t2: 3.0 }, // 8.0 (unchanged)
        advanced: { t1: 3.5, t2: 2.0 } }, // 5.5
};
// NOTE: no open-run rows at all anymore — 5k/10k/HM/marathon go through the
// VDOT table below instead (a ≤1 factor on threshold SPEED means "slower than
// threshold", which told a 20:00-5k athlete they'd race 22:12 and a 1:31
// half-marathoner they'd race 1:40). Only the tri run splits keep factors:
// they encode post-swim/bike fatigue, which no open-run table can.
//
// Recalibrated 2026-07-30 (second pass), IM-anchored. No published table maps
// tri run pace onto threshold speed — Millet & Vleck 2000 documents the
// post-cycling economy loss but gives no per-level values. What CAN be checked
// is the shape: expressed as "seconds/km slower than the equivalent OPEN race
// at the same distance" (Daniels reference), the ironman row landed on common
// coaching guidance (+25-50 s/km) while the shorter distances drifted
// progressively above it — sprint sat at +21-41 s/km against a +5-15 corridor.
// Only cells OUTSIDE the corridor were moved; olympic advanced, IM intermediate
// and IM advanced were already inside and are untouched. Beginners stay
// deliberately below the corridor (it describes a trained age-grouper, and the
// optimistic direction is the dangerous one).
// Keep byte-identical with the edge copy (race-duration-parity.test.ts).
export const RUN_RACE_FACTOR = {
    //                                                     implied s/km vs the open race
    sprint_tri: { beginner: 0.930, intermediate: 0.965, advanced: 1.00 }, // +35 / +25 / +16
    olympic_tri: { beginner: 0.880, intermediate: 0.930, advanced: 0.96 }, // +42 / +26 / +18
    half_ironman: { beginner: 0.820, intermediate: 0.865, advanced: 0.89 }, // +51 / +35 / +26
    ironman: { beginner: 0.730, intermediate: 0.775, advanced: 0.81 }, // +57 / +44 / +38
};
// Short-course IFs likewise raised 2026-07-30 (trained athletes ride sprints
// near 0.95+, olympics near 0.85-0.90); long course matches standard guidance
// and is unchanged.
export const BIKE_RACE_IF = {
    sprint_tri: { beginner: 0.86, intermediate: 0.91, advanced: 0.94 },
    olympic_tri: { beginner: 0.82, intermediate: 0.87, advanced: 0.90 },
    half_ironman: { beginner: 0.72, intermediate: 0.77, advanced: 0.81 },
    ironman: { beginner: 0.66, intermediate: 0.72, advanced: 0.76 },
};
// Raised 2026-07-30: the old 0.88/0.92/0.95 compounded with OW_FACTOR to
// +17% over CSS — with a wetsuit most athletes race within 5-10% of CSS.
export const SWIM_CSS_FACTOR = {
    beginner: 0.91, intermediate: 0.95, advanced: 0.97,
};
/** Standalone bike race: the IF comes from the DISTANCE, not a race-type row —
 *  a 40 km criterium and a 180 km gran fondo share one race_type and nothing
 *  else. Mirrors BIKE_RACE_IF_BY_DISTANCE in the edge copy; added to the app
 *  side on 21.08.2026 when lib/racePaceZones.ts began prescribing bike race
 *  targets from these tables instead of from a goal-time-derived speed.
 *  Keep byte-identical with the edge copy (sync-mirrors.test.ts). */
const BIKE_RACE_IF_BY_DISTANCE = [
    { maxKm: 50, iff: { beginner: 0.82, intermediate: 0.87, advanced: 0.90 } }, // criterium / short road race
    { maxKm: 100, iff: { beginner: 0.74, intermediate: 0.79, advanced: 0.83 } }, // classic road race
    { maxKm: 150, iff: { beginner: 0.68, intermediate: 0.73, advanced: 0.77 } }, // gran fondo
    { maxKm: Infinity, iff: { beginner: 0.62, intermediate: 0.67, advanced: 0.71 } }, // long fondo / marathon
];
/** IF for a standalone bike race of this distance. */
export function bikeRaceIF(distanceM, level) {
    const km = distanceM / 1000;
    const bucket = BIKE_RACE_IF_BY_DISTANCE.find((b) => km <= b.maxKm)
        ?? BIKE_RACE_IF_BY_DISTANCE[BIKE_RACE_IF_BY_DISTANCE.length - 1];
    return bucket.iff[level];
}
/** Finish-time relaxation per B-race effort — the DISPLAY counterpart to
 *  B_RACE_EFFORT_MULTIPLIER below, which buffers the WEEK'S LOAD and points the
 *  opposite way. An athlete going all out is fastest (x1.00); one treating the
 *  race as training finishes slower (x1.12).
 *  Keep byte-identical with the edge copy (sync-mirrors.test.ts). */
export const B_RACE_FINISH_EFFORT_FACTOR = {
    all_out: 1.0,
    tempo: 1.05,
    training: 1.12,
};
const CDA_BY_LEVEL = {
    beginner: 0.35, intermediate: 0.28, advanced: 0.24,
};
/** Course reality factor: the power balance below solves for a flat, windless
 * course ridden in a constant position. A real race has wind asymmetry (the
 * headwind half costs more time than the tailwind half returns), corners,
 * aid stations, position changes and accumulating fatigue. Dividing by this
 * converts the ideal-physics time into a race time.
 *
 * Adopted 2026-07-30 from update-baseline.ts, which had it all along while
 * this file did not — the two disagreed by ~28 min on an Ironman bike split
 * for identical inputs. Long course is penalised most: more hours exposed,
 * and more of them spent out of the aero position. */
const BIKE_COURSE_REALITY = {
    ironman: 0.92,
    half_ironman: 0.95,
    olympic_tri: 0.97,
    sprint_tri: 0.97,
};
const BIKE_COURSE_REALITY_DEFAULT = 0.92;
const OW_FACTOR = 1.08;
const B_RACE_TIME_MULTIPLIER = 1.05; // legacy, no effort field
// §17.2 duration relaxation per effort — buffer for what the race takes out of
// the week, not a pace prediction. Keep identical with the edge copy; the app
// copy lacked this entirely, so the two predictors disagreed by up to 1.1 h on
// an Ironman whenever an effort was passed.
const B_RACE_EFFORT_MULTIPLIER = {
    all_out: 1.15,
    tempo: 1.08,
    training: 1.0,
};
// ── Daniels-Gilbert VDOT (open-run prediction) ──
//
// Same data as VDOT_TABLE in lib/realismCheck.ts — columns
// [vdot, 5k_sec, 10k_sec, hm_sec, marathon_sec, threshold_sec_km]. Kept as a
// copy because realismCheck has no edge mirror while this file does; the
// sync-mirror test in __tests__/lib/race-duration-predictor.test.ts trips
// when the copies drift.
//
// Prediction runs the derivation backwards: threshold pace → VDOT (column 5,
// inverted) → race seconds (columns 1-4). Because deriveRunThreshold maps a
// PB at any canonical distance onto the same piecewise-linear grid, the round
// trip is the identity: enter a 20:00 5k (or 1:31 HM), get the same time
// predicted. Level is not a parameter for 5k/10k/HM — the threshold already
// encodes the athlete's fitness. The marathon multiplies in a level margin
// (mileage realization, see MARATHON_LEVEL_MARGIN in realismCheck), which
// deriveRunThreshold divides back out for entered marathon PBs.
const VDOT_RUN_TABLE = [
    [12, 3756, 7802, 16869, 33876, 754],
    [14, 3361, 6995, 15196, 30576, 679],
    [16, 3042, 6338, 13825, 27880, 618],
    [18, 2779, 5793, 12681, 25634, 567],
    [20, 2559, 5334, 11712, 23735, 525],
    [22, 2372, 4943, 10881, 22106, 488],
    [24, 2211, 4606, 10160, 20693, 457],
    [26, 2071, 4313, 9529, 19455, 430],
    [28, 1949, 4056, 8972, 18362, 406],
    [30, 1841, 3829, 8477, 17389, 384],
    [33, 1700, 3534, 7831, 16114, 356],
    [35, 1619, 3362, 7453, 15366, 340],
    [37, 1545, 3207, 7111, 14687, 325],
    [40, 1446, 3001, 6654, 13777, 306],
    [42, 1388, 2878, 6382, 13233, 294],
    [45, 1309, 2713, 6014, 12496, 278],
    [48, 1238, 2568, 5688, 11839, 264],
    [50, 1196, 2480, 5491, 11440, 255],
    [52, 1157, 2398, 5308, 11068, 247],
    [55, 1102, 2286, 5056, 10555, 236],
    [58, 1053, 2184, 4828, 10089, 226],
    [60, 1023, 2122, 4689, 9802, 220],
    [63, 981, 2035, 4494, 9403, 212],
    [65, 955, 1982, 4374, 9155, 206],
    [70, 896, 1861, 4103, 8593, 194],
    [75, 844, 1755, 3866, 8099, 184],
    [80, 798, 1662, 3657, 7663, 174],
    [85, 757, 1579, 3471, 7275, 166],
    [90, 721, 1505, 3306, 6927, 159],
];
// Mirrors MARATHON_LEVEL_MARGIN in lib/realismCheck.ts — keep identical
// (parity-tested). Applied on top of the pure Daniels marathon time.
const MARATHON_LEVEL_MARGIN = {
    beginner: 1.08, intermediate: 1.05, advanced: 1.02,
};
// Open-run race types → their VDOT_RUN_TABLE time column + canonical distance.
const VDOT_RACE_COL = {
    '5k': { col: 1, baseDist: 5000 },
    '10k': { col: 2, baseDist: 10000 },
    half_marathon: { col: 3, baseDist: 21097.5 },
    marathon: { col: 4, baseDist: 42195 },
};
/** Riegel's endurance exponent: t2 = t1 · (d2/d1)^1.06. Replaced a plain linear
 *  ratio on 2026-08-06 — see the edge copy for the full rationale. Short version:
 *  scaling an anchor time linearly says pace does not fade with distance, which
 *  put a 30 km race 8 minutes fast off the 10k column and 10 minutes slow off the
 *  marathon column. Canonical distances are unaffected (ratio 1). */
const RIEGEL_EXPONENT = 1.06;
/** Anchors by distance, for open runs with no column of their own (run_race).
 *  Nearest is measured in LOG space — the Riegel correction acts on the ratio. */
const RUN_ANCHORS = [
    { col: 1, baseDist: 5000 },
    { col: 2, baseDist: 10000 },
    { col: 3, baseDist: 21097.5 },
    { col: 4, baseDist: 42195 },
];
function nearestRunAnchor(distanceM) {
    let best = RUN_ANCHORS[0];
    let bestGap = Infinity;
    for (const a of RUN_ANCHORS) {
        const gap = Math.abs(Math.log(distanceM / a.baseDist));
        if (gap < bestGap) {
            bestGap = gap;
            best = a;
        }
    }
    return best;
}
/** Marathon margin faded in between HM and marathon distance — mirrors
 *  enduranceMargin in lib/realismCheck.ts, which already had to solve this for
 *  the DERIVATION direction (turning a PB at any distance into a threshold).
 *
 *  Why a fade and not a flat per-type constant: the margin models the amateur
 *  marathon shortfall (mileage realization, the wall). Keyed on race_type it was
 *  invisible, because only 'marathon' ever carried it. Keyed on an athlete-chosen
 *  distance it becomes a cliff — a 42.1 km race would get none of it and a
 *  42.195 km race all 5%. Fading it in over the HM→marathon stretch keeps the
 *  seam continuous and makes prediction the exact inverse of derivation.
 *
 *  Canonical distances are unaffected: at 42195 m the lerp is 1 (full margin,
 *  exactly as before) and at or below 21097.5 m it is 0 (no margin, as before). */
function enduranceMargin(distanceM, level) {
    const t = Math.min(1, Math.max(0, (distanceM - 21097.5) / (42195 - 21097.5)));
    const full = MARATHON_LEVEL_MARGIN[level] ?? 1.05;
    return 1.0 + t * (full - 1.0);
}
/** Race seconds for a canonical distance column from threshold pace,
 *  clamped to the table's VDOT range at both ends. */
function raceSecondsFromThreshold(thresholdSecKm, col) {
    const t = VDOT_RUN_TABLE;
    // Column 5 falls monotonically with VDOT — walk the segments directly.
    if (thresholdSecKm >= t[0][5])
        return t[0][col];
    for (let i = 0; i < t.length - 1; i++) {
        if (thresholdSecKm <= t[i][5] && thresholdSecKm >= t[i + 1][5]) {
            const frac = (t[i][5] - thresholdSecKm) / (t[i][5] - t[i + 1][5]);
            return t[i][col] + frac * (t[i + 1][col] - t[i][col]);
        }
    }
    return t[t.length - 1][col];
}
const FALLBACK_HOURS = {
    '5k': { beginner: 0.5, intermediate: 0.4, advanced: 0.3 },
    '10k': { beginner: 1.0, intermediate: 0.8, advanced: 0.6 },
    half_marathon: { beginner: 2.25, intermediate: 1.75, advanced: 1.5 },
    marathon: { beginner: 4.5, intermediate: 3.75, advanced: 3.0 },
    sprint_tri: { beginner: 1.75, intermediate: 1.4, advanced: 1.1 },
    olympic_tri: { beginner: 3.5, intermediate: 2.75, advanced: 2.25 },
    half_ironman: { beginner: 6.5, intermediate: 5.5, advanced: 4.75 },
    ironman: { beginner: 14, intermediate: 12, advanced: 10 },
    // Per the 10 km row above, Riegel-scaled to the real distance.
    run_race: { beginner: 1.0, intermediate: 0.8, advanced: 0.6 },
};
// ── Main ──
export function predictRaceDuration(thresholds, opts) {
    const dist = resolveDistances(opts);
    const courseFactors = {
        swim: opts.courseFactors?.swim ?? 1.0,
        bike: opts.courseFactors?.bike ?? 1.0,
        run: opts.courseFactors?.run ?? 1.0,
    };
    const fallback = [];
    let usedThresholds = false;
    let runHours = 0;
    if (dist.run > 0) {
        const tp = thresholds.run_threshold_pace_sec_km;
        if (tp && tp > 0) {
            // An open run with no column of its own (run_race) borrows the nearest
            // one by ratio; everything else keeps the column its race_type names.
            const vdotRace = VDOT_RACE_COL[opts.raceType]
                ?? (opts.raceType === 'run_race' ? nearestRunAnchor(dist.run) : undefined);
            if (vdotRace) {
                // Open run: VDOT round trip, see VDOT_RUN_TABLE. Off-distance races
                // (race_config course lengths, athlete-chosen B-race distances) scale
                // off the table time with Riegel's exponent, not linearly.
                // Column 4 is the PURE Daniels marathon; the amateur margin is applied
                // separately, keyed on the actual distance rather than on the race_type.
                const raceSec = raceSecondsFromThreshold(tp, vdotRace.col)
                    * enduranceMargin(dist.run, opts.level);
                runHours = (raceSec / 3600) * Math.pow(dist.run / vdotRace.baseDist, RIEGEL_EXPONENT);
            }
            else {
                const factor = RUN_RACE_FACTOR[opts.raceType]?.[opts.level] ?? 0.85;
                const thresholdSpeedKmH = 3600 / tp;
                const raceSpeedKmH = thresholdSpeedKmH * factor;
                runHours = (dist.run / 1000) / raceSpeedKmH;
            }
            runHours *= courseFactors.run;
            usedThresholds = true;
        }
        else {
            runHours = fallbackRunHours(opts.raceType, opts.level, dist.run);
            fallback.push('run');
        }
    }
    let bikeHours = 0;
    if (dist.bike > 0) {
        const ftp = thresholds.ftp_watts;
        const weight = thresholds.weight_kg;
        if (ftp && ftp > 0 && weight && weight > 0) {
            bikeHours = predictBikeHours(ftp, weight, dist.bike, opts.raceType, opts.level);
            bikeHours *= courseFactors.bike;
            usedThresholds = true;
        }
        else {
            bikeHours = fallbackBikeHours(opts.raceType, opts.level, dist.bike);
            fallback.push('bike');
        }
    }
    let swimHours = 0;
    if (dist.swim > 0) {
        const css = thresholds.css_pace_sec_per_100m;
        if (css && css > 0) {
            const factor = SWIM_CSS_FACTOR[opts.level] ?? 0.92;
            const racePacePer100m = css / factor;
            swimHours = (racePacePer100m * OW_FACTOR * (dist.swim / 100)) / 3600;
            swimHours *= courseFactors.swim;
            usedThresholds = true;
        }
        else {
            swimHours = fallbackSwimHours(opts.raceType, opts.level, dist.swim);
            fallback.push('swim');
        }
    }
    const transition = (dist.t1_min + dist.t2_min) / 60;
    let total = runHours + bikeHours + swimHours + transition;
    if (opts.isBRace) {
        const mult = opts.bRaceEffort
            ? B_RACE_EFFORT_MULTIPLIER[opts.bRaceEffort]
            : B_RACE_TIME_MULTIPLIER;
        total *= mult;
        runHours *= mult;
        bikeHours *= mult;
        swimHours *= mult;
    }
    return {
        // 4 decimals, not 2: consumers render min:sec (hours*3600), and a 0.01h
        // grid quantizes to 36s steps — enough to visibly break the 5k/10k
        // round-trip identity (20:00 in, 19:48 out).
        total_hours: round4(total),
        swim_hours: round4(swimHours),
        bike_hours: round4(bikeHours),
        run_hours: round4(runHours),
        transition_hours: round4(transition),
        used_thresholds: usedThresholds,
        fallback_disciplines: fallback,
    };
}
export function predictRaceDurationHours(thresholds, opts) {
    return predictRaceDuration(thresholds, opts).total_hours;
}
function predictBikeHours(ftp, weight, distanceM, raceType, level) {
    const raceIF = BIKE_RACE_IF[raceType]?.[level] ?? 0.75;
    const racePower = ftp * raceIF;
    const cda = CDA_BY_LEVEL[level] ?? 0.28;
    const RHO = 1.205;
    const CRR = 0.004;
    const G = 9.81;
    const bikeMass = weight + 10;
    const effectivePower = racePower * 0.97;
    let v = Math.pow(effectivePower / (0.5 * RHO * cda), 1 / 3);
    for (let i = 0; i < 10; i++) {
        const f = 0.5 * RHO * cda * v ** 3 + CRR * bikeMass * G * v - effectivePower;
        const df = 1.5 * RHO * cda * v ** 2 + CRR * bikeMass * G;
        v -= f / df;
        if (Math.abs(f) < 0.01)
            break;
    }
    const speedKmH = v * 3.6;
    const idealHours = (distanceM / 1000) / speedKmH;
    return idealHours / (BIKE_COURSE_REALITY[raceType] ?? BIKE_COURSE_REALITY_DEFAULT);
}
function fallbackRunHours(raceType, level, distanceM) {
    const baseDist = RACE_DISTANCES[raceType]?.run ?? distanceM;
    const baseHours = FALLBACK_HOURS[raceType]?.[level] ?? 3.0;
    if (['5k', '10k', 'half_marathon', 'marathon', 'run_race'].includes(raceType)) {
        return baseDist > 0 ? baseHours * Math.pow(distanceM / baseDist, RIEGEL_EXPONENT) : baseHours;
    }
    // Tri run legs stay linear: the override is a course-length tweak of a few
    // percent, never a chosen distance.
    return baseHours * 0.35 * (distanceM / baseDist);
}
function fallbackBikeHours(raceType, level, distanceM) {
    const baseDist = RACE_DISTANCES[raceType]?.bike ?? distanceM;
    const baseHours = FALLBACK_HOURS[raceType]?.[level] ?? 5.0;
    return baseHours * 0.55 * (distanceM / baseDist);
}
function fallbackSwimHours(raceType, level, distanceM) {
    const baseDist = RACE_DISTANCES[raceType]?.swim ?? distanceM;
    const baseHours = FALLBACK_HOURS[raceType]?.[level] ?? 5.0;
    return baseHours * 0.10 * (distanceM / baseDist);
}
function resolveDistances(opts) {
    const base = RACE_DISTANCES[opts.raceType] ?? RACE_DISTANCES.marathon;
    // Level-keyed transition, falling back to the flat row for any race type
    // without a TRANSITION_MIN entry (open runs, bike races — all zero anyway).
    const t = TRANSITION_MIN[opts.raceType]?.[opts.level];
    return {
        swim: opts.distances?.swim ?? base.swim,
        bike: opts.distances?.bike ?? base.bike,
        run: opts.distances?.run ?? base.run,
        t1_min: t?.t1 ?? base.t1_min,
        t2_min: t?.t2 ?? base.t2_min,
    };
}
function round4(n) {
    return Math.round(n * 10000) / 10000;
}
