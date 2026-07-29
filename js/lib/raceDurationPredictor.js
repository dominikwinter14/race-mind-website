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
};
// NOTE: no '5k'/'10k' rows — pure short-course run races go through the VDOT
// table below instead. A ≤1 factor on threshold SPEED means "slower than
// threshold", but 5k/10k race pace is FASTER than threshold pace; the factor
// approach predicted a 22:12 5k for an athlete whose entered PB was 20:00.
// The tri run splits keep their factors: they encode post-swim/bike fatigue,
// which no open-run table can.
const RUN_RACE_FACTOR = {
    half_marathon: { beginner: 0.87, intermediate: 0.91, advanced: 0.94 },
    marathon: { beginner: 0.83, intermediate: 0.87, advanced: 0.90 },
    sprint_tri: { beginner: 0.88, intermediate: 0.92, advanced: 0.95 },
    olympic_tri: { beginner: 0.85, intermediate: 0.90, advanced: 0.93 },
    half_ironman: { beginner: 0.78, intermediate: 0.83, advanced: 0.87 },
    ironman: { beginner: 0.72, intermediate: 0.77, advanced: 0.81 },
};
const BIKE_RACE_IF = {
    sprint_tri: { beginner: 0.82, intermediate: 0.87, advanced: 0.90 },
    olympic_tri: { beginner: 0.78, intermediate: 0.83, advanced: 0.87 },
    half_ironman: { beginner: 0.72, intermediate: 0.77, advanced: 0.81 },
    ironman: { beginner: 0.66, intermediate: 0.72, advanced: 0.76 },
};
const SWIM_CSS_FACTOR = {
    beginner: 0.88, intermediate: 0.92, advanced: 0.95,
};
const CDA_BY_LEVEL = {
    beginner: 0.35, intermediate: 0.28, advanced: 0.24,
};
const OW_FACTOR = 1.08;
const B_RACE_TIME_MULTIPLIER = 1.05;
// ── Daniels-Gilbert VDOT (5k/10k prediction) ──
//
// Same data as VDOT_TABLE in lib/realismCheck.ts — columns
// [vdot, 5k_sec, 10k_sec, threshold_sec_km]. Kept as a copy because
// realismCheck has no edge mirror while this file does; the sync-mirror test
// in __tests__/lib/race-duration-predictor.test.ts trips when the copies drift.
//
// Prediction runs the derivation backwards: threshold pace → VDOT (column 3,
// inverted) → race seconds (column 1/2). Because deriveRunThreshold maps a
// 5–10km PB onto the same piecewise-linear grid, the round trip is the
// identity: enter a 20:00 5k, get a 20:00 5k predicted. Level is deliberately
// not a parameter — the threshold already encodes the athlete's fitness.
const VDOT_RUN_TABLE = [
    [30, 1841, 3829, 384],
    [33, 1700, 3534, 356],
    [35, 1619, 3362, 340],
    [37, 1545, 3207, 325],
    [40, 1446, 3001, 306],
    [42, 1388, 2878, 294],
    [45, 1309, 2713, 278],
    [48, 1238, 2568, 264],
    [50, 1196, 2480, 255],
    [52, 1157, 2398, 247],
    [55, 1102, 2286, 236],
    [58, 1053, 2184, 226],
    [60, 1023, 2122, 220],
    [63, 981, 2035, 212],
    [65, 955, 1982, 206],
    [70, 896, 1861, 194],
    [75, 844, 1755, 184],
    [80, 798, 1662, 174],
    [85, 757, 1579, 166],
];
/** Race seconds for a canonical 5k (col 1) or 10k (col 2) from threshold pace,
 *  clamped to the table's VDOT range at both ends. */
function raceSecondsFromThreshold(thresholdSecKm, col) {
    const t = VDOT_RUN_TABLE;
    // Column 3 falls monotonically with VDOT — walk the segments directly.
    if (thresholdSecKm >= t[0][3])
        return t[0][col];
    for (let i = 0; i < t.length - 1; i++) {
        if (thresholdSecKm <= t[i][3] && thresholdSecKm >= t[i + 1][3]) {
            const frac = (t[i][3] - thresholdSecKm) / (t[i][3] - t[i + 1][3]);
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
            if (opts.raceType === '5k' || opts.raceType === '10k') {
                // Short course: VDOT round trip, see VDOT_RUN_TABLE. Non-canonical
                // distances (race_config course lengths) scale off the table time.
                const baseDist = opts.raceType === '5k' ? 5000 : 10000;
                const raceSec = raceSecondsFromThreshold(tp, opts.raceType === '5k' ? 1 : 2);
                runHours = (raceSec / 3600) * (dist.run / baseDist);
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
        total *= B_RACE_TIME_MULTIPLIER;
        runHours *= B_RACE_TIME_MULTIPLIER;
        bikeHours *= B_RACE_TIME_MULTIPLIER;
        swimHours *= B_RACE_TIME_MULTIPLIER;
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
    return (distanceM / 1000) / speedKmH;
}
function fallbackRunHours(raceType, level, distanceM) {
    const baseDist = RACE_DISTANCES[raceType]?.run ?? distanceM;
    const baseHours = FALLBACK_HOURS[raceType]?.[level] ?? 3.0;
    if (['5k', '10k', 'half_marathon', 'marathon'].includes(raceType)) {
        return baseDist > 0 ? baseHours * (distanceM / baseDist) : baseHours;
    }
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
    return {
        swim: opts.distances?.swim ?? base.swim,
        bike: opts.distances?.bike ?? base.bike,
        run: opts.distances?.run ?? base.run,
        t1_min: base.t1_min,
        t2_min: base.t2_min,
    };
}
function round4(n) {
    return Math.round(n * 10000) / 10000;
}
