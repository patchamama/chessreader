// Library books tab: the uploaded books, their comments in the commentary database, a dry-run preview and Add.
Console.addStrings({
  en: {
    'bk.title': 'Library books', 'bk.loading': 'Loading…', 'bk.noDb': 'No database is set. Start the console with --db <comments.sqlite>.',
    'bk.noLib': 'Library database not found: {path}. Set "libraryDb" in the settings.',
    'bk.where': 'Comments are stored in the commentary database under the language of their source (comment_sources.lang): the language of the book in the library.',
    'bk.col.title': 'Title', 'bk.col.author': 'Author', 'bk.col.lang': 'Language', 'bk.col.chapters': 'Chapters', 'bk.col.comments': 'Comments', 'bk.col.source': 'Source (section)', 'bk.none': 'No books in the library.',
    'bk.noLang': 'unknown', 'bk.noSource': 'no source', 'bk.preview': 'Preview', 'bk.previewing': 'Reading the book…',
    'bk.pv.title': 'Preview (nothing is written)', 'bk.pv.games': 'Games found: {games} · with comments: {withComments} · comments: {comments} · chapters with text: {chapters}',
    'bk.pv.lang': 'Would be filed under language: {lang}', 'bk.pv.perChapter': 'Comments per chapter', 'bk.pv.sample': 'Sample', 'bk.pv.none': 'No comments recognised.',
    'bk.pv.exists': 'This book already has a source ("{title}", language {lang}) with {comments} comments.',
    'bk.pv.fresh': 'This book has no source yet.', 'bk.chooseLang': 'The library has no language for this book: choose one', 'bk.lang': 'Language',
    'bk.confirm': 'I confirm: write these comments to the commentary database', 'bk.replace': 'Replace the existing source (deletes its {comments} comments, {games} games and their translations first)', 'bk.add': 'Add to the database', 'bk.adding': 'Adding… ({step})',
    'bk.added': 'Added "{title}": {games} games, {comments} comments, language {lang}.', 'bk.replaced': 'Replaced the old source: {comments} comments and {translations} translations deleted.', 'bk.skipped': 'Skipped: the book already has a source with {comments} comments. Tick "replace" to redo it.',
    'bk.note': 'The Status tab counters per language include them now; they are normalized and translated later by the Queue.', 'bk.error': 'Error: {msg}',
    'bk.requested': 'Requested', 'bk.fulfilled': 'Fulfilled', 'bk.onlyRequested': 'Only requested books', 'bk.reqTitle': 'Requested on {date}: {note}',
    'bk.step.export': 'exporting', 'bk.step.build': 'building comments', 'bk.step.merge': 'writing to the database',
  },
  es: {
    'bk.title': 'Libros de la biblioteca', 'bk.loading': 'Cargando…', 'bk.noDb': 'No hay base de datos. Inicia la consola con --db <comments.sqlite>.',
    'bk.noLib': 'No se encuentra la base de la biblioteca: {path}. Define "libraryDb" en los ajustes.',
    'bk.where': 'Los comentarios se guardan en la base de comentarios bajo el idioma de su fuente (comment_sources.lang): el idioma del libro en la biblioteca.',
    'bk.col.title': 'Título', 'bk.col.author': 'Autor', 'bk.col.lang': 'Idioma', 'bk.col.chapters': 'Capítulos', 'bk.col.comments': 'Comentarios', 'bk.col.source': 'Fuente (sección)', 'bk.none': 'No hay libros en la biblioteca.',
    'bk.noLang': 'desconocido', 'bk.noSource': 'sin fuente', 'bk.preview': 'Previsualizar', 'bk.previewing': 'Leyendo el libro…',
    'bk.pv.title': 'Previsualización (no se escribe nada)', 'bk.pv.games': 'Partidas encontradas: {games} · con comentarios: {withComments} · comentarios: {comments} · capítulos con texto: {chapters}',
    'bk.pv.lang': 'Se guardaría en el idioma: {lang}', 'bk.pv.perChapter': 'Comentarios por capítulo', 'bk.pv.sample': 'Muestra', 'bk.pv.none': 'No se reconoció ningún comentario.',
    'bk.pv.exists': 'Este libro ya tiene una fuente ("{title}", idioma {lang}) con {comments} comentarios.',
    'bk.pv.fresh': 'Este libro todavía no tiene fuente.', 'bk.chooseLang': 'La biblioteca no tiene idioma para este libro: elige uno', 'bk.lang': 'Idioma',
    'bk.confirm': 'Confirmo: escribir estos comentarios en la base de comentarios', 'bk.replace': 'Reemplazar la fuente existente (borra antes sus {comments} comentarios, {games} partidas y traducciones)', 'bk.add': 'Añadir a la base de datos', 'bk.adding': 'Añadiendo… ({step})',
    'bk.added': 'Añadido "{title}": {games} partidas, {comments} comentarios, idioma {lang}.', 'bk.replaced': 'Fuente anterior reemplazada: {comments} comentarios y {translations} traducciones borrados.', 'bk.skipped': 'Omitido: el libro ya tiene una fuente con {comments} comentarios. Marca "reemplazar" para rehacerla.',
    'bk.note': 'Los contadores por idioma de la pestaña Estado ya los incluyen; la Cola los normaliza y traduce después.', 'bk.error': 'Error: {msg}',
    'bk.requested': 'Solicitado', 'bk.fulfilled': 'Cumplido', 'bk.onlyRequested': 'Solo libros solicitados', 'bk.reqTitle': 'Solicitado el {date}: {note}',
    'bk.step.export': 'exportando', 'bk.step.build': 'construyendo comentarios', 'bk.step.merge': 'escribiendo en la base de datos',
  },
})

