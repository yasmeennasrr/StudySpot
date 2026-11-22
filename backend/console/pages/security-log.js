/**
 * Security log page (PB-36, FR-041, SEC-010, UC-20). Owner: M1. Administrators only.
 * Failed sign-ins (app and staff), staff sign-ins and sign-outs, and staff actions.
 * Entries contain user-typed e-mails: always rendered as text, never as HTML.
 */
(function () {
  const ACTIONS = [
    ['', 'Everything'],
    ['auth.sign_in_failed', 'Failed sign-ins'],
    ['staff.sign_in', 'Staff sign-ins'],
    ['staff.sign_out', 'Staff sign-outs'],
    ['config.changed', 'Setting changes'],
    ['moderation.review_removed', 'Reviews removed'],
    ['moderation.reports_dismissed', 'Reports dismissed'],
    ['moderation.survey_removed', 'Surveys removed'],
    ['account.created', 'Accounts created'],
    ['account.suspended', 'Accounts suspended'],
    ['account.reactivated', 'Accounts reactivated'],
  ];
  const ROLE_NAMES = { user: 'student', moderator: 'moderator', admin: 'administrator' };
  const REASONS = {
    wrong_password: 'Wrong password',
    unknown_email: 'Unknown e-mail',
    suspended: 'Suspended account',
    not_staff: 'Not a staff account',
  };

  function describe(entry) {
    const d = entry.details || {};
    switch (entry.action) {
      case 'auth.sign_in_failed':
        return `${REASONS[d.reason] || d.reason || 'Failed'}${d.channel === 'staff' ? ' (Staff Console)' : ' (app)'}`;
      case 'staff.sign_in':
        return `Staff sign-in as ${d.role || 'staff'}`;
      case 'staff.sign_out':
        return 'Staff sign-out';
      case 'config.changed':
        return `Setting changed from ${d.oldValue} to ${d.newValue}`;
      case 'moderation.review_removed':
        return `Review removed (${d.reports || 0} report${d.reports === 1 ? '' : 's'})`;
      case 'moderation.reports_dismissed':
        return `Review kept, ${d.reports || 0} report${d.reports === 1 ? '' : 's'} dismissed`;
      case 'moderation.survey_removed':
        return 'Survey removed';
      case 'account.created':
        return `Account created as ${ROLE_NAMES[d.role] || d.role}`;
      case 'account.suspended':
        return `Account suspended (${d.sessionsEnded || 0} session${d.sessionsEnded === 1 ? '' : 's'} ended)`;
      case 'account.reactivated':
        return 'Account reactivated';
      default:
        return entry.action;
    }
  }

  async function render(container, { api, h, formatDateTime }) {
    const select = h('select', { id: 'log-action' }, ACTIONS.map(([v, label]) => h('option', { value: v }, label)));
    const body = h('div', { 'aria-live': 'polite' });
    const error = h('div', { class: 'error', role: 'alert', hidden: true });
    const picker = window.StaffConsole.periodPicker({ h, days: 7, onChange: load });
    select.addEventListener('change', load);

    async function load() {
      error.hidden = true;
      try {
        const action = select.value ? `&action=${encodeURIComponent(select.value)}` : '';
        const rows = await api('GET', `/staff/security-log?${picker.query()}${action}&limit=200`);
        body.replaceChildren(
          rows.length
            ? h('table', {},
                h('thead', {}, h('tr', {}, h('th', {}, 'When'), h('th', {}, 'Event'), h('th', {}, 'Account'), h('th', {}, 'By'), h('th', {}, 'IP'))),
                h('tbody', {}, rows.map((r) => h('tr', {},
                  h('td', { class: 'small' }, formatDateTime(r.createdAt)),
                  h('td', {}, describe(r)),
                  h('td', {}, r.target || '—'),
                  h('td', { class: 'small' }, r.actor ? r.actor.email : r.actorType),
                  h('td', { class: 'small muted' }, r.ip || (r.details && r.details.ip) || '—'),
                ))),
              )
            : h('div', { class: 'empty' }, 'Nothing in this period.'),
          ...(rows.length === 200
            ? [h('p', { class: 'hint' }, 'Showing the newest 200. Choose a shorter period to see older entries.')]
            : []),
        );
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
      }
    }

    container.replaceChildren(
      h('h1', {}, 'Security log'),
      h('p', { class: 'muted' }, 'Failed sign-ins and every staff action, newest first.'),
      picker.element,
      h('div', { class: 'toolbar' }, h('div', { class: 'field' }, h('label', { for: 'log-action' }, 'Show'), select)),
      error,
      body,
    );
    await load();
  }

  window.StaffConsole.registerPage({ id: 'security-log', title: 'Security log', story: 'PB-36', roles: ['admin'], render });
})();
