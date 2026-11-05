// The withdrawal button (§ 356a BGB): two steps, no login. First the details and
// "Vertrag widerrufen", then a second page state with "Widerruf bestätigen".
// Posts to contact-submit, which stores it and mails the receipt.
(() => {
  const ENDPOINT = 'https://pmrtfviekuvbgjzfokzb.supabase.co/functions/v1/contact-submit';
  const form = document.getElementById('withdrawal-form');
  const review = document.getElementById('withdrawal-review');
  const done = document.getElementById('withdrawal-done');
  const confirm = document.getElementById('withdrawal-confirm');
  const back = document.getElementById('withdrawal-back');
  const failed = document.getElementById('withdrawal-failed');
  if (!form || !review || !done || !confirm || !back || !failed) return;
  const lang = document.documentElement.lang === 'en' ? 'en' : 'de';
  let details = null;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    details = {
      name: String(fd.get('name') || '').trim(),
      email: String(fd.get('email') || '').trim(),
      invoice: String(fd.get('invoice') || '').trim(),
      botcheck: fd.get('botcheck') ? 'on' : '',
    };
    document.getElementById('withdrawal-review-name').textContent = details.name;
    document.getElementById('withdrawal-review-email').textContent = details.email;
    document.getElementById('withdrawal-review-invoice').textContent = details.invoice || '–';
    form.hidden = true;
    review.hidden = false;
  });

  back.addEventListener('click', () => {
    review.hidden = true;
    form.hidden = false;
  });

  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    failed.hidden = true;
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...details, source: 'withdrawal', lang }),
      });
      if (!res.ok) throw new Error(String(res.status));
      review.hidden = true;
      done.hidden = false;
    } catch {
      failed.hidden = false;
      confirm.disabled = false;
    }
  });
})();
