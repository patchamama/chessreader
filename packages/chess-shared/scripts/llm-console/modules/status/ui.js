// Status tab: what the run did, is doing and has left, plus the latest results to review.
Console.addStrings({
  en: {
    'status.tab': 'Status', 'status.loading': 'Loading…', 'status.updated': 'Updated {time} · refreshes every 5 s', 'status.noDb': 'No database is set. Start the console with --db <comments.sqlite> or set it in the Queue tab.',
    'status.state': 'State', 'status.running': 'RUNNING', 'status.stale': 'NO ACTIVITY', 'status.stopped': 'STOPPED / FINISHED', 'status.between': 'BETWEEN PHASES',
    'status.phase': 'Current phase', 'status.normModel': 'LLM that normalizes', 'status.transModel': 'LLM that translates', 'status.langs': 'Target languages', 'status.concurrency': 'Concurrency', 'status.parallel': '{n} requests at a time',
    'status.process': 'Process', 'status.processOn': 'pid {pid} · running for {time}', 'status.noProcess': 'no translation process', 'status.lastActivity': 'Last activity', 'status.ago': '{s} s ago', 'status.ollama': 'Ollama', 'status.noModel': 'no model loaded', 'status.down': 'does not answer', 'status.lastLog': 'Last log',
    'status.speed': 'Speed and time left', 'status.normPerMin': 'normalizations / min', 'status.transPerMin': 'translations / min', 'status.window': 'Measured over the last {min} min.', 'status.leftPhase': 'Left in this phase', 'status.leftAll': 'Left in total', 'status.tasks': '{n} tasks', 'status.done': 'done',
    'status.results': 'LLM results (so far) — click one to see them', 'status.normalized': 'normalized', 'status.dropped': 'dropped as not universal', 'status.rejected': 'rejected by validation', 'status.translated': 'translated', 'status.transRejected': 'translations rejected', 'status.failures': 'failures',
    'status.plan': 'Run plan', 'status.complete': 'complete', 'status.noResult': '{n} without result (rejected or failed)', 'status.inProgress': 'in progress · {n} pending', 'status.waiting': 'waiting · {n} pending',
    'status.normalize': 'Normalize (universal text)', 'status.translate': 'Translate', 'status.books': 'Books', 'status.lichess': 'Lichess', 'status.onlyLang': 'only {lang}',
    'status.normSection': 'Normalization (universal text in the comment\'s own language)', 'status.normLine': '{ok} normalized · {dropped} dropped · {left} not normalized', 'status.transSection': 'Translation into each language',
    'status.startNorm': 'Queue normalization', 'status.startTrans': 'Queue translation', 'status.queued': 'Added to the queue', 'status.queueError': 'Could not queue: {msg}',
    'status.latest': 'Latest results to review', 'status.tabNorm': 'Last normalization', 'status.tabTrans': 'Last translation', 'status.tabProblems': 'Rejected / dropped / failed', 'status.none': 'No results of this kind yet.',
    'status.original': 'Original', 'status.normalizedText': 'Normalized text', 'status.translation': 'Translation', 'status.bookText': 'Text of the book / study', 'status.newest': 'newest', 'status.noText': '(no text)', 'status.move': 'move {n}{dots} {san}',
    'st.accepted': 'accepted', 'st.rejected': 'rejected', 'st.dropped': 'dropped (not universal)', 'st.failed': 'failed', 'status.lang.es': 'Spanish', 'status.lang.en': 'English', 'status.lang.de': 'German', 'status.lang.fr': 'French',
  },
  es: {
    'status.tab': 'Estado', 'status.loading': 'Cargando…', 'status.updated': 'Actualizado {time} · se refresca cada 5 s', 'status.noDb': 'No hay base de datos. Inicia la consola con --db <comments.sqlite> o elígela en la pestaña Cola.',
    'status.state': 'Estado', 'status.running': 'EN MARCHA', 'status.stale': 'SIN ACTIVIDAD', 'status.stopped': 'PARADO / TERMINADO', 'status.between': 'ENTRE FASES',
    'status.phase': 'Fase actual', 'status.normModel': 'LLM que normaliza', 'status.transModel': 'LLM que traduce', 'status.langs': 'Idiomas objetivo', 'status.concurrency': 'Concurrencia', 'status.parallel': '{n} peticiones a la vez',
    'status.process': 'Proceso', 'status.processOn': 'pid {pid} · activo desde hace {time}', 'status.noProcess': 'no hay proceso de traducción', 'status.lastActivity': 'Última actividad', 'status.ago': 'hace {s} s', 'status.ollama': 'Ollama', 'status.noModel': 'sin modelo cargado', 'status.down': 'no responde', 'status.lastLog': 'Último log',
    'status.speed': 'Velocidad y tiempo restante', 'status.normPerMin': 'normalizaciones / min', 'status.transPerMin': 'traducciones / min', 'status.window': 'Medido en los últimos {min} min.', 'status.leftPhase': 'Falta en la fase actual', 'status.leftAll': 'Falta en total', 'status.tasks': '{n} tareas', 'status.done': 'listo',
    'status.results': 'Resultados del LLM (acumulado) — pulsa uno para verlos', 'status.normalized': 'normalizados', 'status.dropped': 'descartados por no ser universales', 'status.rejected': 'rechazados por validación', 'status.translated': 'traducidos', 'status.transRejected': 'traducciones rechazadas', 'status.failures': 'fallos',
    'status.plan': 'Plan de la corrida', 'status.complete': 'completa', 'status.noResult': '{n} sin resultado (rechazados o fallidos)', 'status.inProgress': 'en curso · {n} pendientes', 'status.waiting': 'en espera · {n} pendientes',
    'status.normalize': 'Normalizar (texto universal)', 'status.translate': 'Traducir', 'status.books': 'Libros', 'status.lichess': 'Lichess', 'status.onlyLang': 'solo {lang}',
    'status.normSection': 'Normalización (texto universal en el idioma del comentario)', 'status.normLine': '{ok} normalizados · {dropped} descartados · {left} sin normalizar', 'status.transSection': 'Traducción a cada idioma',
    'status.startNorm': 'Encolar normalización', 'status.startTrans': 'Encolar traducción', 'status.queued': 'Añadido a la cola', 'status.queueError': 'No se pudo encolar: {msg}',
    'status.latest': 'Últimos resultados para revisar', 'status.tabNorm': 'Última normalización', 'status.tabTrans': 'Última traducción', 'status.tabProblems': 'Rechazados / descartados / fallos', 'status.none': 'Todavía no hay resultados de este tipo.',
    'status.original': 'Original', 'status.normalizedText': 'Texto normalizado', 'status.translation': 'Traducción', 'status.bookText': 'Texto del libro / estudio', 'status.newest': 'más reciente', 'status.noText': '(sin texto)', 'status.move': 'jugada {n}{dots} {san}',
    'st.accepted': 'aceptado', 'st.rejected': 'rechazado', 'st.dropped': 'descartado (no universal)', 'st.failed': 'falló', 'status.lang.es': 'Español', 'status.lang.en': 'Inglés', 'status.lang.de': 'Alemán', 'status.lang.fr': 'Francés',
  },
})

