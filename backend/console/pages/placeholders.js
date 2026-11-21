/**
 * Pages other members build in Sprints 3 and 4. Each owner replaces their entry with
 * a real file in pages/ (and adds a <script> tag in index.html), calling the Staff API
 * with ctx.api(...). Backend routes use @StaffOnly(...) from common/http/staff.guard.ts.
 */
(function () {
  const soon = (story, what) => (container, { h }) => {
    container.replaceChildren(
      h('h1', {}, what),
      h('div', { class: 'empty' }, `This page arrives with ${story}.`),
    );
  };
  const C = window.StaffConsole;
  C.registerPage({ id: 'accounts', title: 'Accounts', story: 'PB-33', roles: ['admin'],
    render: soon('PB-33', 'Staff and user accounts') });
  C.registerPage({ id: 'venues', title: 'Venues and API keys', story: 'PB-35', roles: ['admin'],
    render: soon('PB-35', 'Venues and API keys') });
})();
