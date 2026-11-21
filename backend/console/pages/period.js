/**
 * Shared period picker for the security log and statistics (PB-36). Owner: M1.
 * Dates are whole days in the browser's time zone; "to" includes that day.
 */
(function () {
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  /** Returns { element, query() } where query() gives "from=...&to=..." in UTC ISO. */
  window.StaffConsole.periodPicker = function ({ h, days = 30, onChange }) {
    const today = new Date();
    const start = new Date(today.getTime() - (days - 1) * 86_400_000);
    const from = h('input', { id: 'period-from', type: 'date', value: ymd(start), max: ymd(today) });
    const to = h('input', { id: 'period-to', type: 'date', value: ymd(today), max: ymd(today) });
    const quick = (n) =>
      h('button', {
        class: 'btn secondary', type: 'button',
        onclick: () => {
          const now = new Date();
          from.value = ymd(new Date(now.getTime() - (n - 1) * 86_400_000));
          to.value = ymd(now);
          onChange();
        },
      }, n === 1 ? 'Today' : `Last ${n} days`);
    from.addEventListener('change', onChange);
    to.addEventListener('change', onChange);
    const element = h('div', { class: 'toolbar' },
      h('div', { class: 'field' }, h('label', { for: 'period-from' }, 'From'), from),
      h('div', { class: 'field' }, h('label', { for: 'period-to' }, 'To (including)'), to),
      quick(1), quick(7), quick(30),
    );
    return {
      element,
      query() {
        // Local midnight of "from" to local midnight after "to".
        const f = new Date(`${from.value}T00:00:00`);
        const t = new Date(`${to.value}T00:00:00`);
        t.setDate(t.getDate() + 1);
        return `from=${encodeURIComponent(f.toISOString())}&to=${encodeURIComponent(t.toISOString())}`;
      },
    };
  };
})();
