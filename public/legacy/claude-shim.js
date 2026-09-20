// Adapter that gives the tracker UI the small `window.claude` surface it was written against
// (claude.use('db'), claude.use('sample')), backed by this app's own API instead of the
// claude.ai artifact runtime. Every call is same-origin and cookie-authenticated.
(function () {
  'use strict';
  var HEADERS = { 'content-type': 'application/json', 'x-requested-with': 'costs-tracker' };
  var POLL_MS = 30000;

  function fail(status, body) {
    var e = (body && body.error) || {};
    if (status === 401) { location.href = '/login'; }
    if (status === 403 && e.code === 'pending') { location.href = '/pending'; }
    var err = new Error(e.message || ('Request failed (' + status + ')'));
    err.code = e.code || 'http_' + status;
    return err;
  }

  async function api(method, path, body, signal) {
    var res;
    try {
      res = await fetch(path, { method: method, headers: HEADERS, credentials: 'same-origin', signal: signal,
        body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) {
      if (e && e.name === 'AbortError') { var c = new Error('cancelled'); c.code = 'cancelled'; throw c; }
      var n = new Error('Network error'); n.code = 'network'; throw n;
    }
    var data = null;
    try { data = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) throw fail(res.status, data);
    return data;
  }
  window.__ctApi = api;

  // ---------- db ----------
  var listeners = {}; // collection -> [{cb, err}]
  var cache = {};     // collection -> last docs

  function snapshotOf(docs) {
    return { docs: docs.map(function (d) { return { id: d.id, data: function () { return d.data; } }; }), size: docs.length, empty: docs.length === 0 };
  }
  async function refresh(name) {
    var subs = listeners[name] || [];
    if (!subs.length) return;
    try {
      var r = await api('GET', '/api/db/' + encodeURIComponent(name));
      cache[name] = r.docs;
      subs.slice().forEach(function (s) { try { s.cb(snapshotOf(r.docs)); } catch (e) { console.error(e); } });
    } catch (e) {
      subs.slice().forEach(function (s) { if (s.err) try { s.err(e); } catch (x) { console.error(x); } });
    }
  }
  setInterval(function () { if (document.visibilityState === 'visible') Object.keys(listeners).forEach(refresh); }, POLL_MS);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') Object.keys(listeners).forEach(refresh); });

  var db = {
    collection: function (name) {
      return {
        add: async function (data) { var r = await api('POST', '/api/db/' + encodeURIComponent(name), data); await refresh(name); return { id: r.id }; },
        onSnapshot: function (cb, err) {
          var sub = { cb: cb, err: err };
          (listeners[name] = listeners[name] || []).push(sub);
          if (cache[name]) { var docs = cache[name]; Promise.resolve().then(function () { cb(snapshotOf(docs)); }); }
          refresh(name);
          return function () { listeners[name] = (listeners[name] || []).filter(function (s) { return s !== sub; }); };
        },
      };
    },
    doc: function (path) {
      var i = path.indexOf('/'); var name = path.slice(0, i), id = path.slice(i + 1);
      var url = '/api/db/' + encodeURIComponent(name) + '/' + encodeURIComponent(id);
      return {
        set: async function (data) { await api('PUT', url, data); await refresh(name); },
        delete: async function () { await api('DELETE', url); await refresh(name); },
      };
    },
  };

  // ---------- sample (document reading; nothing is stored server-side) ----------
  var LIMITS = { maxPromptBytes: 65536, images: { mediaTypes: ['image/jpeg', 'image/png', 'image/webp'], maxCount: 6, maxInputBytes: 20 * 1048576 } };

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { var s = String(r.result); resolve(s.slice(s.indexOf(',') + 1)); };
      r.onerror = function () { reject(new Error('read failed')); };
      r.readAsDataURL(blob);
    });
  }
  async function sample(input, opts) {
    opts = opts || {};
    if (typeof input !== 'string') { var e = new Error('string input only'); e.code = 'bad_input'; throw e; }
    var images = [];
    for (var i = 0; i < (opts.images || []).length; i++) {
      var b = opts.images[i];
      images.push({ mediaType: b.type || 'image/jpeg', data: await blobToBase64(b) });
    }
    var r = await api('POST', '/api/read-document', { prompt: input, images: images }, opts.signal);
    return { text: r.text, truncated: false };
  }
  sample.json = async function (input, opts) {
    var r = await sample(input, opts);
    var t = r.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { return JSON.parse(t); } catch (e) {
      var m = t.match(/[\[{][\s\S]*[\]}]/);
      if (m) { try { return JSON.parse(m[0]); } catch (x) { /* fall through */ } }
      var err = new Error('Claude did not return valid JSON'); err.code = 'bad_output'; throw err;
    }
  };
  sample.limits = async function () { return LIMITS; };

  window.claude = { use: async function (name) { return name === 'db' ? db : name === 'sample' ? sample : null; } };

  // ---------- account bar ----------
  document.addEventListener('DOMContentLoaded', async function () {
    var me; try { me = await api('GET', '/api/me'); } catch (e) { return; }
    var bar = document.createElement('div'); bar.className = 'ct-shell';
    var who = document.createElement('span'); who.className = 'ct-who'; who.textContent = me.email; bar.appendChild(who);
    function btn(label, fn) { var b = document.createElement('button'); b.type = 'button'; b.className = 'ct-btn'; b.textContent = label; b.addEventListener('click', fn); bar.appendChild(b); return b; }
    if (me.isAdmin) btn('Approve users', openAdmin);
    var del = btn('Delete all my data', function () {
      if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Click again to permanently delete'; setTimeout(function () { del.dataset.armed = ''; del.textContent = 'Delete all my data'; }, 5000); return; }
      api('DELETE', '/api/me').then(function () { return fetch('/auth/signout', { method: 'POST', headers: HEADERS, credentials: 'same-origin' }); }).then(function () { location.href = '/login'; });
    });
    btn('Sign out', function () { fetch('/auth/signout', { method: 'POST', headers: HEADERS, credentials: 'same-origin' }).then(function () { location.href = '/login'; }); });
    document.body.insertBefore(bar, document.body.firstChild);

    async function openAdmin() {
      var r = await api('GET', '/api/admin/users');
      var dlg = document.createElement('dialog'); dlg.className = 'ct-dialog';
      var h = document.createElement('h2'); h.textContent = 'Users'; dlg.appendChild(h);
      r.users.forEach(function (u) {
        var row = document.createElement('div'); row.className = 'ct-row';
        var t = document.createElement('span'); t.textContent = u.email + ' · ' + u.status; row.appendChild(t);
        ['approve', 'block'].forEach(function (act) {
          var b = document.createElement('button'); b.type = 'button'; b.className = 'ct-btn'; b.textContent = act === 'approve' ? 'Approve' : 'Block';
          b.addEventListener('click', async function () { await api('POST', '/api/admin/users/' + encodeURIComponent(u.id) + '/' + act); t.textContent = u.email + ' · ' + (act === 'approve' ? 'approved' : 'blocked'); });
          row.appendChild(b);
        });
        dlg.appendChild(row);
      });
      var close = document.createElement('button'); close.type = 'button'; close.className = 'ct-btn'; close.textContent = 'Close';
      close.addEventListener('click', function () { dlg.close(); dlg.remove(); }); dlg.appendChild(close);
      document.body.appendChild(dlg); dlg.showModal();
    }
  });
})();
