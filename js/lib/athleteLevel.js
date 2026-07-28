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
