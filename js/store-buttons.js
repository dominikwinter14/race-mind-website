/* ══════════════════════════════════════
   RaceMind – Store Button Platform Order
   ══════════════════════════════════════

   Ads send iOS and Android traffic to the same page, so the markup ships
   both stores with iOS first. This only flags the platform on <html>; the
   reorder and the primary/secondary swap are pure CSS. That keeps the page
   fully usable without JS and — because this runs in <head>, before the
   first paint — avoids a visible flip of the buttons.
   ══════════════════════════════════════ */

(function () {
  'use strict';

  var ua = navigator.userAgent || '';

  // iPadOS 13+ reports as Macintosh; the touch-point check separates a real
  // Mac (0) from an iPad pretending to be one.
  var isIOS = /iPad|iPhone|iPod/.test(ua) ||
              (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/.test(ua);

  // Desktop keeps the shipped order: we cannot know which phone the visitor
  // will install on, so neither store gets demoted there.
  if (isAndroid && !isIOS) {
    document.documentElement.classList.add('is-android');
  } else if (isIOS) {
    document.documentElement.classList.add('is-ios');
  }
})();
