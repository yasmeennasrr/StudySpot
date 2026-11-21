/**
 * Statistics page (PB-36, FR-042, UC-20). Owner: M1. Administrators only.
 * Users, surveys submitted, points issued and coupons redeemed for a chosen period.
 */
(function () {
  const fmt = (n) => Number(n).toLocaleString();

  async function render(container, { api, h }) {
    const tiles = h('div', { class: 'tiles', 'aria-live': 'polite' });
    const error = h('div', { class: 'error', role: 'alert', hidden: true });
    const picker = window.StaffConsole.periodPicker({ h, onChange: load });
    const tile = (value, label, note) =>
      h('div', { class: 'tile' }, h('div', { class: 'value' }, fmt(value)), h('div', { class: 'label' }, label),
        note ? h('div', { class: 'hint' }, note) : null);

    async function load() {
      error.hidden = true;
      tiles.setAttribute('aria-busy', 'true');
      try {
        const s = await api('GET', `/staff/statistics?${picker.query()}`);
        tiles.replaceChildren(
          tile(s.users.newInPeriod, 'New students', `${fmt(s.users.total)} in total`),
          tile(s.surveysSubmitted, 'Surveys submitted'),
          tile(s.pointsIssued, 'Points issued'),
          tile(s.couponsRedeemed, 'Coupons redeemed'),
          tile(s.failedSignIns, 'Failed sign-ins', 'See the security log'),
        );
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
      } finally {
        tiles.removeAttribute('aria-busy');
      }
    }

    container.replaceChildren(
      h('h1', {}, 'Statistics'),
      h('p', { class: 'muted' }, 'Totals for the chosen days.'),
      picker.element,
      error,
      tiles,
    );
    await load();
  }

  window.StaffConsole.registerPage({ id: 'statistics', title: 'Statistics', story: 'PB-36', roles: ['admin'], render });
})();
