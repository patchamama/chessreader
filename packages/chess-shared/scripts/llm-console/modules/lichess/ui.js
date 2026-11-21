// Lichess studies tab: the studies already in the database, a form to find new ones, a preview and Add.
Console.addStrings({
  en: {
    'li.tab': 'Lichess studies', 'li.title': 'Lichess studies', 'li.loading': 'Loading…', 'li.noDb': 'No database is set. Start the console with --db <comments.sqlite>.',
    'li.existing': 'Studies in the database', 'li.summary': '{studies} studies · {games} games · {comments} comments', 'li.none': 'No Lichess studies in the database yet.',
    'li.col.name': 'Study', 'li.col.author': 'Author', 'li.col.games': 'Games', 'li.col.comments': 'Comments', 'li.col.avg': 'Comments / game', 'li.col.norm': 'Normalized', 'li.col.dropped': 'Dropped', 'li.col.trans': 'Translated', 'li.col.langs': 'Languages', 'li.col.dates': 'Dates',
    'li.find': 'Find new studies', 'li.findHelp': 'A study URL or id, a Lichess username (their public studies), several separated by spaces, or the JSON list file the harvester uses.',
    'li.ref': 'URL, id, @user or JSON list', 'li.token': 'Lichess token (optional, kept in memory only, sent only to lichess.org)', 'li.preview': 'Preview', 'li.previewing': 'Fetching one study at a time…',
    'li.results': 'Preview', 'li.select': 'Add', 'li.col.owner': 'Owner', 'li.col.chapters': 'Chapters', 'li.col.annotated': 'Annotated', 'li.col.kept': 'Kept games', 'li.col.pcomments': 'Comments kept', 'li.col.updated': 'Updated', 'li.col.state': 'State',
    'li.inDb': 'already in the database', 'li.new': 'new', 'li.add': 'Add selected', 'li.adding': 'Adding… ({step})', 'li.added': 'Added {sources} source(s): {games} games, {comments} comments.', 'li.skipped': '{n} chapter(s) were already in the database.',
    'li.nothing': 'Nothing selected.', 'li.error': 'Error: {msg}', 'li.warning': 'Warning: {msg}', 'li.note': 'Next: queue normalization and translation of the new comments in the Queue tab.',
    'li.output': 'Script output', 'li.filterNote': 'Counted with the harvester filter: at least {minComments} comments of {minCommentChars}+ characters and {minPlies}+ plies per game.',
    'li.step.harvest': 'fetching studies', 'li.step.build': 'building comments', 'li.step.merge': 'writing to the database', 'li.open': 'open',
  },
  es: {
    'li.tab': 'Estudios de Lichess', 'li.title': 'Estudios de Lichess', 'li.loading': 'Cargando…', 'li.noDb': 'No hay base de datos. Inicia la consola con --db <comments.sqlite>.',
    'li.existing': 'Estudios en la base de datos', 'li.summary': '{studies} estudios · {games} partidas · {comments} comentarios', 'li.none': 'Todavía no hay estudios de Lichess en la base de datos.',
    'li.col.name': 'Estudio', 'li.col.author': 'Autor', 'li.col.games': 'Partidas', 'li.col.comments': 'Comentarios', 'li.col.avg': 'Comentarios / partida', 'li.col.norm': 'Normalizados', 'li.col.dropped': 'Descartados', 'li.col.trans': 'Traducidos', 'li.col.langs': 'Idiomas', 'li.col.dates': 'Fechas',
    'li.find': 'Buscar estudios nuevos', 'li.findHelp': 'La URL o el id de un estudio, un usuario de Lichess (sus estudios públicos), varios separados por espacios, o el archivo JSON de lista que usa el recolector.',
    'li.ref': 'URL, id, @usuario o lista JSON', 'li.token': 'Token de Lichess (opcional, solo en memoria, solo se envía a lichess.org)', 'li.preview': 'Previsualizar', 'li.previewing': 'Consultando un estudio cada vez…',
    'li.results': 'Previsualización', 'li.select': 'Añadir', 'li.col.owner': 'Propietario', 'li.col.chapters': 'Capítulos', 'li.col.annotated': 'Comentados', 'li.col.kept': 'Partidas válidas', 'li.col.pcomments': 'Comentarios válidos', 'li.col.updated': 'Actualizado', 'li.col.state': 'Estado',
    'li.inDb': 'ya está en la base de datos', 'li.new': 'nuevo', 'li.add': 'Añadir seleccionados', 'li.adding': 'Añadiendo… ({step})', 'li.added': 'Añadidas {sources} fuente(s): {games} partidas, {comments} comentarios.', 'li.skipped': '{n} capítulo(s) ya estaban en la base de datos.',
    'li.nothing': 'No hay nada seleccionado.', 'li.error': 'Error: {msg}', 'li.warning': 'Aviso: {msg}', 'li.note': 'Siguiente: encola la normalización y traducción de los comentarios nuevos en la pestaña Cola.',
    'li.output': 'Salida del script', 'li.filterNote': 'Contado con el filtro del recolector: al menos {minComments} comentarios de {minCommentChars}+ caracteres y {minPlies}+ medias jugadas por partida.',
    'li.step.harvest': 'descargando estudios', 'li.step.build': 'construyendo comentarios', 'li.step.merge': 'escribiendo en la base de datos', 'li.open': 'abrir',
  },
})

