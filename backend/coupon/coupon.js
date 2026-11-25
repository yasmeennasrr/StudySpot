'use strict';
/*
 * PB-27: the e-mail "Activate" link page (RWD-017..RWD-020). The token is read from the
 * #fragment, which the browser never sends to any server or log. Opening the page only
 * reads the coupon (GET), so a mail scanner that opens links can never start the timer;
 * the student starts it with two taps. The countdown is the server's expiresAt.
 */
(function () {
  var API = '/api/v1/coupons/by-token/';
  var token = new URLSearchParams(location.hash.replace(/^#/, '')).get('t') || '';
  var timer = null;
  var $ = function (id) { return document.getElementById(id); };

  function show(id) {
    ['loading', 'error', 'coupon'].forEach(function (s) { $(s).hidden = s !== id; });
  }
  function fail(text) { $('error-text').textContent = text; show('error'); }
  function time(iso) { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

  function request(method, path) {
    return fetch(API + encodeURIComponent(token) + path, { method: method, headers: { Accept: 'application/json' } })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) { return { ok: res.ok, body: body }; });
      });
  }

  function render(c) {
    if (timer) { clearInterval(timer); timer = null; }
    $('reward').textContent = c.reward;
    $('venue').textContent = 'at ' + c.venueName;
    $('code').textContent = c.code;
    $('issued').hidden = c.status !== 'issued';
    $('active').hidden = c.status !== 'active';
    $('expired').hidden = c.status !== 'expired';
    var chip = $('status-chip');
    chip.className = 'chip ' + c.status;
    chip.textContent = { issued: 'Ready to use', active: 'Active', expired: 'Expired' }[c.status];
    if (c.status === 'expired') {
      $('expired-detail').textContent = c.activatedAt ? 'Activated at ' + time(c.activatedAt) + '.' : '';
    }
    if (c.status === 'active') {
      $('activated-at').textContent = time(c.activatedAt);
      var end = new Date(c.expiresAt).getTime();
      var total = end - new Date(c.activatedAt).getTime();
      var tick = function () {
        var left = Math.max(0, end - Date.now());
        var s = Math.ceil(left / 1000);
        $('countdown').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
        $('bar-fill').style.width = (100 * left / total) + '%';
        $('clock').textContent = new Date().toLocaleTimeString();
        if (left <= 0) render(Object.assign({}, c, { status: 'expired' }));
      };
      tick();
      timer = setInterval(tick, 1000);
    }
    show('coupon');
  }

  function activate() {
    $('confirm-yes').disabled = true;
    $('action-error').hidden = true;
    request('POST', '/activate').then(function (r) {
      $('confirm-yes').disabled = false;
      $('confirm').hidden = true;
      $('activate').hidden = false;
      if (r.ok) return render(r.body);
      if (r.body && r.body.details && r.body.details.coupon) return render(r.body.details.coupon);
      $('action-error').textContent = (r.body && r.body.message) || 'Could not activate. Check your connection and try again.';
      $('action-error').hidden = false;
    }).catch(function () {
      $('confirm-yes').disabled = false;
      $('action-error').textContent = 'No connection. Check your internet and try again.';
      $('action-error').hidden = false;
    });
  }

  // A different link opened in the same tab: start again with the new token.
  window.addEventListener('hashchange', function () { location.reload(); });

  $('activate').addEventListener('click', function () { $('confirm').hidden = false; $('activate').hidden = true; });
  $('confirm-no').addEventListener('click', function () { $('confirm').hidden = true; $('activate').hidden = false; });
  $('confirm-yes').addEventListener('click', activate);

  if (!/^[A-Za-z0-9_-]{22}$/.test(token)) {
    fail('This link is incomplete. Open the coupon from the StudySpot app instead (Rewards > My coupons).');
    return;
  }
  request('GET', '').then(function (r) {
    if (r.ok) render(r.body);
    else fail((r.body && r.body.message) || 'Open the coupon from the StudySpot app instead.');
  }).catch(function () { fail('No connection. Check your internet and open the link again.'); });
})();
