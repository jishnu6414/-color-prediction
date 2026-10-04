(() => {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const ICON = {
    game: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1"/><circle cx="15.5" cy="15.5" r="1"/><circle cx="12" cy="12" r="1"/>',
    wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3"/><path d="M21 9h-4a2 2 0 0 0 0 4h4z"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    sliders: '<path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10M20 18h0"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/>',
    check: '<path d="M5 13l4 4L19 7"/>',
    crown: '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>'
  };
  const icon = (n, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n] || ''}</svg>`;

  // Storage that never throws; falls back to memory
  const mem = {};
  const Store = {
    get(k, d) { try { const v = localStorage.getItem('cg_' + k); if (v === null) return k in mem ? mem[k] : d; return JSON.parse(v); } catch (e) { return k in mem ? mem[k] : d; } },
    set(k, v) { mem[k] = v; try { localStorage.setItem('cg_' + k, JSON.stringify(v)); } catch (e) {} }
  };

  const DEF = { sound: true, anim: true, resultAnim: true, haptics: true, compact: false };
  const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const S = {
    get(k) { const v = Store.get('settings', {}); return v && typeof v[k] === 'boolean' ? v[k] : DEF[k]; },
    set(k, val) { const v = Store.get('settings', {}); Store.set('settings', { ...(v && typeof v === 'object' ? v : {}), [k]: !!val }); S.apply(); },
    anim() { return S.get('anim') && !reduced(); },
    apply() { const h = document.documentElement; h.classList.toggle('no-anim', !S.anim()); h.classList.toggle('compact', S.get('compact')); }
  };
  S.apply();

  const haptic = p => { if (S.get('haptics') && navigator.vibrate) { try { navigator.vibrate(p); } catch (e) {} } };

  // Toasts
  function toast(msg, type = 'info', ms = 3600) {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.textContent = msg;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => { el.classList.remove('in'); el.classList.add('out'); setTimeout(() => el.remove(), 350); }, ms);
  }

  // Smooth number counting
  function countTo(el, from, to, ms = 800) {
    if (!S.anim() || from === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const step = t => {
      const p = Math.min(1, (t - t0) / ms);
      el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // API helper: friendly errors, redirect on logout
  async function api(url, opts = {}) {
    const o = { credentials: 'same-origin', ...opts };
    if (o.body && typeof o.body !== 'string') { o.body = JSON.stringify(o.body); o.headers = { 'Content-Type': 'application/json', ...(o.headers || {}) }; }
    let res;
    try { res = await fetch(url, o); } catch (e) { console.error('Network error', url, e); throw new Error('Connection problem. Please try again.'); }
    if (res.status === 401) { location.href = '/login.html'; throw new Error('Please log in'); }
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok || data.error) { console.error('API error', url, res.status, data); const err = new Error(data.error || 'Something went wrong. Please try again.'); err.status = res.status; throw err; }
    return data;
  }

  let mePromise;
  const me = () => mePromise || (mePromise = api('/api/auth/me'));

  // Sound (optional, controlled by settings)
  const audio = {};
  const aud = n => audio[n] || (audio[n] = Object.assign(new Audio('/' + n + '.mp3'), { preload: 'auto' }));
  const sound = {
    unlock() { ['win', 'fail', 'click'].forEach(n => { const a = aud(n); a.muted = true; const p = a.play(); if (p) p.then(() => { a.pause(); a.currentTime = 0; a.muted = false; }).catch(() => { a.muted = false; }); }); },
    play(n) { if (!S.get('sound')) return; try { const a = aud(n); a.muted = false; a.currentTime = 0; const p = a.play(); if (p) p.catch(() => {}); } catch (e) {} },
    loop(n, on) { try { const a = aud(n); if (on) { if (!S.get('sound')) return; a.loop = true; a.currentTime = 0; const p = a.play(); if (p) p.catch(() => {}); } else { a.pause(); a.currentTime = 0; a.loop = false; } } catch (e) {} }
  };

  // Empty and error states
  const errorState = (box, retry) => {
    box.innerHTML = '<div class="state card"><div class="big">⚠️</div><h2>Something went wrong</h2><p>We couldn’t load this section.</p><button class="btn btn-gold" type="button">TRY AGAIN</button></div>';
    box.querySelector('button').onclick = retry;
  };
  const emptyState = (box, o) => {
    box.innerHTML = `<div class="state"><div class="big">${esc(o.icon)}</div><h2>${esc(o.title)}</h2><p>${esc(o.text)}</p>${o.href ? `<a class="btn btn-gold" href="${esc(o.href)}">${esc(o.cta)}</a>` : ''}</div>`;
  };

  // Navigation
  const NAV = [['game', '/', 'Game', 'Game', 'game'], ['wallet', '/deposit.html', 'Wallet', 'Wallet', 'wallet'], ['history', '/history.html', 'History', 'History', 'history'], ['ranking', '/leaderboard.html', 'Leaderboard', 'Ranking', 'trophy'], ['profile', '/profile.html', 'Profile', 'Profile', 'user']];

  function build() {
    const page = document.body.dataset.page || '';
    const bg = document.createElement('div');
    bg.className = 'bg'; bg.setAttribute('aria-hidden', 'true');
    bg.innerHTML = '<i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i>';
    for (let i = 0; i < 22; i++) {
      const p = document.createElement('i'), z = 1 + Math.random() * 2.5;
      p.className = 'particle';
      p.style.cssText = `left:${Math.random() * 100}%;bottom:-10px;width:${z}px;height:${z}px;animation-duration:${28 + Math.random() * 40}s;animation-delay:-${Math.random() * 50}s`;
      bg.appendChild(p);
    }
    const links = NAV.map(n => `<a href="${n[1]}" class="${n[0] === page ? 'active' : ''}" ${n[0] === page ? 'aria-current="page"' : ''}>${icon(n[4], 18)}${n[2]}</a>`).join('');
    const mlinks = NAV.map(n => `<a href="${n[1]}" class="${n[0] === page ? 'active' : ''}" ${n[0] === page ? 'aria-current="page"' : ''}>${icon(n[4], 22)}<span>${n[3]}</span></a>`).join('');
    const header = document.createElement('header');
    header.className = 'topbar';
    header.innerHTML = `
      <a class="logo" href="/" aria-label="Color Game home"><span class="logo-mark" aria-hidden="true">🪙</span><span>COLOR<em>GAME</em></span><span class="tag demo-tag">DEMO</span></a>
      <nav class="nav-links" aria-label="Main"><span class="nav-ind" aria-hidden="true"></span>${links}</nav>
      <div class="top-right">
        <a class="icon-btn" id="adminLink" href="/admin.html" aria-label="Admin panel" title="Admin" hidden>${icon('crown')}</a>
        <a class="chip" href="/profile.html" aria-label="Your profile"><span class="avatar" id="avatar">?</span><span class="uname" id="uname">…</span></a>
        <a class="icon-btn" href="/settings.html" aria-label="Settings" title="Settings">${icon('sliders')}</a>
        <button class="icon-btn logout" id="logoutBtn" type="button" aria-label="Log out">${icon('logout')}<span>Logout</span></button>
      </div>`;
    const mnav = document.createElement('nav');
    mnav.className = 'mnav'; mnav.setAttribute('aria-label', 'Mobile');
    mnav.innerHTML = mlinks;
    document.body.prepend(bg, header);
    document.body.appendChild(mnav);

    document.getElementById('logoutBtn').onclick = async () => {
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
      location.href = '/login.html';
    };

    // sliding active indicator
    const ind = header.querySelector('.nav-ind'), act = header.querySelector('.nav-links a.active');
    const place = animate => {
      if (!act) { ind.style.opacity = 0; return; }
      let from = null;
      if (animate) { try { from = JSON.parse(sessionStorage.getItem('cg_ind')); } catch (e) {} }
      const to = { x: act.offsetLeft, w: act.offsetWidth };
      if (from) { ind.style.transition = 'none'; ind.style.width = from.w + 'px'; ind.style.transform = `translateX(${from.x}px)`; ind.getBoundingClientRect(); ind.style.transition = ''; }
      requestAnimationFrame(() => { ind.style.width = to.w + 'px'; ind.style.transform = `translateX(${to.x}px)`; });
      try { sessionStorage.setItem('cg_ind', JSON.stringify(to)); } catch (e) {}
    };
    place(true);
    window.addEventListener('load', () => place(false));
    window.addEventListener('resize', () => place(false));

    me().then(u => {
      document.getElementById('uname').textContent = u.username;
      document.getElementById('avatar').textContent = String(u.username || '?').charAt(0).toUpperCase();
      if (u.isAdmin) document.getElementById('adminLink').hidden = false;
    }).catch(() => {});
  }

  window.Shell = { S, Store, toast, countTo, fmt, api, me, sound, haptic, esc, icon, errorState, emptyState };
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();