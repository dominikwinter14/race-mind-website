/* ══════════════════════════════════════════════════════════
   RaceMind – Zielzeit-Prognose / Race time projection
   Runs entirely in the browser: the modules under js/lib are compiled
   straight from the app sources (scripts/build-website-lib.mjs), so the page
   and the app compute the same numbers from the same code.
   ══════════════════════════════════════════════════════════ */

import { calculateOnboardingPrognosis } from './lib/realismCheck.js';
import { deriveAthleteLevel } from './lib/athleteLevel.js';
import { RACE_PARAMS } from './constants/raceVolume.js';

(function () {
  'use strict';

  var LANG = document.documentElement.lang === 'en' ? 'en' : 'de';
  var IS_EN = LANG === 'en';

  // ── Bucket keys ──
  // These strings are LOOKUP KEYS in deriveRunThreshold/deriveBikeFTP/
  // deriveSwimCSS (lib/realismCheck.ts) — an unknown key silently yields null,
  // so they are defined once here and never re-typed in the HTML.
  var RUN_BUCKETS = ['< 18 min', '18-22 min', '22-27 min', '27-33 min', '> 33 min'];
  var BIKE_BUCKETS = ['< 23 km/h', '23-27 km/h', '27-31 km/h', '31-35 km/h', '> 35 km/h'];
  var SWIM_BUCKETS = ['< 1:30 min', '1:30 - 2:00', '2:00 - 2:30', '> 2:30 min'];

  var DISTANCES = ['5k', '10k', 'half_marathon', 'marathon', 'sprint_tri', 'olympic_tri', 'half_ironman', 'ironman'];
  var RUN_ONLY = { '5k': 1, '10k': 1, half_marathon: 1, marathon: 1 };

  var T = {
    de: {
      dist: {
        '5k': '5 km', '10k': '10 km', half_marathon: 'Halbmarathon', marathon: 'Marathon',
        sprint_tri: 'Sprint', olympic_tri: 'Olympisch', half_ironman: 'Mitteldistanz', ironman: 'Langdistanz',
      },
      distHint: {
        '5k': 'Lauf', '10k': 'Lauf', half_marathon: '21,1 km', marathon: '42,2 km',
        sprint_tri: '0,75 / 20 / 5 km', olympic_tri: '1,5 / 40 / 10 km',
        half_ironman: '1,9 / 90 / 21,1 km', ironman: '3,8 / 180 / 42,2 km',
      },
      disc: { swim: 'Schwimmen', bike: 'Radfahren', run: 'Laufen' },
      modes: { bucket: 'Bereich', custom: 'Distanz & Zeit', exact: 'Schwellenwert' },
      bucketLabel: {
        swim: 'Dein Tempo auf 100 m', bike: 'Dein Schnitt auf lockerer Ausfahrt', run: 'Deine 5-km-Zeit',
      },
      pick: 'Bitte wählen',
      fieldDistKm: 'Distanz (km)', fieldDistM: 'Distanz (m)', fieldTime: 'Zeit',
      fieldThresholdRun: 'Schwellenpace (min/km)', fieldFtp: 'Schwellenleistung (Watt)',
      fieldCss: 'Kritische Geschwindigkeit (min/100 m)', fieldWeight: 'Gewicht (kg, optional)',
      phTime: 'z. B. 22:30', phTimeLong: 'z. B. 1:12:00', phPace: 'z. B. 4:15', phCss: 'z. B. 1:45',
      resultTodayLabel: 'Wo du heute stehst', resultRaceLabel: 'Am Renntag realistisch',
      range: 'Bandbreite', splits: 'Splits', transitions: 'Wechsel',
      derived: 'Deine abgeleiteten Werte', conf: { high: 'hohe Sicherheit', medium: 'mittlere Sicherheit', low: 'grobe Schätzung' },
      thresholdPace: 'Schwellenpace', ftp: 'Schwellenleistung', css: 'Kritische Geschwindigkeit',
      improvement: 'davon Entwicklung bis zum Renntag',
      weeksToRace: 'Wochen bis zum Rennen', raceThisWeek: 'Rennen steht diese Woche an',
      placeholder: 'Wähle deine Distanz und trage ein, wo du stehst.',
      needMore: 'Trage noch die fehlenden Disziplinen ein.',
      assumeLevel: 'Gerechnet mit mittlerem Trainingsstand und neutraler Strecke. Schritt 2 ersetzt beide Annahmen.',
      assumeLevelOnly: 'Gerechnet mit mittlerem Trainingsstand. Schritt 2 ersetzt diese Annahme.',
      assumeCourseOnly: 'Gerechnet mit neutraler Strecke. Wähle in Schritt 2 dein Rennen.',
      raceCourse: 'Kursfaktor',
      raceOther: 'Anderes Rennen', raceNoMatch: 'Kein Treffer für „%q“',
      raceHintDefault: 'Übernimmt Datum und Kursfaktor aus unserem Rennkalender.',
      raceHintOther: 'Dein Rennen kennen wir nicht – wir rechnen mit einer neutralen Strecke. Trag das Renndatum bitte selbst ein.',
      raceHintPicked: 'Datum und Kursfaktor kommen aus unserem Rennkalender.',
      shareErr: 'Bild konnte nicht erstellt werden',
      shareOk: 'Bild gespeichert – teilbar auf Instagram & Co.',
      copyOk: 'Link kopiert',
      exp: ['< 6 Monate', '< 2 Jahre', '2–5 Jahre', '5+ Jahre'],
      shareLabel: 'RACEMIND ZIELZEIT-PROGNOSE',
      shareFooter: 'race-mind.com/race-time',
      shareToday: 'WO ICH HEUTE STEHE', shareRace: 'MEINE ZIELZEIT',
      volumeWarn: 'Unter %h h/Woche rechnen wir mit keiner Verbesserung bis zum Renntag.',
    },
    en: {
      dist: {
        '5k': '5 km', '10k': '10 km', half_marathon: 'Half marathon', marathon: 'Marathon',
        sprint_tri: 'Sprint', olympic_tri: 'Olympic', half_ironman: 'Middle distance', ironman: 'Long distance',
      },
      distHint: {
        '5k': 'Run', '10k': 'Run', half_marathon: '21.1 km', marathon: '42.2 km',
        sprint_tri: '0.75 / 20 / 5 km', olympic_tri: '1.5 / 40 / 10 km',
        half_ironman: '1.9 / 90 / 21.1 km', ironman: '3.8 / 180 / 42.2 km',
      },
      disc: { swim: 'Swim', bike: 'Bike', run: 'Run' },
      modes: { bucket: 'Range', custom: 'Distance & time', exact: 'Threshold' },
      bucketLabel: {
        swim: 'Your pace per 100 m', bike: 'Your average on an easy ride', run: 'Your 5 km time',
      },
      pick: 'Please choose',
      fieldDistKm: 'Distance (km)', fieldDistM: 'Distance (m)', fieldTime: 'Time',
      fieldThresholdRun: 'Threshold pace (min/km)', fieldFtp: 'Threshold power (watts)',
      fieldCss: 'Critical swim speed (min/100 m)', fieldWeight: 'Weight (kg, optional)',
      phTime: 'e.g. 22:30', phTimeLong: 'e.g. 1:12:00', phPace: 'e.g. 4:15', phCss: 'e.g. 1:45',
      resultTodayLabel: 'Where you stand today', resultRaceLabel: 'Realistic on race day',
      range: 'Range', splits: 'Splits', transitions: 'Transitions',
      derived: 'Your derived values', conf: { high: 'high confidence', medium: 'medium confidence', low: 'rough estimate' },
      thresholdPace: 'Threshold pace', ftp: 'Threshold power', css: 'Critical swim speed',
      improvement: 'of which progress until race day',
      weeksToRace: 'weeks to race', raceThisWeek: 'race is this week',
      placeholder: 'Pick your distance and tell us where you stand.',
      needMore: 'Add the missing disciplines.',
      assumeLevel: 'Calculated with a mid-level athlete and a neutral course. Step 2 replaces both assumptions.',
      assumeLevelOnly: 'Calculated with a mid-level athlete. Step 2 replaces that assumption.',
      assumeCourseOnly: 'Calculated with a neutral course. Pick your race in step 2.',
      raceCourse: 'Course factor',
      raceOther: 'Another race', raceNoMatch: 'No match for “%q”',
      raceHintDefault: 'Takes the date and course factor from our race calendar.',
      raceHintOther: 'We don’t know your race – we calculate with a neutral course. Please enter the race date yourself.',
      raceHintPicked: 'Date and course factor come from our race calendar.',
      shareErr: 'Could not create the image',
      shareOk: 'Image saved – ready for Instagram & co.',
      copyOk: 'Link copied',
      exp: ['< 6 months', '< 2 years', '2–5 years', '5+ years'],
      shareLabel: 'RACEMIND RACE TIME PROJECTION',
      shareFooter: 'race-mind.com/race-time',
      shareToday: 'WHERE I STAND TODAY', shareRace: 'MY TARGET TIME',
      volumeWarn: 'Below %h h/week we project no improvement until race day.',
    },
  }[LANG];

  var $ = function (id) { return document.getElementById(id); };

  // ── State ──
  var state = {
    raceType: null,
    swim: { mode: 'bucket', bucket: '', dist: '', time: '', exact: '' },
    bike: { mode: 'bucket', bucket: '', dist: '', time: '', exact: '', weight: '' },
    run: { mode: 'bucket', bucket: '', dist: '', time: '', exact: '' },
    raceSlug: '', date: '', goal: '', hoursNow: '', hoursPlan: '', exp: '',
  };
  var RACES = [];
  var lastResult = null;

  // ── Parsing & formatting ──

  /** "22:30" → 1350, "1:12:00" → 4320, "45" → 2700. Null on anything else. */
  function parseDuration(raw) {
    if (!raw) return null;
    var parts = String(raw).trim().split(':');
    if (parts.some(function (p) { return p === '' || isNaN(Number(p)); })) return null;
    var n = parts.map(Number);
    var sec = n.length === 1 ? n[0] * 60
      : n.length === 2 ? n[0] * 60 + n[1]
      : n.length === 3 ? n[0] * 3600 + n[1] * 60 + n[2]
      : null;
    return sec && sec > 0 ? sec : null;
  }

  /** Goal time. 5k/10k are read as mm:ss, every longer race as h:mm(:ss). */
  function parseGoalHours(raw, raceType) {
    if (!raw) return null;
    var parts = String(raw).trim().split(':');
    if (parts.some(function (p) { return p === '' || isNaN(Number(p)); })) return null;
    var n = parts.map(Number);
    var sec;
    if (raceType === '5k' || raceType === '10k') {
      sec = n.length === 2 ? n[0] * 60 + n[1] : n.length === 3 ? n[0] * 3600 + n[1] * 60 + n[2] : n[0] * 60;
    } else {
      sec = n.length === 2 ? n[0] * 3600 + n[1] * 60
        : n.length === 3 ? n[0] * 3600 + n[1] * 60 + n[2]
        : n[0] * 3600;
    }
    return sec > 0 ? sec / 3600 : null;
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  /** Mirrors formatRaceClock() in lib/realismCheck.ts so page and app agree. */
  function fmtRaceTime(hours, raceType) {
    if (!hours) return '–';
    if (raceType === '5k' || raceType === '10k') {
      var s = Math.round(hours * 3600);
      return Math.floor(s / 60) + ':' + pad(s % 60);
    }
    var h = Math.floor(hours);
    var m = Math.round((hours - h) * 60);
    if (m === 60) { h += 1; m = 0; }
    return h + ':' + pad(m);
  }

  /** Split times always carry seconds — a 1:41 swim rounded to minutes hides too much. */
  function fmtSplit(hours) {
    if (!hours) return '–';
    var s = Math.round(hours * 3600);
    return Math.floor(s / 3600) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
  }

  function fmtPace(sec) {
    if (!sec) return '–';
    var s = Math.round(sec);
    return Math.floor(s / 60) + ':' + pad(s % 60);
  }

  function num(raw) {
    var v = parseFloat(String(raw).replace(',', '.'));
    return isNaN(v) ? null : v;
  }

  // ── Input → DisciplineInput ──
  // Mirrors buildRunData/buildBikeData/buildSwimData in lib/api.ts. Note the
  // swim distance is metres while run and bike are kilometres — same as the app.

  function buildInput(disc, s) {
    if (s.mode === 'bucket') return s.bucket ? { mode: 'bucket', bucket: s.bucket } : null;
    if (s.mode === 'custom') {
      var d = num(s.dist);
      var sec = parseDuration(s.time);
      if (!d || !sec) return null;
      return { mode: 'custom', distance_m: disc === 'swim' ? d : d * 1000, duration_sec: sec };
    }
    if (disc === 'run') {
      var p = parseDuration(s.exact);
      return p ? { mode: 'threshold', threshold_pace_sec_km: p } : null;
    }
    if (disc === 'bike') {
      var w = num(s.exact);
      return w ? { mode: 'ftp', ftp_watts: Math.round(w) } : null;
    }
    var css = parseDuration(s.exact);
    return css ? { mode: 'css', css_pace_100m: css } : null;
  }

  function neededDisciplines() {
    if (!state.raceType) return [];
    return RUN_ONLY[state.raceType] ? ['run'] : ['swim', 'bike', 'run'];
  }

  // ── Form rendering ──

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function renderDistances() {
    var wrap = $('rtDistances');
    wrap.innerHTML = '';
    DISTANCES.forEach(function (d) {
      var b = el('button', 'rt-chip');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(state.raceType === d));
      if (state.raceType === d) b.classList.add('is-active');
      b.appendChild(el('span', 'rt-chip-name', T.dist[d]));
      b.appendChild(el('span', 'rt-chip-hint', T.distHint[d]));
      b.addEventListener('click', function () {
        state.raceType = d;
        renderDistances();
        renderDisciplines();
        renderStep2();
        recalc();
      });
      wrap.appendChild(b);
    });
  }

  function field(labelText, node, hint) {
    var f = el('div', 'rt-field');
    var lab = el('label', null, labelText);
    lab.setAttribute('for', node.id);
    f.appendChild(lab);
    f.appendChild(node);
    if (hint) f.appendChild(el('p', 'rt-hint', hint));
    return f;
  }

  /**
   * kind 'decimal' → numbers with a decimal separator, kind 'clock' → mm:ss.
   * Both stay type="text": <input type="number"> reports an empty value for
   * "10,5" in a German locale, and no mobile inputmode offers a colon, so a
   * clock field must fall back to the normal keyboard.
   */
  function input(id, placeholder, value, onInput, kind) {
    var i = document.createElement('input');
    i.id = id;
    i.type = 'text';
    i.autocomplete = 'off';
    if (kind === 'decimal') i.inputMode = 'decimal';
    i.placeholder = placeholder || '';
    i.value = value || '';
    i.addEventListener('input', onInput);
    return i;
  }

  function select(id, options, value, onChange, emptyLabel) {
    var s = document.createElement('select');
    s.id = id;
    if (emptyLabel != null) {
      var o0 = document.createElement('option');
      o0.value = '';
      o0.textContent = emptyLabel;
      s.appendChild(o0);
    }
    options.forEach(function (opt) {
      var o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      s.appendChild(o);
    });
    s.value = value || '';
    s.addEventListener('change', onChange);
    return s;
  }

  function bucketLabel(disc, key) {
    var pretty = key.replace('-', ' – ').replace(/\s+/g, ' ');
    if (disc === 'swim') return pretty.replace(' min', '') + ' min/100 m';
    return pretty;
  }

  function renderDisciplineBlock(disc) {
    var s = state[disc];
    var block = el('div', 'rt-disc');
    var head = el('div', 'rt-disc-head');
    head.appendChild(el('h3', null, T.disc[disc]));

    var seg = el('div', 'rt-seg');
    ['bucket', 'custom', 'exact'].forEach(function (mode) {
      var b = el('button', 'rt-seg-btn' + (s.mode === mode ? ' is-active' : ''), T.modes[mode]);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(s.mode === mode));
      b.addEventListener('click', function () {
        s.mode = mode;
        renderDisciplines();
        recalc();
      });
      seg.appendChild(b);
    });
    head.appendChild(seg);
    block.appendChild(head);

    var body = el('div', 'rt-fields');

    if (s.mode === 'bucket') {
      var keys = disc === 'run' ? RUN_BUCKETS : disc === 'bike' ? BIKE_BUCKETS : SWIM_BUCKETS;
      var opts = keys.map(function (k) { return { value: k, label: bucketLabel(disc, k) }; });
      var sel = select('rt-' + disc + '-bucket', opts, s.bucket, function (e) {
        s.bucket = e.target.value;
        recalc();
      }, T.pick);
      var f = field(T.bucketLabel[disc], sel);
      f.classList.add('rt-field--full');
      body.appendChild(f);
    } else if (s.mode === 'custom') {
      var distInp = input('rt-' + disc + '-dist', disc === 'swim' ? '1500' : '10', s.dist, function (e) {
        s.dist = e.target.value;
        recalc();
      }, 'decimal');
      body.appendChild(field(disc === 'swim' ? T.fieldDistM : T.fieldDistKm, distInp));
      var timeInp = input('rt-' + disc + '-time', disc === 'bike' ? T.phTimeLong : T.phTime, s.time, function (e) {
        s.time = e.target.value;
        recalc();
      }, 'clock');
      body.appendChild(field(T.fieldTime, timeInp));
    } else {
      var label = disc === 'run' ? T.fieldThresholdRun : disc === 'bike' ? T.fieldFtp : T.fieldCss;
      var ph = disc === 'run' ? T.phPace : disc === 'bike' ? '250' : T.phCss;
      var exInp = input('rt-' + disc + '-exact', ph, s.exact, function (e) {
        s.exact = e.target.value;
        recalc();
      }, disc === 'bike' ? 'decimal' : 'clock');
      body.appendChild(field(label, exInp));
      if (disc === 'bike') {
        // Watts alone say nothing about how fast they move a rider — mass is the
        // other half of the power-velocity equation. Optional: 75 kg otherwise.
        var wInp = input('rt-bike-weight', '75', s.weight, function (e) {
          s.weight = e.target.value;
          recalc();
        }, 'decimal');
        body.appendChild(field(T.fieldWeight, wInp));
      }
    }

    block.appendChild(body);
    return block;
  }

  function renderDisciplines() {
    var wrap = $('rtDisciplines');
    wrap.innerHTML = '';
    if (!state.raceType) return;
    neededDisciplines().forEach(function (d) { wrap.appendChild(renderDisciplineBlock(d)); });
  }

  // ── Step 2 ──

  function renderStep2() {
    var step2 = $('rtStep2');
    if (!state.raceType) { step2.classList.remove('is-visible'); return; }
    step2.classList.add('is-visible');

    // The field stays available even when we know no race for this distance:
    // "Anderes Rennen" is exactly the case someone in that situation is in.
    var prevType = comboRaceType;
    comboRaceType = state.raceType;
    if (prevType && prevType !== state.raceType && state.raceSlug !== OTHER) {
      // Distance changed — a slug from the old distance no longer applies.
      // OTHER survives: it says nothing about the distance.
      setRace('');
    }
    renderComboInput();

    // The goal field is read as mm:ss for 5k/10k and as h:mm above that, so the
    // placeholder has to show which of the two the field expects.
    var GOAL_PH = {
      '5k': '22:30', '10k': '46:00', half_marathon: '1:45', marathon: '3:45',
      sprint_tri: '1:20', olympic_tri: '2:45', half_ironman: '5:30', ironman: '11:30',
    };
    $('rtGoal').placeholder = GOAL_PH[state.raceType] || '3:45';
  }

  // ── Race combobox ──
  //
  // Sentinel for "my race is not in your calendar". It never matches a slug, so
  // selectedRace() returns null for it and the projection runs on a neutral
  // course — same maths as an empty field, but the athlete has *said* so, and
  // the hint can tell them the date is now theirs to fill in.
  var OTHER = '__other__';

  var comboRaceType = null;   // distance the list was last built for
  var comboOpen = false;
  var comboItems = [];        // [{ slug, label, date }] currently rendered
  var comboIndex = -1;        // keyboard cursor into comboItems

  /** Diacritic- and case-insensitive so "vitoria" finds "Vitoria-Gasteiz". */
  function norm(s) {
    return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function raceLabel(r) { return IS_EN ? r.name_en : r.name; }

  function racesForType() {
    return RACES.filter(function (r) { return r.race_type === comboRaceType; });
  }

  /** Writes the slug into the state and keeps input, hint and date in step. */
  function setRace(slug, opts) {
    state.raceSlug = slug;
    var race = selectedRace();
    if (race && race.date && !(opts && opts.keepDate)) {
      state.date = race.date;
      $('rtDate').value = race.date;
    }
    renderComboInput();
  }

  function renderComboInput() {
    var input = $('rtRaceInput');
    var hint = $('rtRaceHint');
    var race = selectedRace();
    if (race) {
      input.value = raceLabel(race);
      hint.textContent = T.raceHintPicked;
    } else if (state.raceSlug === OTHER) {
      input.value = T.raceOther;
      hint.textContent = T.raceHintOther;
    } else {
      input.value = '';
      hint.textContent = T.raceHintDefault;
    }
  }

  function closeCombo() {
    comboOpen = false;
    comboIndex = -1;
    $('rtRaceList').hidden = true;
    $('rtCombo').classList.remove('is-open');
    $('rtRaceInput').setAttribute('aria-expanded', 'false');
    $('rtRaceInput').removeAttribute('aria-activedescendant');
  }

  /**
   * `query` empty means "show everything" — that is the state right after the
   * field is focused, and the one a mouse user gets from the chevron.
   */
  function openCombo(query) {
    var list = $('rtRaceList');
    var q = norm(String(query || '').trim());
    // A picked race leaves its own name in the input. Treating that as a filter
    // would narrow the list to the single entry already chosen, so a click on
    // the chevron could never reach the others.
    var picked = selectedRace();
    if (picked && q === norm(raceLabel(picked))) q = '';
    if (state.raceSlug === OTHER && q === norm(T.raceOther)) q = '';

    var hits = q
      ? racesForType().filter(function (r) {
          return norm(r.name).indexOf(q) !== -1 || norm(r.name_en).indexOf(q) !== -1;
        })
      : racesForType();

    comboItems = hits.map(function (r) {
      return { slug: r.slug, label: raceLabel(r), date: r.date };
    });
    comboItems.push({ slug: OTHER, label: T.raceOther, date: '' });

    list.innerHTML = '';
    if (!hits.length && q) {
      var empty = document.createElement('li');
      empty.className = 'rt-combo-empty';
      empty.textContent = T.raceNoMatch.replace('%q', String(query).trim());
      list.appendChild(empty);
    }
    comboItems.forEach(function (item, i) {
      if (item.slug === OTHER && hits.length) {
        var sep = document.createElement('li');
        sep.className = 'rt-combo-sep';
        sep.setAttribute('aria-hidden', 'true');
        list.appendChild(sep);
      }
      var li = document.createElement('li');
      li.className = 'rt-combo-opt';
      li.id = 'rtRaceOpt' + i;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', item.slug === state.raceSlug ? 'true' : 'false');
      li.textContent = item.label;
      if (item.date) {
        var d = document.createElement('span');
        d.className = 'rt-combo-opt-date';
        d.textContent = fmtDate(item.date);
        li.appendChild(d);
      }
      // mousedown, not click: the input's blur handler closes the list first.
      li.addEventListener('mousedown', function (ev) {
        ev.preventDefault();
        pickCombo(i);
      });
      list.appendChild(li);
    });

    comboOpen = true;
    comboIndex = -1;
    list.hidden = false;
    $('rtCombo').classList.add('is-open');
    $('rtRaceInput').setAttribute('aria-expanded', 'true');
  }

  function highlightCombo(i) {
    var list = $('rtRaceList');
    var opts = list.querySelectorAll('.rt-combo-opt');
    for (var k = 0; k < opts.length; k++) opts[k].classList.remove('is-active');
    if (i < 0 || i >= opts.length) {
      $('rtRaceInput').removeAttribute('aria-activedescendant');
      return;
    }
    opts[i].classList.add('is-active');
    opts[i].scrollIntoView({ block: 'nearest' });
    $('rtRaceInput').setAttribute('aria-activedescendant', opts[i].id);
  }

  function pickCombo(i) {
    var item = comboItems[i];
    if (!item) return;
    closeCombo();
    if (item.slug === OTHER) {
      // Switching to "another race" must not silently keep the date of the race
      // just abandoned — the hint asks for a date, so leaving one there
      // contradicts it. Only a date WE filled in is dropped: if it no longer
      // matches the outgoing race, the athlete typed it and it is theirs.
      var outgoing = selectedRace();
      if (outgoing && outgoing.date === state.date) {
        state.date = '';
        $('rtDate').value = '';
      }
      setRace(OTHER, { keepDate: true });
    } else {
      setRace(item.slug);
    }
    recalc();
  }

  function bindCombo() {
    var input = $('rtRaceInput');
    var list = $('rtRaceList');

    input.addEventListener('focus', function () { openCombo(''); });
    $('rtRaceToggle').addEventListener('mousedown', function (ev) {
      ev.preventDefault();
      if (comboOpen) { closeCombo(); return; }
      input.focus();
      openCombo('');
    });

    input.addEventListener('input', function (e) {
      // Typing over a selection means the athlete is looking for something
      // else — drop the old pick so a half-typed name cannot be mistaken for
      // a confirmed one.
      if (state.raceSlug) { state.raceSlug = ''; $('rtRaceHint').textContent = T.raceHintDefault; recalc(); }
      openCombo(e.target.value);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!comboOpen) { openCombo(input.value); return; }
        var next = comboIndex + (e.key === 'ArrowDown' ? 1 : -1);
        comboIndex = Math.max(0, Math.min(comboItems.length - 1, next));
        highlightCombo(comboIndex);
      } else if (e.key === 'Enter') {
        if (comboOpen) {
          e.preventDefault();
          // Enter without an arrow-key cursor takes the only sensible single
          // candidate, if there is exactly one.
          pickCombo(comboIndex >= 0 ? comboIndex : (comboItems.length === 2 ? 0 : -1));
        }
      } else if (e.key === 'Escape') {
        if (comboOpen) { e.preventDefault(); closeCombo(); }
      }
    });

    input.addEventListener('blur', function () {
      closeCombo();
      // Leaving text behind that matches nothing would look like a selection.
      renderComboInput();
    });

    document.addEventListener('click', function (e) {
      if (comboOpen && !$('rtCombo').contains(e.target)) closeCombo();
    });
    list.addEventListener('mousemove', function (e) {
      var opt = e.target.closest ? e.target.closest('.rt-combo-opt') : null;
      if (!opt) return;
      var opts = list.querySelectorAll('.rt-combo-opt');
      for (var k = 0; k < opts.length; k++) {
        if (opts[k] === opt) { comboIndex = k; highlightCombo(k); break; }
      }
    });
  }

  function fmtDate(iso) {
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(IS_EN ? 'en-GB' : 'de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  /**
   * The race type has to match: a shared link can carry ?d=marathon together
   * with an Ironman slug, and the slug alone would then apply Kona's course
   * factors to a marathon while the dropdown shows "no specific race".
   */
  function selectedRace() {
    if (!state.raceSlug || state.raceSlug === OTHER) return null;
    var hit = RACES.filter(function (r) { return r.slug === state.raceSlug; })[0];
    return hit && hit.race_type === state.raceType ? hit : null;
  }

  // ── Calculation ──

  /**
   * The note under step 1 names what is still assumed. It has to shrink as
   * step 2 fills up, otherwise it keeps claiming a mid-level athlete long after
   * the athlete answered that question.
   */
  function updateAssumeNote() {
    var hasLevel = state.exp !== '' && num(state.hoursPlan) != null;
    var hasCourse = !!selectedRace();
    var note = hasLevel && hasCourse ? ''
      : hasLevel ? T.assumeCourseOnly
      : hasCourse ? T.assumeLevelOnly
      : T.assumeLevel;
    var node = $('rtAssume');
    node.textContent = note;
    node.style.display = note ? '' : 'none';
  }

  function recalc() {
    updateAssumeNote();
    var result = $('rtResult');
    var placeholder = $('rtPlaceholder');
    if (!state.raceType) {
      placeholder.textContent = T.placeholder;
      placeholder.style.display = '';
      result.classList.remove('is-visible');
      lastResult = null;
      return;
    }

    var data = {};
    var missing = false;
    neededDisciplines().forEach(function (d) {
      var built = buildInput(d, state[d]);
      if (!built) missing = true;
      data[d] = built;
    });
    if (missing) {
      placeholder.textContent = T.needMore;
      placeholder.style.display = '';
      result.classList.remove('is-visible');
      lastResult = null;
      writeParams();
      return;
    }

    var race = selectedRace();
    var rp = RACE_PARAMS[state.raceType] || RACE_PARAMS.ironman;
    var hoursPlan = num(state.hoursPlan);
    var hoursNow = num(state.hoursNow);
    var hasStep2 = state.exp !== '' && hoursPlan != null;
    // Without step 2 the projection must not depend on volume at all: feed the
    // reference volume so no "too little training" branch fires on a page that
    // never asked the question.
    var weeklyGoal = hoursPlan != null ? hoursPlan : rp.hNorm;
    var weeklyNow = hoursNow != null ? hoursNow : weeklyGoal;
    var level = hasStep2
      ? deriveAthleteLevel(parseInt(state.exp, 10), String(hoursPlan), state.raceType).athleteLevel
      : 'intermediate';
    var date = race && race.date ? race.date : state.date;

    var forecast;
    try {
      forecast = calculateOnboardingPrognosis({
        onboardingData: data,
        raceType: state.raceType,
        athleteLevel: level,
        weeklyHoursGoal: weeklyGoal,
        goalTimeHours: parseGoalHours(state.goal, state.raceType),
        mainRaceDate: date || '',
        raceConfig: race ? {
          race_type: race.race_type,
          course_factor_swim: race.course_factor_swim,
          course_factor_bike: race.course_factor_bike,
          course_factor_run: race.course_factor_run,
        } : null,
        language: LANG,
        currentWeeklyHours: weeklyNow || weeklyGoal,
        weightKg: num(state.bike.weight) || undefined,
      });
    } catch (err) {
      forecast = null;
    }

    // A bucket key that no longer exists derives to null and the total collapses
    // to 0 — realismCheck then reports scale_label 'unknown'. Show the hint
    // rather than a result card full of dashes, and drop the stale share source.
    if (!forecast || !forecast.prognosis.adjusted_total_hours) {
      placeholder.textContent = T.needMore;
      placeholder.style.display = '';
      result.classList.remove('is-visible');
      lastResult = null;
      writeParams();
      return;
    }

    lastResult = { forecast: forecast, hasDate: !!date, level: level };
    placeholder.style.display = 'none';
    result.classList.add('is-visible');
    renderResult(lastResult);
    writeParams();
  }

  function renderResult(r) {
    var p = r.forecast.prognosis;
    var re = r.forecast.realism;
    var rt = state.raceType;

    $('rtBigLabel').textContent = r.hasDate ? T.resultRaceLabel : T.resultTodayLabel;
    $('rtBigTime').textContent = fmtRaceTime(re.projected_probable_hours, rt);
    $('rtRange').textContent = T.range + ' ' + fmtRaceTime(re.projected_best_hours, rt)
      + ' – ' + fmtRaceTime(re.projected_worst_hours, rt);

    // Splits
    var splits = $('rtSplits');
    splits.innerHTML = '';
    if (!RUN_ONLY[rt]) {
      [['swim', p.adjusted_swim_hours], ['bike', p.adjusted_bike_hours], ['run', p.adjusted_run_hours]]
        .forEach(function (pair) {
          var row = el('div', 'rt-split');
          row.appendChild(el('span', 'rt-split-name', T.disc[pair[0]]));
          row.appendChild(el('span', 'rt-split-val', fmtSplit(pair[1])));
          splits.appendChild(row);
        });
      var t1 = el('div', 'rt-split rt-split--muted');
      t1.appendChild(el('span', 'rt-split-name', T.transitions));
      var trans = (p.adjusted_total_hours || 0)
        - (p.adjusted_swim_hours || 0) - (p.adjusted_bike_hours || 0) - (p.adjusted_run_hours || 0);
      t1.appendChild(el('span', 'rt-split-val', fmtSplit(trans)));
      splits.appendChild(t1);
      splits.style.display = '';
    } else {
      splits.style.display = 'none';
    }

    // Derived values
    var derived = $('rtDerived');
    derived.innerHTML = '';
    var rows = [];
    if (p.derived_threshold_pace) {
      rows.push([T.thresholdPace, fmtPace(p.derived_threshold_pace) + ' min/km', p.confidence_run]);
    }
    if (p.derived_ftp && !RUN_ONLY[rt]) rows.push([T.ftp, Math.round(p.derived_ftp) + ' W', p.confidence_bike]);
    if (p.derived_css && !RUN_ONLY[rt]) {
      rows.push([T.css, fmtPace(p.derived_css) + ' min/100 m', p.confidence_swim]);
    }
    rows.forEach(function (row) {
      var d = el('div', 'rt-derived-row');
      d.appendChild(el('span', 'rt-derived-name', row[0]));
      d.appendChild(el('span', 'rt-derived-val', row[1]));
      if (row[2]) d.appendChild(el('span', 'rt-conf rt-conf--' + row[2], T.conf[row[2]]));
      derived.appendChild(d);
    });

    // Race-day context
    var meta = $('rtMeta');
    meta.innerHTML = '';
    if (r.hasDate) {
      if (re.weeks_to_race != null) {
        meta.appendChild(el('span', 'rt-meta-item', re.weeks_to_race < 1
          ? T.raceThisWeek
          : Math.round(re.weeks_to_race) + ' ' + T.weeksToRace));
      }
      if (re.improvement_pct) {
        meta.appendChild(el('span', 'rt-meta-item',
          '+' + re.improvement_pct.toFixed(1).replace('.', IS_EN ? '.' : ',') + ' % ' + T.improvement));
      }
    }
    var race = selectedRace();
    if (race) {
      var cf = RUN_ONLY[rt] ? race.course_factor_run : race.course_factor_bike;
      meta.appendChild(el('span', 'rt-meta-item', T.raceCourse + ' ' + cf.toFixed(2).replace('.', IS_EN ? '.' : ',')));
    }
    if (re.volume_status === 'insufficient' && r.hasDate) {
      meta.appendChild(el('span', 'rt-meta-item rt-meta-item--warn',
        T.volumeWarn.replace('%h', String(re.min_weekly_hours))));
    }

    // Goal verdict — realismCheck already returns the message in the page language.
    var verdict = $('rtVerdict');
    if (re.message_de && re.scale_label !== 'no_goal') {
      verdict.style.display = '';
      verdict.className = 'rt-verdict rt-verdict--' + verdictTone(re);
      verdict.textContent = re.message_de;
    } else {
      verdict.style.display = 'none';
    }
  }

  /**
   * Tone follows likelihood_label, not scale_label. GoalScaleLabel is
   * 'comfortable' | 'stretch' | 'high_effort' | 'unrealistic' | 'too_easy'
   * (lib/goalAssessment.ts) — matching those by name means every label someone
   * adds later lands in whichever branch happens to be last. The likelihood is
   * one number with a documented ramp, so it cannot drift the same way.
   */
  function verdictTone(realism) {
    var l = realism.likelihood_label;
    if (l === 'high') return 'yes';
    if (l === 'low' || l === 'very_low') return 'no';
    return 'close';
  }

  // ── URL params (shareable links) ──

  function encDisc(s) {
    if (s.mode === 'bucket') return s.bucket ? 'b~' + s.bucket : '';
    if (s.mode === 'custom') return s.dist && s.time ? 'c~' + s.dist + '~' + s.time : '';
    return s.exact ? 'x~' + s.exact : '';
  }

  function decDisc(raw, s) {
    if (!raw) return;
    var parts = raw.split('~');
    if (parts[0] === 'b') { s.mode = 'bucket'; s.bucket = parts[1] || ''; }
    else if (parts[0] === 'c') { s.mode = 'custom'; s.dist = parts[1] || ''; s.time = parts[2] || ''; }
    else if (parts[0] === 'x') { s.mode = 'exact'; s.exact = parts[1] || ''; }
  }

  function buildUrl() {
    var q = new URLSearchParams();
    if (state.raceType) q.set('d', state.raceType);
    ['swim', 'bike', 'run'].forEach(function (disc) {
      var v = encDisc(state[disc]);
      if (v) q.set(disc[0], v);
    });
    // Weight travels with the link: it is half of the power-velocity equation,
    // so a shared FTP result would otherwise reopen at the 75 kg default.
    if (state.bike.weight) q.set('kg', state.bike.weight);
    if (state.raceSlug) q.set('race', state.raceSlug);
    if (state.date) q.set('date', state.date);
    if (state.goal) q.set('goal', state.goal);
    if (state.hoursNow) q.set('hn', state.hoursNow);
    if (state.hoursPlan) q.set('hp', state.hoursPlan);
    if (state.exp !== '') q.set('exp', state.exp);
    var qs = q.toString();
    return qs ? location.pathname + '?' + qs : location.pathname;
  }

  // Every keystroke recalculates, but the address bar must not be rewritten
  // that often: WebKit throws a SecurityError past ~100 replaceState calls in
  // 30 s and Chrome silently drops them. The link is only read on share.
  var paramTimer = null;
  function writeParams() {
    if (paramTimer) clearTimeout(paramTimer);
    paramTimer = setTimeout(flushParams, 400);
  }

  function flushParams() {
    if (paramTimer) { clearTimeout(paramTimer); paramTimer = null; }
    history.replaceState(null, '', buildUrl());
  }

  function readParams() {
    var q = new URLSearchParams(location.search);
    var d = q.get('d');
    if (d && DISTANCES.indexOf(d) !== -1) state.raceType = d;
    decDisc(q.get('s'), state.swim);
    decDisc(q.get('b'), state.bike);
    decDisc(q.get('r'), state.run);
    state.bike.weight = q.get('kg') || '';
    state.raceSlug = q.get('race') || '';
    state.date = q.get('date') || '';
    state.goal = q.get('goal') || '';
    state.hoursNow = q.get('hn') || '';
    state.hoursPlan = q.get('hp') || '';
    // Anything but a known experience index would reach deriveAthleteLevel as
    // NaN and quietly resolve to 'intermediate' — reject it here instead.
    var exp = q.get('exp') || '';
    state.exp = ['0', '1', '2', '3'].indexOf(exp) !== -1 ? exp : '';
  }

  // ── Toast ──

  function showToast(msg) {
    var t = $('rtToast');
    t.textContent = msg;
    t.classList.add('is-visible');
    setTimeout(function () { t.classList.remove('is-visible'); }, 2200);
  }

  // ── Share image ──
  // Same layout language as the Kona check card: 4:5, logo header, one card.

  function fnt(weight, size) { return weight + ' ' + size + 'px "Lexend Deca", sans-serif'; }

  var logoImg = null;
  (function preloadLogo() {
    fetch('logo-full.svg').then(function (r) { return r.ok ? r.text() : null; }).then(function (svg) {
      if (!svg) return;
      // Give the SVG an intrinsic size – Safari refuses to rasterise size-less SVGs.
      var sized = svg.replace('<svg', '<svg width="1482" height="782"');
      var img = new Image();
      img.onload = function () { logoImg = img; };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sized);
    }).catch(function () {});
  })();

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawShare() {
    if (!lastResult) return null;
    var c = $('rtCanvas');
    var ctx = c.getContext('2d');
    var W = 1080, H = 1350, HEADER_H = 236, FOOTER_H = 116;
    var CARD_X = 56, CARD_W = W - CARD_X * 2, PAD = 56;
    var X = CARD_X + PAD, CW = CARD_W - PAD * 2, MID = X + CW / 2;
    c.width = W;
    c.height = H;

    var rt = state.raceType;
    var re = lastResult.forecast.realism;
    var p = lastResult.forecast.prognosis;
    var race = selectedRace();

    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#0A0A0A'); g.addColorStop(1, '#050505');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    var rg = ctx.createRadialGradient(W / 2, 300, 40, W / 2, 300, 560);
    rg.addColorStop(0, 'rgba(255,138,0,0.16)'); rg.addColorStop(1, 'rgba(255,138,0,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, 820);

    ctx.textAlign = 'center';
    if (logoImg) {
      var lw = 248, lh = lw * logoImg.height / logoImg.width;
      ctx.drawImage(logoImg, (W - lw) / 2, 38, lw, lh);
    } else {
      ctx.fillStyle = '#FF8A00'; ctx.font = fnt(700, 34);
      ctx.fillText('R A C E M I N D', W / 2, 116);
    }
    ctx.fillStyle = '#949494'; ctx.font = fnt(500, 26); ctx.letterSpacing = '2px';
    ctx.fillText(T.shareLabel, W / 2, 210);
    ctx.letterSpacing = '0px';

    var cardH = H - HEADER_H - FOOTER_H;
    ctx.fillStyle = '#1A1C1E';
    roundRect(ctx, CARD_X, HEADER_H, CARD_W, cardH, 36); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 2; ctx.stroke();

    // Content is centred in the card: a run-only result is barely half as tall
    // as a triathlon one, and top-aligning both leaves the short one floating.
    var contentH = 86 + (race ? 54 : 0) + 40 + 60 + 180 + 80 + (RUN_ONLY[rt] ? 78 : 3 * 78);
    var y = HEADER_H + Math.max(PAD, (cardH - contentH) / 2);

    // distance / race name
    ctx.textAlign = 'center'; ctx.fillStyle = '#FFFFFF'; ctx.font = fnt(700, 48);
    ctx.fillText(race ? (IS_EN ? race.name_en : race.name) : T.dist[rt], MID, y + 44);
    y += 86;
    if (race) {
      ctx.fillStyle = '#949494'; ctx.font = fnt(500, 30);
      ctx.fillText(T.dist[rt], MID, y + 24);
      y += 54;
    }

    y += 40;
    ctx.fillStyle = '#949494'; ctx.font = fnt(600, 28); ctx.letterSpacing = '3px';
    ctx.fillText(lastResult.hasDate ? T.shareRace : T.shareToday, MID, y + 28);
    ctx.letterSpacing = '0px';
    y += 60;

    var bigTime = fmtRaceTime(re.projected_probable_hours, rt);
    ctx.textAlign = 'left'; ctx.font = fnt(800, 150);
    var tw = ctx.measureText(bigTime).width;
    var tx = MID - tw / 2;
    var tg = ctx.createLinearGradient(tx, y, tx + tw, y + 150);
    tg.addColorStop(0, '#FF8A00'); tg.addColorStop(1, '#00D1FF');
    ctx.fillStyle = tg;
    ctx.fillText(bigTime, tx, y + 130);
    y += 180;

    ctx.textAlign = 'center'; ctx.fillStyle = '#949494'; ctx.font = fnt(400, 32);
    ctx.fillText(T.range + ' ' + fmtRaceTime(re.projected_best_hours, rt)
      + ' – ' + fmtRaceTime(re.projected_worst_hours, rt), MID, y + 30);
    y += 80;

    // Triathlon shows the three splits; a run-only card would otherwise be near
    // empty, so it carries the derived threshold pace instead.
    var rows = RUN_ONLY[rt]
      ? [[T.thresholdPace, fmtPace(p.derived_threshold_pace) + ' min/km']]
      : [['swim', p.adjusted_swim_hours], ['bike', p.adjusted_bike_hours], ['run', p.adjusted_run_hours]]
        .map(function (pair) { return [T.disc[pair[0]], fmtSplit(pair[1])]; });
    rows.forEach(function (row) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(X, y); ctx.lineTo(X + CW, y); ctx.stroke();
      ctx.textAlign = 'left'; ctx.fillStyle = '#E6E6E6'; ctx.font = fnt(400, 34);
      ctx.fillText(row[0], X, y + 52);
      ctx.textAlign = 'right'; ctx.fillStyle = '#FFFFFF'; ctx.font = fnt(700, 34);
      ctx.fillText(row[1], X + CW, y + 52);
      y += 78;
    });

    ctx.textAlign = 'center'; ctx.fillStyle = '#666666'; ctx.font = fnt(500, 30);
    ctx.fillText(T.shareFooter, W / 2, H - 52);
    return c;
  }

  function doShare() {
    var c = drawShare();
    if (!c) return;
    c.toBlob(function (blob) {
      if (!blob) { showToast(T.shareErr); return; }
      var name = 'race-time-' + state.raceType + '.png';
      var file = new File([blob], name, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: T.shareLabel }).catch(function () {});
      } else {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        showToast(T.shareOk);
      }
    }, 'image/png');
  }

  function doCopy() {
    flushParams(); // the debounce may still be pending — the copied link must be current
    var url = location.origin + buildUrl();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(
        function () { showToast(T.copyOk); },
        function () { showToast(url); },
      );
    } else {
      showToast(url);
    }
  }

  // ── Wiring ──

  function bindStep2() {
    bindCombo();
    $('rtDate').addEventListener('change', function (e) {
      state.date = e.target.value;
      recalc();
    });
    $('rtGoal').addEventListener('input', function (e) { state.goal = e.target.value; recalc(); });
    $('rtHoursNow').addEventListener('input', function (e) { state.hoursNow = e.target.value; recalc(); });
    $('rtHoursPlan').addEventListener('input', function (e) { state.hoursPlan = e.target.value; recalc(); });

    var expSel = $('rtExp');
    T.exp.forEach(function (label, i) {
      var o = document.createElement('option');
      o.value = String(i);
      o.textContent = label;
      expSel.appendChild(o);
    });
    expSel.addEventListener('change', function (e) { state.exp = e.target.value; recalc(); });
  }

  function restoreStep2Fields() {
    $('rtGoal').value = state.goal;
    $('rtHoursNow').value = state.hoursNow;
    $('rtHoursPlan').value = state.hoursPlan;
    $('rtExp').value = state.exp;
    // A slug the calendar cannot resolve — a stale shared link, a race whose
    // date has passed since, or a slug paired with the wrong distance — must
    // not sit in the state where it would go straight back into the share URL.
    if (state.raceSlug && state.raceSlug !== OTHER && !selectedRace()) {
      state.raceSlug = '';
    }
    renderComboInput();
    // A link from a race detail page carries the slug but no date — only the
    // change handler used to copy it over, and that never fires on a deep link.
    // Without this the race sits selected while "Renndatum" stays empty, and
    // the remaining time that drives the whole race-day projection is missing.
    // An explicit ?date= wins: a shared link may deliberately differ.
    var race = selectedRace();
    if (!state.date && race && race.date) state.date = race.date;
    $('rtDate').value = state.date;
  }

  function init() {
    bindStep2();
    $('rtShareBtn').addEventListener('click', doShare);
    $('rtCopyBtn').addEventListener('click', doCopy);

    readParams();
    renderDistances();
    renderDisciplines();

    fetch('data/races.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (json) {
        RACES = Array.isArray(json) ? json : [];
      })
      .catch(function () { RACES = []; })
      .then(function () {
        renderStep2();
        restoreStep2Fields();
        recalc();
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
