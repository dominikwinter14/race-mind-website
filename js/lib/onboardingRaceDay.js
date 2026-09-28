// The race-day projection of the onboarding forecast and the website
// calculator (Phase 2, docs/plan-level-forecast-2026-09.md): the same parts as
// calculateRaceDayProjection in supabase/functions/_shared/race-day-projection.ts,
// from what the onboarding knows — the thresholds it derived, the birth year,
// the experience answer. There are no training weeks before a plan and no
// measured trend, so the headroom counts as the curve has it.
//
// realismCheck (lib/realismCheck.ts) calls it; the parts live in
// lib/improvementHeadroom.ts, whose parity with the edge a Deno test holds.
import { RACE_PARAMS } from '../constants/raceVolume.js';
import { EXPERIENCE_TO_MONTHS, executionOnRaceDay, executionToday, } from './athleteLevel.js';
import { ageFactor, ageYearsAt, disciplineHeadroom, executionShift, goalVolume, levelGrowsAt, projectRaceDay, } from './improvementHeadroom.js';
import { predictRaceDuration } from './raceDurationPredictor.js';
/** The athlete from the onboarding store's answers (weight is added where it is parsed). */
export function onboardingAthleteOf(store) {
    const year = parseInt(store.birthYear, 10);
    return {
        birthYear: Number.isFinite(year) && year > 1900 ? year : null,
        experienceMonths: EXPERIENCE_TO_MONTHS[store.experience] ?? null,
        trainingWeeks: store.levelGrowth?.trainingWeeks ?? 0,
        chosen: store.levelChosen,
    };
}
const MAIN_RACE_TYPES = [
    'ironman', 'half_ironman', 'olympic_tri', 'sprint_tri', 'marathon', 'half_marathon', '10k', '5k',
];
function executionInputOf(raceType, level, athlete) {
    return {
        experienceMonths: athlete?.experienceMonths ?? null,
        trainingWeeks: athlete?.trainingWeeks ?? 0,
        raceType: (MAIN_RACE_TYPES.includes(raceType) ? raceType : null),
        stored: level,
        chosen: athlete?.chosen === true,
    };
}
/** Today's execution (race-execution): the level, or its glide with training
 *  weeks from a new race. buildPrognosis prices "today" with it, like the server. */
export function onboardingExecutionToday(raceType, level, currentWeeklyHours, athlete) {
    return executionToday(executionInputOf(raceType, level, athlete), currentWeeklyHours);
}
/**
 * Today's times (best / probable / worst) taken to race day. Under 3 weeks, or
 * without a date, race day is today, as on the server.
 */
export function onboardingRaceDay(params) {
    const { prognosis: p, base, raceType, weeksToRace, currentWeeklyHours, level } = params;
    const athlete = params.athlete ?? {};
    const same = {
        ...base, improvement: 0, breakdown: null, view: null, probableAt: () => base.probable,
    };
    if (!weeksToRace || weeksToRace < 3 || !(base.probable > 0))
        return same;
    const legs = { swim: p.adjusted_swim_hours ?? 0, bike: p.adjusted_bike_hours ?? 0, run: p.adjusted_run_hours ?? 0 };
    const transitionHours = Math.max(0, base.probable - legs.swim - legs.bike - legs.run);
    const thresholds = {
        run_threshold_pace_sec_km: p.derived_threshold_pace, ftp_watts: p.derived_ftp,
        css_pace_sec_per_100m: p.derived_css, weight_kg: athlete.weightKg ?? null,
    };
    const input = executionInputOf(raceType, level, athlete);
    const today = executionToday(input, currentWeeklyHours);
    const born = athlete.birthYear ? `${athlete.birthYear}-01-01` : null;
    const now = new Date();
    const ageNow = ageYearsAt(born, now);
    const ageThen = ageYearsAt(born, new Date(now.getTime() + weeksToRace * 7 * 86400000));
    const headroom = disciplineHeadroom({
        thresholds, ageYears: ageNow, raceType, distances: params.distances, level, execution: today,
        // A chip or a distance + time is never measured — the server's 'seed'. An
        // exact value is the athlete's own, the server's 'manual': no chip.
        chips: {
            run: (p.source_run ?? p.source) === 'onboarding' && !p.exact?.run,
            bike: (p.source_bike ?? p.source) === 'onboarding' && !p.exact?.bike,
            swim: (p.source_swim ?? p.source) === 'onboarding' && !p.exact?.swim,
        },
    }, predictRaceDuration);
    const rp = RACE_PARAMS[raceType] || RACE_PARAMS.ironman;
    const at = (weeklyHours) => projectRaceDay({
        legs, transitionHours,
        base: { worst: base.worst ?? base.probable, probable: base.probable, best: base.best ?? base.probable },
        headroom,
        monthsToRace: weeksToRace / 4.33,
        volume: goalVolume(weeklyHours, currentWeeklyHours, rp),
        trendScale: 1,
        shift: executionShift({
            thresholds, raceType, distances: params.distances, level, today,
            raceDay: levelGrowsAt(weeklyHours, rp) ? executionOnRaceDay(input, currentWeeklyHours, weeksToRace, weeklyHours) : today,
        }, predictRaceDuration),
        ageing: ageFactor(ageNow) / ageFactor(ageThen),
    });
    const projection = at(params.weeklyHoursGoal);
    if (!projection)
        return same;
    // Never slower than today, as on the server.
    const clamp = (hours, today) => round4(Math.min(today, hours));
    const probable = clamp(projection.hours.probable, base.probable);
    // The cone: every case from today's probable time (concept Umsetzung 6).
    const fromToday = (c) => clamp(base.probable * (1 - projection.improvement[c]), base.probable);
    return {
        best: base.best != null ? clamp(projection.hours.best, base.best) : null,
        probable,
        worst: base.worst != null ? clamp(projection.hours.worst, base.worst) : null,
        improvement: 1 - probable / base.probable,
        breakdown: projection.breakdown,
        view: {
            today: base.probable,
            cone: { best: fromToday('best'), probable, worst: fromToday('worst') },
            breakdown: projection.breakdown,
        },
        probableAt: (weeklyHours) => {
            const other = at(weeklyHours);
            return other ? clamp(other.hours.probable, base.probable) : base.probable;
        },
    };
}
function round4(n) {
    return Math.round(n * 10000) / 10000;
}
