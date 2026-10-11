/* ══════════════════════════════════════
   RaceMind – Store Link Campaign
   ══════════════════════════════════════

   Instagram ads, the Instagram bio and stories all land on the home page.
   With bare store links App Store Connect only sees "came from Instagram"
   and cannot tell an ad from the bio link. This appends the visitor's
   campaign to every App Store and Google Play link on the page: Apple reads
   `ct` (with our provider token `pt`) into the Campaign column of its
   analytics, Play reads the UTM string in `referrer`.

   The campaign is `utm_campaign` from the page URL (ig_ad, ig_bio,
   ig_story), `web` without one. Nothing is stored on the device — the site
   runs without a consent banner (Datenschutz 3.5) — so a visitor who opens
   another page before tapping a store link arrives as `web`. /start/ builds
   the same links with its own copy of this logic.
   ══════════════════════════════════════ */

(function () {
  'use strict';

  var APPLE_PROVIDER_TOKEN = '128611094';
  // The `apple-store` slug is what App Store Connect's campaign-link generator
  // emits; the prettier /app/race-mind/ slug has lost attribution before.
  var IOS_URL = 'https://apps.apple.com/app/apple-store/id6759935305';
  var PLAY_URL = 'https://play.google.com/store/apps/details?id=com.racemind.app';

  var params = new URLSearchParams(window.location.search);

  // Lowercase and URL-safe, so a hand-typed parameter can neither break the
  // store link nor split one campaign into several spellings.
  function clean(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
  }

  var campaign = clean(params.get('utm_campaign')) || 'web';
  var source = clean(params.get('utm_source')) || (campaign.indexOf('ig_') === 0 ? 'instagram' : 'website');
  var medium = clean(params.get('utm_medium')) || 'website';

  var iosUrl = IOS_URL + '?pt=' + APPLE_PROVIDER_TOKEN + '&ct=' + campaign + '&mt=8';
  var playUrl = PLAY_URL + '&referrer=' + encodeURIComponent(
    'utm_source=' + source + '&utm_medium=' + medium + '&utm_campaign=' + campaign
  );

  document.querySelectorAll('a[href*="id6759935305"]').forEach(function (link) {
    link.setAttribute('href', iosUrl);
  });
  document.querySelectorAll('a[href^="' + PLAY_URL + '"]').forEach(function (link) {
    link.setAttribute('href', playUrl);
  });
})();
