// ══════════════════════════════════════════════════════════
// [App] Athlete level & periodization derivation
// Pure, dependency-free: no store, no network, no secrets.
// Lives in lib/ (not stores/) so the website prognosis tool can bundle it
// without dragging Zustand into the browser build.
// ══════════════════════════════════════════════════════════
// Minimum training volume per race type (below → beginner)
const MIN_VOLUME = {
    '5k': 2,
    '10k': 2,
    half_marathon: 2,
    marathon: 2,
    sprint_tri: 2,
    olympic_tri: 3,
    half_ironman: 3,
    ironman: 5,
};
// Minimum volume for block periodization (non-beginners only)
export const MIN_BLOCK_VOLUME = {
    '5k': 3,
    '10k': 4,
    half_marathon: 4,
    marathon: 5,
    sprint_tri: 4,
    olympic_tri: 5,
    half_ironman: 5,
    ironman: 6,
};
// Minimum volume for advanced level, keyed by experience index
const MIN_ADVANCED_VOLUME = {
    2: { '5k': 4, '10k': 5, half_marathon: 5, marathon: 6, sprint_tri: 6, olympic_tri: 7, half_ironman: 7, ironman: 8 },
    3: { '5k': 5, '10k': 6, half_marathon: 6, marathon: 7, sprint_tri: 7, olympic_tri: 8, half_ironman: 8, ironman: 10 },
};
/** Derive athlete level & periodization mode from experience + volume + race type.
 *  Exported: the PlanConfig periodization picker marks this mode as recommended. */
export function deriveAthleteLevel(experience, weeklyHours, raceType) {
    const hours = parseFloat(weeklyHours) || 0;
    const minVolume = raceType ? MIN_VOLUME[raceType] ?? 2 : 2;
    const minBlockVolume = raceType ? MIN_BLOCK_VOLUME[raceType] ?? 5 : 5;
    // Beginner: < 6 months experience OR below minimum volume for race type
    if (experience === 0 || hours < minVolume) {
        return { athleteLevel: 'beginner', periodizationMode: 'linear' };
    }
    // Check for advanced (only experience 2+ has advanced thresholds)
    const advancedThresholds = MIN_ADVANCED_VOLUME[experience];
    const isAdvanced = advancedThresholds && raceType && hours >= (advancedThresholds[raceType] ?? Infinity);
    const athleteLevel = isAdvanced ? 'advanced' : 'intermediate';
    // Block is an ORGANIZATION change, not a load change — MODE_CONFIG gives linear
    // and block the identical 80/20 intensity split; only the placement of quality
    // work differs (within-week vs. concentrated per mesocycle). So the gate is
    // VOLUME, not level: every non-beginner above MIN_BLOCK_VOLUME gets block.
    // This restores the engine default of spec §18.4 (resolveEffectivePeriodizationMode:
    // beginner → linear, else → block), which the client used to mask by always
    // persisting an explicit mode. Guardrails stay engine-side: computeBlockSequence
    // still falls back to linear below 5 mesocycles.
    const periodizationMode = hours >= minBlockVolume ? 'block' : 'linear';
    return { athleteLevel, periodizationMode };
}
// ══════════════════════════════════════════════════════════
// Planner mirror
// Copies of supabase/functions/_shared/athlete-level.ts (resolveEffectiveLevel,
// classifyAthleteLevel, plannedAthleteLevel, nextLevelStep, goalLevelStep), intensity-rules.ts
// (maxIntensitySessionsFor, ageFromBirthDate) and ramp-feasibility.ts
// (levelMaxJump). The level card shows the level the planner plans with, and
// what it does there, only while both sides agree:
// supabase/functions/_test/athlete-level-parity.test.ts runs them over the
// same inputs.
// ══════════════════════════════════════════════════════════
/** Fix 18: resolve effective athlete level based on experience and volume. */
export function resolveEffectiveLevel(athleteLevel, experienceMonths, goalHours) {
    if (athleteLevel === 'beginner' && experienceMonths != null && experienceMonths >= 12 && goalHours >= 6) {
        return 'intermediate';
    }
    if (athleteLevel === 'advanced' && goalHours <= 4) {
        return 'intermediate';
    }
    if (athleteLevel === 'intermediate' && goalHours <= 2.5) {
        return 'beginner';
    }
    return athleteLevel;
}
/** Server fallback when athlete_config.athlete_level is empty. */
export function classifyAthleteLevel(experienceMonths) {
    if (experienceMonths == null || experienceMonths < 6)
        return 'beginner';
    if (experienceMonths < 24)
        return 'intermediate';
    if (experienceMonths >= 60)
        return 'advanced';
    return 'intermediate';
}
/** The level the planner plans with: the athlete's own choice as it is, a
 *  computed one adjusted to the weekly goal, an empty one from the experience. */
