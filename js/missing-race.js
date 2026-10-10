// "Dir fehlt ein Rennen?" under the race list (events.html / events-en.html).
//
// The block is rendered by scripts/events/missing-race.mjs. This script opens
// the form, carries a search that found nothing over as the race name, and
// posts to the same contact-submit function as the contact form, as source
// 'race'. Only the race name is required there; everything else is optional.
(() => {
  const ENDPOINT = 'https://pmrtfviekuvbgjzfokzb.supabase.co/functions/v1/contact-submit';

  const block = document.getElementById('missingRace');
  if (!block) return;
  const toggle = document.getElementById('missingRaceToggle');
  const form = document.getElementById('missingRaceForm');
  const success = document.getElementById('missingRaceSuccess');
  const raceName = form.elements.namedItem('race_name');
  const search = document.getElementById('searchInput');

  toggle.addEventListener('click', () => {
    form.hidden = false;
    toggle.hidden = true;
    toggle.setAttribute('aria-expanded', 'true');
    // Whoever searched for a race and found nothing has just typed its name.
    const query = search ? search.value.trim() : '';
    if (query && !raceName.value) raceName.value = query;
    raceName.focus();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.textContent = form.dataset.sending;
    btn.disabled = true;

    const fd = new FormData(form);
    const value = (key) => String(fd.get(key) || '').trim();

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'race',
          lang: form.dataset.lang === 'en' ? 'en' : 'de',
          race_name: value('race_name'),
          race_date: value('race_date'),
          race_location: value('race_location'),
          race_distance: value('race_distance'),
          race_url: value('race_url'),
          email: value('email'),
          botcheck: fd.get('botcheck') ? 'on' : '',
        }),
      });

      if (res.ok) {
        form.hidden = true;
        success.hidden = false;
        return;
      }
      btn.textContent = res.status === 429 ? form.dataset.tooMany : form.dataset.error;
    } catch {
      btn.textContent = form.dataset.error;
    }

    btn.disabled = false;
    setTimeout(() => {
      btn.textContent = originalText;
    }, 3000);
  });
})();
