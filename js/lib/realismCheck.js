// ══════════════════════════════════════════════════════════
// [App] Realism Check
// Universelles Realism-Check-Modul für React Native.
// Rein synchron, kein Netzwerk, keine Secrets.
// ══════════════════════════════════════════════════════════
import { RACE_PARAMS } from '../constants/raceVolume.js';
import { formatHoursToHM } from './format.js';
import { predictRaceDuration } from './raceDurationPredictor.js';
import { classifyGoalTime } from './goalAssessment.js';
// ══════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════
const RACE_TYPE_DISTANCES = {
    ironman: { swim: 3800, bike: 180000, run: 42195, t1_min: 5, t2_min: 3 },
    half_ironman: { swim: 1900, bike: 90000, run: 21100, t1_min: 4, t2_min: 2 },
    olympic_tri: { swim: 1500, bike: 40000, run: 10000, t1_min: 3, t2_min: 2 },
    sprint_tri: { swim: 750, bike: 20000, run: 5000, t1_min: 2, t2_min: 1 },
    marathon: { swim: 0, bike: 0, run: 42195, t1_min: 0, t2_min: 0 },
    half_marathon: { swim: 0, bike: 0, run: 21100, t1_min: 0, t2_min: 0 },
    '10k': { swim: 0, bike: 0, run: 10000, t1_min: 0, t2_min: 0 },
    '5k': { swim: 0, bike: 0, run: 5000, t1_min: 0, t2_min: 0 },
};
// [vdot, 5k_sec, 10k_sec, hm_sec, marathon_sec, threshold_pace_sec_km]
//
// Generated from the published Daniels-Gilbert equations (Oxygen Power, 1979):
//   VO2(v)   = -4.60 + 0.182258*v + 0.000104*v^2        (v in m/min)
//   %max(t)  = 0.8 + 0.1894393*e^(-0.012778*t)
//                 + 0.2989558*e^(-0.1932605*t)          (t in min)
//   VDOT     = VO2(v) / %max(t)
// Race times solve VDOT(dist, t) = vdot; threshold pace is the velocity at
// 0.88 * VDOT (Daniels' T-pace, ~83-88% VO2max). Reproduces the published
// table to within ~3 s at 5k/10k and matches T-pace at VDOT 50 (4:15/km)
// and VDOT 60 (3:40/km).
//
// The previous hand-built table was internally inconsistent: it claimed 5k
// times below the world record above VDOT 70, and the threshold-to-race-pace
// ratio drifted from 1.075 to 1.383 across the range instead of staying near
// Daniels' ~1.08. That produced a discontinuity of up to 24 s/km at the 10 km
// branch boundary in deriveRunThreshold() — the same runner got a materially
// different threshold depending on whether they entered 10 km or 11 km.
// Regenerate with scripts/vdot-table.mjs if this ever needs revisiting.
const VDOT_TABLE = [
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
// Marathon realization margin on top of pure Daniels equivalence. Daniels
// assumes marathon-appropriate mileage; recreational runners underperform the
// equivalent time by mileage tier (Vickers & Vertosick 2016, n≈2500: HM
// predictions from shorter races hold, marathons run ~5-10 min slower).
// Applied symmetrically: prediction multiplies the Daniels time by this,
// deriveRunThreshold divides an entered marathon PB by it — round trip stays
// the identity for every level. Mirrored in both race-duration predictors
// (parity-tested); change all three together.
export const MARATHON_LEVEL_MARGIN = {
    beginner: 1.08, intermediate: 1.05, advanced: 1.02,
};
// ══════════════════════════════════════════════════════════
// ENTRY POINT 1: Manuelles Onboarding → Prognose + Realism
// ══════════════════════════════════════════════════════════
export function calculateOnboardingPrognosis({ onboardingData, raceType, athleteLevel, weightKg, weeklyHoursGoal, goalTimeHours, mainRaceDate, raceConfig, language, currentWeeklyHours, }) {
    const lang = language === 'en' ? 'en' : 'de';
    const level = athleteLevel ?? 'intermediate';
    const weight = weightKg ?? 75;
    if (!onboardingData) {
        throw new Error('[realismCheck] onboardingData is required');
    }
    const { raceDist, courseFactors } = resolveRaceDist(raceType, raceConfig);
    const runInput = onboardingData?.run ?? null;
    const bikeInput = onboardingData?.bike ?? null;
    const swimInput = onboardingData?.swim ?? null;
    const thresholdPace = runInput ? deriveRunThreshold(runInput, level) : null;
    const ftp = bikeInput ? deriveBikeFTP(bikeInput, level, weight) : null;
    const cssPace = swimInput ? deriveSwimCSS(swimInput, level) : null;
    const prognosis = buildPrognosis({
        thresholdPace, ftp, cssPace,
        runInput, bikeInput, swimInput,
        raceDist, courseFactors, raceType, level, weight,
        source: 'onboarding',
    });
    const realism = realismCheck({
        prognosis,
        goalTimeHours,
        weeklyHoursGoal,
        mainRaceDate,
        athleteLevel: level,
        raceType,
        raceDist,
        lang,
        currentWeeklyHours,
    });
    return { prognosis, realism };
}
// ══════════════════════════════════════════════════════════
// ENTRY POINT 2: Strava Baseline → Realism
// ══════════════════════════════════════════════════════════
export function calculateStravaRealism({ baseline, onboardingData, raceType, athleteLevel, weightKg, weeklyHoursGoal, goalTimeHours, mainRaceDate, raceConfig, language, thresholdsEdited, currentWeeklyHours, }) {
    const lang = language === 'en' ? 'en' : 'de';
    const level = athleteLevel ?? 'intermediate';
    if (!baseline) {
        throw new Error('[realismCheck] baseline is required');
    }
    const { raceDist, courseFactors } = resolveRaceDist(raceType, raceConfig);
    const weight = weightKg ?? 75;
    const isTriRace = raceType === 'ironman' || raceType === 'half_ironman'
        || raceType === 'olympic_tri' || raceType === 'sprint_tri';
    // If thresholds weren't edited and baseline already has a prognosis from
    // import-history (empirical model), use it directly instead of recalculating
    // from thresholds (deterministic model). This avoids divergence between
    // the forecast screen and score overview.
    const hasBaselinePrognosis = !thresholdsEdited
        && baseline.adjusted_total_hours != null
        && baseline.prognose_source_run != null;
    let recalc;
    if (hasBaselinePrognosis) {
        recalc = {
            swim_prognose_hours: baseline.swim_prognose_hours ?? null,
            bike_prognose_hours: baseline.bike_prognose_hours ?? null,
            run_prognose_hours: baseline.run_prognose_hours ?? null,
            total_prognose_hours: baseline.total_prognose_hours ?? null,
            adjusted_swim_hours: baseline.adjusted_swim_hours ?? null,
            adjusted_bike_hours: baseline.adjusted_bike_hours ?? null,
            adjusted_run_hours: baseline.adjusted_run_hours ?? null,
            adjusted_total_hours: baseline.adjusted_total_hours,
            adjusted_best_hours: baseline.adjusted_best_hours ?? null,
            adjusted_worst_hours: baseline.adjusted_worst_hours ?? null,
            best_case_hours: baseline.best_case_hours ?? null,
            worst_case_hours: baseline.worst_case_hours ?? null,
            course_factor_swim: baseline.course_factor_swim ?? 1,
            course_factor_bike: baseline.course_factor_bike ?? 1,
            course_factor_run: baseline.course_factor_run ?? 1,
            derived_ftp: baseline.current_ftp_estimated ?? null,
            derived_css: baseline.current_css_pace_100m ?? null,
            derived_threshold_pace: baseline.current_run_threshold_pace_sec_km ?? null,
            effective_stddev: baseline.effective_stddev ?? null,
            swim_stddev: baseline.swim_stddev ?? null,
            bike_stddev: baseline.bike_stddev ?? null,
            run_stddev: baseline.run_stddev ?? null,
            source: 'strava',
        };
    }
    else {
        // Recalculate prognosis from current threshold values so user edits
        // on the threshold_check screen are reflected in the forecast.
        recalc = buildPrognosis({
            thresholdPace: baseline.current_run_threshold_pace_sec_km ?? null,
            ftp: baseline.current_ftp_estimated ?? null,
            cssPace: baseline.current_css_pace_100m ?? null,
            runInput: null, bikeInput: null, swimInput: null,
            raceDist, courseFactors, raceType, level, weight, source: 'strava',
        });
    }
    const needsSwim = isTriRace && !recalc.swim_prognose_hours;
    const needsBike = isTriRace && !recalc.bike_prognose_hours;
    const needsRun = !recalc.run_prognose_hours;
    const hasGaps = needsSwim || needsBike || needsRun;
    const isHybrid = hasGaps && !!onboardingData;
    let fallbackSwim = null;
    let fallbackBike = null;
    let fallbackRun = null;
    if (isHybrid) {
        if (needsSwim && onboardingData?.swim) {
            const css = deriveSwimCSS(onboardingData.swim, level);
            if (css)
                fallbackSwim = buildPrognosis({
                    thresholdPace: null, ftp: null, cssPace: css,
                    runInput: null, bikeInput: null, swimInput: onboardingData.swim,
                    raceDist, courseFactors, raceType, level, weight, source: 'onboarding',
                });
        }
        if (needsBike && onboardingData?.bike) {
            const ftpVal = deriveBikeFTP(onboardingData.bike, level, weight);
            if (ftpVal)
                fallbackBike = buildPrognosis({
                    thresholdPace: null, ftp: ftpVal, cssPace: null,
                    runInput: null, bikeInput: onboardingData.bike, swimInput: null,
                    raceDist, courseFactors, raceType, level, weight, source: 'onboarding',
                });
        }
        if (needsRun && onboardingData?.run) {
            const tp = deriveRunThreshold(onboardingData.run, level);
            if (tp)
                fallbackRun = buildPrognosis({
                    thresholdPace: tp, ftp: null, cssPace: null,
                    runInput: onboardingData.run, bikeInput: null, swimInput: null,
                    raceDist, courseFactors, raceType, level, weight, source: 'onboarding',
                });
        }
    }
    const prognosis = {
        ...recalc,
        confidence_run: baseline.confidence_run ?? recalc.confidence_run ?? 'medium',
        confidence_bike: baseline.confidence_bike ?? recalc.confidence_bike ?? 'medium',
        confidence_swim: baseline.confidence_swim ?? recalc.confidence_swim ?? 'medium',
        confidence_overall: baseline.confidence_overall ?? recalc.confidence_overall ?? 'medium',
        source: isHybrid ? 'hybrid' : 'strava',
        source_swim: needsSwim ? (fallbackSwim ? 'onboarding' : 'missing') : 'strava',
        source_bike: needsBike ? (fallbackBike ? 'onboarding' : 'missing') : 'strava',
        source_run: needsRun ? (fallbackRun ? 'onboarding' : 'missing') : 'strava',
    };
    if (fallbackSwim) {
        prognosis.swim_prognose_hours = fallbackSwim.swim_prognose_hours;
        prognosis.adjusted_swim_hours = fallbackSwim.adjusted_swim_hours;
        prognosis.derived_css = fallbackSwim.derived_css;
        prognosis.confidence_swim = fallbackSwim.confidence_swim ?? 'low';
    }
    if (fallbackBike) {
        prognosis.bike_prognose_hours = fallbackBike.bike_prognose_hours;
        prognosis.adjusted_bike_hours = fallbackBike.adjusted_bike_hours;
        prognosis.derived_ftp = fallbackBike.derived_ftp;
        prognosis.confidence_bike = fallbackBike.confidence_bike ?? 'low';
    }
    if (fallbackRun) {
        prognosis.run_prognose_hours = fallbackRun.run_prognose_hours;
        prognosis.adjusted_run_hours = fallbackRun.adjusted_run_hours;
        prognosis.derived_threshold_pace = fallbackRun.derived_threshold_pace;
        prognosis.confidence_run = fallbackRun.confidence_run ?? 'low';
    }
    if (isHybrid) {
        const T1h = raceDist.t1_min / 60;
        const T2h = raceDist.t2_min / 60;
        const sw = prognosis.adjusted_swim_hours ?? prognosis.swim_prognose_hours ?? 0;
        const bk = prognosis.adjusted_bike_hours ?? prognosis.bike_prognose_hours ?? 0;
        const rn = prognosis.adjusted_run_hours ?? prognosis.run_prognose_hours ?? 0;
        const adjTotal = round4(sw + T1h + bk + T2h + rn);
        prognosis.total_prognose_hours = adjTotal > 0 ? adjTotal : null;
        prognosis.adjusted_total_hours = adjTotal > 0 ? adjTotal : null;
        const overallConf = worstOf(prognosis.confidence_run, prognosis.confidence_bike, prognosis.confidence_swim);
        prognosis.confidence_overall = overallConf;
        const BASE_SPREAD = { high: 0.06, medium: 0.10, low: 0.15 };
        const spreadPct = BASE_SPREAD[overallConf] ?? 0.10;
        prognosis.best_case_hours = round4(adjTotal * (1 - spreadPct));
        prognosis.worst_case_hours = round4(adjTotal * (1 + spreadPct * 1.5));
        prognosis.adjusted_best_hours = prognosis.best_case_hours;
        prognosis.adjusted_worst_hours = prognosis.worst_case_hours;
    }
    const realism = realismCheck({
        prognosis,
        goalTimeHours,
        weeklyHoursGoal,
        mainRaceDate,
        athleteLevel: level,
        raceType,
        raceDist,
        lang,
        currentWeeklyHours,
    });
    return { prognosis, realism };
}
// ══════════════════════════════════════════════════════════
// HELPER: getMissingDisciplines
// ══════════════════════════════════════════════════════════
export function getMissingDisciplines(baseline, raceType) {
    const isTriRace = raceType === 'ironman' || raceType === 'half_ironman'
        || raceType === 'olympic_tri' || raceType === 'sprint_tri';
    const swim = isTriRace && !baseline?.swim_prognose_hours;
    const bike = isTriRace && !baseline?.bike_prognose_hours;
    const run = !baseline?.run_prognose_hours;
    return { swim, bike, run, any: swim || bike || run };
}
// ══════════════════════════════════════════════════════════
// HELPER: isBaselinePlausible
// ══════════════════════════════════════════════════════════
function inRange(v, min, max) {
    return typeof v === 'number' && v >= min && v <= max;
}
/**
 * Range check for optional metrics: a missing value passes, a present one
 * must be in range. Used for the efficiency factors — they depend on device
 * data the athlete may simply not have (bike EF = NP/HR needs a power meter,
 * run/swim EF need a HR strap), so their absence must not block the fast path.
 * A present-but-absurd value still counts as implausible.
 */
function inRangeIfPresent(v, min, max) {
    if (v === null || v === undefined)
        return true;
    return inRange(v, min, max);
}
export function isBaselinePlausible(baseline, raceType) {
    if (!baseline)
        return { ok: false, reason: 'baseline_null' };
    const isTriRace = raceType === 'ironman' || raceType === 'half_ironman'
        || raceType === 'olympic_tri' || raceType === 'sprint_tri';
    // Run threshold pace required: 2:30–10:00/km → 150–600 sec.
    // The upper bound was 480 (8:00/km) and rejected legitimately slow athletes:
    // a sprint-tri beginner with a COMPLETE Garmin import and 9:02/km threshold
    // pace was pushed through the manual fitness questionnaire instead of the
    // fast path (Sentry REACT-NATIVE-3T, 2026-07-30) — same failure mode as the
    // EF gate. 10:00/km is where running turns into walking, so the bound still
    // catches genuine garbage, and threshold_check shows the value pre-filled and
    // editable, so an implausible-but-passing value gets corrected there anyway.
    if (!inRange(baseline.current_run_threshold_pace_sec_km, 150, 600)) {
        return { ok: false, reason: `run_threshold_pace_out_of_range:${baseline.current_run_threshold_pace_sec_km}` };
    }
    // Run EF optional (needs HR data) — only sanity-checked when present
    if (!inRangeIfPresent(baseline.current_run_ef, 0.5, 3.5)) {
        return { ok: false, reason: `run_ef_out_of_range:${baseline.current_run_ef}` };
    }
    if (isTriRace) {
        // FTP required: 80–500W
        if (!inRange(baseline.current_ftp_estimated, 80, 500)) {
            return { ok: false, reason: `ftp_out_of_range:${baseline.current_ftp_estimated}` };
        }
        // CSS required: 1:00–3:30/100m → 60–210 sec
        if (!inRange(baseline.current_css_pace_100m, 60, 210)) {
            return { ok: false, reason: `css_out_of_range:${baseline.current_css_pace_100m}` };
        }
        // Bike EF optional (NP/HR needs a power meter) — sanity-checked when present
        if (!inRangeIfPresent(baseline.current_bike_ef, 0.5, 4.0)) {
            return { ok: false, reason: `bike_ef_out_of_range:${baseline.current_bike_ef}` };
        }
        // Swim EF optional (speed/HR needs HR in the water) — sanity-checked when present
        if (!inRangeIfPresent(baseline.current_swim_ef, 0.3, 5.0)) {
            return { ok: false, reason: `swim_ef_out_of_range:${baseline.current_swim_ef}` };
        }
    }
    return { ok: true, reason: null };
}
// ══════════════════════════════════════════════════════════
// RACE DISTANCE RESOLVER
// ══════════════════════════════════════════════════════════
function resolveRaceDist(raceType, raceConfig) {
    let raceDist = RACE_TYPE_DISTANCES[raceType] ?? RACE_TYPE_DISTANCES.ironman;
    let courseFactors = { swim: 1.0, bike: 1.0, run: 1.0 };
    if (raceConfig) {
        const base = RACE_TYPE_DISTANCES[raceConfig.race_type ?? raceType] ?? raceDist;
        raceDist = {
            swim: raceConfig.swim_distance_m ?? base.swim,
            bike: raceConfig.bike_distance_m ?? base.bike,
            run: raceConfig.run_distance_m ?? base.run,
            t1_min: base.t1_min,
            t2_min: base.t2_min,
        };
        courseFactors = {
            swim: raceConfig.course_factor_swim ?? 1.0,
            bike: raceConfig.course_factor_bike ?? 1.0,
            run: raceConfig.course_factor_run ?? 1.0,
        };
    }
    return { raceDist, courseFactors };
}
// ══════════════════════════════════════════════════════════
// BUILD PROGNOSIS (from derived thresholds)
// ══════════════════════════════════════════════════════════
function buildPrognosis({ thresholdPace, ftp, cssPace, runInput, bikeInput, swimInput, raceDist, courseFactors, raceType, level, weight, source, }) {
    const T1h = raceDist.t1_min / 60;
    const T2h = raceDist.t2_min / 60;
    // ── Per-discipline race times via shared predictor ──
    // Single source of truth: same formulas as supabase/functions/_shared/race-duration-predictor.ts
    // (parity verified by supabase/functions/_test/race-duration-parity.test.ts).
    // Behavior change: bike IF is now race-type-aware (HIM/Olympic ride at higher IF
    // than Ironman). For HIM intermediate this means ~5% faster bike prediction.
    const prediction = predictRaceDuration({
        run_threshold_pace_sec_km: thresholdPace,
        ftp_watts: ftp,
        css_pace_sec_per_100m: cssPace,
        weight_kg: weight,
    }, {
        raceType,
        level,
        distances: { swim: raceDist.swim, bike: raceDist.bike, run: raceDist.run },
    });
    // Run — gated on threshold presence (legacy "null when no input" semantic).
    let runHours = null;
    let runConfidence = null;
    if (thresholdPace && raceDist.run > 0) {
        runHours = prediction.run_hours;
        // 'vdot' alone is not enough for high confidence: a bucket pick runs through
        // the same corridor because deriveRunThreshold assumes distM = 5000 for it,
        // so a dropdown ("18-22 min") used to be rated as confidently as a stopped
        // race time — and BASE_SPREAD then quoted a ±6% band around a guess. High
        // confidence now requires a performance the athlete actually measured.
        runConfidence = runInput?.mode === 'threshold' ? 'high'
            : runInput?.mode === 'custom' && runInput._corridor === 'vdot' ? 'high'
                : 'medium';
    }
    // Bike — gated on FTP presence (predictor also needs weight; if missing it falls back).
    let bikeHours = null;
    let bikeConfidence = null;
    if (ftp && raceDist.bike > 0) {
        bikeHours = prediction.bike_hours;
        bikeConfidence = bikeInput?.mode === 'ftp' ? 'high'
            : bikeInput?._corridor === 'medium' ? 'medium' : 'low';
    }
    // Swim — gated on CSS pace.
    let swimHours = null;
    let swimConfidence = null;
    if (cssPace && raceDist.swim > 0) {
        swimHours = prediction.swim_hours;
        swimConfidence = swimInput?.mode === 'css' ? 'high'
            : swimInput?._corridor === 'threshold' ? 'high' : 'medium';
    }
    // ── Total ──
    const rawTotal = (swimHours ?? 0) + T1h + (bikeHours ?? 0) + T2h + (runHours ?? 0);
    const adjSwim = swimHours ? round4(swimHours * courseFactors.swim) : null;
    const adjBike = bikeHours ? round4(bikeHours * courseFactors.bike) : null;
    const adjRun = runHours ? round4(runHours * courseFactors.run) : null;
    const adjTotal = round4((adjSwim ?? 0) + T1h + (adjBike ?? 0) + T2h + (adjRun ?? 0));
    const BASE_SPREAD = { high: 0.06, medium: 0.10, low: 0.15 };
    const overallConfidence = worstOf(runConfidence, bikeConfidence, swimConfidence);
    const spreadPct = BASE_SPREAD[overallConfidence] ?? 0.10;
    const bestCase = round4(adjTotal * (1 - spreadPct));
    const worstCase = round4(adjTotal * (1 + spreadPct * 1.5));
    return {
        swim_prognose_hours: swimHours,
        bike_prognose_hours: bikeHours,
        run_prognose_hours: runHours,
        total_prognose_hours: rawTotal > 0 ? round4(rawTotal) : null,
        adjusted_swim_hours: adjSwim,
        adjusted_bike_hours: adjBike,
        adjusted_run_hours: adjRun,
        adjusted_total_hours: adjTotal > 0 ? adjTotal : null,
        adjusted_best_hours: bestCase,
        adjusted_worst_hours: worstCase,
        best_case_hours: bestCase,
        worst_case_hours: worstCase,
        course_factor_swim: courseFactors.swim,
        course_factor_bike: courseFactors.bike,
        course_factor_run: courseFactors.run,
        derived_threshold_pace: thresholdPace,
        derived_ftp: ftp,
        derived_css: cssPace,
        confidence_run: runConfidence,
        confidence_bike: bikeConfidence,
        confidence_swim: swimConfidence,
        confidence_overall: overallConfidence,
        source,
    };
}
// ══════════════════════════════════════════════════════════
// Race-Type-Aware Projection Constants
// ══════════════════════════════════════════════════════════
// RACE_PARAMS is imported from constants/raceVolume.ts (single source of truth).
// Edge function copy in supabase/functions/_shared/update-baseline.ts must stay
// byte-identical — enforced by __tests__/lib/race-constants-sync.test.ts.
const PROJECTION_CAPS = {
    beginner: { '5k': 0.24, '10k': 0.22, half_marathon: 0.20, marathon: 0.18, sprint_tri: 0.21, olympic_tri: 0.19, half_ironman: 0.17, ironman: 0.16, bike_race: 0.18 },
    intermediate: { '5k': 0.18, '10k': 0.16, half_marathon: 0.14, marathon: 0.12, sprint_tri: 0.15, olympic_tri: 0.13, half_ironman: 0.10, ironman: 0.08, bike_race: 0.12 },
    advanced: { '5k': 0.14, '10k': 0.12, half_marathon: 0.10, marathon: 0.08, sprint_tri: 0.11, olympic_tri: 0.09, half_ironman: 0.07, ironman: 0.06, bike_race: 0.08 },
};
// ══════════════════════════════════════════════════════════
// UNIVERSAL: Realism Check (exported for Live-Updates)
// ══════════════════════════════════════════════════════════
export function realismCheck({ prognosis, goalTimeHours, weeklyHoursGoal, mainRaceDate, athleteLevel, raceType, raceDist, precomputedProjection, lang, currentWeeklyHours, }) {
    const l = lang ?? 'de';
    const tx = (de, en) => l === 'en' ? en : de;
    const level = athleteLevel ?? 'intermediate';
    // 5k/10k show target & projections as MM:SS — shadow the module formatter so
    // every formatTime(...) below is distance-aware without per-call changes.
    const formatTime = (h) => formatRaceClock(h, raceType);
    const adjTotal = prognosis.adjusted_total_hours ?? prognosis.total_prognose_hours;
    const bestCase = prognosis.adjusted_best_hours ?? prognosis.best_case_hours;
    const worstCase = prognosis.adjusted_worst_hours ?? prognosis.worst_case_hours;
    if (!adjTotal) {
        return {
            feasible: null, likelihood: null,
            likelihood_label: null,
            scale_position: 0.5, scale_label: 'unknown',
            projected_best_hours: null,
            projected_probable_hours: 0,
            projected_worst_hours: null,
            improvement_pct: 0,
            weeks_to_race: null,
            volume_status: 'sufficient',
            min_weekly_hours: 5,
            message_de: tx('Nicht genügend Daten für eine Einschätzung.', 'Not enough data for an assessment.'),
            suggestions: [],
        };
    }
    const weeksToRace = mainRaceDate
        ? Math.max(0, (new Date(mainRaceDate).getTime() - Date.now()) / (7 * 86400000))
        : null;
    const IMPROVEMENT_RATES = { beginner: 0.025, intermediate: 0.022, advanced: 0.010 };
    const monthlyRate = IMPROVEMENT_RATES[level] ?? 0.015;
    const monthsToRace = weeksToRace ? weeksToRace / 4.33 : 0;
    const rp = RACE_PARAMS[raceType] || RACE_PARAMS.ironman;
    const minHours = rp.hMin;
    const RAMP_CEILING = 1.15; // suggest 15% above minimum for volume increase suggestions
    // Volume sufficiency: soft ramp hMin→hNorm (0→1), diminishing returns hNorm→hCap (1→1.15)
    let volumeEffect;
    let volumeStatus = 'sufficient';
    if (weeklyHoursGoal < rp.hMin) {
        volumeEffect = 0;
        volumeStatus = 'insufficient';
    }
    else if (weeklyHoursGoal <= rp.hNorm) {
        volumeEffect = (weeklyHoursGoal - rp.hMin) / (rp.hNorm - rp.hMin);
        // Above hMin = sufficient. No "marginal" warning between hMin and hMin*1.3
        // because volume warnings are reserved for "below improvement threshold".
    }
    else if (weeklyHoursGoal <= rp.hCap) {
        volumeEffect = 1 + 0.15 * (weeklyHoursGoal - rp.hNorm) / (rp.hCap - rp.hNorm);
    }
    else {
        volumeEffect = 1.15;
    }
    // Gap penalty: light dampener — plan engine handles ramp safety (max +15%/week),
    // so the cliff-jump assumption is wrong. Coefficient kept low.
    const gapPenalty = 1 / (1 + 0.05 * Math.max(0, weeklyHoursGoal / currentWeeklyHours - 1));
    // Time saturation: divisor 2 reflects typical 8-12 week adaptation cycle for endurance training.
    const timeFactor = monthsToRace > 0 ? 1 - Math.exp(-monthsToRace / 2) : 0;
    // Race-type-aware caps
    const levelCaps = PROJECTION_CAPS[level] || PROJECTION_CAPS.intermediate;
    const totalCap = levelCaps[raceType] || levelCaps.ironman || 0.08;
    // Continuous compounding
    const baseRate = monthlyRate * rp.raceRateMult * volumeEffect * gapPenalty;
    const rawImprovement = monthsToRace > 0 ? 1 - Math.exp(-baseRate * monthsToRace * timeFactor) : 0;
    // Proportional taper bonus
    const taperBonus = Math.min(0.015, 0.15 * rawImprovement);
    const maxImprovement = Math.min(rawImprovement + taperBonus, totalCap);
    const projectProbableAtHours = (hours) => {
        let ve;
        if (hours < rp.hMin) {
            ve = 0;
        }
        else if (hours <= rp.hNorm) {
            ve = (hours - rp.hMin) / (rp.hNorm - rp.hMin);
        }
        else if (hours <= rp.hCap) {
            ve = 1 + 0.15 * (hours - rp.hNorm) / (rp.hCap - rp.hNorm);
        }
        else {
            ve = 1.15;
        }
        const gp = 1 / (1 + 0.05 * Math.max(0, hours / currentWeeklyHours - 1));
        const rate = monthlyRate * rp.raceRateMult * ve * gp;
        const raw = monthsToRace > 0 ? 1 - Math.exp(-rate * monthsToRace * timeFactor) : 0;
        const tb = Math.min(0.015, 0.15 * raw);
        const impr = Math.min(raw + tb, totalCap);
        return round4(adjTotal * (1 - impr));
    };
    let projectedBest;
    let projectedProb;
    let projectedWorst;
    if (precomputedProjection) {
        projectedBest = precomputedProjection.projectedBest;
        projectedProb = precomputedProjection.projectedProb;
        projectedWorst = precomputedProjection.projectedWorst;
    }
    else {
        projectedBest = bestCase ? round4(bestCase * (1 - Math.min(rawImprovement * 1.3 + taperBonus, totalCap * 1.2))) : null;
        projectedProb = round4(adjTotal * (1 - maxImprovement));
        projectedWorst = worstCase ? round4(worstCase * (1 - Math.min(rawImprovement * 0.4 + taperBonus * 0.5, totalCap * 0.5))) : null;
    }
    // ── GAP ANALYSIS ──
    if (!goalTimeHours) {
        const noGoalSuggestions = [];
        if (volumeStatus === 'insufficient') {
            const sugHrs = round2(minHours * RAMP_CEILING);
            const projAt = projectProbableAtHours(sugHrs);
            noGoalSuggestions.push({
                type: 'increase_volume',
                label_de: tx('Trainingsumfang erhöhen', 'Increase training volume'),
                current_hours: weeklyHoursGoal ?? 10,
                suggested_hours: sugHrs, min_hours: minHours,
                projected_probable_at_suggested: projAt,
                projected_probable_formatted_at_suggested: formatTime(projAt),
                message_de: tx('Ab ' + minHours + 'h/Woche wird Verbesserung möglich. Bei ' + sugHrs + 'h erreichst du voraussichtlich ' + formatTime(projAt) + '.', 'From ' + minHours + 'h/week improvement becomes possible. At ' + sugHrs + 'h you can expect ' + formatTime(projAt) + '.'),
            });
        }
        return {
            feasible: true, likelihood: null,
            likelihood_label: null,
            scale_position: 0.5, scale_label: 'no_goal',
            message_de: null,
            projected_best_hours: projectedBest,
            projected_probable_hours: projectedProb,
            projected_worst_hours: projectedWorst,
            suggested_goal_hours: projectedProb,
            suggested_goal_formatted: formatTime(projectedProb),
            improvement_pct: round2(maxImprovement * 100),
            volume_status: volumeStatus,
            min_weekly_hours: minHours,
            weeks_to_race: weeksToRace ? round2(weeksToRace) : null,
            suggestions: noGoalSuggestions,
        };
    }
    const goal = goalTimeHours;
    const gapHours = projectedProb - goal;
    const gapPct = round2((gapHours / goal) * 100);
    // Classification extracted to ./goalAssessment and mirrored to the plan
    // engine (roadmap 12.1, spec §8) — parity pinned by
    // supabase/functions/_test/goal-assessment-parity.test.ts. Behavior here is
    // byte-identical to the previous inline block.
    const _goalClass = classifyGoalTime(goal, projectedBest, projectedProb, projectedWorst);
    let scalePosition = _goalClass.scale_position;
    let scaleLabel = _goalClass.scale_label;
    let likelihood = _goalClass.likelihood;
    // ── SUGGESTIONS ──
    const suggestions = [];
    if (scaleLabel === 'too_easy') {
        suggestions.push({ type: 'adjust_goal_faster', label_de: tx('Schnelleres Ziel setzen', 'Set a faster goal'), suggested_goal_hours: projectedProb, suggested_goal_formatted: formatTime(projectedProb), message_de: tx('Du kannst mehr! Eine fordernde Zielzeit wäre ' + formatTime(projectedProb) + '.', 'You can do more! A challenging goal would be ' + formatTime(projectedProb) + '.') });
        if (projectedBest) {
            suggestions.push({ type: 'adjust_goal_dream', label_de: tx('Dream Goal setzen', 'Set a dream goal'), suggested_goal_hours: projectedBest, suggested_goal_formatted: formatTime(projectedBest), message_de: tx('Dein absolutes Best-Case-Ziel: ' + formatTime(projectedBest) + '. Ambitioniert, aber möglich.', 'Your absolute best-case goal: ' + formatTime(projectedBest) + '. Ambitious, but possible.') });
        }
        // Race-aware floor: never suggest below rp.hMin (improvement threshold).
        // Avoids absurd cases like "reduce IM to 4.79h/week".
        const reduceFloor = Math.max(rp.hMin, 4);
        if (monthsToRace > 0 && (weeklyHoursGoal ?? 10) > reduceFloor) {
            const reducedHours = round2(Math.max(reduceFloor, (weeklyHoursGoal ?? 10) * 0.75));
            if (reducedHours < (weeklyHoursGoal ?? 10) - 1) {
                const projAtReduced = projectProbableAtHours(reducedHours);
                suggestions.push({ type: 'reduce_hours', label_de: tx('Trainingsumfang reduzieren', 'Reduce training volume'), current_hours: weeklyHoursGoal ?? 10, suggested_hours: reducedHours, projected_probable_at_suggested: projAtReduced, projected_probable_formatted_at_suggested: formatTime(projAtReduced), message_de: tx('Für ' + formatTime(goal) + ' reichen auch ' + reducedHours + 'h/Woche (Prognose: ' + formatTime(projAtReduced) + ').', 'For ' + formatTime(goal) + ', ' + reducedHours + 'h/week is enough (projection: ' + formatTime(projAtReduced) + ').') });
            }
        }
    }
    else if (scaleLabel === 'unrealistic' || scaleLabel === 'high_effort') {
        suggestions.push({ type: 'adjust_goal', label_de: tx('Zielzeit anpassen', 'Adjust goal time'), suggested_goal_hours: projectedProb, suggested_goal_formatted: formatTime(projectedProb), message_de: tx('Eine realistischere Zielzeit wäre ' + formatTime(projectedProb) + '.', 'A more realistic goal time would be ' + formatTime(projectedProb) + '.') });
        const requiredImprovement = (projectedProb - goal) / projectedProb;
        const requiredTotal = requiredImprovement + maxImprovement;
        if (requiredTotal <= totalCap * 1.5 && monthsToRace > 0) {
            const requiredRate = (requiredTotal - taperBonus) / monthsToRace;
            const requiredVF = requiredRate / monthlyRate;
            const clampedVF = Math.max(0.6, Math.min(1.15, requiredVF));
            const requiredHours = Math.pow(12, 2 * (clampedVF - 0.5));
            const suggestedHours = round2(Math.max((weeklyHoursGoal ?? 10) + 1, Math.min(25, requiredHours)));
            if (suggestedHours > (weeklyHoursGoal ?? 10)) {
                const projAtSuggested = projectProbableAtHours(suggestedHours);
                const closesGapPct = Math.abs(gapHours) > 0 ? (projectedProb - projAtSuggested) / Math.abs(gapHours) : 0;
                if (closesGapPct >= 0.5) {
                    suggestions.push({ type: 'adjust_hours', label_de: tx('Trainingsumfang erhöhen', 'Increase training volume'), current_hours: weeklyHoursGoal ?? 10, suggested_hours: suggestedHours, projected_probable_at_suggested: projAtSuggested, projected_probable_formatted_at_suggested: formatTime(projAtSuggested), improvement_vs_current_pct: round2(((projectedProb - projAtSuggested) / projectedProb) * 100), message_de: tx('Mit ' + suggestedHours + 'h/Woche erreichst du voraussichtlich ' + formatTime(projAtSuggested) + ' statt ' + formatTime(projectedProb) + '.', 'With ' + suggestedHours + 'h/week you can expect ' + formatTime(projAtSuggested) + ' instead of ' + formatTime(projectedProb) + '.') });
                }
            }
        }
    }
    if (scaleLabel === 'stretch') {
        suggestions.push({ type: 'adjust_goal', label_de: tx('Ziel absichern', 'Secure your goal'), suggested_goal_hours: projectedProb, suggested_goal_formatted: formatTime(projectedProb), message_de: tx('Mit ' + formatTime(projectedProb) + ' als Ziel bist du auf der sicheren Seite.', 'With ' + formatTime(projectedProb) + ' as your goal, you are on the safe side.') });
        if (monthsToRace > 0) {
            const MAX_TEST_HOURS_OFFSET = 5;
            const maxTestHrs = Math.min(25, (weeklyHoursGoal ?? 10) + MAX_TEST_HOURS_OFFSET);
            let sugHrs = null;
            let sugProj = null;
            const STEP = 0.5;
            for (let h = (weeklyHoursGoal ?? 10) + STEP; h <= maxTestHrs; h += STEP) {
                const p = projectProbableAtHours(h);
                if (p <= goal) {
                    sugHrs = round2(h);
                    sugProj = p;
                    break;
                }
            }
            if (sugHrs && sugProj && sugHrs > (weeklyHoursGoal ?? 10)) {
                suggestions.push({ type: 'adjust_hours', label_de: tx('Etwas mehr trainieren', 'Train a bit more'), current_hours: weeklyHoursGoal ?? 10, suggested_hours: sugHrs, projected_probable_at_suggested: sugProj, projected_probable_formatted_at_suggested: formatTime(sugProj), improvement_vs_current_pct: round2(((projectedProb - sugProj) / projectedProb) * 100), message_de: tx('Mit ' + sugHrs + 'h/Woche wird ' + formatTime(goal) + ' zur realistischen Prognose (' + formatTime(sugProj) + ').', 'With ' + sugHrs + 'h/week, ' + formatTime(goal) + ' becomes a realistic projection (' + formatTime(sugProj) + ').') });
            }
        }
    }
    // Comfortable: goal is achievable, search for the lowest hours that still meet it
    // (with a 0.5h safety buffer above the bare minimum)
    if (scaleLabel === 'comfortable' && monthsToRace > 0) {
        const minSearchHrs = Math.max(rp.hMin, 4);
        const STEP = 0.5;
        let lastOkHrs = null;
        for (let h = (weeklyHoursGoal ?? 10) - STEP; h >= minSearchHrs; h -= STEP) {
            if (projectProbableAtHours(h) <= goal) {
                lastOkHrs = round2(h);
            }
            else {
                break;
            }
        }
        if (lastOkHrs != null) {
            const safeHrs = round2(Math.min(lastOkHrs + STEP, (weeklyHoursGoal ?? 10) - 1));
            if (safeHrs >= minSearchHrs && safeHrs <= (weeklyHoursGoal ?? 10) - 1) {
                const safeProj = projectProbableAtHours(safeHrs);
                if (safeProj <= goal) {
                    suggestions.push({ type: 'reduce_hours', label_de: tx('Trainingsumfang reduzieren', 'Reduce training volume'), current_hours: weeklyHoursGoal ?? 10, suggested_hours: safeHrs, projected_probable_at_suggested: safeProj, projected_probable_formatted_at_suggested: formatTime(safeProj), message_de: tx('Für ' + formatTime(goal) + ' reichen auch ' + safeHrs + 'h/Woche (Prognose: ' + formatTime(safeProj) + ').', 'For ' + formatTime(goal) + ', ' + safeHrs + 'h/week is enough (projection: ' + formatTime(safeProj) + ').') });
                }
            }
        }
    }
    // Insufficient-volume suggestion only when the user actually wants to improve
    // (stretch / high_effort / unrealistic). For comfortable / too_easy goals
    // a low volume is a non-issue and pushing more hours would be noise.
    const ambitiousGoal = scaleLabel === 'stretch' || scaleLabel === 'high_effort' || scaleLabel === 'unrealistic';
    if (volumeStatus === 'insufficient' && ambitiousGoal) {
        const suggestedHrsVol = round2(minHours * RAMP_CEILING);
        const projAtVol = projectProbableAtHours(suggestedHrsVol);
        suggestions.unshift({ type: 'increase_volume', label_de: tx('Trainingsumfang erhöhen', 'Increase training volume'), current_hours: weeklyHoursGoal ?? 10, suggested_hours: suggestedHrsVol, min_hours: minHours, projected_probable_at_suggested: projAtVol, projected_probable_formatted_at_suggested: formatTime(projAtVol), improvement_vs_current_pct: round2(((projectedProb - projAtVol) / projectedProb) * 100), message_de: tx('Mit ' + (weeklyHoursGoal ?? 10) + 'h/Woche ist Verbesserung unwahrscheinlich. Ab ' + minHours + 'h wird deine Prognose spürbar besser — bei ' + suggestedHrsVol + 'h erreichst du ' + formatTime(projAtVol) + '.', 'At ' + (weeklyHoursGoal ?? 10) + 'h/week, improvement is unlikely. From ' + minHours + 'h your projection improves noticeably — at ' + suggestedHrsVol + 'h you reach ' + formatTime(projAtVol) + '.') });
    }
    // Fallback: low volume + ambitious goal but no hours-suggestion fired yet.
    // Triggers when user is at hMin or just above, where adjust_hours' strict
    // closesGapPct gate blocks but a modest volume bump would still meaningfully
    // shift the projection toward the goal.
    const lowVolume = (weeklyHoursGoal ?? 10) < rp.hNorm;
    const hoursAlreadySuggested = suggestions.some((s) => s.type === 'adjust_hours' || s.type === 'increase_volume');
    if (ambitiousGoal && lowVolume && !hoursAlreadySuggested && monthsToRace > 0) {
        const suggestedHrsVol = round2(Math.min(rp.hNorm, (weeklyHoursGoal ?? 10) + 3));
        if (suggestedHrsVol > (weeklyHoursGoal ?? 10) + 0.5) {
            const projAtVol = projectProbableAtHours(suggestedHrsVol);
            suggestions.push({
                type: 'increase_volume',
                label_de: tx('Trainingsumfang erhöhen', 'Increase training volume'),
                current_hours: weeklyHoursGoal ?? 10,
                suggested_hours: suggestedHrsVol,
                projected_probable_at_suggested: projAtVol,
                projected_probable_formatted_at_suggested: formatTime(projAtVol),
                improvement_vs_current_pct: round2(((projectedProb - projAtVol) / projectedProb) * 100),
                message_de: tx('Mit ' + suggestedHrsVol + 'h/Woche statt ' + (weeklyHoursGoal ?? 10) + 'h verbessert sich deine Prognose auf ' + formatTime(projAtVol) + '.', 'With ' + suggestedHrsVol + 'h/week instead of ' + (weeklyHoursGoal ?? 10) + 'h, your projection improves to ' + formatTime(projAtVol) + '.'),
            });
        }
    }
    const hoursHelpful = suggestions.some((s) => s.type === 'adjust_hours' || s.type === 'increase_volume');
    return {
        feasible: scaleLabel !== 'unrealistic',
        likelihood,
        likelihood_label: likelihood >= 0.70 ? 'high' : likelihood >= 0.40 ? 'moderate' : likelihood >= 0.15 ? 'low' : 'very_low',
        scale_position: scalePosition,
        scale_label: scaleLabel,
        gap_hours: round2(gapHours),
        gap_pct: gapPct,
        goal_time_hours: goal,
        goal_time_formatted: formatTime(goal),
        projected_best_hours: projectedBest,
        projected_probable_hours: projectedProb,
        projected_worst_hours: projectedWorst,
        projected_best_formatted: formatTime(projectedBest),
        projected_probable_formatted: formatTime(projectedProb),
        projected_worst_formatted: formatTime(projectedWorst),
        improvement_pct: round2(maxImprovement * 100),
        weeks_to_race: weeksToRace ? round2(weeksToRace) : null,
        volume_status: volumeStatus,
        min_weekly_hours: minHours,
        message_de: buildMessage(scaleLabel, goal, projectedProb, projectedBest, weeklyHoursGoal, level, volumeStatus, minHours, hoursHelpful, l, raceType),
        suggestions,
    };
}
// ══════════════════════════════════════════════════════════
// DERIVE: Run → Threshold Pace (sec/km)
// ══════════════════════════════════════════════════════════
export function deriveRunThreshold(input, level) {
    if (input.mode === 'threshold') {
        return input.threshold_pace_sec_km;
    }
    let distM;
    let durationSec;
    if (input.mode === 'bucket') {
        distM = 5000;
        const BUCKET_MAP = {
            '< 18 min': 16.5 * 60,
            '18-22 min': 20 * 60,
            '22-27 min': 24.5 * 60,
            '27-33 min': 30 * 60,
            '> 33 min': 36 * 60,
        };
        const d = BUCKET_MAP[input.bucket];
        if (!d)
            return null;
        durationSec = d;
    }
    else if (input.mode === 'custom') {
        distM = input.distance_m;
        durationSec = input.duration_sec;
    }
    else {
        return null;
    }
    if (!distM || !durationSec)
        return null;
    const distKm = distM / 1000;
    const MIN_DIST_KM = 1;
    if (distKm < MIN_DIST_KM)
        return null;
    // Every distance now runs through the same Daniels-Gilbert grid that the
    // race-duration predictors invert, so entering a PB at ANY of the four
    // canonical distances and predicting that same distance is the identity
    // (the old flat factors told a 1:31 half-marathoner they'd run 1:40).
    // Corridor labels still grade the evidence for the confidence mapping:
    if (distKm < 5) {
        // 'sprint': a projected sub-5k effort stays lower-confidence than a
        // measured 5k+ PB even though it uses the same table.
        input._corridor = 'sprint';
        return vdotToThreshold(distM, durationSec, level);
    }
    if (distKm <= 21.0975) {
        input._corridor = 'vdot';
        return vdotToThreshold(distM, durationSec, level);
    }
    // 'endurance': beyond the half marathon the level-dependent realization
    // margin (see enduranceMargin) is divided out — still a measured race, but
    // the mileage assumption keeps it below 'vdot' confidence.
    input._corridor = 'endurance';
    return vdotToThreshold(distM, durationSec, level);
}
// ══════════════════════════════════════════════════════════
// DERIVE: Bike → FTP (watts)
// ══════════════════════════════════════════════════════════
export function deriveBikeFTP(input, level, weight) {
    if (input.mode === 'ftp') {
        return input.ftp_watts;
    }
    let speedKmh;
    if (input.mode === 'bucket') {
        const BUCKET_MAP = {
            '< 23 km/h': 21,
            '23-27 km/h': 25,
            '27-31 km/h': 29,
            '31-35 km/h': 33,
            '> 35 km/h': 37,
        };
        const s = BUCKET_MAP[input.bucket];
        if (!s)
            return null;
        speedKmh = s;
        input._corridor = 'medium';
    }
    else if (input.mode === 'custom') {
        const distM = input.distance_m;
        const durationSec = input.duration_sec;
        if (!distM || !durationSec)
            return null;
        speedKmh = (distM / durationSec) * 3.6;
        const distKm = distM / 1000;
        if (distKm < 16) {
            speedKmh *= 0.95;
            input._corridor = 'short';
        }
        else if (distKm <= 40) {
            input._corridor = 'medium';
        }
        else if (distKm <= 100) {
            const factor = lerp(1.03, 1.05, (distKm - 41) / 59);
            speedKmh *= factor;
            input._corridor = 'long';
        }
        else {
            const factor = lerp(1.08, 1.12, Math.min(1, (distKm - 100) / 80));
            speedKmh *= factor;
            input._corridor = 'ultra';
        }
    }
    else {
        return null;
    }
    const RIDE_INTENSITY = { beginner: 0.65, intermediate: 0.70, advanced: 0.72 };
    const rideIF = RIDE_INTENSITY[level] ?? 0.70;
    const CDA = { beginner: 0.35, intermediate: 0.28, advanced: 0.24 };
    const cda = CDA[level] ?? 0.28;
    const RHO = 1.205;
    const CRR = 0.004;
    const mass = (weight ?? 75) + 10;
    const G = 9.81;
    const v = speedKmh / 3.6;
    const DRIVETRAIN_LOSS = 0.97;
    const powerAtSpeed = (0.5 * RHO * cda * v ** 3 + CRR * mass * G * v) / DRIVETRAIN_LOSS;
    const ftpResult = Math.round(powerAtSpeed / rideIF);
    const FTP_MIN = 80;
    const FTP_MAX = 500;
    return Math.max(FTP_MIN, Math.min(FTP_MAX, ftpResult));
}
// ══════════════════════════════════════════════════════════
// DERIVE: Swim → CSS (sec/100m)
// ══════════════════════════════════════════════════════════
export function deriveSwimCSS(input, level) {
    if (input.mode === 'css') {
        return input.css_pace_100m ?? input.css_sec_per_100m ?? null;
    }
    if (input.mode === 'bucket') {
        const BUCKET_MAP = {
            '< 1:30 min': 80,
            '1:30 - 2:00': 105,
            '2:00 - 2:30': 135,
            '> 2:30 min': 165,
        };
        const pace100m = BUCKET_MAP[input.bucket];
        if (!pace100m)
            return null;
        input._corridor = 'sprint';
        const BUCKET_SPRINT_FACTOR = 1.08;
        return round2(pace100m * BUCKET_SPRINT_FACTOR);
    }
    if (input.mode === 'custom') {
        const distM = input.distance_m;
        const durationSec = input.duration_sec;
        if (!distM || !durationSec)
            return null;
        const pace100m = (durationSec / distM) * 100;
        const MIN_SWIM_DIST = 50;
        if (distM < MIN_SWIM_DIST)
            return null;
        if (distM <= 100) {
            input._corridor = 'sprint';
            return round2(pace100m * 1.18);
        }
        if (distM <= 200) {
            input._corridor = 'css_near';
            return round2(pace100m * 1.05);
        }
        if (distM <= 400) {
            input._corridor = 'css_near';
            return round2(pace100m * 1.02);
        }
        if (distM <= 1000) {
            input._corridor = 'threshold';
            return round2(pace100m * 1.00);
        }
        if (distM <= 2000) {
            input._corridor = 'endurance';
            return round2(pace100m / 0.96);
        }
        input._corridor = 'race_near';
        return round2(pace100m / 0.97);
    }
    return null;
}
// ══════════════════════════════════════════════════════════
// VDOT LOOKUP
// ══════════════════════════════════════════════════════════
/** Riegel exponent for projecting a performance to a nearby distance —
 *  T2 = T1 × (D2/D1)^1.06 (Riegel 1981, holds well 1.5k–marathon). */
const RIEGEL_EXPONENT = 1.06;
// Canonical table distances and their time columns in VDOT_TABLE.
const VDOT_ANCHORS = [
    { distM: 5000, col: 1 },
    { distM: 10000, col: 2 },
    { distM: 21097.5, col: 3 },
    { distM: 42195, col: 4 },
];
const VDOT_THRESHOLD_COL = 5;
/** Marathon margin faded in between HM and marathon distance: an entered HM
 *  is pure Daniels (1.0), an entered marathon carries the full level margin,
 *  anything between (and beyond, clamped) lerps. Keeps the 21.1 km seam
 *  continuous and makes derivation the exact inverse of prediction. */
function enduranceMargin(distM, level) {
    const t = Math.min(1, Math.max(0, (distM - 21097.5) / (42195 - 21097.5)));
    return lerp(1.0, MARATHON_LEVEL_MARGIN[level] ?? 1.05, t);
}
function vdotToThreshold(distM, durationSec, level) {
    // Riegel-project the (margin-adjusted) effort onto the two bracketing
    // canonical distances and blend the resulting VDOTs by where the input sits
    // between them. At an exact anchor the projection is the identity, so table
    // lookups stay byte-identical for true PBs; in between the blend keeps the
    // threshold continuous (the old hard branches jumped up to ~24 s/km).
    // Below 5 km the weight clamps to pure 5k projection (sprint corridor),
    // beyond the marathon to pure marathon projection.
    const adjustedSec = durationSec / enduranceMargin(distM, level);
    let lo = VDOT_ANCHORS[0];
    let hi = VDOT_ANCHORS[VDOT_ANCHORS.length - 1];
    for (let i = 0; i < VDOT_ANCHORS.length - 1; i++) {
        if (distM <= VDOT_ANCHORS[i + 1].distM) {
            lo = VDOT_ANCHORS[i];
            hi = VDOT_ANCHORS[i + 1];
            break;
        }
    }
    const tLo = adjustedSec * Math.pow(lo.distM / distM, RIEGEL_EXPONENT);
    const tHi = adjustedSec * Math.pow(hi.distM / distM, RIEGEL_EXPONENT);
    const vdotLo = interpolateVDOT(VDOT_TABLE, lo.col, tLo);
    const vdotHi = interpolateVDOT(VDOT_TABLE, hi.col, tHi);
    if (vdotLo == null || vdotHi == null)
        return null;
    const w = Math.min(1, Math.max(0, (distM - lo.distM) / (hi.distM - lo.distM)));
    const vdot = vdotLo * (1 - w) + vdotHi * w;
    return interpolateFromVDOT(VDOT_TABLE, vdot, VDOT_THRESHOLD_COL);
}
function interpolateVDOT(table, timeCol, timeSec) {
    for (let i = 0; i < table.length - 1; i++) {
        const t1 = table[i][timeCol];
        const t2 = table[i + 1][timeCol];
        if (timeSec <= t1 && timeSec >= t2) {
            const frac = (t1 - timeSec) / (t1 - t2);
            return table[i][0] + frac * (table[i + 1][0] - table[i][0]);
        }
    }
    if (timeSec >= table[0][timeCol])
        return table[0][0];
    return table[table.length - 1][0];
}
function interpolateFromVDOT(table, vdot, col) {
    for (let i = 0; i < table.length - 1; i++) {
        if (vdot >= table[i][0] && vdot <= table[i + 1][0]) {
            const frac = (vdot - table[i][0]) / (table[i + 1][0] - table[i][0]);
            return round2(table[i][col] + frac * (table[i + 1][col] - table[i][col]));
        }
    }
    if (vdot <= table[0][0])
        return table[0][col];
    return table[table.length - 1][col];
}
// ══════════════════════════════════════════════════════════
// BUILD MESSAGE: Deutsch
// ══════════════════════════════════════════════════════════
function buildMessage(scaleLabel, goal, projected, best, weeklyHours, level, volumeStatus, minHours, hoursHelpful, lang, raceType) {
    if (lang === 'en')
        return buildMessageEN(scaleLabel, goal, projected, best, weeklyHours, level, volumeStatus, minHours, hoursHelpful, raceType);
    const formatTime = (h) => formatRaceClock(h, raceType);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const g = formatTime(goal);
    const p = formatTime(projected);
    const h = weeklyHours;
    const mh = minHours;
    // Insufficient-volume verdict only when the user is reaching for a non-easy goal.
    const needsImprovement = scaleLabel === 'stretch' || scaleLabel === 'high_effort' || scaleLabel === 'unrealistic';
    if (volumeStatus === 'insufficient' && needsImprovement)
        return pick(['Mit ' + h + 'h/Woche hältst du dein Level — für eine Verbesserung empfehlen wir mindestens ' + mh + 'h. Deine aktuelle Prognose: ' + p + '.', h + 'h/Woche reichen für Formerhalt, aber nicht für eine schnellere Zeit. Ab ' + mh + 'h wird Verbesserung realistisch.', 'Dein Prognose-Fenster (' + p + ') basiert auf deinem aktuellen Level. Mehr als ' + mh + 'h/Woche bringen dich nach vorne.']);
    const COMFORTABLE = [g + ' ist ein realistisches Ziel. Mit ' + h + 'h/Woche und deinem aktuellen Fitnesslevel bist du auf einem guten Weg.', g + ' passt gut zu deinem Fitness-Level. Bleib dran und du wirst das schaffen.', 'Dein Ziel von ' + g + ' ist absolut machbar — deine Basis stimmt.', g + '? Das liegt voll in deiner Reichweite. Weiter so!', 'Mit deinem aktuellen Stand und ' + h + 'h/Woche ist ' + g + ' ein solides Ziel.'];
    const STRETCH = [g + ' ist optimistisch — machbar, wenn alles gut läuft. Prognose: ' + p + '. Eine kleine Anpassung bei Ziel oder Umfang macht es sicherer.', 'Dein Ziel von ' + g + ' liegt im oberen Bereich deiner Prognose (' + p + '). Erreichbar, aber du solltest nichts dem Zufall überlassen.', g + ' bei Prognose ' + p + ' — das geht, braucht aber einen guten Tag. Etwas mehr Training oder ein kleiner Puffer machen den Unterschied.', 'Zwischen ' + g + ' und deiner Prognose (' + p + ') liegt ein schmaler Grat. Mit einer kleinen Anpassung wird daraus ein sicheres Ziel.', g + ' ist ambitioniert, aber nicht unrealistisch. Aktuell: ' + p + '. Willst du es absichern, hilft etwas mehr Umfang oder eine Zielkorrektur.'];
    const HIGH_EFFORT = [g + ' ist ambitioniert, aber machbar. Deine aktuelle Prognose liegt bei ' + p + '. Konsequentes Training und gute Regeneration sind entscheidend.', g + ' wird kein Selbstläufer — deine Prognose liegt bei ' + p + '. Mit Fokus und Disziplin ist es aber drin.', 'Dein Ziel von ' + g + ' fordert dich. Aktuell stehst du bei ' + p + '. Jede Einheit zählt ab jetzt.', g + ' ist sportlich, aber nicht unmöglich. Prognose: ' + p + '. Gute Planung und Erholung machen den Unterschied.', 'Zwischen ' + g + ' und deiner Prognose (' + p + ') liegt harte Arbeit — aber genau dafür trainierst du.'];
    const UNREALISTIC = [g + ' ist mit ' + h + 'h/Woche aktuell schwer erreichbar. Unsere Prognose liegt bei ' + p + '. Du kannst entweder die Zielzeit oder den Trainingsumfang anpassen.', 'Ehrlich gesagt: ' + g + ' ist mit ' + h + 'h/Woche sehr ambitioniert. Prognose: ' + p + '. Lass uns Ziel oder Umfang anpassen.', g + ' liegt aktuell außerhalb der realistischen Reichweite (Prognose: ' + p + '). Aber es gibt zwei gute Optionen, das zu ändern.', 'Deine Prognose (' + p + ') zeigt: ' + g + ' braucht entweder mehr Trainingszeit oder ein angepasstes Ziel.', g + ' mit ' + h + 'h/Woche — das wird eng. Aktuell sehen wir ' + p + '. Lass uns schauen, was wir drehen können.'];
    const TOO_EASY = [g + '? Das schaffst du locker — und zwar mit Reserven. Du könntest dir ein ambitionierteres Ziel setzen.', 'Dein Ziel von ' + g + ' ist deutlich unter deinem Potenzial. Du kannst mehr — trau dich!', g + ' ist für dich eine entspannte Sache. Willst du dich nicht etwas mehr herausfordern?', 'Mit deiner Fitness ist ' + g + ' fast schon zu gemütlich. Prognose: ' + p + ' — da geht mehr.'];
    const UNREALISTIC_GOAL_ONLY = [g + ' ist mit deinem aktuellen Stand nicht erreichbar — auch mehr Stunden würden die Lücke nicht schließen. Prognose: ' + p + '. Passe dein Ziel an.', 'Zwischen ' + g + ' und ' + p + ' liegt mehr als zusätzliches Training ausgleichen kann. Eine realistischere Zielzeit bringt dich weiter.', g + ' bei Prognose ' + p + ' — diese Differenz lässt sich nicht über mehr Umfang lösen. Passe deine Zielzeit an und steigere dich schrittweise.', 'Ehrlich: ' + g + ' ist aktuell außer Reichweite, auch mit mehr Stunden. Setz dir ein erreichbares Ziel — du kannst es später verschärfen.'];
    if (scaleLabel === 'too_easy')
        return pick(TOO_EASY);
    if (scaleLabel === 'stretch')
        return pick(STRETCH);
    if (scaleLabel === 'comfortable')
        return pick(COMFORTABLE);
    if (scaleLabel === 'high_effort')
        return hoursHelpful ? pick(HIGH_EFFORT) : pick(UNREALISTIC_GOAL_ONLY);
    return hoursHelpful ? pick(UNREALISTIC) : pick(UNREALISTIC_GOAL_ONLY);
}
// ══════════════════════════════════════════════════════════
// BUILD MESSAGE: English
// ══════════════════════════════════════════════════════════
function buildMessageEN(scaleLabel, goal, projected, best, weeklyHours, level, volumeStatus, minHours, hoursHelpful, raceType) {
    const formatTime = (h) => formatRaceClock(h, raceType);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const g = formatTime(goal);
    const p = formatTime(projected);
    const h = weeklyHours;
    const mh = minHours;
    const needsImprovement = scaleLabel === 'stretch' || scaleLabel === 'high_effort' || scaleLabel === 'unrealistic';
    if (volumeStatus === 'insufficient' && needsImprovement)
        return pick(['At ' + h + 'h/week you maintain your level — for improvement we recommend at least ' + mh + 'h. Projection: ' + p + '.', h + 'h/week is enough for maintenance, but not for getting faster. From ' + mh + 'h, improvement becomes realistic.', 'Your projection (' + p + ') reflects your current level. More than ' + mh + 'h/week will push you forward.']);
    const COMFORTABLE = [g + ' is a realistic goal. With ' + h + 'h/week and your current fitness, you are on track.', g + ' fits your fitness level well. Stay consistent and you will make it.', 'Your goal of ' + g + ' is absolutely achievable — your foundation is solid.', g + '? That is well within your reach. Keep it up!', 'With your current level and ' + h + 'h/week, ' + g + ' is a solid goal.'];
    const STRETCH = [g + ' is optimistic — achievable if everything goes well. Projection: ' + p + '. A small tweak to goal or volume makes it safer.', 'Your goal of ' + g + ' is at the upper end of your projection (' + p + '). Reachable, but leave nothing to chance.', g + ' at projection ' + p + ' — doable, but needs a good day. A bit more training or a small buffer makes the difference.', 'Between ' + g + ' and your projection (' + p + ') is a thin margin. A small adjustment turns it into a safe goal.', g + ' is ambitious but not unrealistic. Current: ' + p + '. More volume or a goal tweak helps secure it.'];
    const HIGH_EFFORT = [g + ' is ambitious but achievable. Your projection is ' + p + '. Consistent training and good recovery are key.', g + ' will not come easy — your projection is ' + p + '. With focus and discipline, it is possible.', 'Your goal of ' + g + ' challenges you. Currently at ' + p + '. Every session counts from now on.', g + ' is a stretch but not impossible. Projection: ' + p + '. Smart planning and recovery make the difference.', 'Between ' + g + ' and your projection (' + p + ') lies hard work — but that is exactly what you train for.'];
    const UNREALISTIC = [g + ' is hard to reach at ' + h + 'h/week. Projection: ' + p + '. Adjust either your goal or training volume.', 'Honestly: ' + g + ' is very ambitious at ' + h + 'h/week. Projection: ' + p + '. Adjust goal or volume.', g + ' is currently out of realistic reach (projection: ' + p + '). But there are two good options to change that.', 'Your projection (' + p + ') shows: ' + g + ' needs either more training time or an adjusted goal.', g + ' at ' + h + 'h/week — that is tight. Currently: ' + p + '. Let us see what we can adjust.'];
    const TOO_EASY = [g + '? You will nail that easily — with room to spare. Consider a more ambitious goal.', 'Your goal of ' + g + ' is well below your potential. You can do more — go for it!', g + ' is a walk in the park for you. Want to challenge yourself more?', 'With your fitness, ' + g + ' is almost too comfortable. Projection: ' + p + ' — there is more in you.'];
    const UNREALISTIC_GOAL_ONLY = [g + ' is not reachable — more hours would not close the gap. Projection: ' + p + '. Adjust your goal.', 'Between ' + g + ' and ' + p + ' lies more than extra training can fix. A more realistic goal serves you better.', g + ' at projection ' + p + ' — this gap cannot be closed with volume. Adjust your goal and improve step by step.', 'Honestly: ' + g + ' is out of reach, even with more hours. Set an achievable goal — tighten it later.'];
    if (scaleLabel === 'too_easy')
        return pick(TOO_EASY);
    if (scaleLabel === 'stretch')
        return pick(STRETCH);
    if (scaleLabel === 'comfortable')
        return pick(COMFORTABLE);
    if (scaleLabel === 'high_effort')
        return hoursHelpful ? pick(HIGH_EFFORT) : pick(UNREALISTIC_GOAL_ONLY);
    return hoursHelpful ? pick(UNREALISTIC) : pick(UNREALISTIC_GOAL_ONLY);
}
// ══════════════════════════════════════════════════════════
// POST-REALISM WRITE: Prognose → Supabase (nur onboarding/hybrid)
// ══════════════════════════════════════════════════════════
export async function writePrognosisToSupabase({ supabase, userId, prognosis, }) {
    if (!supabase || !userId || !prognosis) {
        return { error: true, code: 'MISSING_INPUT', detail: 'supabase, userId, prognosis required' };
    }
    const now = new Date().toISOString();
    // Preserve existing EF/threshold values that import-history may have written
    const { data: existing } = await supabase
        .from('athlete_baseline')
        .select('current_run_ef, current_bike_ef, current_swim_ef, consistency_score, acwr, weekly_training_load, avg_hours_per_week_28d, total_sessions_28d')
        .eq('user_id', userId)
        .maybeSingle();
    const baselineData = {
        user_id: userId,
        // Carry over activity-derived fields so upsert doesn't null them out
        current_run_ef: existing?.current_run_ef ?? null,
        current_bike_ef: existing?.current_bike_ef ?? null,
        current_swim_ef: existing?.current_swim_ef ?? null,
        consistency_score: existing?.consistency_score ?? null,
        acwr: existing?.acwr ?? null,
        weekly_training_load: existing?.weekly_training_load ?? null,
        avg_hours_per_week_28d: existing?.avg_hours_per_week_28d ?? null,
        total_sessions_28d: existing?.total_sessions_28d ?? null,
        swim_prognose_hours: prognosis.swim_prognose_hours ?? null,
        bike_prognose_hours: prognosis.bike_prognose_hours ?? null,
        run_prognose_hours: prognosis.run_prognose_hours ?? null,
        total_prognose_hours: prognosis.total_prognose_hours ?? null,
        best_case_hours: prognosis.best_case_hours ?? null,
        worst_case_hours: prognosis.worst_case_hours ?? null,
        adjusted_swim_hours: prognosis.adjusted_swim_hours ?? null,
        adjusted_bike_hours: prognosis.adjusted_bike_hours ?? null,
        adjusted_run_hours: prognosis.adjusted_run_hours ?? null,
        adjusted_total_hours: prognosis.adjusted_total_hours ?? null,
        adjusted_best_hours: prognosis.adjusted_best_hours ?? null,
        adjusted_worst_hours: prognosis.adjusted_worst_hours ?? null,
        course_factor_swim: prognosis.course_factor_swim ?? 1.0,
        course_factor_bike: prognosis.course_factor_bike ?? 1.0,
        course_factor_run: prognosis.course_factor_run ?? 1.0,
        current_ftp_estimated: prognosis.derived_ftp != null ? Math.round(prognosis.derived_ftp) : null,
        current_css_pace_100m: prognosis.derived_css != null ? Math.round(prognosis.derived_css) : null,
        current_run_threshold_pace_sec_km: prognosis.derived_threshold_pace != null ? Math.round(prognosis.derived_threshold_pace) : null,
        prognose_source_swim: prognosis.source_swim ?? prognosis.source ?? null,
        prognose_source_bike: prognosis.source_bike ?? prognosis.source ?? null,
        prognose_source_run: prognosis.source_run ?? prognosis.source ?? null,
        swim_stddev: prognosis.swim_stddev ?? null,
        bike_stddev: prognosis.bike_stddev ?? null,
        run_stddev: prognosis.run_stddev ?? null,
        effective_stddev: prognosis.effective_stddev ?? null,
        race_day_probable_hours: prognosis.race_day_probable_hours ?? null,
        race_day_best_hours: prognosis.race_day_best_hours ?? null,
        race_day_worst_hours: prognosis.race_day_worst_hours ?? null,
        race_day_improvement_pct: prognosis.race_day_improvement_pct ?? null,
        race_day_weeks_to_race: prognosis.race_day_weeks_to_race ?? null,
        race_day_source: prognosis.race_day_source ?? 'snapshot_only',
        last_updated: now,
    };
    const { error: upsertError } = await supabase
        .from('athlete_baseline')
        .upsert(baselineData, { onConflict: 'user_id' });
    if (upsertError) {
        return { error: true, code: 'UPSERT_FAILED', detail: upsertError.message };
    }
    const { error: historyError } = await supabase
        .from('baseline_history')
        .insert({
        user_id: userId,
        total_prognose_hours: prognosis.total_prognose_hours,
        swim_prognose_hours: prognosis.swim_prognose_hours,
        bike_prognose_hours: prognosis.bike_prognose_hours,
        run_prognose_hours: prognosis.run_prognose_hours,
        best_case_hours: prognosis.best_case_hours,
        worst_case_hours: prognosis.worst_case_hours,
        current_ftp_estimated: prognosis.derived_ftp != null ? Math.round(prognosis.derived_ftp) : null,
        current_css_pace_100m: prognosis.derived_css != null ? Math.round(prognosis.derived_css) : null,
        current_run_threshold_pace_sec_km: prognosis.derived_threshold_pace != null ? Math.round(prognosis.derived_threshold_pace) : null,
        adjusted_total_hours: prognosis.adjusted_total_hours,
        race_day_probable_hours: prognosis.race_day_probable_hours ?? null,
        race_day_best_hours: prognosis.race_day_best_hours ?? null,
        race_day_worst_hours: prognosis.race_day_worst_hours ?? null,
        race_day_improvement_pct: prognosis.race_day_improvement_pct ?? null,
        race_day_source: prognosis.race_day_source ?? 'snapshot_only',
        // Carry over activity-derived EF values
        current_run_ef: existing?.current_run_ef ?? null,
        current_bike_ef: existing?.current_bike_ef ?? null,
        current_swim_ef: existing?.current_swim_ef ?? null,
        consistency_score: existing?.consistency_score ?? null,
    });
    if (historyError) {
        return { error: true, code: 'HISTORY_INSERT_FAILED', detail: historyError.message };
    }
    return { upserted: true };
}
// ══════════════════════════════════════════════════════════
// SHARED HELPERS
// ══════════════════════════════════════════════════════════
/** For race-TIME hours: consumers render min:sec (hours*3600) and a 0.01h
 *  grid quantizes to 36s steps — visible next to the 5k/10k round-trip
 *  identity. Weekly-volume hours and paces keep round2. */
export function round4(n) {
    return Math.round(n * 10000) / 10000;
}
export function round2(n) {
    return Math.round(n * 100) / 100;
}
export function lerp(a, b, t) {
    return a + (b - a) * Math.max(0, Math.min(1, t));
}
export function worstOf(...levels) {
    const order = { low: 0, medium: 1, high: 2 };
    let worst = 'high';
    for (const l of levels) {
        if (l && (order[l] ?? 0) < (order[worst] ?? 0))
            worst = l;
    }
    return worst;
}
export function formatTime(hours) {
    if (!hours)
        return null;
    return formatHoursToHM(hours);
}
/** Race-aware variant of formatTime: 5k/10k render as MM:SS, all else H:MM. */
function formatRaceClock(hours, raceType) {
    if (!hours)
        return null;
    if (raceType === '5k' || raceType === '10k') {
        const totalSec = Math.round(hours * 3600);
        return Math.floor(totalSec / 60) + ':' + String(totalSec % 60).padStart(2, '0');
    }
    return formatTime(hours);
}
