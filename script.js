/* ══════════════════════════════════════
   RaceMind – Landing Page Scripts
   ══════════════════════════════════════ */

(function () {
  'use strict';

  // ── Scroll-triggered reveal animations ──

  const revealElements = document.querySelectorAll('.reveal');

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );

  revealElements.forEach((el) => revealObserver.observe(el));

  // ── Nav background on scroll ──

  const nav = document.getElementById('nav');

  function updateNav() {
    if (window.scrollY > 40) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
  }

  window.addEventListener('scroll', updateNav, { passive: true });
  updateNav();

  // ── Mobile menu toggle ──

  const navToggle = document.getElementById('navToggle');
  const navLinks = document.querySelector('.nav-links');

  navToggle.addEventListener('click', () => {
    navToggle.classList.toggle('open');
    navLinks.classList.toggle('open');
  });

  // Close mobile menu when a link is clicked
  navLinks.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      navToggle.classList.remove('open');
      navLinks.classList.remove('open');
    });
  });

  // ── Smooth scroll for anchor links ──

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId === '#') return;

      const target = document.querySelector(targetId);
      if (!target) return;

      e.preventDefault();
      const navHeight = nav.offsetHeight;
      const top = target.getBoundingClientRect().top + window.scrollY - navHeight;

      window.scrollTo({ top, behavior: 'smooth' });
    });
  });
  // ── Contact form ──
  //
  // Posts to our own Supabase edge function instead of a third-party form
  // relay, so visitor name/email/message never leave our EU project. The
  // endpoint is public (deployed with --no-verify-jwt) and needs no key —
  // it does its own honeypot check, validation and per-IP rate limiting.

  const CONTACT_ENDPOINT = 'https://pmrtfviekuvbgjzfokzb.supabase.co/functions/v1/contact-submit';

  const CONTACT_TEXT = {
    de: {
      sending: 'Wird gesendet…',
      error: 'Fehler – erneut versuchen',
      tooMany: 'Zu viele Nachrichten – später erneut',
    },
    en: {
      sending: 'Sending…',
      error: 'Error – please try again',
      tooMany: 'Too many messages – try again later',
    },
  };

  const contactForm = document.querySelector('.contact-form');
  const contactSuccess = document.getElementById('contactSuccess');

  if (contactForm) {
    const lang = document.documentElement.lang === 'en' ? 'en' : 'de';
    const t = CONTACT_TEXT[lang];

    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = contactForm.querySelector('button[type="submit"]');
      const originalText = btn.textContent;
      btn.textContent = t.sending;
      btn.disabled = true;

      const fd = new FormData(contactForm);
      const source = contactForm.dataset.source === 'partner' ? 'partner' : 'contact';

      // The partner application asks for two extra fields. The backend stores a
      // single message body, so fold them in rather than dropping them.
      const extras = [
        ['Social-Handle / Website', fd.get('handle')],
        [lang === 'en' ? 'Reach / audience' : 'Reichweite / Zielgruppe', fd.get('reach')],
      ].filter(([, value]) => value);

      const message = extras.length
        ? extras.map(([label, value]) => label + ': ' + value).join('\n') + '\n\n' + (fd.get('message') || '')
        : String(fd.get('message') || '');

      try {
        const res = await fetch(CONTACT_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: fd.get('name'),
            email: fd.get('email'),
            message,
            source,
            lang,
            botcheck: fd.get('botcheck') || '',
          }),
        });

        if (res.ok) {
          contactForm.style.display = 'none';
          contactSuccess.style.display = 'block';
          return;
        }

        btn.textContent = res.status === 429 ? t.tooMany : t.error;
      } catch {
        btn.textContent = t.error;
      }

      btn.disabled = false;
      setTimeout(() => {
        btn.textContent = originalText;
      }, 3000);
    });
  }
})();
