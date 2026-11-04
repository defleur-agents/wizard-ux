/* One responsive Settings feature surface. Register once: both shells render and dispatch it.
 * Shell adapters own navigation/input only; capability checks never depend on viewport width.
 * Existing outbox/recording stores remain the sole owners of durable user content. */
(() => {
  'use strict';
  const features = new Map(), mounts = new Set();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const native = () => window.WizardOSNative;
  const android = () => !!native() || /Android/i.test(navigator.userAgent);
  const shell = () => !native() && /WizardShell\//.test(navigator.userAgent || '');
  const shellOrb = () => shell() && window.WosDeviceOrb?.ready ? window.WosDeviceOrb : null;
  // Rows are plain lines split by hairlines: no boxes, no icon tiles; a second line only when it says something.
  const row = (id, title, sub) => `<button class="st-row wz-row" data-st="${esc(id)}"><span class="st-tx"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="st-go">›</span></button>`;
  // System pages are filled by packages (WosSettings.register with page = one of these); a page with nothing on it hides.
  const filled = id => () => [...features.values()].some(f => f.page === id && (!f.available || f.available()));
  const PAGES = [
    { id: 'overview', title: 'Your network', group: 'System', available: filled('overview') },
    { id: 'ai', title: 'AI', group: 'System', available: filled('ai') },
    { id: 'network', title: 'Network & security', group: 'System', available: filled('network') },
    { id: 'storage', title: 'Storage & backups', group: 'System', available: filled('storage') },
    { id: 'appearance', title: 'Appearance', group: 'Preferences' },
    { id: 'chats', title: 'Chats & app screens' },
    // Where each app's notifications go: a badge on its icon, or Chats (core/notif-bell.js routes; one place each).
    { id: 'notifications', title: 'Notifications', available: () => typeof window.WosBell?.routes === 'function' },
    { id: 'voice', title: 'Voice & typing' },
    // Phones over Tailscale (Phone Setup). Hidden on a Wizard without Phone Setup or for a non-owner.
    // Hidden only for a non-owner; a Wizard without phone access shows the shared "not available yet" note.
    { id: 'phones', title: 'Phones & devices', available: phonesAvailable },
    { id: 'phone', title: 'Phone', available: () => shell() ? !!shellOrb() : android() },
    // Connections: the App Manager's own view (agents, what each may use, app-to-app links), only where its owner
    // listener answers. System pieces that come with every box live in Settings, not the launcher (wizard-os issue 324).
    // pending: availability not known yet; a deep link to it waits for the answer instead of falling back to the root.
    { id: 'connections', title: 'Connections', available: () => connectionsAvailable(), pending: () => conn.ok === null },
    { id: 'recovery', title: 'Unsent & recovered' },
    // Resources: the Home resource bars (AI + Compute) from the shared renderer, when it is there; else AI usage.
    // Kept beside the System pages: it is the only place with service health and the manual refresh.
    { id: 'usage', get title() { return window.WosResources?.bars ? 'Resources' : 'AI usage'; } },
    { id: 'schedules', title: 'Schedules', available: () => !!window.WosSchedules?.available },
    { id: 'about', title: 'About & updates' },
  ];
  const featurePages = { look: 'appearance', 'window-glass': 'appearance', 'skin-frame': 'appearance', 'chats-default': 'chats', 'own-views': 'chats', voice: 'voice', microphone: 'voice', selection: 'voice', assistant: 'phone', unsent: 'recovery', cancelled: 'recovery', usage: 'usage' };
  const pageOf = f => f?.page != null ? PAGES.some(p => p.id === f.page) ? f.page : 'about' : featurePages[f?.id] || 'about';
  /* Connections is served by the App Manager behind its owner channel, on this origin; the page hosts it as is, so
   * its owner-only actions (Disconnect, Reconnect, agent access, Restore defaults) stay the App Manager's own. The tab
   * shows only once that listener answers this device (a non-owner, or a box without it, never sees an empty tab). */
  // Beside the shell's own pages (/wizard-os-home/), like the Store's install routes.
  const CONNECTIONS = (() => { try { return new URL('store-install/_connections/', document.baseURI || location.href).pathname; } catch (_) { return '/wizard-os-home/store-install/_connections/'; } })();
  const conn = { ok: null, at: 0, busy: false };
  function connectionsAvailable() {
    if (!conn.busy && Date.now() - conn.at > (conn.ok ? 300000 : 60000) && typeof fetch === 'function') {
      conn.busy = true;
      fetch(CONNECTIONS, { credentials: 'same-origin', cache: 'no-store' }).then(r => r.ok, () => conn.ok).then(ok => {
        const was = conn.ok; conn.ok = ok === true; conn.at = Date.now(); conn.busy = false;
        if (was !== conn.ok) for (const m of mounts) m.render();
      });
    }
    return conn.ok === true;
  }
  const chatsHost = () => window.WizChatsHost;
  const chatsName = id => id === 'wizard-chats' ? 'Wizard Chats' : chatsHost()?.installed().find(a => a.id === id)?.name || id;
  const recovered = () => window.WosCancelled?.list?.() || [];
  function attention(ctx) {
    const items = [], n = unsentAll(ctx).length, r = recovered().length;
    if (n) items.push({ title: `${n} ${n === 1 ? 'message' : 'messages'} not sent`, feature: 'unsent' });
    if (r) items.push({ title: `${r} ${r === 1 ? 'recording' : 'recordings'} to recover`, feature: 'cancelled' });
    // Updates never appear here: the update card at the top of Settings says it once.
    if (window.WizCore.voiceStatus?.state?.ready === false) items.push({ title: 'Voice unavailable', feature: 'voice' });
    if (ctx.live?.error === 'access') items.push({ title: 'Sign-in needed', feature: 'wizard' });
    // Whatever the notification routing part puts on the Settings cog (stock: nothing) opens Notifications.
    const at = window.WosBell?.attention?.();
    if (at?.n) items.push({ title: `${at.n} ${at.label}`, feature: 'notification-routing' });
    return items;
  }
  // A quiet value on the right of a row, only where it tells you something at a glance; '' otherwise.
  function subtitle(id, ctx) {
    if (id === 'phones') { const pc = phones(), v = pc?.view; if (!v) return ''; if (pc.lost) return 'Can’t check'; const n = v.phones.length; return pc.on ? (n ? `${n} ${n === 1 ? 'device' : 'devices'}` : 'On') : pc.settingUp ? 'Setting up' : v.step === 'off' ? 'Off' : ''; }
    if (id === 'appearance') return window.WosSkin ? (mySkinWorn() ? window.WosMySkin.active.name + ' · ' : '') + lookName(window.WosSkin, window.WosSkin.current) : '';
    if (id === 'phone') { if (shell()) return shellOrb()?.state.on ? 'Everywhere on' : ''; try { return JSON.parse(native()?.everywhere?.() || '{}').enabled ? 'Everywhere on' : ''; } catch (_) { return ''; } }
    if (id === 'recovery') { const n = new Set([...unsentAll(ctx), ...recovered()].map(x => x.id)).size; return n ? String(n) : ''; }
    // Resources: quiet unless something is running low (under a quarter left), then the lowest one.
    const own = [...features.values()].find(f => f.page === id && typeof f.subtitle === 'function');
    if (own) { try { return String(own.subtitle() || '').slice(0, 40); } catch (_) { return ''; } }
    if (id === 'usage') { const low = window.WosResources?.lowest?.(); return low && low.left < 25 ? `${low.label} ${low.value || (100 - low.left) + '% used'}` : ''; }
    return '';
  }
  // The update card (os-updates.js) sits above the list, same look in every state; nothing to do = nothing shown.
  function cardHtml() {
    const h = window.WosUpdates?.cardHtml?.(); if (!h) return '';
    return `<section class="st-card-wrap" data-settings-feature="updates">${h}</section>`;
  }
  function register(feature) {
    if (!feature.id || features.has(feature.id) || typeof feature.html !== 'function') throw new Error('Settings feature requires a unique id and html');
    features.set(feature.id, feature);
    for (const m of mounts) m.render();
    return () => { features.delete(feature.id); for (const m of mounts) m.render(); };
  }
  function unsentAll(ctx) {
    let nat = []; try { nat = JSON.parse(native()?.unsent?.() || '[]'); } catch (_) {}
    return [...(ctx.outbox?.unsent() || []).map(it => ({ ...it, origin: 'app' })), ...nat.map(it => ({ ...it, origin: 'everywhere' }))].sort((a, b) => a.createdAt - b.createdAt);
  }
  function unsentRow(it, ctx) {
    const when = ctx.ago?.(new Date(it.createdAt).toISOString()) || '';
    const blocked = it.state === 'unconfirmed' || ctx.outbox?.quarantined?.(it.id);
    const held = it.state === 'held', audio = !!(it.audio || it.audioFile || it.hasAudio);
    const st = blocked ? esc(ctx.outbox?.quarantined?.(it.id) ? 'Waiting for device storage verification' : it.error || 'Could not confirm delivery · original kept') : it.state === 'empty' ? 'No speech detected · recording kept' : held ? esc(it.error || 'Kept on this device · no delivery intent confirmed; not queued') : it.state === 'failed' ? `<b class="fail">Not sent</b> · ${esc(it.error || '')}` : ['sending', 'queued'].includes(it.state) ? 'Queued / sending · awaiting receipt' : esc(window.WizReach?.label?.('send') || 'Reconnecting…');
    const src = it.origin === 'everywhere' ? 'Everywhere button' : it.source === 'orb' ? 'Orb' : 'Chat';
    const canRetry = it.origin === 'app' ? ctx.outbox?.canRetry(it) : !blocked && ['failed', 'waiting'].includes(it.state);
    const transcript = it.recoveryText || it.text || '';
    const recovery = it.origin === 'app' && it.audio && ['held', 'empty', 'failed', 'unconfirmed'].includes(it.state);
    const working = ctx.outbox?.transcribingRecording?.(it.id);
    return `<div class="ub-row ${esc(it.state)}" data-ubid="${esc(it.id)}" data-uborigin="${it.origin}"><div class="ub-t"><span>${esc(transcript || it.typed || (audio ? 'Retained voice recording' : 'Retained message'))}</span></div><div class="ub-m">${src} · ${esc(when)} · ${st}</div>${it.recoveryError ? `<div class="ub-m">${esc(it.recoveryError)}</div>` : ''}<div class="ub-a">${it.state === 'waiting' ? '<button data-ub="troubleshoot">Open Troubleshooter</button>' : ''}${it.parkedDraft && ctx.restoreReply ? '<button data-ub="restore-reply">Return to paused reply</button>' : ''}${canRetry ? `<button data-ub="retry">${it.state === 'empty' ? 'Retry speech & send' : 'Retry'}</button>` : ''}${recovery ? `<button data-ub="play">Play audio</button><button data-ub="download">Save audio</button>${!ctx.outbox?.quarantined?.(it.id) ? `<button data-ub="transcribe" ${working ? 'disabled' : ''}>${working ? 'Transcribing…' : 'Transcribe only'}</button>` : ''}` : ''}${transcript ? '<button data-ub="copy">Copy transcript</button>' : ''}${it.origin === 'app' && it.sessionId && ctx.live?.session(it.sessionId) ? '<button data-ub="open">Open thread</button>' : ''}${it.origin === 'app' && !audio && !blocked && !held && !it.body && !['sending', 'queued'].includes(it.state) ? '<button data-ub="edit">Edit</button>' : ''}<button data-ub="delete" class="ghost">Delete</button></div></div>`;
  }
  function focusUnsent(id) {
    requestAnimationFrame(() => {
      const row = [...document.querySelectorAll('[data-ubid]')].find(el => el.dataset.ubid === id && el.getClientRects().length);
      if (row) { row.scrollIntoView({ block: 'center' }); row.querySelector('button')?.focus({ preventScroll: true }); }
    });
  }
  let preview = null, previewUrl = '';
  function stopPreview() { if (preview) { preview.pause(); preview.remove(); preview = null; } if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = ''; }
  function retryAll(ctx) {
    const n = ctx.outbox?.retryAll() || 0;
    // Native retained custody has independent intent/receipt rules. Never wildcard it
    // from a web bulk action; its explicit per-item recovery remains available.
    ctx.toast?.('↻', ctx.outbox?.retryFeedback(n) || 'Nothing eligible to retry', 2400);
    setTimeout(() => ctx.render?.(), 300); return n;
  }
  function unsentAction(ctx, id, origin, action) {
    if (action === 'troubleshoot') { window.WizReach?.open(); return; }
    if (origin === 'everywhere') {
      if (action === 'retry') native()?.retryUnsent?.(id);
      if (action === 'delete') { for (const row of ctx.root?.querySelectorAll('[data-ubid]') || []) if (row.dataset.ubid === id) { const b = row.querySelector('[data-ub="delete"]'); if (b) { b.disabled = true; b.textContent = 'Deleting…'; } } native()?.deleteUnsent?.(id); }
      setTimeout(() => ctx.changed?.(), 300); return;
    }
    const it = ctx.outbox?.get(id); if (!it) return;
    if (action === 'restore-reply') { ctx.restoreReply?.(id); return; }
    if (action === 'retry') ctx.toast?.('↻', ctx.outbox.retryFeedback(ctx.outbox.retry(id)), 2400);
    if (action === 'transcribe') { ctx.outbox.transcribeRecording(id).then(() => { ctx.changed?.(); ctx.render?.(); }); return; }
    if (action === 'copy') { window.WosChat.copyText(it.recoveryText || it.text || '').then(() => ctx.toast?.('✓', 'Transcript copied · nothing sent', 2000)); return; }
    if (action === 'play' && it.audio) {
      stopPreview(); previewUrl = URL.createObjectURL(it.audio); preview = document.createElement('audio');
      preview.controls = true; preview.src = previewUrl; preview.style.maxWidth = '100%';
      const row = [...document.querySelectorAll('[data-ubid]')].find(el => el.dataset.ubid === id && el.getClientRects().length);
      row?.appendChild(preview); preview.onended = stopPreview;
      preview.play().catch(() => ctx.toast?.('!', 'Could not play this format · Save audio instead', 2400)); return;
    }
    if (action === 'download' && it.audio) {
      const url = URL.createObjectURL(it.audio), a = document.createElement('a');
      const ext = /aac/.test(it.audioType) ? 'aac' : /mp4|m4a/.test(it.audioType) ? 'm4a' : /wav/.test(it.audioType) ? 'wav' : /ogg/.test(it.audioType) ? 'ogg' : 'webm';
      a.href = url; a.download = `wizard-recording-${id}.${ext}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); return;
    }
    if (action === 'delete') {
      // Custody deletes must be durable before losing the original; acknowledge the tap now.
      const buttons = [...(ctx.root?.querySelectorAll('[data-ubid]') || [])].filter(row => row.dataset.ubid === id).map(row => row.querySelector('[data-ub="delete"]')).filter(Boolean);
      for (const b of buttons) { if (b.disabled) return; b.disabled = true; b.textContent = 'Deleting…'; }
      Promise.resolve(ctx.outbox.remove(id)).then(ok => { ctx.render?.(); ctx.toast?.(ok === false ? '!' : '✕', ok === false ? 'Could not save deletion · keep Wizard open' : 'Deleted', 2400); }, () => { for (const b of buttons) { b.disabled = false; b.textContent = 'Delete'; } ctx.toast?.('!', 'Could not save deletion · original kept', 2400); });
    }
    if (action === 'open') ctx.openThread(it.sessionId);
    // Moving an audio-bearing/in-flight record to a text composer would lose custody. Never do it.
    if (action === 'edit') {
      if (it.audio || it.audioFile || it.hasAudio || it.body || it.state === 'sending' || it.state === 'unconfirmed' || ctx.outbox.quarantined?.(id)) return ctx.toast?.('!', 'Recording or sending message kept · retry it, or open its thread', 2400);
      ctx.editUnsent(it);
    }
  }
  register({ id: 'unsent', aliases: ['unsent'], html(ctx) {
    const all = unsentAll(ctx);
    return `<div class="st-group"><h4>Unsent & retained <span>${all.length || ''}</span></h4>${all.length ? all.map(it => unsentRow(it, ctx)).join('') + (all.length > 1 ? '<button class="st-wide wz-button secondary" data-ub-all="retry">Retry all</button>' : '') : '<div class="st-empty">No messages awaiting delivery on this device.</div>'}<details class="st-info"><summary aria-label="About retained messages">?</summary><p class="st-note">Held recordings are not queued. Retry all sends eligible failed/waiting messages only; held commands and unconfirmed delivery stay kept.</p></details></div>`;
  }, act(ctx, el) {
    const b = el.closest('[data-ub]');
    if (b) { const r = b.closest('[data-ubid]'); unsentAction(ctx, r.dataset.ubid, r.dataset.uborigin, b.dataset.ub); return true; }
    if (!el.closest('[data-ub-all]')) return false;
    retryAll(ctx); return true;
  } });
  // Public kind-0 only. The signed event comes from native; no secret is handled by the page.
  const identityRelays = ['wss://relay.aiwizards.com', 'wss://nos.lol', 'wss://relay.damus.io'];
  function publishIdentityProfile(event) {
    return Promise.any(identityRelays.map(url => new Promise((resolve, reject) => {
      let socket; const timer = setTimeout(() => { socket?.close(); reject(new Error('relay timeout')); }, 8000);
      const finish = (ok, message) => { clearTimeout(timer); socket?.close(); ok ? resolve(url) : reject(new Error(message || 'relay refused')); };
      try {
        socket = new WebSocket(url);
        socket.onopen = () => socket.send(JSON.stringify(['EVENT', event]));
        socket.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (_) { return; } if (m[0] === 'OK' && m[1] === event.id) finish(m[2] === true, m[3]); };
        socket.onerror = () => finish(false, 'relay unavailable');
        socket.onclose = () => { clearTimeout(timer); reject(new Error('relay closed')); };
      } catch (e) { clearTimeout(timer); reject(e); }
    })));
  }
  let identityInfo = null, identityAsked = false;
  register({ id: 'wizard-id', page: 'phone', aliases: ['wizard-id'], available: () => !!window.wizardDevicePort,
    html(ctx) {
      if (!identityAsked) { identityAsked = true; window.WizCore?.bridge?.call('identity.info').then(info => { identityInfo = info?.npub ? info : null; (ctx?.render || ctx?.changed)?.(); }).catch(() => { identityAsked = false; }); }
      const sub = identityInfo?.npub ? `${identityInfo.name || 'Your ID'} · ${identityInfo.backed_up ? 'Backed up' : 'Not backed up'}` : 'Not set up · your signing key stays on this phone';
      return `<div class="st-group"><h4>Identity</h4>${row('wizard-id', 'Wizard ID', sub)}</div>`;
    },
    act(ctx, el) {
      if (!el.closest('[data-st="wizard-id"]')) return false;
      window.WizCore.bridge.call('identity.setup').then(async result => {
        if (result.cancelled || result.denied) return;
        identityInfo = await window.WizCore.bridge.call('identity.info');
        ctx.changed?.();
        if (result.profile_event) {
          try { await publishIdentityProfile(result.profile_event); ctx.toast?.('✓', 'Wizard ID profile published', 2200); }
          catch (_) { ctx.toast?.('!', 'ID saved on this phone · profile not published. Open Wizard ID to retry.', 4500); }
        }
      }).catch(() => ctx.toast?.('!', 'Wizard ID unavailable · update the Wizard Android app', 3000));
      return true;
    }
  });
  // Reply style belongs to each agent's own persona (SOUL.md), not to Wizard: one source, survives detach.
  register({ id: 'response-style', page: 'chats', aliases: ['response-style'],
    html() {
      return `<div class="st-group"><div class="st-row static"><span class="st-tx"><b>Reply style</b><small>Each agent keeps its own. Tell an agent how you like replies and it remembers.</small></span></div></div>`;
    },
  });
  const mySkinWorn = () => !!window.WosMySkin?.active;
  function mySkinRow(skin) {
    const M = window.WosMySkin, st = M?.state, js = st?.script;
    // A script that failed to load names its file and the reason, and stays off until the owner turns it on again.
    const jsFile = js?.file || (M.active ? 'Skins/' + M.active.id + '/skin.js' : 'skin.js');
    const jsTitle = js?.error && !js.approved ? 'Skin script off' : js?.approved ? 'Skin script on' : 'Skin script changed';
    const jsSub = js?.error && !js.approved ? `${jsFile} didn’t load: ${js.error.message}` : `${jsFile} · approval on this device`;
    const script = js?.exists && !st.off ? `<div class="st-row static my-skin-row${js.error && !js.approved ? ' failed' : ''}" data-myskin-script${js.error && !js.approved ? ' data-myskin-error' : ''}><span class="st-tx"><b>${jsTitle}</b><small>${esc(jsSub)}</small></span><span class="ms-acts">${js.approved ? '<button type="button" class="ghost" data-myskin="off">Turn off</button>' : `<button type="button" data-myskin="on" data-myskin-hash="${esc(js.sha256 || '')}" ${js.valid ? '' : 'disabled'}>Turn on</button>`}</span></div>` : '';
    return `<div class="ms-panel" data-ownskin-panel><button class="st-row wz-row" data-myskin="edit"><span class="st-tx"><b>Edit with your Wizard</b><small>Ask your Wizard ‘change my ${esc(skin.name)} skin so…’</small></span><span class="st-go">›</span></button><p class="st-hint">${M.storage === 'box' ? 'Saved on your Wizard.' : M.storage === 'local' ? 'Saved on this device until your Wizard is updated.' : 'Offline · showing a cached skin.'}</p>${script}<button class="st-row wz-row" data-ownskin-remove="${esc(skin.id)}"><span class="st-tx"><b>Remove skin</b></span><span class="st-go">›</span></button></div>`;
  }
  function mySkinAction(ctx, what, event) {
    const M = window.WosMySkin; if (!M) return;
    if (what === 'on') { M.turnOn(event); return; }
    if (what === 'off') { M.turnOff(); return; }
    if (what === 'edit') {
      const app = ['wizard-files', 'files'].find(id => window.WizCanOpen?.(id));
      // Open the registered app, not a guessed folder URL or an app id absent on this box.
      const opened = app && window.WizOpenApp?.(app);
      if (!opened) ctx.toast?.('✎', esc(`Ask your Wizard: “change my ${M.active?.name || 'own'} skin so…”`), 4000);
    }
  }
  // Settings › Look: choose a skin family, then one of its colours. Tweaks stay independent.
  const lookName = (S, id) => S.list.find(k => k.id === id)?.name || '';
  // Skin picker: a grid of small preview cards, one per look, in the skins' own order. Each card is a miniature of
  // that look (its background, a reply and a sent bubble, the dock with its orb) drawn in CSS from its own tokens, with
  // the name set in its own face. Names stay hidden until those faces load (at most 2.5s), so they never flash.
  let facesP = null, facesReady = false;
  const faceCss = f => f ? `font-family:${f.family};font-weight:${f.weight || 400};font-style:${f.style || 'normal'}` : '';
  function loadFaces() {
    if (facesP) return facesP;
    const L = window.WosSkin?.list || [], F = typeof document !== 'undefined' && document.fonts;
    if (!F || !F.load) { facesReady = true; return (facesP = Promise.resolve()); }
    const all = Promise.all(L.filter(k => k.face).map(k => F.load(`${k.face.style || 'normal'} ${k.face.weight || 400} 15px ${k.face.family}`).catch(() => null)));
    facesP = Promise.race([all, new Promise(r => setTimeout(r, 2500))]).then(() => {
      facesReady = true;
      for (const m of mounts) m.context?.root?.querySelectorAll?.('.skp-wait').forEach(n => n.classList.remove('skp-wait'));
    });
    return facesP;
  }
  const pvars = k => { const t = k.t || {}; return [['bg', t.bg || k.bg], ['ink', t.ink], ['ac', t.violet || k.accent], ['ac2', t['violet-2']], ['pk', t.pink], ['cy', t.cyan], ['dock', t['sk-dock']], ['dl', t['sk-dock-line']]]
    .filter(([, v]) => v).map(([n, v]) => `--p-${n}:${esc(v)}`).join(';'); };
  const mini = k => `<span class="skp-mini" data-skp="${esc(k.id)}" style="${pvars(k)}" aria-hidden="true"><i class="skp-a"></i><i class="skp-a skp-a2"></i><i class="skp-u"></i><i class="skp-dock"><i class="skp-orb"></i></i></span>`;
  const skinCard = (k, cur) => `<button type="button" class="skp-card" data-skinpick="${esc(k.id)}" aria-pressed="${k.id === cur}" aria-label="${esc(k.name)}">${mini(k)}<span class="skp-nm" style="${esc(faceCss(k.face))}">${esc(k.name)}</span></button>`;
  /* Tweaks are separate from color: a row of published sets to start from (Standard, Miguel's, …), then one
   * disclosure with every installed tweak as a switch. Picking a set clears the per-tweak choices. */
  const tweakSwitches = (items, attr, busy = false, by = null) => items.map(t => `<button type="button" class="st-row tw-row" ${attr}="${esc(t.id)}" role="switch" aria-checked="${!!t.on}"${busy ? ' disabled' : ''}><span class="st-tx"><b>${esc(t.name)}</b>${by ? `<small class="tw-by">${t.where ? esc(t.where) + ' · ' : ''}by ${esc(by(t.author))}</small>` : ''}${t.description ? `<small>${esc(t.description)}</small>` : ''}</span><span class="sw ${t.on ? 'on' : ''}" aria-hidden="true"><i></i></span></button>`).join('');
  function tweakRows(S) {
    const E = window.WosExperience; if (!E) return '';
    const s = E.state, own = window.WosMySkin?.active;
    if (!s.tweaks.length && !s.error) return '';
    if (!authorList) E.authors?.().then(list => { authorList = list; for (const m of mounts) m.render(); }, () => {});
    const name = who => (authorList || []).find(a => a.id === who)?.name || who;
    // Release-wide features are ordinary settings on their own pages (settingRow below), never tweaks.
    const exp = s.tweaks.filter(t => !t.builtin);
    // Views are chosen per type of device (desktop / phone): only the ones this one can wear, marked as such.
    const where = s.shell === 'desktop' ? 'Desktop view' : 'Phone view';
    const shown = exp.filter(t => !t.view || !Array.isArray(t.shells) || t.shells.includes(s.shell)).map(t => t.view && s.shell ? { ...t, where } : t);
    const err = s.error ? `<p role="alert">${esc(s.error)}</p>` : '';
    // One flat list, A to Z (Miguel, 1 Nov 2026): one switch per tweak, each labelled "by <author>"; no per-author
    // quick buttons. Same list whatever skin is worn; skins are looks only.
    const list = [...shown].sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)) || a.id.localeCompare(b.id));
    const rows = list.map(t => tweakSwitches([t], 'data-tweak-toggle', s.busy, name) + (t.on && tweakOpts.has(t.id) ? `<div class="tw-opts" data-tweak-opts="${esc(t.id)}"></div>` : '')).join('');
