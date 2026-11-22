/**
 * Moderation queue (PB-37, FR-029, UC-21). Owner: M4. Moderators and administrators.
 * Reported reviews, most reported first: remove one (it disappears from the app and
 * its rating at once) or keep it (its reports are cleared). Below, the newest surveys,
 * which users cannot report, so a moderator can remove abusive answers.
 * Review text and names come from users: always rendered as text, never as HTML.
 */
(function () {
  const ANSWERS = {
    not_crowded: 'Not crowded', slightly_crowded: 'Slightly crowded',
    moderately_crowded: 'Moderately crowded', very_crowded: 'Very crowded',
    quiet: 'Quiet', moderate: 'Moderate', noisy: 'Noisy',
    poor: 'Poor', average: 'Average', good: 'Good', not_used: 'Did not use it',
  };

  function stars(n) {
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  function author(a, h) {
    if (!a) return h('span', { class: 'muted' }, 'Deleted account');
    return h('div', {},
      a.displayName,
      a.suspended ? h('span', { class: 'role' }, 'suspended') : null,
      h('div', { class: 'hint' }, a.email),
    );
  }

  async function render(container, { api, h, formatDateTime }) {
    const notice = h('div', { class: 'notice', role: 'status', hidden: true });
    const reviewsBox = h('div', { 'aria-live': 'polite' });
    const surveysBox = h('div', { 'aria-live': 'polite' });
    const error = h('div', { class: 'error', role: 'alert', hidden: true });

    function say(text) {
      notice.textContent = text;
      notice.hidden = false;
    }
    function fail(err) {
      error.textContent = err.message;
      error.hidden = false;
    }

    /** A button that runs `work` once, after an optional confirmation. */
    function action(label, cls, question, work) {
      const btn = h('button', { class: `btn ${cls}`, type: 'button' }, label);
      btn.addEventListener('click', async () => {
        if (question && !window.confirm(question)) return;
        btn.disabled = true;
        error.hidden = true;
        try {
          await work();
        } catch (err) {
          fail(err);
          btn.disabled = false;
        }
      });
      return btn;
    }

    async function loadReviews() {
      const rows = await api('GET', '/staff/moderation/reviews?limit=100');
      reviewsBox.replaceChildren(
        rows.length
          ? h('table', {},
              h('thead', {}, h('tr', {},
                h('th', {}, 'Review'), h('th', {}, 'Venue'), h('th', {}, 'Author'),
                h('th', { class: 'num' }, 'Reports'), h('th', {}, 'Last reported'), h('th', {}, ''))),
              h('tbody', {}, rows.map((r) => h('tr', {},
                h('td', {},
                  h('div', { 'aria-label': `${r.rating} of 5 stars` }, stars(r.rating)),
                  r.text ? h('div', {}, r.text) : h('div', { class: 'muted small' }, 'No text'),
                  h('div', { class: 'hint' }, `Written ${formatDateTime(r.writtenAt)}`),
                ),
                h('td', {}, r.venue.name),
                h('td', {}, author(r.author, h)),
                h('td', { class: 'num' }, String(r.reportCount)),
                h('td', { class: 'small' }, formatDateTime(r.lastReportedAt)),
                h('td', {}, h('div', { class: 'row' },
                  action('Keep', 'secondary', null, async () => {
                    await api('POST', `/staff/moderation/reviews/${r.reviewId}/dismiss`);
                    say(`Kept the review of ${r.venue.name}; its reports were cleared.`);
                    await loadReviews();
                  }),
                  action('Remove', 'danger', `Remove this review of ${r.venue.name}? It disappears from the app.`, async () => {
                    await api('POST', `/staff/moderation/reviews/${r.reviewId}/remove`);
                    say(`Removed the review of ${r.venue.name}.`);
                    await loadReviews();
                  }),
                )),
              ))),
            )
          : h('div', { class: 'empty' }, 'No reported reviews. The queue is clear.'),
      );
    }

    async function loadSurveys() {
      const rows = await api('GET', '/staff/moderation/surveys?limit=50');
      surveysBox.replaceChildren(
        rows.length
          ? h('table', {},
              h('thead', {}, h('tr', {},
                h('th', {}, 'Submitted'), h('th', {}, 'Venue'), h('th', {}, 'Answers'),
                h('th', {}, 'Author'), h('th', { class: 'num' }, 'Points'), h('th', {}, ''))),
              h('tbody', {}, rows.map((s) => h('tr', {},
                h('td', { class: 'small' }, formatDateTime(s.submittedAt),
                  h('div', { class: 'hint' }, s.source === 'qr' ? 'Receipt code' : 'In the app')),
                h('td', {}, s.venue.name),
                h('td', { class: 'small' },
                  ['crowd', 'noise', 'wifi'].filter((k) => s.answers[k]).map((k) =>
                    h('div', {}, `${k === 'wifi' ? 'Wi-Fi' : k[0].toUpperCase() + k.slice(1)}: ${ANSWERS[s.answers[k]] || s.answers[k]}`)),
                ),
                h('td', {}, author(s.author, h)),
                h('td', { class: 'num' }, String(s.pointsAwarded)),
                h('td', {}, h('div', { class: 'row' },
                  action('Remove', 'danger', `Remove this survey of ${s.venue.name}? Its answers stop counting.`, async () => {
                    await api('POST', `/staff/moderation/surveys/${s.surveyId}/remove`);
                    say(`Removed the survey of ${s.venue.name}. Its answers no longer count.`);
                    await loadSurveys();
                  }),
                )),
              ))),
            )
          : h('div', { class: 'empty' }, 'No surveys yet.'),
      );
    }

    container.replaceChildren(
      h('h1', {}, 'Moderation queue'),
      h('p', { class: 'muted' }, 'Removed content is hidden everywhere at once. Every decision is in the security log.'),
      notice,
      error,
      h('h2', {}, 'Reported reviews'),
      reviewsBox,
      h('h2', {}, 'Newest surveys'),
      h('p', { class: 'hint' }, 'Users cannot report surveys. Remove answers that are clearly abusive, for example many from one account.'),
      surveysBox,
    );
    reviewsBox.append(h('p', { class: 'muted' }, 'Loading…'));
    await Promise.all([loadReviews(), loadSurveys()]);
  }

  window.StaffConsole.registerPage({
    id: 'moderation', title: 'Moderation queue', story: 'PB-37', roles: ['admin', 'moderator'], render,
  });
})();
