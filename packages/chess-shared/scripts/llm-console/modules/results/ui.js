// Results tab: browse what the LLM did (filters, pagination), select results and redo them with the external model.
Console.addStrings({
  en: {
    'results.tab': 'Results', 'results.loading': 'Loading…', 'results.noDb': 'No database or review file is set. Start the console with --db <comments.sqlite> or set it in the Queue tab.',
    'results.chips': 'Categories',
    'results.c.normalized': 'normalized', 'results.c.dropped': 'dropped as not universal', 'results.c.rejected': 'rejected by validation', 'results.c.translated': 'translated', 'results.c.transRejected': 'translations rejected', 'results.c.failures': 'failures', 'results.c.all': 'all',
    'results.action': 'Action', 'results.status': 'Status', 'results.kind': 'Source', 'results.lang': 'Language', 'results.search': 'Search text', 'results.any': 'any',
    'results.a.universal': 'normalization', 'results.a.translate': 'translation', 'results.k.book': 'books', 'results.k.lichess': 'Lichess',
    'results.s.accepted': 'accepted', 'results.s.rejected': 'rejected', 'results.s.dropped': 'dropped (not universal)', 'results.s.failed': 'failed',
    'results.total': '{n} results', 'results.page': '{from}–{to} of {n}', 'results.prev': 'Previous', 'results.next': 'Next', 'results.none': 'No results match these filters.',
    'results.original': 'Original', 'results.proposal': 'LLM proposal', 'results.stored': 'Stored now', 'results.noText': '(no text)', 'results.model': 'model', 'results.move': 'move {ply} {san}', 'results.own': 'own language {lang}', 'results.empty': '(empty: dropped)',
    'results.problems': 'Problems', 'results.attempts': 'All attempts', 'results.hide': 'Hide', 'results.pending': 'proposal pending',
    'results.selectPage': 'Select all on this page', 'results.selected': '{n} selected', 'results.clear': 'Clear selection',
    'results.redoAs': 'Repeat with the external AI as', 'results.redoUniversal': 'Normalization', 'results.redoTranslate': 'Translation', 'results.redoKeep': 'same as the result', 'results.lang.target': 'into', 'results.instructions': 'Extra instructions for the AI (optional)',
    'results.redo': 'Redo with external AI', 'results.redoOne': 'Redo with external AI', 'results.redoStarted': 'Started: {n} requests, one at a time.', 'results.redoError': 'Could not start: {msg}',
    'results.noExternal': 'No external model or key set: choose the provider, model and key in the Queue tab (external LLM).',
    'results.job': 'External redo', 'results.jobRunning': 'running {done} / {total}', 'results.jobDone': 'finished {done} / {total}', 'results.jobCancelled': 'cancelled at {done} / {total}', 'results.cancel': 'Cancel', 'results.errors': 'Provider errors',
    'results.proposals': 'Proposals from the external AI', 'results.noProposals': 'No proposals yet. Select results above and redo them.', 'results.previous': 'Previous text', 'results.newText': 'New proposal',
    'results.apply': 'Apply', 'results.discard': 'Discard', 'results.applySel': 'Apply selected', 'results.discardSel': 'Discard selected', 'results.applyAll': 'Select all pending', 'results.force': 'Apply even with validation problems',
    'results.p.proposed': 'proposed', 'results.p.applied': 'applied', 'results.p.discarded': 'discarded', 'results.applied': 'Applied {n} to the database.', 'results.discarded': 'Discarded {n}.', 'results.applyError': 'Not applied: {msg}',
    'results.showing': 'Showing {n} of {total}', 'results.end': 'end of the list', 'results.more': 'Load more', 'results.showPos': 'Show the position', 'results.after': 'after', 'results.initial': 'initial position',
    'results.showProposals': 'show', 'results.filterPending': 'only pending',
    'results.m.title': 'Review translation #{id} · {lang}', 'results.m.normalized': 'Normalized text (source of the translation)', 'results.m.stored': 'Stored translation (editable)', 'results.m.attempt': 'Last attempt', 'results.m.save': 'Save edit', 'results.m.revoke': 'Revoke (delete)', 'results.m.revokeQueue': 'Delete and queue it again', 'results.m.close': 'Close',
    'results.m.redoExt': 'Redo with external AI', 'results.m.redoLocal': 'Redo with local model', 'results.m.model': 'Local model', 'results.m.gpuWarn': 'A local model competes for the GPU with a running translate job.', 'results.m.noModels': 'no installed models found',
    'results.m.saved': 'Saved.', 'results.m.revoked': 'Revoked: the translation was deleted (its text is kept in the redo file) and the queue will translate it again.', 'results.m.queued': 'Queued for translation again.', 'results.m.queueFail': 'Deleted, but it could not be queued: {msg}', 'results.m.confirmRevoke': 'Delete this translation?', 'results.m.review': 'Review', 'results.m.err': 'Error: {msg}', 'results.m.proposal': 'Proposal of the AI', 'results.m.loading': 'Loading…',
    'results.p.edited': 'edited', 'results.p.revoked': 'revoked',
  },
  es: {
    'results.tab': 'Resultados', 'results.loading': 'Cargando…', 'results.noDb': 'No hay base de datos ni archivo de revisión. Inicia la consola con --db <comments.sqlite> o elígela en la pestaña Cola.',
    'results.chips': 'Categorías',
    'results.c.normalized': 'normalizados', 'results.c.dropped': 'descartados por no ser universales', 'results.c.rejected': 'rechazados por validación', 'results.c.translated': 'traducidos', 'results.c.transRejected': 'traducciones rechazadas', 'results.c.failures': 'fallos', 'results.c.all': 'todos',
    'results.action': 'Acción', 'results.status': 'Estado', 'results.kind': 'Fuente', 'results.lang': 'Idioma', 'results.search': 'Buscar texto', 'results.any': 'cualquiera',
    'results.a.universal': 'normalización', 'results.a.translate': 'traducción', 'results.k.book': 'libros', 'results.k.lichess': 'Lichess',
    'results.s.accepted': 'aceptado', 'results.s.rejected': 'rechazado', 'results.s.dropped': 'descartado (no universal)', 'results.s.failed': 'falló',
    'results.total': '{n} resultados', 'results.page': '{from}–{to} de {n}', 'results.prev': 'Anterior', 'results.next': 'Siguiente', 'results.none': 'Ningún resultado coincide con estos filtros.',
    'results.original': 'Original', 'results.proposal': 'Propuesta del LLM', 'results.stored': 'Guardado ahora', 'results.noText': '(sin texto)', 'results.model': 'modelo', 'results.move': 'jugada {ply} {san}', 'results.own': 'idioma propio {lang}', 'results.empty': '(vacío: descartado)',
    'results.problems': 'Problemas', 'results.attempts': 'Todos los intentos', 'results.hide': 'Ocultar', 'results.pending': 'propuesta pendiente',
    'results.selectPage': 'Seleccionar todo en esta página', 'results.selected': '{n} seleccionados', 'results.clear': 'Quitar selección',
    'results.redoAs': 'Repetir con la IA externa como', 'results.redoUniversal': 'Normalización', 'results.redoTranslate': 'Traducción', 'results.redoKeep': 'igual que el resultado', 'results.lang.target': 'a', 'results.instructions': 'Instrucciones extra para la IA (opcional)',
    'results.redo': 'Repetir con IA externa', 'results.redoOne': 'Repetir con IA externa', 'results.redoStarted': 'Iniciado: {n} peticiones, una a la vez.', 'results.redoError': 'No se pudo iniciar: {msg}',
    'results.noExternal': 'No hay modelo externo ni clave: elige proveedor, modelo y clave en la pestaña Cola (LLM externo).',
    'results.job': 'Repetición externa', 'results.jobRunning': 'en curso {done} / {total}', 'results.jobDone': 'terminado {done} / {total}', 'results.jobCancelled': 'cancelado en {done} / {total}', 'results.cancel': 'Cancelar', 'results.errors': 'Errores del proveedor',
    'results.proposals': 'Propuestas de la IA externa', 'results.noProposals': 'Aún no hay propuestas. Selecciona resultados arriba y repítelos.', 'results.previous': 'Texto anterior', 'results.newText': 'Nueva propuesta',
    'results.apply': 'Aplicar', 'results.discard': 'Descartar', 'results.applySel': 'Aplicar seleccionadas', 'results.discardSel': 'Descartar seleccionadas', 'results.applyAll': 'Seleccionar todas las pendientes', 'results.force': 'Aplicar aunque tengan problemas de validación',
    'results.p.proposed': 'propuesta', 'results.p.applied': 'aplicada', 'results.p.discarded': 'descartada', 'results.applied': 'Se aplicaron {n} a la base de datos.', 'results.discarded': 'Se descartaron {n}.', 'results.applyError': 'No se aplicó: {msg}',
    'results.showing': 'Mostrando {n} de {total}', 'results.end': 'fin de la lista', 'results.more': 'Cargar más', 'results.showPos': 'Ver la posición', 'results.after': 'después de', 'results.initial': 'posición inicial',
    'results.showProposals': 'ver', 'results.filterPending': 'solo pendientes',
    'results.m.title': 'Revisar traducción #{id} · {lang}', 'results.m.normalized': 'Texto normalizado (origen de la traducción)', 'results.m.stored': 'Traducción guardada (editable)', 'results.m.attempt': 'Último intento', 'results.m.save': 'Guardar edición', 'results.m.revoke': 'Revocar (eliminar)', 'results.m.revokeQueue': 'Eliminar y encolar de nuevo', 'results.m.close': 'Cerrar',
    'results.m.redoExt': 'Rehacer con IA externa', 'results.m.redoLocal': 'Rehacer con modelo local', 'results.m.model': 'Modelo local', 'results.m.gpuWarn': 'Un modelo local compite por la GPU con un trabajo de traducción en curso.', 'results.m.noModels': 'no hay modelos instalados',
    'results.m.saved': 'Guardado.', 'results.m.revoked': 'Revocada: se eliminó la traducción (su texto queda en el archivo de repeticiones) y la cola la traducirá de nuevo.', 'results.m.queued': 'Encolada para traducir de nuevo.', 'results.m.queueFail': 'Eliminada, pero no se pudo encolar: {msg}', 'results.m.confirmRevoke': '¿Eliminar esta traducción?', 'results.m.review': 'Revisar', 'results.m.err': 'Error: {msg}', 'results.m.proposal': 'Propuesta de la IA', 'results.m.loading': 'Cargando…',
    'results.p.edited': 'editada', 'results.p.revoked': 'revocada',
  },
})

