// The suggestion to train more hours when the weekly volume sits under the
// race's norm (RACE_PARAMS.hNorm): up to the norm, at most three hours more.
//
// realismCheck offers it for an ambitious goal that no other hours suggestion
// covers, and without a goal, where the forecast card turns it into its line
// "At 8 h per week: 5:20 on race day" (components/forecast/RaceDayForecastCard.tsx).
/** At most this many hours more than the athlete plans. */
const MAX_MORE_HOURS = 3;
/** A suggestion that gains less than a minute is not one (also realismCheck's other hours lines). */
export const MIN_GAIN_HOURS = 1 / 60;
export function moreHoursSuggestion(input) {
    const { weeklyHours: h, probable, formatTime, tx } = input;
    if (!(h < input.hNorm))
        return null;
    // Down to the half hour, or 4.3 h + 3 would round up to 7.5 h.
    const suggested = Math.floor(Math.min(input.hNorm, h + MAX_MORE_HOURS) * 2) / 2;
    if (!(suggested > h + 0.5))
        return null;
    const at = input.projectAt(suggested);
    if (!(probable - at >= MIN_GAIN_HOURS))
        return null;
    return {
        type: 'increase_volume',
        label_de: tx('Trainingsumfang erhöhen', 'Increase training volume'),
        current_hours: h,
        suggested_hours: suggested,
        projected_probable_at_suggested: at,
        projected_probable_formatted_at_suggested: formatTime(at),
        improvement_vs_current_pct: Math.round(((probable - at) / probable) * 10000) / 100,
        message_de: tx('Mit ' + suggested + 'h/Woche statt ' + h + 'h verbessert sich deine Prognose auf ' + formatTime(at) + '.', 'With ' + suggested + 'h/week instead of ' + h + 'h, your projection improves to ' + formatTime(at) + '.'),
    };
}