Console.registerTab({
  id: 'books', order: 55, title: { en: 'Library books', es: 'Libros de la biblioteca' },
  render(el, { t, api, esc, n }) {
    let data = null, pv = null, msg = '', busy = '', step = '', timer = null, disposed = false
    let onlyReq = false, bookId = null, lang = '', confirm = false, replace = false
    const LANGS = ['es', 'en', 'de', 'fr', 'it', 'pt']

    // A pending request is open only while the book has no comments; once it has, it counts as fulfilled.
    const reqState = (b) => (b.request?.status === 'pending' ? (b.comments > 0 ? 'fulfilled' : 'open') : null)
    const badge = (b) => {
      const st = reqState(b)
      if (!st) return ''
      const title = t('bk.reqTitle', { date: (b.request.createdAt ?? '').slice(0, 10), note: b.request.note || '' })
      return ` <span class="pill ${st === 'open' ? 'run' : 'idle'}" title="${esc(title)}">${t(st === 'open' ? 'bk.requested' : 'bk.fulfilled')}</span>`
    }
    const shown = () => {
      const open = (b) => (reqState(b) === 'open' ? 0 : 1)
      const list = onlyReq ? data.books.filter((b) => reqState(b) === 'open') : data.books
      return [...list].sort((a, b) => open(a) - open(b) || a.id - b.id)
    }

    const listHtml = () => {
      if (!data) return `<p class="empty">${t('bk.loading')}</p>`
      if (!data.configured) return `<p class="err">${t('bk.noDb')}</p>`
      if (!data.libraryConfigured) return `<p class="err">${esc(t('bk.noLib', { path: data.libraryDb }))}</p>`
      if (!data.books.length) return `<p class="empty">${t('bk.none')}</p>`
      return `<p><label><input type="checkbox" id="bk-only" ${onlyReq ? 'checked' : ''}> ${t('bk.onlyRequested')}</label></p><div style="overflow-x:auto"><table class="tbl"><thead><tr><th>${t('bk.col.title')}</th><th>${t('bk.col.author')}</th><th>${t('bk.col.lang')}</th><th>${t('bk.col.chapters')}</th><th>${t('bk.col.comments')}</th><th>${t('bk.col.source')}</th><th></th></tr></thead><tbody>
        ${shown().map((b) => `<tr><td>${esc(b.title)}${badge(b)}</td><td>${esc(b.author)}</td><td>${b.language ? esc(b.language) : `<span class="muted">${t('bk.noLang')}</span>`}</td><td>${n(b.chapters)}</td><td>${n(b.comments)}</td>
          <td>${b.source ? `${esc(b.source.title)} <span class="tag">${esc(b.source.lang)}</span>` : `<span class="muted">${t('bk.noSource')}</span>`}</td>
          <td><button type="button" class="btn" data-preview="${b.id}" ${busy ? 'disabled' : ''}>${t('bk.preview')}</button></td></tr>`).join('')}</tbody></table></div>`
    }

    const pvHtml = () => {
      if (busy === 'preview') return `<p class="sub-line">${t('bk.previewing')}</p>`
      if (!pv) return ''
      const ex = pv.existing
      return `<div class="card" style="margin-top:14px"><h2>${esc(pv.title)} — ${t('bk.pv.title')}</h2>
        <p>${t('bk.pv.games', { games: n(pv.games), withComments: n(pv.gamesWithComments), comments: n(pv.comments), chapters: n(pv.chapters) })}</p>
        <p>${pv.needsLang ? `<label>${t('bk.chooseLang')} <select id="bk-lang"><option value=""></option>${LANGS.map((l) => `<option value="${l}" ${lang === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : t('bk.pv.lang', { lang: pv.lang })}</p>
        <p>${ex ? t('bk.pv.exists', { title: esc(ex.title), lang: ex.lang, comments: n(ex.comments) }) : t('bk.pv.fresh')}</p>
        ${pv.perChapter.length ? `<h3>${t('bk.pv.perChapter')}</h3><p class="sub-line">${pv.perChapter.map((c) => `${c.chapter}: ${n(c.comments)}`).join(' · ')}</p><h3>${t('bk.pv.sample')}</h3><ul>${pv.sample.map((s) => `<li><span class="mono">${esc(s.san)}</span> ${esc(s.text)}</li>`).join('')}</ul>` : `<p class="empty">${t('bk.pv.none')}</p>`}
        <p><label><input type="checkbox" id="bk-confirm" ${confirm ? 'checked' : ''}> ${t('bk.confirm')}</label></p>
        ${ex ? `<p><label><input type="checkbox" id="bk-replace" ${replace ? 'checked' : ''}> ${esc(t('bk.replace', { comments: n(ex.comments), games: '?' }))}</label></p>` : ''}
        <p><button type="button" class="btn primary" id="bk-add" ${busy || !confirm || !pv.comments || (pv.needsLang && !lang) ? 'disabled' : ''}>${busy === 'add' ? esc(t('bk.adding', { step: step ? t(`bk.step.${step}`) : '' })) : t('bk.add')}</button></p></div>`
    }

    function draw() {
      if (disposed) return
      el.innerHTML = `<h1>${t('bk.title')}</h1><p class="sub-line">${t('bk.where')}</p>
        <div class="card">${listHtml()}</div>
        <p id="bk-msg" role="status" class="${msg.startsWith('!') ? 'err' : 'sub-line'}">${esc(msg.replace(/^!/, ''))}</p>${pvHtml()}`
      el.querySelector('#bk-only')?.addEventListener('change', (e) => { onlyReq = e.target.checked; draw() })
      el.querySelectorAll('[data-preview]').forEach((b) => b.addEventListener('click', () => void runPreview(Number(b.dataset.preview))))
      el.querySelector('#bk-lang')?.addEventListener('change', (e) => { lang = e.target.value; draw() })
      el.querySelector('#bk-confirm')?.addEventListener('change', (e) => { confirm = e.target.checked; draw() })
      el.querySelector('#bk-replace')?.addEventListener('change', (e) => { replace = e.target.checked; draw() })
      el.querySelector('#bk-add')?.addEventListener('click', () => void runAdd())
    }

    async function load() {
      try { data = await api('/api/books/list') } catch (e) { data = { configured: true, libraryConfigured: true, books: [] }; msg = `!${t('bk.error', { msg: e.message })}` }
      draw()
    }
    async function runPreview(id) {
      bookId = id; pv = null; confirm = false; replace = false; msg = ''; busy = 'preview'; draw()
      try { pv = await api('/api/books/preview', { method: 'POST', body: { bookId, ...(lang ? { lang } : {}) } }); if (!pv.needsLang) lang = '' } catch (e) { msg = `!${t('bk.error', { msg: e.message })}` }
      busy = ''; draw()
    }
    async function runAdd() {
      busy = 'add'; step = 'export'; msg = ''; draw()
      timer = setInterval(async () => { try { step = (await api('/api/books/job')).step; draw() } catch { /* ignore */ } }, 1500)
      try {
        const r = await api('/api/books/add', { method: 'POST', body: { bookId, confirm, replace, ...(lang ? { lang } : {}) } })
        msg = r.added ? [t('bk.added', r.added), r.replaced ? t('bk.replaced', r.replaced) : '', t('bk.note')].filter(Boolean).join(' ') : t('bk.skipped', r.skipped)
        if (r.added) { pv = null; confirm = false; replace = false }
        await load()
      } catch (e) { msg = `!${t('bk.error', { msg: e.message })}` }
      clearInterval(timer); timer = null; busy = ''; step = ''; draw()
    }

    draw()
    void load()
    return () => { disposed = true; if (timer) clearInterval(timer) }
  },
})
