/**
 * StudySpot Staff Console shell (PB-32, FR-035, UC-17). Owner: M1.
 *
 * - Sign-in always asks for the password; the staff session lasts 15 minutes and
 *   cannot be refreshed. When it ends, a dialog asks for the password again and the
 *   page carries on where it was.
 * - Pages live in pages/<name>.js and call StaffConsole.registerPage({...}).
 * - Build the DOM with StaffConsole.h(...), never innerHTML: log entries and names
 *   come from users.
 */
(function () {
  'use strict';

  const API = '/api/v1';
  const STORE_KEY = 'studyspot.staff';
  const pages = [];
  let session = load(); // { staffToken, expiresAt, user }
  let timer = null;
  let reauthPending = null;

  // ------------------------------------------------------------------ helpers
  /** h('p', { class: 'muted' }, 'text', childNode) builds an element safely. */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  function load() {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  function save(value) {
    session = value;
    try {
      if (value) sessionStorage.setItem(STORE_KEY, JSON.stringify(value));
      else sessionStorage.removeItem(STORE_KEY);
    } catch {
      /* private mode: the session simply lives in memory */
    }
  }

  function formatDateTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  // ---------------------------------------------------------------------- API
  class ApiError extends Error {
    constructor(status, body) {
      super((body && body.message) || `Request failed (${status}).`);
      this.status = status;
      this.code = body && body.code;
      this.details = body && body.details;
    }
  }

  async function raw(method, path, body, token) {
    const res = await fetch(API + path, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
  }

  /** Staff API call. A 401 (session ended) asks for the password and retries once. */
  async function api(method, path, body) {
    try {
      return await raw(method, path, body, session && session.staffToken);
    } catch (err) {
      if (err.status !== 401 || !session) throw err;
      await reauthenticate();
      return raw(method, path, body, session.staffToken);
    }
  }

  // -------------------------------------------------------------- sign-in view
  function renderSignIn(message) {
    stopTimer();
    const error = h('div', { class: 'error', role: 'alert', hidden: !message }, message || '');
    const email = h('input', { id: 'email', type: 'email', autocomplete: 'username', required: true });
    const password = h('input', { id: 'password', type: 'password', autocomplete: 'current-password', required: true });
    const submit = h('button', { class: 'btn block', type: 'submit' }, 'Sign in');

    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        submit.disabled = true;
        submit.textContent = 'Signing in…';
        error.hidden = true;
        try {
          const s = await raw('POST', '/staff/session', { email: email.value, password: password.value });
          save({ staffToken: s.staffToken, expiresAt: s.expiresAt, user: s.user });
          route();
        } catch (err) {
          error.textContent =
            err.status === 429 ? 'Too many attempts. Wait a minute and try again.' : err.message;
          error.hidden = false;
          password.value = '';
          password.focus();
        } finally {
          submit.disabled = false;
          submit.textContent = 'Sign in';
        }
      },
    },
      error,
      h('div', { class: 'field' }, h('label', { for: 'email' }, 'E-mail'), email),
      h('div', { class: 'field' }, h('label', { for: 'password' }, 'Password'), password),
      submit,
    );

    mount(
      h('div', { class: 'signin' },
        h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 'S'), 'StudySpot Staff Console'),
        h('div', { class: 'card' },
          h('h1', {}, 'Staff sign-in'),
          h('p', { class: 'muted small' },
            'For administrators and moderators. Your session lasts 15 minutes; after that you enter your password again.'),
          form,
        ),
      ),
    );
    email.focus();
  }

  // ------------------------------------------------------------ re-auth dialog
  /** Shows the password dialog once, however many requests hit a 401 at the same time. */
  function reauthenticate() {
    if (reauthPending) return reauthPending;
    reauthPending = new Promise((resolve, reject) => {
      const error = h('div', { class: 'error', role: 'alert', hidden: true });
      const password = h('input', { id: 'reauth-password', type: 'password', autocomplete: 'current-password', required: true });
      const dialog = h('dialog', { 'aria-labelledby': 'reauth-title' });
      const finish = (ok, value) => {
        dialog.close();
        dialog.remove();
        reauthPending = null;
        ok ? resolve(value) : reject(value);
      };
      dialog.append(
        h('form', {
          onsubmit: async (e) => {
            e.preventDefault();
            try {
              const s = await raw('POST', '/staff/session', { email: session.user.email, password: password.value });
              save({ staffToken: s.staffToken, expiresAt: s.expiresAt, user: s.user });
              startTimer();
              finish(true);
            } catch (err) {
              error.textContent = err.status === 429 ? 'Too many attempts. Wait a minute and try again.' : err.message;
              error.hidden = false;
              password.value = '';
            }
          },
        },
          h('h1', { id: 'reauth-title' }, 'Session ended'),
          h('p', { class: 'muted small' }, `Enter the password for ${session.user.email} to carry on.`),
          error,
          h('div', { class: 'field' }, h('label', { for: 'reauth-password' }, 'Password'), password),
          h('div', { class: 'row' },
            h('button', { class: 'btn secondary', type: 'button', onclick: () => { signOut(false); finish(false, new ApiError(401, { message: 'Signed out.' })); } }, 'Sign out'),
            h('button', { class: 'btn', type: 'submit' }, 'Continue'),
          ),
        ),
      );
      // Escape must not leave a page without a session.
      dialog.addEventListener('cancel', (e) => e.preventDefault());
      document.body.append(dialog);
      dialog.showModal();
      password.focus();
    });
    return reauthPending;
  }

  // ------------------------------------------------------------------- layout
  function visiblePages() {
    return pages.filter((p) => !p.roles || p.roles.includes(session.user.role));
  }

  function renderLayout(page) {
    const timerEl = h('span', { class: 'timer', 'aria-live': 'off' });
    const nav = h('nav', { class: 'nav', 'aria-label': 'Staff pages' },
      visiblePages().map((p) =>
        h('a', { href: `#/${p.id}`, 'aria-current': p === page ? 'page' : false },
          p.title, p.story ? h('span', { class: 'tag' }, p.story) : null),
      ),
    );
    const main = h('main', { id: 'main' });
    mount(
      h('div', { class: 'layout' },
        h('aside', { class: 'sidebar' },
          h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 'S'), 'Staff Console'),
          nav,
        ),
        h('div', {},
          h('div', { class: 'topbar' },
            timerEl,
            h('span', {}, session.user.displayName, ' ', h('span', { class: 'role' }, session.user.role)),
            h('button', { class: 'btn secondary', type: 'button', onclick: () => signOut(true) }, 'Sign out'),
          ),
          main,
        ),
      ),
    );
    startTimer(timerEl);
    document.title = `${page.title} · StudySpot Staff Console`;
    Promise.resolve(page.render(main, context())).catch((err) => {
      main.replaceChildren(h('div', { class: 'error', role: 'alert' }, err.message || 'Something went wrong.'));
    });
  }

  function startTimer(el) {
    stopTimer();
    const target = el || document.querySelector('.timer');
    if (!target || !session) return;
    const tick = () => {
      const left = Math.max(0, Math.round((new Date(session.expiresAt).getTime() - Date.now()) / 1000));
      const m = Math.floor(left / 60);
      const s = String(left % 60).padStart(2, '0');
      target.textContent = left > 0 ? `Session ends in ${m}:${s}` : 'Session ended';
      target.classList.toggle('low', left <= 120);
      // Ask for the password as soon as the session ends, not at the next click.
      if (left === 0) {
        stopTimer();
        reauthenticate().then(() => startTimer(target), () => {});
      }
    };
    tick();
    timer = setInterval(tick, 1000);
  }
  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  async function signOut(tellServer) {
    if (tellServer && session) {
      try {
        await raw('DELETE', '/staff/session', undefined, session.staffToken);
      } catch {
        /* the token is forgotten either way */
      }
    }
    save(null);
    location.hash = '';
    renderSignIn();
  }

  function mount(node) {
    document.getElementById('app').replaceChildren(node);
  }

  /** What every page receives. */
  function context() {
    return { api, h, user: session.user, formatDateTime, ApiError };
  }

  function route() {
    if (!session) return renderSignIn();
    const list = visiblePages();
    if (!list.length) return renderSignIn('Your role has no pages yet.');
    const id = location.hash.replace(/^#\/?/, '');
    const page = list.find((p) => p.id === id) || list[0];
    if (page.id !== id) history.replaceState(null, '', `#/${page.id}`);
    renderLayout(page);
  }

  // ------------------------------------------------------------------- public
  window.StaffConsole = {
    /**
     * Add a page: { id, title, story, roles: ['admin'] | ['admin','moderator'],
     * render(container, { api, h, user, formatDateTime }) }.
     */
    registerPage(page) {
      pages.push(page);
    },
    h,
    async start() {
      window.addEventListener('hashchange', route);
      // A session restored from this tab may have ended: check it before showing pages.
      if (session) {
        try {
          const me = await raw('GET', '/staff/session', undefined, session.staffToken);
          save({ ...session, user: { id: me.id, email: me.email, displayName: me.displayName, role: me.role } });
        } catch (err) {
          if (err.status === 401) {
            mount(h('div', { class: 'signin' }));
            try {
              await reauthenticate();
            } catch {
              return; // signed out from the dialog
            }
          } else {
            save(null);
          }
        }
      }
      route();
    },
  };
})();
