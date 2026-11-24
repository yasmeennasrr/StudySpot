/**
 * Accounts page (PB-33, FR-036 to FR-038, FR-044, UC-18). Owner: M4. Administrators only.
 * Find accounts, create student, moderator or administrator accounts, and suspend or
 * reactivate them. A suspended account cannot sign in, and its open sessions end at once.
 * Names and e-mails come from users: always rendered as text, never as HTML.
 */
(function () {
  const ROLES = [
    ['user', 'Student'],
    ['moderator', 'Moderator'],
    ['admin', 'Administrator'],
  ];
  const roleName = (role) => (ROLES.find(([v]) => v === role) || [role, role])[1];

  async function render(container, { api, h, user, formatDateTime }) {
    const notice = h('div', { class: 'notice', role: 'status', hidden: true });
    const error = h('div', { class: 'error', role: 'alert', hidden: true });
    const listBox = h('div', { 'aria-live': 'polite' });

    const say = (text) => {
      notice.textContent = text;
      notice.hidden = false;
    };

    // ------------------------------------------------------------- the list
    const search = h('input', { id: 'acc-q', type: 'search', placeholder: 'E-mail or name', maxlength: 100 });
    const roleFilter = h('select', { id: 'acc-role' },
      h('option', { value: '' }, 'Every role'),
      ROLES.map(([v, label]) => h('option', { value: v }, label)));
    const stateFilter = h('select', { id: 'acc-state' },
      h('option', { value: '' }, 'Active and suspended'),
      h('option', { value: 'false' }, 'Active only'),
      h('option', { value: 'true' }, 'Suspended only'));
    let timer = null;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(load, 300);
    });
    roleFilter.addEventListener('change', load);
    stateFilter.addEventListener('change', load);

    function toggle(account) {
      if (account.id === user.id) return h('span', { class: 'hint' }, 'You');
      const suspending = !account.suspended;
      const btn = h('button', { class: `btn ${suspending ? 'danger' : 'secondary'}`, type: 'button' },
        suspending ? 'Suspend' : 'Reactivate');
      btn.addEventListener('click', async () => {
        const question = suspending
          ? `Suspend ${account.email}? They are signed out now and cannot sign in until reactivated.`
          : `Reactivate ${account.email}? They can sign in again.`;
        if (!window.confirm(question)) return;
        btn.disabled = true;
        error.hidden = true;
        try {
          await api('POST', `/staff/accounts/${account.id}/${suspending ? 'suspend' : 'reactivate'}`);
          say(`${account.email} is ${suspending ? 'suspended' : 'active again'}.`);
          await load();
        } catch (err) {
          error.textContent = err.message;
          error.hidden = false;
          btn.disabled = false;
        }
      });
      return btn;
    }

    async function load() {
      error.hidden = true;
      const params = new URLSearchParams({ limit: '200' });
      if (search.value.trim()) params.set('q', search.value.trim());
      if (roleFilter.value) params.set('role', roleFilter.value);
      if (stateFilter.value) params.set('suspended', stateFilter.value);
      try {
        const rows = await api('GET', `/staff/accounts?${params}`);
        listBox.replaceChildren(
          rows.length
            ? h('table', {},
                h('thead', {}, h('tr', {},
                  h('th', {}, 'Account'), h('th', {}, 'Role'), h('th', {}, 'Status'),
                  h('th', {}, 'Created'), h('th', {}, ''))),
                h('tbody', {}, rows.map((a) => h('tr', {},
                  h('td', {}, a.displayName, h('div', { class: 'hint' }, a.email)),
                  h('td', {}, roleName(a.role)),
                  h('td', {}, a.suspended ? h('span', { class: 'role' }, 'suspended') : 'Active'),
                  h('td', { class: 'small' }, formatDateTime(a.createdAt)),
                  h('td', {}, h('div', { class: 'row' }, toggle(a))),
                ))),
              )
            : h('div', { class: 'empty' }, 'No accounts match.'),
          ...(rows.length === 200 ? [h('p', { class: 'hint' }, 'Showing the newest 200. Search to narrow the list.')] : []),
        );
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
      }
    }

    // ----------------------------------------------------------- the form
    const formError = h('div', { class: 'error', role: 'alert', hidden: true });
    const email = h('input', { id: 'new-email', type: 'email', required: true, maxlength: 254, autocomplete: 'off' });
    const name = h('input', { id: 'new-name', required: true, minlength: 2, maxlength: 30, autocomplete: 'off' });
    const role = h('select', { id: 'new-role' }, ROLES.map(([v, label]) => h('option', { value: v }, label)));
    const password = h('input', { id: 'new-password', type: 'password', required: true, autocomplete: 'new-password' });
    const again = h('input', { id: 'new-password-2', type: 'password', required: true, autocomplete: 'new-password' });
    const rule = h('div', { class: 'hint', id: 'new-password-rule' });
    const showRule = () => {
      rule.textContent = role.value === 'user'
        ? 'At least 8 characters with a letter and a digit.'
        : 'Staff: at least 10 characters with a letter and a digit.';
    };
    role.addEventListener('change', showRule);
    showRule();
    const submit = h('button', { class: 'btn', type: 'submit' }, 'Create account');

    const form = h('form', {
      class: 'card',
      onsubmit: async (e) => {
        e.preventDefault();
        formError.hidden = true;
        if (password.value !== again.value) {
          formError.textContent = 'The passwords do not match.';
          formError.hidden = false;
          return;
        }
        submit.disabled = true;
        try {
          const created = await api('POST', '/staff/accounts', {
            email: email.value, displayName: name.value, role: role.value, password: password.value,
          });
          say(`Created ${roleName(created.role).toLowerCase()} account ${created.email}. Give them the password in person.`);
          form.reset();
          showRule();
          await load();
        } catch (err) {
          formError.textContent = err.message;
          formError.hidden = false;
        } finally {
          password.value = '';
          again.value = '';
          submit.disabled = false;
        }
      },
    },
      h('h2', {}, 'Create an account'),
      formError,
      h('div', { class: 'field' }, h('label', { for: 'new-email' }, 'E-mail'), email),
      h('div', { class: 'field' }, h('label', { for: 'new-name' }, 'Display name'), name),
      h('div', { class: 'field' }, h('label', { for: 'new-role' }, 'Role'), role),
      h('div', { class: 'field' }, h('label', { for: 'new-password' }, 'Password'), password, rule),
      h('div', { class: 'field' }, h('label', { for: 'new-password-2' }, 'Password again'), again),
      h('p', { class: 'hint' }, 'Only create an account for someone who has read and accepted the terms and privacy notice.'),
      submit,
    );

    container.replaceChildren(
      h('h1', {}, 'Staff and user accounts'),
      h('p', { class: 'muted' }, 'Suspending ends the account’s sessions at once. Every change is in the security log.'),
      notice,
      error,
      h('div', { class: 'toolbar' },
        h('div', { class: 'field' }, h('label', { for: 'acc-q' }, 'Search'), search),
        h('div', { class: 'field' }, h('label', { for: 'acc-role' }, 'Role'), roleFilter),
        h('div', { class: 'field' }, h('label', { for: 'acc-state' }, 'Status'), stateFilter),
      ),
      listBox,
      form,
    );
    await load();
  }

  window.StaffConsole.registerPage({ id: 'accounts', title: 'Accounts', story: 'PB-33', roles: ['admin'], render });
})();
