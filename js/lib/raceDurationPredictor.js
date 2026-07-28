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
const RUN_RACE_FACTOR = {
    '5k': { beginner: 0.95, intermediate: 0.97, advanced: 0.99 },
    '10k': { beginner: 0.92, intermediate: 0.95, advanced: 0.97 },
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
            const factor = RUN_RACE_FACTOR[opts.raceType]?.[opts.level] ?? 0.85;
            const thresholdSpeedKmH = 3600 / tp;
            const raceSpeedKmH = thresholdSpeedKmH * factor;
            runHours = (dist.run / 1000) / raceSpeedKmH;
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
        total_hours: round2(total),
        swim_hours: round2(swimHours),
        bike_hours: round2(bikeHours),
        run_hours: round2(runHours),
        transition_hours: round2(transition),
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
function round2(n) {
    return Math.round(n * 100) / 100;
}
