// The verdict on a goal time: the sentence under the goal on the onboarding
// forecast screen and on the website calculator (race-time.js).
//
// One fixed sentence per case, where there used to be a random pick of four or
// five that changed with every recalculation. The goal and the forecast stand
// right above it, so it names neither; only a volume under the race's minimum
// names the hours, because that is the lever (texts approved 29.09.2026).
//
// The cases are the goal's place against the band the screen shows
// (lib/goalAssessment.ts): inside it slower or faster than the forecast
// (comfortable, stretch), faster than its best case (high_effort, then
// unrealistic), or well slower than its worst (too_easy).
const TEXTS = {
    de: {
        tooEasy: 'Das schaffst du mit Reserve. Trau dir mehr zu.',
        comfortable: 'Passt zu deinem Stand. Bleib dran, dann klappt das.',
        stretch: 'Liegt in deiner Spanne, braucht aber einen guten Tag.',
        faster: 'Schneller als deine Spanne. Mit mehr Umfang rückt es näher.',
        fasterNoHours: 'Schneller als deine Spanne. Mehr Stunden schließen die Lücke nicht.',
        farFaster: 'Weit schneller als deine Spanne. Auch mehr Stunden schließen die Lücke nicht.',
        farFasterHours: 'Weit schneller als deine Spanne. Mit mehr Umfang rückt es näher.',
        volume: 'Mit {h} h pro Woche hältst du dein Level. Schneller wirst du ab {min} h.',
    },
    en: {
        tooEasy: "You'll make this with room to spare. Aim higher.",
        comfortable: "Fits where you are. Stay consistent and you'll get there.",
        stretch: 'Within your range, but it needs a good day.',
        faster: 'Faster than your range. More volume brings it closer.',
        fasterNoHours: "Faster than your range. More hours won't close the gap.",
        farFaster: "Well beyond your range. More hours won't close the gap.",
        farFasterHours: 'Well beyond your range. More volume brings it closer.',
        volume: 'At {h} h per week you hold your level. From {min} h you get faster.',
    },
};
/** Weekly hours as the language writes them: "5,5" in German, "5.5" in English. */
export function hoursNumber(hours, lang) {
    const text = String(Math.round(hours * 100) / 100);
    return lang === 'en' ? text : text.replace('.', ',');
}
export function goalVerdict(input) {
    const lang = input.lang === 'en' ? 'en' : 'de';
    const t = TEXTS[lang];
    const ambitious = input.scaleLabel === 'stretch' || input.scaleLabel === 'high_effort' || input.scaleLabel === 'unrealistic';
    if (input.volumeStatus === 'insufficient' && ambitious) {
        return t.volume
            .replace('{h}', hoursNumber(input.weeklyHours, lang))
            .replace('{min}', hoursNumber(input.minHours, lang));
    }
    switch (input.scaleLabel) {
        case 'too_easy': return t.tooEasy;
        case 'comfortable': return t.comfortable;
        case 'stretch': return t.stretch;
        case 'high_effort': return input.hoursHelpful ? t.faster : t.fasterNoHours;
        // unrealistic: more hours that do close half the gap still bring it closer,
        // and the goal stays "well beyond" under the red label (Dominik 29.09.2026).
        default: return input.hoursHelpful ? t.farFasterHours : t.farFaster;
    }
}