export function plannedAthleteLevel(input) {
    if (input.chosen && input.stored)
        return input.stored;
    const raw = input.stored || classifyAthleteLevel(input.experienceMonths);
    return resolveEffectiveLevel(raw, input.experienceMonths, input.goalHours);
}
/** The step above `level`, read off deriveAthleteLevel's thresholds. Null at
 *  the top, and for an intermediate without a race type. */
export function nextLevelStep(level, experience, raceType) {
    if (level === 'beginner') {
        return experience === 0
            ? { level: 'intermediate', afterMonths: 6 }
            : { level: 'intermediate', weeklyHours: raceType ? MIN_VOLUME[raceType] ?? 2 : 2 };
    }
    if (level === 'intermediate' && raceType) {
        const hours = MIN_ADVANCED_VOLUME[Math.max(2, Math.min(3, experience))][raceType];
        return hours != null ? { level: 'advanced', afterMonths: 24, weeklyHours: hours } : null;
    }
    return null;
}
/** When resolveEffectiveLevel alone keeps the planned level down, the next
 *  level is a weekly goal away. Null when the goal is not what holds it. */
export function goalLevelStep(computed, experienceMonths, goalHours) {
    const planned = resolveEffectiveLevel(computed, experienceMonths, goalHours);
    if (computed === 'advanced' && planned === 'intermediate')
        return { level: 'advanced', goalAboveHours: 4 };
    if (computed === 'intermediate' && planned === 'beginner')
        return { level: 'intermediate', goalAboveHours: 2.5 };
    if (planned === 'beginner' && experienceMonths != null && experienceMonths >= 12) {
        return { level: 'intermediate', goalFromHours: 6 };
    }
    return null;
}
/** The minimum weekly hours of the distance; a week counts as a training week from it. */
export function minVolumeFor(raceType) {
    return raceType ? MIN_VOLUME[raceType] ?? 2 : 2;
}
// ── Training age (copy of supabase/functions/_shared/training-age.ts) ──
// The server counts the training weeks; the app gets them from
// athlete_baseline.training_weeks and only computes with them.
export const WEEKS_PER_MONTH = 4.33;
/** Months from the onboarding answer plus the training weeks since. */
export function trainingAgeMonths(experienceMonths, trainingWeeks) {
    return experienceMonths + trainingWeeks / WEEKS_PER_MONTH;
}
const GROWTH_RANK = { beginner: 0, intermediate: 1, advanced: 2 };
/** The onboarding rule with the training age in place of the answer, never below the floor. */
export function grownAthleteLevel(input) {
    const experience = monthsToExperience(trainingAgeMonths(input.experienceMonths, input.trainingWeeks));
    const derived = deriveAthleteLevel(experience, String(input.weeklyHours), input.raceType).athleteLevel;
    return input.floor && GROWTH_RANK[input.floor] > GROWTH_RANK[derived] ? input.floor : derived;
}
/** Training weeks until the training age reaches the months of the level
 *  above, or null when the months are not what is missing. */
export function trainingWeeksToNext(level, experienceMonths, trainingWeeks) {
    const target = level === 'beginner' ? 6 : level === 'intermediate' ? 24 : null;
    const months = trainingAgeMonths(experienceMonths, trainingWeeks);
    if (target == null || months >= target)
        return null;
    return Math.ceil((target - months) * WEEKS_PER_MONTH);
}
/** Hard sessions per week the slot builder gives this level (45+: at most 2). */
export function maxIntensitySessionsFor(athleteLevel, age) {
    const baseMax = athleteLevel === 'beginner' ? 1 : athleteLevel === 'advanced' ? 3 : 2;
    return (age != null && age >= 45) ? Math.min(baseMax, 2) : baseMax;
}
/** Whole years since `birthDate`, or null when it is unset or unparseable. The
 *  onboarding saves its birth year as YYYY-01-01. */
