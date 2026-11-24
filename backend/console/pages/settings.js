/**
 * Settings page (PB-34, FR-039, FR-040, UC-19). Owner: M1. Administrators only.
 * Points per survey category, the daily cap, freshness limits and the venue radius.
 * Each change is saved on its own, kept in the change history, and logged (FR-044).
 */
(function () {
  async function render(container, { api, h, formatDateTime }) {
    container.replaceChildren(h('h1', {}, 'Settings'), h('p', { class: 'muted' }, 'Loading…'));
    const [settings, history] = await Promise.all([
      api('GET', '/staff/settings'),
      api('GET', '/staff/settings/history?limit=20'),
    ]);

    const groups = [...new Set(settings.map((s) => s.group))];
    const sections = groups.map((group) =>
      h('section', {},
        h('h2', {}, group),
        h('table', { class: 'settings-table' },
          h('thead', {}, h('tr', {},
            h('th', {}, 'Setting'), h('th', {}, 'Value'), h('th', {}, 'Allowed'), h('th', {}, 'Default'), h('th', {}, ''))),
          h('tbody', {}, settings.filter((s) => s.group === group).map((s) => row(s))),
        ),
      ),
    );

    function row(setting) {
      const id = `setting-${setting.key.replace(/\W/g, '-')}`;
      const input = h('input', {
        id, type: 'number', inputmode: 'numeric', step: 1, min: setting.min, max: setting.max,
        value: setting.value, style: 'max-width: 120px', 'aria-describedby': `${id}-msg`,
      });
      const msg = h('div', { id: `${id}-msg`, class: 'field-error', role: 'status' });
      const save = h('button', { class: 'btn secondary', type: 'button', disabled: true }, 'Save');
      let saved = setting.value;
      const dirty = () => {
        save.disabled = input.value === '' || Number(input.value) === saved;
        msg.textContent = '';
        msg.className = 'field-error';
      };
      input.addEventListener('input', dirty);
      save.addEventListener('click', async () => {
        save.disabled = true;
        save.textContent = 'Saving…';
        try {
          const result = await api('PUT', `/staff/settings/${encodeURIComponent(setting.key)}`, { value: Number(input.value) });
          saved = result.value;
          msg.className = 'hint';
          msg.textContent = 'Saved.';
          refreshHistory();
        } catch (err) {
          msg.textContent = err.message;
          save.disabled = false;
        } finally {
          save.textContent = 'Save';
        }
      });
      return h('tr', {},
        h('td', {}, h('label', { for: id }, setting.label), h('div', { class: 'hint' }, setting.requirement)),
        h('td', {}, input, msg),
        h('td', { class: 'small muted' }, `${setting.min} to ${setting.max} ${setting.unit}`),
        h('td', { class: 'small muted' }, `${setting.defaultValue}`),
        h('td', {}, save),
      );
    }

    const historyBox = h('div', {});
    function drawHistory(list) {
      historyBox.replaceChildren(
        list.length
          ? h('table', {},
              h('thead', {}, h('tr', {}, h('th', {}, 'When'), h('th', {}, 'Setting'), h('th', { class: 'num' }, 'From'), h('th', { class: 'num' }, 'To'), h('th', {}, 'By'))),
              h('tbody', {}, list.map((c) => h('tr', {},
                h('td', {}, formatDateTime(c.changedAt)),
                h('td', {}, c.label),
                h('td', { class: 'num' }, c.oldValue == null ? '—' : String(c.oldValue)),
                h('td', { class: 'num' }, String(c.newValue)),
                h('td', {}, c.changedBy.email || c.changedBy.id),
              ))),
            )
          : h('div', { class: 'empty' }, 'No changes yet. Every value is at its default.'),
      );
    }
    async function refreshHistory() {
      drawHistory(await api('GET', '/staff/settings/history?limit=20'));
    }
    drawHistory(history);

    container.replaceChildren(
      h('h1', {}, 'Settings'),
      h('p', { class: 'muted' }, 'Changes apply within 30 seconds. Every change is kept below and in the security log.'),
      ...sections,
      h('h2', {}, 'Recent changes'),
      historyBox,
    );
  }

  window.StaffConsole.registerPage({ id: 'settings', title: 'Settings', story: 'PB-34', roles: ['admin'], render });
})();
