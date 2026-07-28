/**
 * Race-volume thresholds — single source of truth for the frontend.
 *
 * Used by:
 *   - lib/realismCheck.ts (forecast suggestions)
 *   - components/onboarding/AvailabilitySlider.tsx (slider range + hints)
 *
 * Edge functions (Deno) cannot import from this module — they keep text-synced
 * copies in supabase/functions/_shared/update-baseline.ts (RACE_PARAMS) and
 * supabase/functions/_shared/plan-builder-v2.ts (MIN_HOURS, MAX_HOURS).
 * __tests__/lib/race-constants-sync.test.ts asserts byte-identical RACE_PARAMS.
 */
export const RACE_PARAMS = {
    '5k': { hMin: 2, hNorm: 3, hCap: 5, raceRateMult: 1.10 },
    '10k': { hMin: 2, hNorm: 4, hCap: 6, raceRateMult: 1.05 },
    half_marathon: { hMin: 3, hNorm: 5, hCap: 7, raceRateMult: 1.00 },
    marathon: { hMin: 3, hNorm: 6, hCap: 9, raceRateMult: 0.90 },
    sprint_tri: { hMin: 2, hNorm: 4, hCap: 7, raceRateMult: 1.00 },
    olympic_tri: { hMin: 3, hNorm: 6, hCap: 9, raceRateMult: 0.95 },
    half_ironman: { hMin: 4, hNorm: 8, hCap: 12, raceRateMult: 0.85 },
    ironman: { hMin: 8, hNorm: 12, hCap: 18, raceRateMult: 0.75 },
};
/**
 * Slider / plan-engine ceiling per race type. Mirrors MAX_HOURS in
 * supabase/functions/_shared/plan-builder-v2.ts.
 */
export const HOURS_MAX = {
    '5k': 6,
    '10k': 7,
    half_marathon: 10,
    marathon: 12,
    sprint_tri: 8,
    olympic_tri: 12,
    half_ironman: 16,
    ironman: 20,
};
/**
 * Slider / plan-engine floor per race type. Mirrors MIN_HOURS in
 * supabase/functions/_shared/plan-builder-v2.ts. Distinct from RACE_PARAMS.hMin
 * (which is the "improvement becomes possible" threshold).
 */
export const HOURS_FLOOR = {
    '5k': 2,
    '10k': 2,
    half_marathon: 3,
    marathon: 3,
    sprint_tri: 2,
    olympic_tri: 3,
    half_ironman: 4,
    ironman: 5,
};
// Client mirror of the engine FOCUS_WINDOW_WEEKS (_shared/current-state.ts) —
// the race-nearest specificity window. A general-phase plateau only exists in
// the weeks before it, so this sizes the plateau preview + the picker gate.
export const FOCUS_WINDOW_WEEKS = {
    '5k': 6,
    '10k': 6,
    half_marathon: 10,
    marathon: 14,
    sprint_tri: 6,
    olympic_tri: 8,
    half_ironman: 12,
    ironman: 20,
};
// Client mirror of the engine GENERAL_PHASE_CEILING_FRACTION
// (_shared/ramp-feasibility.ts). Short-course multisport plateaus higher (0.8);
// everything else defaults to 0.6. MUST stay in sync with the engine table.
export const GENERAL_PHASE_CEILING_FRACTION = {
    olympic_tri: 0.8,
    sprint_tri: 0.8,
};
/**
 * Client mirror of the engine's §5 plateau-ceiling formula
 * (computeRampFeasibility in _shared/ramp-feasibility.ts). Keeping the picker on
 * the SAME rule as the engine is the whole point — otherwise the preview draws a
 * plateau the plan never builds.
 *
 *   - explicit override (> 0): the chosen value, capped at the goal. NOT floored
 *     at current — a user can deliberately set a base below current (the engine
 *     honors it and ramps the plan down to it).
 *   - auto (override null): max(current, fraction × goal), capped at goal. Never
 *     below current ("no artificial brake") — so when current ≥ fraction × goal
 *     the plateau sits at current and the plan holds, it does not drop.
 *
 * Floored at the race MIN_HOURS and rounded to 0.1h, exactly like the engine.
 */
export function resolvePlateauCeiling(currentHours, goalHours, raceType, overrideHours) {
    const minHours = HOURS_FLOOR[raceType] ?? 2;
    const fraction = GENERAL_PHASE_CEILING_FRACTION[raceType] ?? 0.6;
    const safeCurrent = Math.max(currentHours, 0.5);
    const raw = (overrideHours != null && overrideHours > 0)
        ? Math.min(goalHours, overrideHours)
        : Math.min(goalHours, Math.max(safeCurrent, goalHours * fraction));
    return Math.round(Math.max(raw, minHours) * 10) / 10;
}
// Length (weeks) of the general/base phase that precedes the focus window — the
// span over which the base plateau is held. Mirrors the VolumeSchematic curve:
// total − focus window − taper. Conservative vs the engine (which folds taper
// into the focus window), so the surfaced number is a safe lower bound and
// always matches the drawn plateau. Shared by PlateauPicker (label) and the
// schematic so the two never disagree.
export function generalPhaseWeeks(raceType, weeksToRace) {
    const taperW = Math.min(3, Math.max(1, Math.round(weeksToRace * 0.08)));
    const focusW = FOCUS_WINDOW_WEEKS[raceType] ?? 14;
    return weeksToRace - focusW - taperW;
}
