/** YYYY-MM-DD for a Date in local time (avoids UTC off-by-one of toISOString). */
export function dateToLocalStr(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}
/** YYYY-MM-DD for today in local time. */
export function todayLocalStr() {
    return dateToLocalStr(new Date());
}
/**
 * Display a Date as dd.mm.yyyy (always two-digit day/month). Use for any user-
 * facing date that should be unambiguous and aligned. `Date.toLocaleDateString()`
 * with German locale returns `d.m.yyyy` (no padding), which looks ragged.
 */
export function formatDateDisplay(date) {
    if (!date)
        return '';
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
}
/**
 * The Mon–Sun span of a training week as `04.08. – 10.08.`
 *
 * Numeric on purpose: identical in German and English, so the one place that
 * has to say WHICH week it means needs no i18n string and can't drift between
 * the two. Year is dropped — the card that shows this is always about a week
 * within a fortnight of today (`canPlanWeek` in app/(tabs)/dashboard.tsx).
 */
export function formatWeekRange(weekStart) {
    const monday = new Date(weekStart + 'T00:00:00');
    if (Number.isNaN(monday.getTime()))
        return '';
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    const dm = (d) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
    return `${dm(monday)} – ${dm(sunday)}`;
}
/** Format seconds to M:SS pace string (e.g. 270 → "4:30") */
export function formatPace(seconds) {
    if (!seconds)
        return '--';
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${Math.round(sec).toString().padStart(2, '0')}`;
}
/** Parse M:SS pace string to seconds (e.g. "4:30" → 270). Returns null for invalid input. */
export function paceToSeconds(pace) {
    if (!pace)
        return null;
    const parts = pace.split(':');
    if (parts.length < 2)
        return null;
    return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
}
/** Parse HH:MM duration string to total seconds. Returns null for invalid input. */
export function durationToSeconds(duration) {
    if (!duration)
        return null;
    const parts = duration.split(':');
    if (parts.length < 2)
        return null;
    return (parseInt(parts[0], 10) || 0) * 3600 + (parseInt(parts[1], 10) || 0) * 60;
}
/** Format distance in meters to km string (e.g. 10000 → "10.0") */
export function formatDistance(meters) {
    if (!meters)
        return '--';
    return (meters / 1000).toFixed(1);
}
/** Parse H:MM or HH:MM:SS time string to decimal hours (e.g. "10:30" → 10.5) */
export function parseTimeToHours(time) {
    if (!time)
        return null;
    const parts = time.split(':');
    if (parts.length < 2)
        return null;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parts[2] ? parseInt(parts[2], 10) : 0;
    return h + m / 60 + s / 3600;
}
// Frontend mirror of the engine's getRaceCategory (_shared/race-category.ts):
// multisport = sprint/olympic/half/full triathlon; run-only = 5k/10k/half/full
// marathon. Keep these two sets in sync with the enum + the engine helper.
const TRIATHLON_RACE_TYPES = new Set([
    'sprint_tri', 'olympic_tri', 'half_ironman', 'ironman',
]);
/** Check if a race type is a triathlon event (swim + bike + run). */
export function isTriathlon(raceType) {
    return raceType != null && TRIATHLON_RACE_TYPES.has(raceType);
}
/** Check if a race type is a running-only event. */
export function isRunning(raceType) {
    return raceType != null && !TRIATHLON_RACE_TYPES.has(raceType);
}
/** Validate a DD.MM.YYYY race date: must be a real, future-or-today date with year >= 2024. */
export function isValidRaceDate(dateStr) {
    if (dateStr.length !== 10)
        return false;
    const parts = dateStr.split('.');
    if (parts.length !== 3)
        return false;
    const [d, m, y] = parts.map(Number);
    if (!d || !m || !y || d < 1 || d > 31 || m < 1 || m > 12 || y < 2024)
        return false;
    const parsed = new Date(y, m - 1, d);
    if (parsed.getDate() !== d || parsed.getMonth() !== m - 1)
        return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return parsed >= today;
}
/**
 * Whole days from today (local midnight) to a TT.MM.JJJJ date.
 * Returns null when the input is not a valid future race date.
 */
export function daysUntilDate(dateStr) {
    if (!isValidRaceDate(dateStr))
        return null;
    const [d, m, y] = dateStr.split('.').map(Number);
    const target = new Date(y, m - 1, d);
    target.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / 86400000);
}
/** Auto-format a numeric string as TT.MM.JJJJ */
export function formatDateInput(raw) {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    let result = '';
    for (let i = 0; i < digits.length; i++) {
        if (i === 2 || i === 4)
            result += '.';
        result += digits[i];
    }
    return result;
}
/** Auto-format a numeric string as HH:MM:SS */
export function formatTimeInput(raw) {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    let result = '';
    for (let i = 0; i < digits.length; i++) {
        if (i === 2 || i === 4)
            result += ':';
        result += digits[i];
    }
    return result;
}
/** Auto-format a numeric string as HH:MM */
export function formatTimeHHMM(raw) {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    let result = '';
    for (let i = 0; i < digits.length; i++) {
        if (i === 2)
            result += ':';
        result += digits[i];
    }
    return result;
}
/** Auto-format a numeric string as H:MM (e.g. 3:45 for marathon) */
export function formatTimeHMM(raw) {
    const digits = raw.replace(/\D/g, '').slice(0, 3);
    let result = '';
    for (let i = 0; i < digits.length; i++) {
        if (i === 1)
            result += ':';
        result += digits[i];
    }
    return result;
}
export function raceTimeFormat(raceType) {
    if (raceType === '5k' || raceType === '10k')
        return 'mmss';
    if (raceType === 'ironman')
        return 'hhmm';
    return 'hmm';
}
/** Placeholder / unit hint for the race target-time field. */
export function raceTimeLabel(raceType) {
    const fmt = raceTimeFormat(raceType);
    return fmt === 'mmss' ? 'MM:SS' : fmt === 'hhmm' ? 'HH:MM' : 'H:MM';
}
/** maxLength for the race target-time field ("99:59" / "10:30" → 5, "3:45" → 4). */
export function raceTimeMaxLength(raceType) {
    return raceTimeFormat(raceType) === 'hmm' ? 4 : 5;
}
/** Auto-format a numeric string as MM:SS (seconds = last two digits). */
export function formatTimeMMSS(raw) {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    if (digits.length <= 2)
        return digits;
    return digits.slice(0, digits.length - 2) + ':' + digits.slice(-2);
}
/** Format raw numeric input for the race target-time field, per distance. */
export function formatRaceTimeInput(raw, raceType) {
    const fmt = raceTimeFormat(raceType);
    if (fmt === 'mmss')
        return formatTimeMMSS(raw);
    if (fmt === 'hhmm')
        return formatTimeHHMM(raw);
    return formatTimeHMM(raw);
}
/** Parse a user-facing race-time string to decimal hours (MM:SS for 5k/10k). */
export function parseRaceTimeToHours(time, raceType) {
    if (!time)
        return null;
    if (raceTimeFormat(raceType) === 'mmss') {
        const parts = time.split(':');
        const mm = parseInt(parts[0], 10);
        if (isNaN(mm))
            return null;
        const ss = parts[1] ? parseInt(parts[1], 10) : 0;
        return (mm * 60 + (isNaN(ss) ? 0 : ss)) / 3600;
    }
    return parseTimeToHours(time);
}
/**
 * Split decimal hours into whole hours and minutes, truncating the minute.
 *
 * Rounding hours and minutes independently is what printed "2:60" in a friend's
 * weekly report: floor(2.9995) = 2 paired with round(59.97) = 60. Deriving both
 * from one truncated minute count makes that unrepresentable.
 *
 * The epsilon only absorbs float noise from the hours↔clock round-trip
 * (140/60*60 = 140.00000000000003, and the same drift downward). It is far too
 * small to lift a real minute, so 2:05:59 stays 2:05 — a prognosis is never
 * displayed faster than it is.
 *
 * Use this for every h:mm rendering of decimal hours. Storage keeps its own
 * second-accurate, rounded path in `formatHoursToCanonical` (round-trip safety).
 */
export function splitHoursToHM(hours) {
    const totalMin = Math.floor(hours * 60 + 1e-9);
    return { h: Math.floor(totalMin / 60), m: totalMin % 60 };
}
/** Decimal hours as "h:mm", minute truncated. See `splitHoursToHM`. */
export function formatHoursToHM(hours) {
    const { h, m } = splitHoursToHM(hours);
    return h + ':' + String(m).padStart(2, '0');
}
/** Format decimal hours as the user-facing race-time string (MM:SS for 5k/10k). */
export function formatHoursToRaceTime(hours, raceType) {
    if (hours == null)
        return null;
    if (raceTimeFormat(raceType) === 'mmss') {
        const totalSec = Math.round(hours * 3600);
        return Math.floor(totalSec / 60) + ':' + String(totalSec % 60).padStart(2, '0');
    }
    return formatHoursToHM(hours);
}
/**
 * Canonical storage string for store / DB: short races keep seconds as
 * H:MM:SS, everything else stays H:MM. Existing H:MM(:SS) parsers handle both.
 */
export function formatHoursToCanonical(hours, raceType) {
    if (hours == null)
        return '';
    const totalSec = Math.round(hours * 3600);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const hm = h + ':' + String(m).padStart(2, '0');
    return raceTimeFormat(raceType) === 'mmss' ? hm + ':' + String(s).padStart(2, '0') : hm;
}
/** Convert a user-facing field string (MM:SS for 5k/10k) to canonical storage. */
export function raceTimeToCanonical(display, raceType) {
    if (!display)
        return display;
    if (raceTimeFormat(raceType) !== 'mmss')
        return display;
    return formatHoursToCanonical(parseRaceTimeToHours(display, raceType), raceType);
}
/** Convert a canonical storage string to the user-facing field string. */
export function raceTimeToDisplay(canonical, raceType) {
    if (!canonical)
        return '';
    if (raceTimeFormat(raceType) !== 'mmss')
        return canonical;
    return formatHoursToRaceTime(parseTimeToHours(canonical), raceType) ?? '';
}
/** Auto-format a numeric string as M:SS (pace, e.g. 4:30) */
export function formatPaceInput(raw) {
    const digits = raw.replace(/\D/g, '').slice(0, 3);
    let result = '';
    for (let i = 0; i < digits.length; i++) {
        if (i === 1)
            result += ':';
        result += digits[i];
    }
    return result;
}
/** Auto-format a numeric string as MM:SS (short duration, e.g. 25:30) */
export function formatDurationMMSS(raw) {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    let result = '';
    for (let i = 0; i < digits.length; i++) {
        if (i === 2)
            result += ':';
        result += digits[i];
    }
    return result;
}