Console.registerTab({
  id: 'lichess', order: 50, title: { en: 'Lichess studies', es: 'Estudios de Lichess' },
  render(el, { t, api, esc, n }) {
    let data = null, preview = null, sort = { key: 'comments', dir: -1 }, msg = '', busy = '', timer = null, disposed = false
    const picked = new Set()
    let token = '' // memory only
    const oneDec = (v) => (Math.round(v * 10) / 10).toLocaleString()
    const COLS = [
      ['name', 'li.col.name'], ['author', 'li.col.author'], ['games', 'li.col.games'], ['comments', 'li.col.comments'], ['avgComments', 'li.col.avg'],
      ['normalized', 'li.col.norm'], ['dropped', 'li.col.dropped'], ['translated', 'li.col.trans'], ['langs', 'li.col.langs'], ['firstDate', 'li.col.dates'],
    ]
    const sorted = () => [...data.studies].sort((a, b) => {
      const x = a[sort.key], y = b[sort.key]
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(Array.isArray(x) ? x.join() : x ?? '').localeCompare(String(Array.isArray(y) ? y.join() : y ?? ''))
      return c * sort.dir
    })
    const link = (s) => (s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a>` : esc(s.name))

    function existingHtml() {
      if (!data) return `<p class="empty">${t('li.loading')}</p>`
      if (!data.configured) return `<p class="err">${t('li.noDb')}</p>`
      if (!data.studies.length) return `<p class="empty">${t('li.none')}</p>`
      const arrow = (k) => (sort.key === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : '')
      return `<p class="sub-line">${t('li.summary', { studies: n(data.totals.studies), games: n(data.totals.games), comments: n(data.totals.comments) })}</p>
        <div style="overflow-x:auto"><table class="tbl"><thead><tr>${COLS.map(([k, l]) => `<th><button type="button" class="linklike" data-sort="${k}" aria-label="${esc(t(l))}">${esc(t(l))}${arrow(k)}</button></th>`).join('')}</tr></thead>
        <tbody>${sorted().map((s) => `<tr><td>${link(s)}</td><td>${esc(s.author ?? '')}</td><td>${n(s.games)}</td><td>${n(s.comments)}</td><td>${oneDec(s.avgComments)}</td><td>${n(s.normalized)}</td><td>${n(s.dropped)}</td><td>${n(s.translated)}</td><td>${esc(s.langs.join(', '))}</td><td>${esc([s.firstDate, s.lastDate].filter((v, i, a) => v && a.indexOf(v) === i).join(' – '))}</td></tr>`).join('')}</tbody></table></div>`
    }

    function previewHtml() {
      if (!preview) return ''
      const f = preview.filter
      const rows = preview.studies.map((s) => {
        if (s.error) return `<tr><td></td><td>${esc(s.id)}</td><td colspan="7" class="err">${esc(s.error)}</td></tr>`
        return `<tr><td><input type="checkbox" data-pick="${esc(s.id)}" aria-label="${esc(t('li.select'))} ${esc(s.id)}" ${picked.has(s.id) ? 'checked' : ''} ${busy ? 'disabled' : ''}></td>
          <td><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name ?? s.id)}</a> <span class="tag">${esc(s.id)}</span></td><td>${esc(s.owner ?? '')}</td><td>${n(s.chapters)}</td><td>${n(s.annotated)}</td><td>${n(s.keptGames)}</td><td>${n(s.comments)}</td>
          <td>${esc(s.updated ? s.updated.slice(0, 10) : '')}</td><td>${s.inDb ? `<span class="pill idle">${t('li.inDb')}</span>` : `<span class="pill run">${t('li.new')}</span>`}</td></tr>`
      }).join('')
      return `<h2>${t('li.results')}</h2>
        ${preview.warnings.map((w) => `<p class="err">${esc(t('li.warning', { msg: w }))}</p>`).join('')}
        <p class="sub-line">${t('li.filterNote', f)}</p>
        <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>${t('li.select')}</th><th>${t('li.col.name')}</th><th>${t('li.col.owner')}</th><th>${t('li.col.chapters')}</th><th>${t('li.col.annotated')}</th><th>${t('li.col.kept')}</th><th>${t('li.col.pcomments')}</th><th>${t('li.col.updated')}</th><th>${t('li.col.state')}</th></tr></thead><tbody>${rows}</tbody></table></div>
        <p><button type="button" class="btn primary" id="li-add" ${busy || !picked.size ? 'disabled' : ''}>${busy === 'add' ? esc(t('li.adding', { step: stepLabel() })) : t('li.add')}</button></p>`
    }
    let step = ''
    const stepLabel = () => (step ? t(`li.step.${step}`) : '')

    function draw() {
      if (disposed) return
      const focus = document.activeElement?.id
      el.innerHTML = `<h1>${t('li.title')}</h1>
        <div class="card"><h2>${t('li.existing')}</h2>${existingHtml()}</div>
        <div class="card" style="margin-top:14px"><h2>${t('li.find')}</h2><p class="sub-line">${t('li.findHelp')}</p>
          <form id="li-form" style="display:grid;gap:8px;max-width:640px">
            <label>${t('li.ref')}<textarea id="li-ref" rows="2" style="width:100%" autocomplete="off" spellcheck="false">${esc(el.dataset.ref ?? '')}</textarea></label>
            <label>${t('li.token')}<input id="li-token" type="password" autocomplete="off" style="width:100%" value="${esc(token)}"></label>
            <div><button type="submit" class="btn primary" ${busy ? 'disabled' : ''}>${busy === 'preview' ? t('li.previewing') : t('li.preview')}</button></div>
          </form>
          <p id="li-msg" role="status" class="${msg.startsWith('!') ? 'err' : 'sub-line'}">${esc(msg.replace(/^!/, ''))}</p>
          ${previewHtml()}
        </div>`
      el.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => { sort = { key: b.dataset.sort, dir: sort.key === b.dataset.sort ? -sort.dir : (typeof data.studies[0]?.[b.dataset.sort] === 'number' ? -1 : 1) }; draw() }))
      el.querySelectorAll('[data-pick]').forEach((c) => c.addEventListener('change', () => { c.checked ? picked.add(c.dataset.pick) : picked.delete(c.dataset.pick); draw() }))
      el.querySelector('#li-ref').addEventListener('input', (e) => { el.dataset.ref = e.target.value })
      el.querySelector('#li-token').addEventListener('input', (e) => { token = e.target.value })
      el.querySelector('#li-form').addEventListener('submit', (e) => { e.preventDefault(); void runPreview() })
      el.querySelector('#li-add')?.addEventListener('click', () => void runAdd())
      if (focus) document.getElementById(focus)?.focus()
    }

    async function load() {
      try { data = await api('/api/lichess/studies') } catch (e) { data = { configured: true, studies: [], totals: { studies: 0, games: 0, comments: 0 } }; msg = `!${t('li.error', { msg: e.message })}` }
      draw()
    }

    async function runPreview() {
      const ref = (el.dataset.ref ?? '').trim()
      if (!ref) return
      busy = 'preview'; msg = ''; preview = null; picked.clear(); draw()
      try {
        preview = await api('/api/lichess/preview', { method: 'POST', body: { ref, ...(token ? { token } : {}) } })
        for (const s of preview.studies) if (!s.error && !s.inDb) picked.add(s.id)
      } catch (e) { msg = `!${t('li.error', { msg: e.message })}` }
      busy = ''; draw()
    }

    async function runAdd() {
      const studies = preview.studies.filter((s) => picked.has(s.id)).map((s) => ({ id: s.id, ...(s.lang && s.lang !== 'en' ? { lang: s.lang } : {}) }))
      if (!studies.length) { msg = t('li.nothing'); draw(); return }
      busy = 'add'; msg = ''; step = 'harvest'; draw()
      timer = setInterval(async () => { try { step = (await api('/api/lichess/job')).step; draw() } catch { /* ignore */ } }, 2000)
      try {
        const r = await api('/api/lichess/add', { method: 'POST', body: { studies, ...(token ? { token } : {}) } })
        msg = [t('li.added', { sources: r.added.length, games: r.added.reduce((a, s) => a + s.games, 0), comments: r.added.reduce((a, s) => a + s.comments, 0) }), r.skipped.length ? t('li.skipped', { n: r.skipped.length }) : '', t('li.note')].filter(Boolean).join(' ')
        preview = null; picked.clear()
        await load()
      } catch (e) { msg = `!${t('li.error', { msg: e.message })}` }
      clearInterval(timer); timer = null; busy = ''; step = ''; draw()
    }

    draw()
    void load()
    return () => { disposed = true; if (timer) clearInterval(timer) }
  },
})