export function ageFromBirthDate(birthDate) {
    if (!birthDate)
        return null;
    const ms = new Date(birthDate).getTime();
    if (!Number.isFinite(ms))
        return null;
    return Math.floor((Date.now() - ms) / (365.25 * 24 * 60 * 60 * 1000));
}
/** Level default weekly volume jump (the athlete's own ramp limit goes first). */
export function levelMaxJump(athleteLevel) {
    return athleteLevel === 'beginner' ? 0.10
        : athleteLevel === 'advanced' ? 0.15
            : 0.12;
}
// ── App only ──
/** Months of training the onboarding answer stands for — what it saves as
 *  profiles.experience_months, and so what the planner reads. */
export const EXPERIENCE_TO_MONTHS = {
    0: 3, // < 6 months
    1: 12, // 6–24 months
    2: 36, // 2–5 years
    3: 72, // 5+ years
};
/** The onboarding answer a number of months falls into. */
export function monthsToExperience(months) {
    if (months < 6)
        return 0; // < 6 months
    if (months < 24)
        return 1; // 6–24 months
    if (months < 60)
        return 2; // 2–5 years
    return 3; // 5+ years
}
export const ATHLETE_LEVELS = ['beginner', 'intermediate', 'advanced'];
/** Narrow a stored level; anything unknown reads as intermediate, like the
 *  race predictor's default. */
export function toAthleteLevel(value) {
    return ATHLETE_LEVELS.includes(value) ? value : 'intermediate';
}
/** Order of the levels: beginner 0, intermediate 1, advanced 2. */
export function levelRank(level) {
    return ATHLETE_LEVELS.indexOf(level);
}
/** Periodization a level gets without a pick of its own: beginners linear,
 *  everyone else block from their distance's block volume on — the rule
 *  deriveAthleteLevel applies to the level it derives. */
export function defaultPeriodizationFor(level, weeklyHours, raceType) {
    if (level === 'beginner')
        return 'linear';
    const minBlockVolume = raceType ? MIN_BLOCK_VOLUME[raceType] ?? 5 : 5;
    return (parseFloat(weeklyHours) || 0) >= minBlockVolume ? 'block' : 'linear';
}
/**
 * The onboarding store's level fields for new answers. `computedLevel` follows
 * the answers, or with `growth` the training age and never below the stored
 * level; `athleteLevel` (the one that applies and is saved) stays the athlete's
 * own choice when there is one, and the periodization follows whichever level
 * applies.
 */
export function onboardingLevel(experience, weeklyHours, raceType, chosen, growth = null) {
    const computedLevel = growth
        ? grownAthleteLevel({
            experienceMonths: EXPERIENCE_TO_MONTHS[experience],
            trainingWeeks: growth.trainingWeeks,
            weeklyHours: growth.weeklyHours ?? (parseFloat(weeklyHours) || 0),
            raceType,
            floor: growth.floor,
        })
        : deriveAthleteLevel(experience, weeklyHours, raceType).athleteLevel;
    const athleteLevel = chosen ?? computedLevel;
    return { computedLevel, athleteLevel, periodizationMode: defaultPeriodizationFor(athleteLevel, weeklyHours, raceType) };
}
/** What the level card reads off the training age: the experience its next
 *  level is named from, and the training weeks until the months of that level. */
export function levelProgress(level, experienceMonths, trainingWeeks) {
    return {
        experience: monthsToExperience(trainingAgeMonths(experienceMonths, trainingWeeks)),
        weeksToNext: trainingWeeksToNext(level, experienceMonths, trainingWeeks),
    };
}
/** The store patch for a tap on the level card. Tapping the recommended level
 *  drops the choice and goes back to the computed one. */
export function levelChoice(state, level, recommended) {
    const levelChosen = level !== recommended;
    const athleteLevel = levelChosen ? level : state.computedLevel;
    return {
        athleteLevel,
        levelChosen,
        periodizationMode: defaultPeriodizationFor(athleteLevel, state.weeklyHours, state.raceType),
    };
}