Console.registerTab({
  id: 'status', order: 10, title: { en: 'Status', es: 'Estado' },
  render(el, { t, api, navigate, esc, n }) {
    let data = null, tab = null, timer = null, notice = ''
    const lang = (l) => t(`status.lang.${l}`) === `status.lang.${l}` ? l : t(`status.lang.${l}`)
    const kind = (k) => (k === 'book' ? t('status.books') : k === 'lichess' ? t('status.lichess') : k)
    const pct = (a, b) => (b > 0 ? Math.min(100, (a / b) * 100) : 100)
    const eta = (left, perMin) => (!left ? t('status.done') : !perMin || perMin <= 0 ? '—' : (() => { const m = left / perMin; return m < 1 ? '< 1 min' : m < 90 ? `${Math.round(m)} min` : m / 60 < 48 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} d` })())
    const phaseLabel = (p) => `${p.phase === 'normalize' ? t('status.normalize') : t('status.translate')} · ${kind(p.kind)}${p.onlyLang ? ` · ${t('status.onlyLang', { lang: lang(p.onlyLang) })}` : ''}`
    const pendingOf = (p) => {
      const c = data.counts[p.kind]; if (!c) return 0
      if (p.phase === 'normalize') { if (p.onlyLang) { const r = c.normByLang[p.onlyLang]; return r ? r.total - r.ok - r.dropped : 0 } return c.pendingNormalize }
      return Object.values(c.translate).reduce((a, r) => a + Math.max(0, r.need - r.done), 0)
    }
    const link = (value, label, params) => `<a class="stat stat-link" href="#/results?${new URLSearchParams(params)}" title="${esc(label)}"><b>${n(value)}</b><span>${esc(label)}</span></a>`

    async function queue(phase, k, extra = {}) {
      try { await api('/api/queue', { method: 'POST', body: { phase, kind: k, ...extra } }); notice = t('status.queued') } catch (e) { notice = t('status.queueError', { msg: e.message }) }
      draw()
    }

    function draw() {
      if (!data) { el.innerHTML = `<p class="empty">${t('status.loading')}</p>`; return }
      if (data.configured === false) { el.innerHTML = `<p class="err">${t('status.noDb')}</p>`; return }
      const d = data, j = d.job
      const stale = j && d.idleSeconds != null && d.idleSeconds > 300
      const pill = j ? (stale ? `<span class="pill stale">${t('status.stale')}</span>` : `<span class="pill run">${t('status.running')}</span>`) : d.driverRunning ? `<span class="pill idle">${t('status.between')}</span>` : `<span class="pill done">${t('status.stopped')}</span>`
      const plan = (d.plan ?? []).map((p) => ({ ...p, pending: pendingOf(p) }))
      const cur = j ? plan.find((p) => p.phase === j.phase && p.kind === j.kind && (p.onlyLang ?? null) === (j.onlyLang ?? null)) : null
      const r = d.review, rt = d.rates
      const rateOf = (ph) => (ph === 'translate' ? rt.translatePerMin : rt.universalPerMin)
      const remaining = plan.reduce((a, p) => a + p.pending, 0)
      const minutes = plan.reduce((a, p) => a + (p.pending && rateOf(p.phase) ? p.pending / rateOf(p.phase) : 0), 0)
      const fmt = (m) => (m < 90 ? `${Math.round(m)} min` : m / 60 < 48 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} d`)
      const stat = (v, l) => `<div class="stat"><b>${n(Math.round(v * 10) / 10)}</b><span>${l}</span></div>`
      const ollamaTxt = d.ollama.up ? (d.ollama.loaded.length ? d.ollama.loaded.map((m) => `${esc(m.name)} (${esc(m.params ?? '?')} ${esc(m.quant ?? '')}, ${m.sizeGb} GB)`).join('<br>') : t('status.noModel')) : `<span class="err">${t('status.down')}</span>`
      const curIdx = cur ? plan.indexOf(cur) : -1
      const stateOf = (p, i) => (j && curIdx >= 0 ? (i < curIdx ? 'done' : i === curIdx ? 'run' : 'wait') : p.pending === 0 ? 'done' : 'wait')
      if (!tab) tab = j?.phase === 'translate' ? 'translate' : 'universal'
      const tabs = [['universal', t('status.tabNorm')], ['translate', t('status.tabTrans')], ['problems', t('status.tabProblems')]]
      const list = d.recent[tab] ?? []
      const lblA = tab === 'translate' ? t('status.original') : t('status.bookText'), lblB = tab === 'translate' ? t('status.translation') : t('status.normalizedText')

      el.innerHTML = `
      <h1>${esc(t('app.title'))}</h1>
      <p class="sub-line">${t('status.updated', { time: new Date(d.now).toLocaleTimeString() })}</p>
      ${notice ? `<p class="sub-line">${esc(notice)}</p>` : ''}
      <div class="grid">
        <section class="card"><h2>${t('status.state')}</h2><p style="margin:0 0 10px">${pill}</p><dl class="kv">
          <dt>${t('status.phase')}</dt><dd>${j ? esc(phaseLabel(j)) : '—'}</dd>
          <dt>${t('status.normModel')}</dt><dd>${esc(j?.model ?? '—')}</dd><dt>${t('status.transModel')}</dt><dd>${esc(j?.translateModel ?? '—')}</dd>
          <dt>${t('status.langs')}</dt><dd>${esc(d.langs.join(', '))}</dd><dt>${t('status.concurrency')}</dt><dd>${j ? t('status.parallel', { n: esc(j.concurrency ?? '—') }) : '—'}</dd>
          <dt>${t('status.process')}</dt><dd>${j ? t('status.processOn', { pid: j.pid, time: esc(j.elapsed) }) : t('status.noProcess')}</dd>
          <dt>${t('status.lastActivity')}</dt><dd>${d.idleSeconds == null ? '—' : t('status.ago', { s: d.idleSeconds })}${stale ? ' ⚠' : ''}</dd>
          <dt>${t('status.ollama')}</dt><dd>${ollamaTxt}</dd><dt>${t('status.lastLog')}</dt><dd>${esc(d.log || '—')}</dd></dl></section>
        <section class="card"><h2>${t('status.speed')}</h2><div class="stats">${stat(rt.universalPerMin ?? 0, t('status.normPerMin'))}${stat(rt.translatePerMin ?? 0, t('status.transPerMin'))}</div>
          <p class="sub-line" style="margin:6px 0 12px">${t('status.window', { min: rt.windowMin || 0 })}</p>
          <dl class="kv"><dt>${t('status.leftPhase')}</dt><dd>${cur ? `${n(cur.pending)} · ${eta(cur.pending, rateOf(cur.phase))}` : '—'}</dd><dt>${t('status.leftAll')}</dt><dd>${t('status.tasks', { n: n(remaining) })} · ${remaining === 0 ? t('status.done') : minutes ? fmt(minutes) : '—'}</dd></dl>
          <h2 style="margin-top:16px">${t('status.results')}</h2><div class="stats">
            ${link(r['universal|accepted'] ?? 0, t('status.normalized'), { action: 'universal', status: 'accepted' })}
            ${link(r['universal|dropped'] ?? 0, t('status.dropped'), { action: 'universal', status: 'dropped' })}
            ${link(r['universal|rejected'] ?? 0, t('status.rejected'), { action: 'universal', status: 'rejected' })}
            ${link(r['translate|accepted'] ?? 0, t('status.translated'), { action: 'translate', status: 'accepted' })}
            ${link(r['translate|rejected'] ?? 0, t('status.transRejected'), { action: 'translate', status: 'rejected' })}
            ${link((r['universal|failed'] ?? 0) + (r['translate|failed'] ?? 0), t('status.failures'), { status: 'failed' })}</div></section>
        <section class="card"><h2>${t('status.plan')}</h2><ul class="phases">${plan.map((p, i) => { const st = stateOf(p, i); const note = st === 'done' ? (p.pending ? `${t('status.complete')} · ${t('status.noResult', { n: n(p.pending) })}` : t('status.complete')) : st === 'run' ? t('status.inProgress', { n: n(p.pending) }) : t('status.waiting', { n: n(p.pending) }); return `<li><span class="dot ${st === 'wait' ? '' : st}">${st === 'done' ? '✓' : i + 1}</span><span>${esc(phaseLabel(p))}</span><span class="n">${note}</span></li>` }).join('')}</ul></section>
      </div>
      <div class="grid">
        <section class="card"><h2>${t('status.normSection')}</h2>${Object.entries(d.counts).map(([k, c]) => `
          <div class="row"><div class="top2"><span><b>${kind(k)}</b> — ${t('status.normLine', { ok: n(c.normalized), dropped: n(c.dropped), left: n(c.pendingNormalize) })}</span><span>${n(c.normalized + c.dropped)} / ${n(c.total)}</span></div><div class="bar ${c.pendingNormalize === 0 ? 'ok' : ''}"><i style="width:${pct(c.normalized + c.dropped, c.total)}%"></i></div>
          ${c.pendingNormalize > 0 ? `<button class="btn small" data-q="normalize|${k}" style="margin-top:4px">▶ ${t('status.startNorm')}</button>` : ''}</div>`).join('')}</section>
        <section class="card"><h2>${t('status.transSection')}</h2>${Object.entries(d.counts).map(([k, c]) => `<p style="margin:8px 0 2px"><b>${kind(k)}</b></p>${Object.entries(c.translate).map(([L, x]) => `
          <div class="row"><div class="top2"><span>→ ${lang(L)}</span><span>${n(x.done)} / ${n(x.need)}</span></div><div class="bar ${x.done >= x.need ? 'ok' : ''}"><i style="width:${pct(x.done, x.need)}%"></i></div>
          ${x.need > x.done ? `<button class="btn small" data-q="translate|${k}|${L}" style="margin-top:4px">▶ ${t('status.startTrans')} (${n(x.need - x.done)})</button>` : ''}</div>`).join('')}`).join('')}</section>
      </div>
      <section class="card wide" style="margin-top:14px"><h2>${t('status.latest')}</h2>
        <div class="tabs2" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${k === tab}" data-tab="${k}">${l}</button>`).join('')}</div>
        ${list.length ? list.map((e, i) => `<article class="item ${i === 0 ? 'first' : ''}"><div class="meta"><span class="tag">#${e.id}</span><span>${esc(e.source ?? '')}${e.kind === 'lichess' ? ' · Lichess' : ''}</span>
          ${e.san ? `<span>${t('status.move', { n: Math.ceil((e.ply ?? 0) / 2), dots: (e.ply ?? 1) % 2 ? '.' : '...', san: esc(e.san) })}</span>` : ''}
          <span>${e.action === 'translate' ? `${esc(lang(e.own ?? '?'))} → <b>${esc(lang(e.lang))}</b>` : esc(lang(e.lang))}</span><span>${esc(e.model ?? '')}</span><span>${t(`st.${e.status}`)}</span>${i === 0 ? `<span class="tag">${t('status.newest')}</span>` : ''}</div>
          <div class="cmp"><div><h3>${lblA}</h3><p>${esc(e.original)}</p></div><div><h3>${lblB}</h3><p>${e.proposal ? esc(e.proposal) : `<span class="empty">${t('status.noText')}</span>`}</p></div></div>
          ${e.problems?.length ? `<div class="problems">⚠ ${e.problems.map(esc).join(' · ')}</div>` : ''}</article>`).join('') : `<p class="empty">${t('status.none')}</p>`}</section>`
      el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; draw() }))
      el.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { const [ph, k, L] = b.dataset.q.split('|'); void queue(ph, k, L ? { langs: [L] } : {}) }))
    }

    async function tick() {
      try { data = await api('/api/status'); } catch (e) { el.innerHTML = `<p class="err">${esc(e.message)}</p>`; return }
      draw()
    }
    void tick()
    timer = setInterval(tick, 5000)
    return () => clearInterval(timer)
  },
})