Console.registerTab({
  id: 'results', order: 30, title: { en: 'Results', es: 'Resultados' },
  render(el, { params, t, api, navigate, esc, n }) {
    const PAGE = 25
    const q = { action: params.action ?? '', status: params.status ?? '', kind: params.kind ?? '', lang: params.lang ?? '', q: params.q ?? '', offset: Number(params.offset) || 0 }
    let data = null, redo = { job: {}, proposals: [] }, notice = '', noticeBad = false
    const selected = new Map()      // "id:lang:action" -> { id, lang, action }
    const picked = new Set()        // proposal keys selected in the panel
    let timer = null, disposed = false, forceOn = false
    const open = new Set()          // ids with the attempts panel open
    const attempts = new Map()

    const itemKey = (r) => `${r.id}:${r.lang}:${r.action}`
    const opt = (v, cur, label) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`

    el.innerHTML = `<div id="rs-chips"></div><div class="card" id="rs-filters" style="margin-top:12px"></div><div id="rs-bulk"></div><div id="rs-list" style="margin-top:12px"></div><div class="card" id="rs-redo" style="margin-top:14px"></div>`
    const $ = (id) => el.querySelector(id)

    function chips() {
      const c = data?.counts ?? {}
      const v = (a, s) => c[`${a}|${s}`] ?? 0
      const defs = [
        ['normalized', v('universal', 'accepted'), { action: 'universal', status: 'accepted' }],
        ['dropped', v('universal', 'dropped'), { action: 'universal', status: 'dropped' }],
        ['rejected', v('universal', 'rejected'), { action: 'universal', status: 'rejected' }],
        ['translated', v('translate', 'accepted'), { action: 'translate', status: 'accepted' }],
        ['transRejected', v('translate', 'rejected'), { action: 'translate', status: 'rejected' }],
        ['failures', v('universal', 'failed') + v('translate', 'failed'), { status: 'failed' }],
      ]
      const on = (p) => (p.action ?? '') === q.action && (p.status ?? '') === q.status
      $('#rs-chips').innerHTML = `<div class="stats" role="group" aria-label="${esc(t('results.chips'))}">${defs.map(([k, val, p]) => `<a class="stat stat-link" data-chip="${k}" href="#/results?${new URLSearchParams(p)}" style="${on(p) ? 'outline:2px solid var(--accent)' : ''}"><b>${n(val)}</b><span>${esc(t(`results.c.${k}`))}</span></a>`).join('')}</div>`
      $('#rs-chips').querySelectorAll('[data-chip]').forEach((a, i) => a.addEventListener('click', (e) => { e.preventDefault(); Object.assign(q, { action: defs[i][2].action ?? '', status: defs[i][2].status ?? '', offset: 0 }); selected.clear(); syncHash(); filters(); load() }))
    }

    function syncHash() {
      const p = {}
      for (const k of ['action', 'status', 'kind', 'lang', 'q']) if (q[k]) p[k] = q[k]
      history.replaceState(null, '', `#/results${Object.keys(p).length ? `?${new URLSearchParams(p)}` : ''}`)
    }

    function filters() {
      $('#rs-filters').innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:end">
        <label>${t('results.action')}<br><select data-f="action">${opt('', q.action, t('results.any'))}${opt('universal', q.action, t('results.a.universal'))}${opt('translate', q.action, t('results.a.translate'))}</select></label>
        <label>${t('results.status')}<br><select data-f="status">${opt('', q.status, t('results.any'))}${['accepted', 'dropped', 'rejected', 'failed'].map((s) => opt(s, q.status, t(`results.s.${s}`))).join('')}</select></label>
        <label>${t('results.kind')}<br><select data-f="kind">${opt('', q.kind, t('results.any'))}${opt('book', q.kind, t('results.k.book'))}${opt('lichess', q.kind, t('results.k.lichess'))}</select></label>
        <label>${t('results.lang')}<br><input data-f="lang" value="${esc(q.lang)}" size="3" maxlength="2" placeholder="es"></label>
        <label style="flex:1;min-width:200px">${t('results.search')}<br><input data-f="q" value="${esc(q.q)}" style="width:100%"></label></div>`
      $('#rs-filters').querySelectorAll('[data-f]').forEach((f) => f.addEventListener(f.tagName === 'SELECT' ? 'change' : 'change', () => { q[f.dataset.f] = f.value.trim(); q.offset = 0; selected.clear(); syncHash(); chips(); load() }))
    }

    // ---- lazy list: rows are appended as the sentinel scrolls into view ----
    const hl = (s) => (s === null || s === undefined ? `<span class="muted">${t('results.noText')}</span>` : s === '' ? `<span class="muted">${t('results.empty')}</span>` : window.ConsoleChess.highlightMoves(s))
    const fenOpen = new Set()
    let rows = [], total = 0, before = null, loading = false, gen = 0, ended = false, observer = null
    const hasIO = typeof IntersectionObserver !== 'undefined'

    const filterParams = () => { const qs = new URLSearchParams(); for (const k of ['action', 'status', 'kind', 'lang', 'q']) if (q[k]) qs.set(k, q[k]); return qs }

    async function load(reset = true) {
      if (reset) { gen++; rows = []; total = 0; before = null; ended = false; loading = false; fenOpen.clear(); frame() }
      if (loading || ended) return
      loading = true
      const mine = gen
      foot()
      try {
        const qs = filterParams()
        qs.set('limit', String(PAGE)); qs.set('offset', String(rows.length))
        if (before !== null) qs.set('before', String(before))
        const res = await api(`/api/results?${qs}`)
        if (disposed || mine !== gen) return   // a late answer for an older filter
        data = res
        if (res.configured === false) { $('#rs-list').innerHTML = `<p class="err">${t('results.noDb')}</p>`; $('#rs-filters').hidden = true; ended = true; return }
        if (before === null) before = res.before
        total = res.total
        const fresh = res.rows.filter((r) => !rows.some((x) => x.seq === r.seq))
        rows.push(...fresh)
        ended = rows.length >= total || res.rows.length === 0
        chips(); append(fresh); bulk()
      } catch (e) {
        if (mine === gen) { $('#rs-foot').innerHTML = `<p class="err">${esc(e.message)}</p>`; ended = true }
      } finally { if (mine === gen) { loading = false; foot() } }
    }

    // Reload what is shown (after a redo or an edit) without losing the position in the list.
    async function refresh() {
      if (!rows.length) return load(true)
      const y = window.scrollY, mine = gen
      try {
        const qs = filterParams(); qs.set('limit', String(Math.min(200, rows.length))); qs.set('offset', '0')
        const res = await api(`/api/results?${qs}`)
        if (disposed || mine !== gen) return
        data = res; rows = res.rows; total = res.total; before = res.before; ended = rows.length >= total
        chips(); $('#rs-rows').innerHTML = rows.map(row).join(''); foot(); window.scrollTo(0, y)
      } catch { /* keep what is shown */ }
    }

    function frame() {
      $('#rs-list').innerHTML = `<label id="rs-all" style="display:block;margin-bottom:8px" hidden><input type="checkbox" data-all> ${t('results.selectPage')}</label><div id="rs-rows"></div><div id="rs-foot" class="muted" style="margin:10px 0"></div><div id="rs-sentinel" style="height:1px"></div>`
      if (observer) observer.disconnect()
      if (hasIO) { observer = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) load(false) }, { rootMargin: '400px' }); observer.observe($('#rs-sentinel')) }
    }

    function foot() {
      const f = $('#rs-foot'); if (!f) return
      const shown = rows.length
      f.innerHTML = `${loading ? t('results.loading') : ''}${!loading && !shown ? t('results.none') : ''}${shown ? `<div>${t('results.showing', { n: n(shown), total: n(total) })}${ended && !loading ? ` · ${t('results.end')}` : ''}</div>` : ''}${!hasIO && !ended && !loading ? `<button class="btn" data-more>${t('results.more')}</button>` : ''}`
      f.querySelector('[data-more]')?.addEventListener('click', () => load(false))
      $('#rs-all').hidden = !shown
      const a = $('#rs-all input'); if (a) a.checked = shown > 0 && rows.every((r) => selected.has(itemKey(r)))
      // The sentinel may already be visible after a short page: ask again once the layout settles.
      if (hasIO && !ended && !loading && observer) { observer.unobserve($('#rs-sentinel')); observer.observe($('#rs-sentinel')) }
    }

    const fenHtml = (r) => {
      if (!fenOpen.has(itemKey(r)) || !r.fen) return ''
      const svg = window.ConsoleChess.boardSvg(r.fen, { size: 160, mark: r.mark || undefined })
      const cap = window.ConsoleChess.afterLabel(r.ply, r.san, { after: t('results.after'), initial: t('results.initial') })
      return `<div class="fen-thumb" style="margin-top:8px;display:flex;gap:10px;align-items:center">${svg}<span class="muted">${esc(cap)}</span></div>`
    }

    function row(r) {
      const sel = selected.has(itemKey(r))
      const loaded = attempts.get(r.id)
      return `<div class="item" data-row="${esc(itemKey(r))}">
        <div class="meta"><label><input type="checkbox" data-sel="${esc(itemKey(r))}"${sel ? ' checked' : ''}> #${r.id}</label>
          <span class="tag">${esc(t(`results.a.${r.action}`))} · ${esc(r.lang)}</span><span class="tag">${esc(t(`results.s.${r.status}`))}</span>
          ${r.model ? `<span>${t('results.model')}: ${esc(r.model)}</span>` : ''}<span>${esc(r.source ?? '')}${r.kind ? ` (${esc(r.kind)})` : ''}</span>
          ${r.san ? `<span>${esc(t('results.move', { ply: r.ply, san: r.san }))}</span>` : ''}${r.own ? `<span>${esc(t('results.own', { lang: r.own }))}</span>` : ''}
          ${r.redo?.status === 'proposed' ? `<span class="tag">${t('results.pending')}</span>` : ''}
          ${r.fen ? `<button class="btn small fen-btn" data-fen="${esc(itemKey(r))}" title="${esc(t('results.showPos'))}" aria-label="${esc(t('results.showPos'))}" aria-pressed="${fenOpen.has(itemKey(r))}">♟</button>` : ''}
          ${r.action === 'translate' ? `<button class="btn small" data-review="${esc(itemKey(r))}">${t('results.m.review')}</button> ` : ''}<button class="btn small" data-redo="${esc(itemKey(r))}">${t('results.redoOne')}</button> <button class="btn small" data-att="${r.id}">${open.has(r.id) ? t('results.hide') : t('results.attempts')}</button></div>
        <div class="cmp"><div><h3>${t('results.original')}</h3><p>${hl(r.original)}</p></div><div><h3>${t('results.proposal')}</h3><p>${hl(r.proposal)}</p></div></div>
        ${r.current !== null && r.current !== r.proposal ? `<div style="margin-top:8px"><h3 class="muted" style="margin:0;font-size:.72rem;text-transform:uppercase">${t('results.stored')}</h3><p style="margin:0;white-space:pre-wrap;font-size:.9rem">${hl(r.current)}</p></div>` : ''}
        ${r.problems.length ? `<div class="problems">${t('results.problems')}: ${r.problems.map(esc).join(' · ')}</div>` : ''}
        ${fenHtml(r)}
        ${open.has(r.id) ? `<div style="margin-top:8px">${loaded ? attemptsHtml(loaded) : t('results.loading')}</div>` : ''}</div>`
    }

    function attemptsHtml(d) {
      return `<table><thead><tr><th>${t('results.action')}</th><th>${t('results.status')}</th><th>${t('results.model')}</th><th>${t('results.proposal')}</th><th>${t('results.problems')}</th></tr></thead><tbody>${d.attempts.map((a) => `<tr><td>${esc(a.action)} · ${esc(a.lang)}</td><td>${esc(a.status)}</td><td>${esc(a.model ?? '')}</td><td>${hl(a.proposal ?? null)}</td><td>${(a.problems ?? []).map(esc).join(' · ')}</td></tr>`).join('')}</tbody></table>
        <p class="muted" style="font-size:.8rem">${t('results.stored')}: ${Object.entries(d.stored ?? {}).map(([l, s]) => `<b>${esc(l)}</b> ${s === '' ? esc(t('results.empty')) : window.ConsoleChess.highlightMoves(s)}`).join(' · ') || '—'}</p>`
    }

    /** Draws only the new rows; the ones already shown (checkboxes, open panels, scroll) are not touched. */
    function append(fresh) { $('#rs-rows').insertAdjacentHTML('beforeend', fresh.map(row).join('')) }
    /** Redraws one row in place. */
    function redrawRow(key) {
      const r = rows.find((x) => itemKey(x) === key); const node = [...$('#rs-rows').children].find((c) => c.dataset.row === key)
      if (r && node) node.outerHTML = row(r)
    }
    const rowOf = (target) => { const d = target.closest('[data-row]'); return d ? rows.find((x) => itemKey(x) === d.dataset.row) : null }

    function list() { /* rows are appended by load(); kept for callers that only need the footer and selection refreshed */ foot() }

    function wireList() {
      const box = $('#rs-list')
      box.addEventListener('change', (e) => {
        const c = e.target
        if (c.matches('[data-all]')) { for (const r of rows) c.checked ? selected.set(itemKey(r), { id: r.id, lang: r.lang, action: r.action }) : selected.delete(itemKey(r)); box.querySelectorAll('[data-sel]').forEach((x) => { x.checked = c.checked }); bulk() }
        else if (c.matches('[data-sel]')) { const r = rowOf(c); if (c.checked) selected.set(c.dataset.sel, { id: r.id, lang: r.lang, action: r.action }); else selected.delete(c.dataset.sel); bulk(); foot() }
      })
      box.addEventListener('click', async (e) => {
        const b = e.target.closest('button')
        const r = rowOf(e.target)
        if (!r) return
        if (b?.matches('[data-fen]')) { const k = itemKey(r); if (fenOpen.has(k)) fenOpen.delete(k); else fenOpen.add(k); redrawRow(k); return }
        if (b?.matches('[data-review]')) return openModal(r)
        if (b?.matches('[data-redo]')) return startRedo([{ id: r.id, action: r.action, lang: r.lang }])
        if (b?.matches('[data-att]')) {
          const id = r.id
          if (open.has(id)) open.delete(id); else { open.add(id); rows.filter((x) => x.id === id).forEach((x) => redrawRow(itemKey(x))); try { attempts.set(id, await api(`/api/results/${id}`)) } catch { attempts.set(id, { attempts: [], stored: {} }) } }
          rows.filter((x) => x.id === id).forEach((x) => redrawRow(itemKey(x)))
          return
        }
        if (e.target.closest('button, input, select, textarea, a, label, table, svg')) return
        if (r.action === 'translate') openModal(r)
      })
    }

    let bulkAction = '', bulkLang = '', instructions = ''
    function bulk() {
      if (!selected.size) { $('#rs-bulk').innerHTML = ''; return }
      $('#rs-bulk').innerHTML = `<div class="card" style="margin-top:12px;border-color:var(--accent)"><div style="display:flex;flex-wrap:wrap;gap:10px;align-items:end">
        <b>${t('results.selected', { n: n(selected.size) })}</b>
        <label>${t('results.redoAs')}<br><select data-b="action">${opt('', bulkAction, t('results.redoKeep'))}${opt('universal', bulkAction, t('results.redoUniversal'))}${opt('translate', bulkAction, t('results.redoTranslate'))}</select></label>
        ${bulkAction === 'translate' ? `<label>${t('results.lang.target')}<br><input data-b="lang" value="${esc(bulkLang)}" size="3" maxlength="2" placeholder="es"></label>` : ''}
        <label style="flex:1;min-width:220px">${t('results.instructions')}<br><input data-b="instructions" value="${esc(instructions)}" style="width:100%"></label>
        <button class="btn primary" data-go>${t('results.redo')}</button> <button class="btn" data-clear>${t('results.clear')}</button></div></div>`
      $('#rs-bulk').querySelectorAll('[data-b]').forEach((f) => f.addEventListener('change', () => { if (f.dataset.b === 'action') { bulkAction = f.value; bulk() } else if (f.dataset.b === 'lang') bulkLang = f.value.trim(); else instructions = f.value }))
      $('#rs-bulk').querySelector('[data-clear]').addEventListener('click', () => { selected.clear(); $('#rs-list').querySelectorAll('[data-sel], [data-all]').forEach((x) => { x.checked = false }); bulk() })
      $('#rs-bulk').querySelector('[data-go]').addEventListener('click', () => {
        const items = [...selected.values()].map((s) => {
          const action = bulkAction || s.action
          // A new action keeps the language of the result, except a translation to the language chosen here.
          return { id: s.id, action, lang: action === 'translate' ? (bulkAction === 'translate' && bulkLang ? bulkLang : s.lang) : s.lang }
        })
        startRedo(items)
      })
    }

    async function startRedo(items) {
      try {
        await api('/api/results/redo', { method: 'POST', body: { items, ...(instructions ? { instructions } : {}) } })
        notice = t('results.redoStarted', { n: n(items.length) }); noticeBad = false
        await pollRedo()
      } catch (e) { notice = e.message.includes('Queue tab') || /external/i.test(e.message) ? `${t('results.redoError', { msg: '' })}${t('results.noExternal')}` : t('results.redoError', { msg: e.message }); noticeBad = true; redoPanel() }
    }

    async function pollRedo() {
      try { redo = await api('/api/results/redo') } catch { /* keep the last one */ }
      if (disposed) return
      redoPanel()
      clearTimeout(timer)
      if (redo.job?.running) timer = setTimeout(pollRedo, 2000)
      else if (data) refresh()
    }

    async function act(kind, ids, force) {
      try {
        const r = await api(`/api/results/redo/${kind}`, { method: 'POST', body: { ids, ...(force ? { force: true } : {}) } })
        notice = kind === 'apply' ? t('results.applied', { n: n(r.applied) }) : t('results.discarded', { n: n(r.discarded) }); noticeBad = false
        picked.clear()
      } catch (e) { notice = t('results.applyError', { msg: e.message }); noticeBad = true }
      await pollRedo()
      if (data) refresh()
    }

    function redoPanel() {
      const j = redo.job ?? {}
      const proposals = redo.proposals ?? []
      const pending = proposals.filter((p) => p.status === 'proposed')
      const jobLine = j.total ? (j.running ? t('results.jobRunning', { done: n(j.done), total: n(j.total) }) : j.cancelled ? t('results.jobCancelled', { done: n(j.done), total: n(j.total) }) : t('results.jobDone', { done: n(j.done), total: n(j.total) })) : ''
      $('#rs-redo').innerHTML = `<h2>${t('results.proposals')}</h2>
        ${notice ? `<p class="${noticeBad ? 'err' : ''}">${esc(notice)}</p>` : ''}
        ${jobLine ? `<p><b>${t('results.job')}:</b> ${esc(jobLine)} ${j.running ? `<button class="btn small" data-cancel>${t('results.cancel')}</button>` : ''}</p>${j.total ? `<div class="bar"><i style="width:${Math.round((j.done / j.total) * 100)}%"></i></div>` : ''}` : ''}
        ${j.errors?.length ? `<div class="problems"><b>${t('results.errors')}</b><br>${j.errors.map((e) => `#${e.id} ${esc(e.action)} ${esc(e.lang)}: ${esc(e.error)}`).join('<br>')}</div>` : ''}
        ${proposals.length ? `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0">
          <button class="btn small" data-pick-all>${t('results.applyAll')}</button>
          <button class="btn small primary" data-apply${picked.size ? '' : ' disabled'}>${t('results.applySel')}</button>
          <button class="btn small" data-discard${picked.size ? '' : ' disabled'}>${t('results.discardSel')}</button>
          <label><input type="checkbox" data-force${forceOn ? ' checked' : ''}> ${t('results.force')}</label></div>
          ${proposals.map((p) => `<div class="item"><div class="meta">${p.status === 'proposed' ? `<label><input type="checkbox" data-pick="${esc(p.key)}"${picked.has(p.key) ? ' checked' : ''}> #${p.id}</label>` : `<span>#${p.id}</span>`}
            <span class="tag">${esc(t(`results.a.${p.action}`))} · ${esc(p.lang)}</span><span class="tag">${esc(t(`results.p.${p.status}`))}</span><span>${t('results.model')}: ${esc(p.model)}</span>
            ${p.status === 'proposed' ? `<button class="btn small" data-one-apply="${esc(p.key)}">${t('results.apply')}</button> <button class="btn small" data-one-discard="${esc(p.key)}">${t('results.discard')}</button>` : ''}</div>
            <div class="cmp"><div><h3>${t('results.previous')}</h3><p>${hl(p.previous)}</p></div><div><h3>${t('results.newText')}</h3><p>${hl(p.proposal)}</p></div></div>
            ${p.problems?.length ? `<div class="problems">${t('results.problems')}: ${p.problems.map(esc).join(' · ')}</div>` : ''}</div>`).join('')}` : `<p class="empty">${t('results.noProposals')}</p>`}`
      const root = $('#rs-redo'), force = () => forceOn
      root.querySelector('[data-force]')?.addEventListener('change', (e) => { forceOn = e.target.checked })
      root.querySelector('[data-cancel]')?.addEventListener('click', async () => { await api('/api/results/redo/cancel', { method: 'POST', body: {} }); pollRedo() })
      root.querySelector('[data-pick-all]')?.addEventListener('click', () => { for (const p of pending) picked.add(p.key); redoPanel() })
      root.querySelectorAll('[data-pick]').forEach((c) => c.addEventListener('change', () => { if (c.checked) picked.add(c.dataset.pick); else picked.delete(c.dataset.pick); redoPanel() }))
      root.querySelector('[data-apply]')?.addEventListener('click', () => act('apply', [...picked], force()))
      root.querySelector('[data-discard]')?.addEventListener('click', () => act('discard', [...picked], false))
      root.querySelectorAll('[data-one-apply]').forEach((b) => b.addEventListener('click', () => act('apply', [b.dataset.oneApply], force())))
      root.querySelectorAll('[data-one-discard]').forEach((b) => b.addEventListener('click', () => act('discard', [b.dataset.oneDiscard], false)))
    }

    // ---- the review modal of one translation ----
    let overlay = null
    function closeModal() { overlay?.remove(); overlay = null }
    async function openModal(r) {
      closeModal()
      overlay = document.createElement('div')
      overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true')
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:50;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:30px 12px'
      document.body.appendChild(overlay)
      overlay.innerHTML = `<div class="card" style="max-width:900px;width:100%"><p class="empty">${t('results.m.loading')}</p></div>`
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal() })
      let d, models = []
      try { d = await api(`/api/results/${r.id}`) } catch (e) { overlay.firstChild.innerHTML = `<p class="err">${esc(e.message)}</p><button class="btn" data-x>${t('results.m.close')}</button>`; overlay.querySelector('[data-x]').addEventListener('click', closeModal); return }
      try { models = (await api('/api/ollama/models')).installed ?? [] } catch { /* none */ }
      const own = d.comment?.own
      let msg = '', bad = false, showFen = false, draft = null // draft: an unsaved edit kept while the modal redraws
      const draw = () => {
        if (!overlay) return
        const stored = d.stored?.[r.lang]
        const att = (d.attempts ?? []).find((a) => a.action === 'translate' && a.lang === r.lang)
        const prop = (d.redo ?? []).find((p) => p.lang === r.lang && p.status === 'proposed')
        overlay.firstChild.innerHTML = `<h2 style="margin-bottom:8px">${esc(t('results.m.title', { id: r.id, lang: r.lang }))}</h2>
          <div class="meta">${d.comment ? `<span>${esc(d.comment.source ?? '')}</span><span>${esc(t('results.move', { ply: d.comment.ply, san: d.comment.san }))}</span>` : ''}</div>
          <h3 class="muted" style="margin:6px 0 2px;font-size:.72rem;text-transform:uppercase">${t('results.m.normalized')}</h3>
          <p style="margin:0 0 10px;white-space:pre-wrap">${hl(d.stored?.[own] ?? null)} ${d.comment?.fen ? `<button class="btn small fen-btn" data-mfen title="${esc(t('results.showPos'))}" aria-label="${esc(t('results.showPos'))}" aria-pressed="${showFen}">♟</button>` : ''}</p>
          ${showFen && d.comment?.fen ? `<div style="display:flex;gap:10px;align-items:center;margin-bottom:10px">${window.ConsoleChess.boardSvg(d.comment.fen, { size: 160, mark: d.comment.mark || undefined })}<span class="muted">${esc(window.ConsoleChess.afterLabel(d.comment.ply, d.comment.san, { after: t('results.after'), initial: t('results.initial') }))}</span></div>` : ''}
          <h3 class="muted" style="margin:6px 0 2px;font-size:.72rem;text-transform:uppercase">${t('results.m.stored')}</h3>
          <textarea data-text rows="6" style="width:100%" ${stored === undefined ? 'disabled' : ''}>${esc(draft ?? stored ?? '')}</textarea>
          ${att ? `<div class="meta" style="margin-top:6px"><span>${t('results.m.attempt')}:</span><span class="tag">${esc(t(`results.s.${att.status}`))}</span><span>${t('results.model')}: ${esc(att.model ?? '')}</span></div>${att.problems?.length ? `<div class="problems">${t('results.problems')}: ${att.problems.map(esc).join(' · ')}</div>` : ''}` : ''}
          ${msg ? `<p class="${bad ? 'err' : ''}">${esc(msg)}</p>` : ''}
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0"><button class="btn primary" data-save${stored === undefined ? ' disabled' : ''}>${t('results.m.save')}</button>
            <button class="btn" data-revoke${stored === undefined ? ' disabled' : ''}>${t('results.m.revoke')}</button><button class="btn" data-revoke-q${stored === undefined ? ' disabled' : ''}>${t('results.m.revokeQueue')}</button><button class="btn" data-x style="margin-left:auto">${t('results.m.close')}</button></div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center"><button class="btn" data-ext>${t('results.m.redoExt')}</button>
            <label>${t('results.m.model')} <select data-model>${models.length ? models.map((m) => `<option>${esc(m.name)}</option>`).join('') : `<option value="">${t('results.m.noModels')}</option>`}</select></label>
            <button class="btn" data-local${models.length ? '' : ' disabled'}>${t('results.m.redoLocal')}</button></div>
          <p class="muted" style="font-size:.8rem">${t('results.m.gpuWarn')}</p>
          ${prop ? `<div class="item" style="margin-top:8px"><h3 class="muted" style="margin:0 0 3px;font-size:.72rem;text-transform:uppercase">${t('results.m.proposal')} · ${esc(prop.model)}</h3><p style="margin:0;white-space:pre-wrap">${hl(prop.proposal)}</p>${prop.problems?.length ? `<div class="problems">${t('results.problems')}: ${prop.problems.map(esc).join(' · ')}</div>` : ''}
            <div style="margin-top:8px"><button class="btn small primary" data-p-apply>${t('results.apply')}</button> <button class="btn small" data-p-discard>${t('results.discard')}</button>${prop.problems?.length ? ` <label><input type="checkbox" data-p-force> ${t('results.force')}</label>` : ''}</div></div>` : ''}`
        const $m = (s) => overlay.querySelector(s)
        const reload = async () => { try { d = await api(`/api/results/${r.id}`) } catch { /* keep */ } draw(); refresh(); pollRedo() }
        const run = async (fn) => { try { msg = await fn(); bad = false } catch (e) { msg = t('results.m.err', { msg: e.message }); bad = true } await reload() }
        $m('[data-x]').addEventListener('click', closeModal)
        $m('[data-mfen]')?.addEventListener('click', () => { const box = $m('[data-text]'); if (box && !box.disabled) draft = box.value; showFen = !showFen; draw() })
        $m('[data-save]')?.addEventListener('click', () => run(async () => { await api(`/api/results/translations/${r.id}/${r.lang}`, { method: 'PUT', body: { text: $m('[data-text]').value } }); return t('results.m.saved') }))
        const revoke = (queue) => () => { if (!confirm(t('results.m.confirmRevoke'))) return; run(async () => {
          await api(`/api/results/translations/${r.id}/${r.lang}`, { method: 'DELETE' })
          if (!queue) return t('results.m.revoked')
          try { await api('/api/queue', { method: 'POST', body: { phase: 'translate', kind: d.comment?.kind ?? r.kind, langs: [r.lang] } }); return t('results.m.queued') } catch (e) { bad = true; return t('results.m.queueFail', { msg: e.message }) }
        }) }
        $m('[data-revoke]')?.addEventListener('click', revoke(false))
        $m('[data-revoke-q]')?.addEventListener('click', revoke(true))
        const redoVia = (via) => () => run(async () => {
          const body = { items: [{ id: r.id, action: 'translate', lang: r.lang }], via, ...(via === 'local' ? { model: $m('[data-model]').value } : {}), ...(instructions ? { instructions } : {}) }
          await api('/api/results/redo', { method: 'POST', body })
          // Wait for the single request to finish, then the proposal shows here.
          for (let i = 0; i < 600 && overlay; i++) { const s = await api('/api/results/redo'); if (!s.job.running) { d.redo = s.proposals.filter((p) => p.id === r.id); const e = s.job.errors?.[0]; if (e) throw new Error(e.error); return t('results.redoStarted', { n: 1 }) } await new Promise((x) => setTimeout(x, 1500)) }
          return ''
        })
        $m('[data-ext]').addEventListener('click', redoVia('external'))
        $m('[data-local]')?.addEventListener('click', redoVia('local'))
        $m('[data-p-apply]')?.addEventListener('click', () => run(async () => { const f = !!$m('[data-p-force]')?.checked; const x = await api('/api/results/redo/apply', { method: 'POST', body: { ids: [`${r.id}:${r.lang}`], ...(f ? { force: true } : {}) } }); return t('results.applied', { n: x.applied }) }))
        $m('[data-p-discard]')?.addEventListener('click', () => run(async () => { const x = await api('/api/results/redo/discard', { method: 'POST', body: { ids: [`${r.id}:${r.lang}`] } }); return t('results.discarded', { n: x.discarded }) }))
      }
      draw()
    }

    frame(); wireList(); filters(); chips(); load(true); pollRedo()
    return () => { disposed = true; clearTimeout(timer); closeModal(); observer?.disconnect() }
  },
})
