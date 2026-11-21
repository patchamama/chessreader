// Publish tab: update the external resources repository and the sample repository from the local database.
// Flow per target: settings (owner/name) → dry run (local vs remote statistics) → confirm → publish (background job).
Console.addStrings({
  en: {
    'sy.tab': 'Publish', 'sy.title': 'Publish to the resource repositories', 'sy.loading': 'Loading…',
    'sy.settings': 'Repositories', 'sy.resourcesRepo': 'Resources repository (private, owner/name)', 'sy.sampleRepo': 'Sample repository (public, owner/name)', 'sy.branch': 'Branch', 'sy.save': 'Save', 'sy.saved': 'Saved',
    'sy.resources': 'Resources repository', 'sy.sample': 'Sample repository', 'sy.notSet': 'Set the repository above first.',
    'sy.token': 'GitHub token', 'sy.tokenSecret': 'available (environment GITHUB_TOKEN or the console\'s secrets)', 'sy.tokenGh': 'available (from `gh auth token`)', 'sy.tokenMemory': 'available (typed here, kept in memory only)', 'sy.tokenNone': 'not available: set GITHUB_TOKEN, run `gh auth login`, or type one below',
    'sy.tokenField': 'Token (kept in memory only: never saved, logged or shown again)', 'sy.tokenUse': 'Use for this session',
    'sy.local': 'Local database', 'sy.remote': 'In the repository', 'sy.diff': 'Difference', 'sy.stat': 'Figure', 'sy.willWrite': 'To write',
    'sy.comments': 'comments', 'sy.translations': 'translations', 'sy.sources': 'sources', 'sy.games': 'games', 'sy.shards': 'shards', 'sy.positions': 'positions', 'sy.hidden': 'hidden (not published)', 'sy.size': 'database size', 'sy.files': 'files', 'sy.repoSize': 'repository size', 'sy.built': 'built',
    'sy.byKind': 'Comments by source and language', 'sy.normalized': 'Normalized ({lang})', 'sy.translatedTo': 'Translated to {lang}', 'sy.dropped': 'dropped as not universal',
    'sy.sampleOptions': 'Sample options', 'sy.mode': 'Content', 'sy.modeTop': 'Most commented positions of the books', 'sy.modeLichess': 'All Lichess comments', 'sy.topN': 'Number of positions', 'sy.perPos': 'Comments per position (up to 3, chosen at random)', 'sy.cap': 'Cap on comments (optional)', 'sy.seed': 'Seed (same seed, same sample)', 'sy.noteEn': 'Sample note (English comments)', 'sy.noteEs': 'Sample note (Spanish comments)',
    'sy.sampleWill': 'The sample will contain {comments} comments on {positions} positions from {games} games.',
    'sy.dry': 'Dry run: compare', 'sy.drying': 'Comparing…', 'sy.dryDone': 'Compared at {time}',
    'sy.confirmResources': 'I understand: this rebuilds the database and shards from the local database and pushes a commit to {repo} ({branch})', 'sy.confirmSample': 'I understand: this replaces the sample files and README of {repo} ({branch}) with a commit',
    'sy.publishResources': 'Publish database and shards to {repo}', 'sy.publishSample': 'Publish the sample ({comments} comments) to {repo}',
    'sy.dryFirst': 'Run the dry run first (and again after changing options).', 'sy.noForce': 'The push is never forced.',
    'sy.job': 'Publication', 'sy.jobRunning': 'Running…', 'sy.jobDone': 'Done', 'sy.jobError': 'Failed: {msg}', 'sy.result': 'Commit {sha} · {files} files changed', 'sy.resultNone': 'Nothing changed: nothing was committed.',
    'sy.error': 'Error: {msg}', 'sy.remoteError': 'The repository could not be read: {msg}',
  },
  es: {
    'sy.tab': 'Publicar', 'sy.title': 'Publicar en los repositorios de recursos', 'sy.loading': 'Cargando…',
    'sy.settings': 'Repositorios', 'sy.resourcesRepo': 'Repositorio de recursos (privado, owner/nombre)', 'sy.sampleRepo': 'Repositorio de muestra (público, owner/nombre)', 'sy.branch': 'Rama', 'sy.save': 'Guardar', 'sy.saved': 'Guardado',
    'sy.resources': 'Repositorio de recursos', 'sy.sample': 'Repositorio de muestra', 'sy.notSet': 'Indica primero el repositorio arriba.',
    'sy.token': 'Token de GitHub', 'sy.tokenSecret': 'disponible (variable GITHUB_TOKEN o secretos de la consola)', 'sy.tokenGh': 'disponible (de `gh auth token`)', 'sy.tokenMemory': 'disponible (escrito aquí, solo en memoria)', 'sy.tokenNone': 'no disponible: define GITHUB_TOKEN, ejecuta `gh auth login` o escribe uno abajo',
    'sy.tokenField': 'Token (solo en memoria: no se guarda, no se registra ni se vuelve a mostrar)', 'sy.tokenUse': 'Usar en esta sesión',
    'sy.local': 'Base de datos local', 'sy.remote': 'En el repositorio', 'sy.diff': 'Diferencia', 'sy.stat': 'Dato', 'sy.willWrite': 'A escribir',
    'sy.comments': 'comentarios', 'sy.translations': 'traducciones', 'sy.sources': 'fuentes', 'sy.games': 'partidas', 'sy.shards': 'fragmentos', 'sy.positions': 'posiciones', 'sy.hidden': 'ocultos (no se publican)', 'sy.size': 'tamaño de la base', 'sy.files': 'archivos', 'sy.repoSize': 'tamaño del repositorio', 'sy.built': 'generado',
    'sy.byKind': 'Comentarios por fuente e idioma', 'sy.normalized': 'Normalizados ({lang})', 'sy.translatedTo': 'Traducidos a {lang}', 'sy.dropped': 'descartados por no ser universales',
    'sy.sampleOptions': 'Opciones de la muestra', 'sy.mode': 'Contenido', 'sy.modeTop': 'Posiciones más comentadas de los libros', 'sy.modeLichess': 'Todos los comentarios de Lichess', 'sy.topN': 'Número de posiciones', 'sy.perPos': 'Comentarios por posición (hasta 3, al azar)', 'sy.cap': 'Tope de comentarios (opcional)', 'sy.seed': 'Semilla (misma semilla, misma muestra)', 'sy.noteEn': 'Nota de muestra (comentarios en inglés)', 'sy.noteEs': 'Nota de muestra (comentarios en español)',
    'sy.sampleWill': 'La muestra tendrá {comments} comentarios en {positions} posiciones de {games} partidas.',
    'sy.dry': 'Simulación: comparar', 'sy.drying': 'Comparando…', 'sy.dryDone': 'Comparado a las {time}',
    'sy.confirmResources': 'Entiendo: reconstruye la base de datos y los fragmentos desde la base local y sube un commit a {repo} ({branch})', 'sy.confirmSample': 'Entiendo: reemplaza los archivos de la muestra y el README de {repo} ({branch}) con un commit',
    'sy.publishResources': 'Publicar base de datos y fragmentos en {repo}', 'sy.publishSample': 'Publicar la muestra ({comments} comentarios) en {repo}',
    'sy.dryFirst': 'Haz primero la simulación (y otra vez si cambias opciones).', 'sy.noForce': 'El push nunca es forzado.',
    'sy.job': 'Publicación', 'sy.jobRunning': 'En curso…', 'sy.jobDone': 'Hecho', 'sy.jobError': 'Falló: {msg}', 'sy.result': 'Commit {sha} · {files} archivos cambiados', 'sy.resultNone': 'Nada cambió: no se hizo ningún commit.',
    'sy.error': 'Error: {msg}', 'sy.remoteError': 'No se pudo leer el repositorio: {msg}',
  },
})

Console.registerTab({
  id: 'sync', order: 60, title: { en: 'Publish', es: 'Publicar' },
  render(el, { t, api, esc, n }) {
    let cfg = null, token = null, notice = ''
    const state = { resources: { data: null, busy: false, error: '' }, sample: { data: null, busy: false, error: '' } }
    let opts = null, jobId = null, job = null, timer = null, dead = false

    const bytes = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b > 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`)
    const tokenText = (tk) => (!tk?.available ? t('sy.tokenNone') : t({ secret: 'sy.tokenSecret', gh: 'sy.tokenGh', memory: 'sy.tokenMemory' }[tk.source] ?? 'sy.tokenSecret'))
    const optQuery = () => (opts ? `&${new URLSearchParams(Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== null && v !== '').map(([k, v]) => [k, String(v)])))}` : '')

    async function load() {
      try { const r = await api('/api/sync/settings'); cfg = r.sync; token = r.token; opts ??= { ...cfg.sample } } catch (e) { notice = t('sy.error', { msg: e.message }) }
      draw()
    }
    async function dry(target) {
      const s = state[target]; s.busy = true; s.error = ''; draw()
      try { s.data = await api(`/api/sync/status?target=${target}${target === 'sample' ? optQuery() : ''}`); token = s.data.token; s.dryKey = JSON.stringify(opts) } catch (e) { s.error = e.message }
      s.busy = false; draw()
    }
    async function publish(target) {
      const box = el.querySelector(`[data-confirm="${target}"]`)
      try {
        const r = await api('/api/sync/publish', { method: 'POST', body: { target, confirm: !!box?.checked, ...(target === 'sample' ? { options: opts } : {}) } })
        jobId = r.id; job = { state: 'running', progress: 0, steps: [], target }; poll()
      } catch (e) { state[target].error = e.message }
      draw()
    }
    function poll() {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        if (dead || !jobId) return
        try { job = (await api(`/api/sync/job?id=${jobId}`)).job } catch { /* keep polling */ }
        draw()
        if (job?.state === 'running') poll()
      }, 1000)
    }

    const row = (label, l, r, d) => `<tr><td>${esc(label)}</td><td class="num">${l === undefined ? '' : n(l)}</td><td class="num">${r === undefined ? '' : n(r)}</td><td class="num">${d === undefined ? '' : (d > 0 ? '+' : '') + n(d)}</td></tr>`

    function card(target) {
      const s = state[target], d = s.data, repo = target === 'resources' ? cfg.resourcesRepo : cfg.sampleRepo
      let h = `<div class="card wide"><h2>${t(target === 'resources' ? 'sy.resources' : 'sy.sample')} ${repo ? `<span class="mono muted">${esc(repo)}@${esc(cfg.branch)}</span>` : ''}</h2>`
      if (!repo) return `${h}<p class="empty">${t('sy.notSet')}</p></div>`
      h += `<p class="sub">${t('sy.token')}: ${esc(tokenText(token))}</p>`
      if (target === 'sample') {
        const o = opts
        h += `<h3>${t('sy.sampleOptions')}</h3><div class="row">
          <label>${t('sy.mode')} <select data-opt="mode"><option value="top"${o.mode === 'top' ? ' selected' : ''}>${t('sy.modeTop')}</option><option value="lichess"${o.mode === 'lichess' ? ' selected' : ''}>${t('sy.modeLichess')}</option></select></label>
          <label>${t('sy.topN')} <input type="number" min="1" data-opt="topN" value="${esc(o.topN)}"${o.mode === 'lichess' ? ' disabled' : ''}></label>
          <label>${t('sy.perPos')} <input type="number" min="1" max="3" data-opt="perPosition" value="${esc(o.perPosition)}"${o.mode === 'lichess' ? ' disabled' : ''}></label>
          <label>${t('sy.cap')} <input type="number" min="1" data-opt="cap" value="${esc(o.cap ?? '')}"></label>
          <label>${t('sy.seed')} <input data-opt="seed" value="${esc(o.seed)}"></label>
          <label>${t('sy.noteEn')} <input data-opt="noteEn" value="${esc(o.noteEn)}"></label>
          <label>${t('sy.noteEs')} <input data-opt="noteEs" value="${esc(o.noteEs)}"></label></div>`
      }
      h += `<p><button class="btn" data-dry="${target}"${s.busy ? ' disabled' : ''}>${s.busy ? t('sy.drying') : t('sy.dry')}</button> ${d ? `<span class="muted">${t('sy.dryDone', { time: new Date(d.dryRunAt ?? Date.now()).toLocaleTimeString() })}</span>` : ''}</p>`
      if (s.error) h += `<p class="err">${esc(t('sy.error', { msg: s.error }))}</p>`
      if (d) {
        const L = d.local, R = d.remote
        if (!R.ok) h += `<p class="err">${esc(t('sy.remoteError', { msg: R.error }))}</p>`
        const diff = Object.fromEntries(d.diff.map((x) => [x.key, x]))
        const cell = (k, label, lv) => row(label, lv, diff[k]?.remote, diff[k]?.delta)
        h += `<table class="cmp"><thead><tr><th>${t('sy.stat')}</th><th>${target === 'sample' ? t('sy.willWrite') : t('sy.local')}</th><th>${t('sy.remote')}</th><th>${t('sy.diff')}</th></tr></thead><tbody>`
        if (target === 'sample' && d.plan) {
          h += cell('comments', t('sy.comments'), d.plan.comments) + row(t('sy.positions'), d.plan.positions) + cell('games', t('sy.games'), d.plan.games) + cell('sources', t('sy.sources'), d.plan.sources)
        } else {
          h += cell('comments', t('sy.comments'), L.comments) + cell('translations', t('sy.translations'), L.translations) + cell('sources', t('sy.sources'), L.sources) + cell('games', t('sy.games'), L.games) + cell('shards', t('sy.shards'), L.shards)
        }
        if (R.ok) h += row(t('sy.files'), undefined, R.files) + `<tr><td>${t('sy.repoSize')}</td><td></td><td class="num">${bytes(R.bytes)}</td><td></td></tr>`
        h += `<tr><td>${t('sy.size')}</td><td class="num">${bytes(L.bytes)}</td><td class="num">${R.ok ? bytes(R.dbBytes) : ''}</td><td></td></tr></tbody></table>`
        h += `<details><summary>${t('sy.byKind')}</summary><ul>${Object.entries(L.byKind).map(([k, langs]) => `<li>${esc(k)}: ${Object.entries(langs).map(([l, c]) => `${esc(l)} ${n(c)}`).join(' · ')}</li>`).join('')}
          ${Object.entries(L.normalized).map(([l, c]) => `<li>${t('sy.normalized', { lang: l })}: ${n(c.ok)} · ${n(c.dropped)} ${t('sy.dropped')}</li>`).join('')}
          ${Object.entries(L.translatedByLang).map(([l, c]) => `<li>${t('sy.translatedTo', { lang: l })}: ${n(c)}</li>`).join('')}
          <li>${t('sy.hidden')}: ${n(L.hidden)}</li></ul></details>`
        if (target === 'sample' && d.plan) h += `<p>${t('sy.sampleWill', d.plan)}</p>`
        const fresh = target !== 'sample' || s.dryKey === JSON.stringify(opts)
        const running = job?.state === 'running'
        h += `<label class="row"><input type="checkbox" data-confirm="${target}"> ${esc(t(target === 'resources' ? 'sy.confirmResources' : 'sy.confirmSample', { repo, branch: cfg.branch }))}</label>`
        h += `<p><button class="btn" data-publish="${target}"${!R.ok || !d.token.available || !fresh || running ? ' disabled' : ''}>${esc(target === 'resources' ? t('sy.publishResources', { repo }) : t('sy.publishSample', { comments: n(d.plan?.comments), repo }))}</button> <span class="muted">${fresh ? t('sy.noForce') : t('sy.dryFirst')}</span></p>`
      }
      return `${h}</div>`
    }

    function jobBox() {
      if (!job) return ''
      const steps = (job.steps ?? []).map((s) => `<li>${esc(s.name)} ${s.state === 'done' ? '✓' : s.state === 'error' ? '✗' : '…'}</li>`).join('')
      const res = job.state === 'done' ? (job.result?.pushed ? t('sy.result', { sha: esc(job.result.sha), files: n(job.result.files) }) : t('sy.resultNone')) : job.state === 'error' ? t('sy.jobError', { msg: esc(job.error) }) : t('sy.jobRunning')
      return `<div class="card wide"><h2>${t('sy.job')} · ${esc(job.target ?? '')}</h2><progress max="1" value="${job.progress ?? 0}"></progress><ul>${steps}</ul><p class="${job.state === 'error' ? 'err' : ''}">${res}</p></div>`
    }

    function draw() {
      if (dead) return
      if (!cfg) { el.innerHTML = `<p class="empty">${t('sy.loading')}</p>`; return }
      el.innerHTML = `<h1>${t('sy.title')}</h1>${notice ? `<p class="muted">${esc(notice)}</p>` : ''}
        <div class="card wide"><h2>${t('sy.settings')}</h2><div class="row">
          <label>${t('sy.resourcesRepo')} <input data-cfg="resourcesRepo" value="${esc(cfg.resourcesRepo)}" placeholder="owner/name"></label>
          <label>${t('sy.sampleRepo')} <input data-cfg="sampleRepo" value="${esc(cfg.sampleRepo)}" placeholder="owner/name"></label>
          <label>${t('sy.branch')} <input data-cfg="branch" value="${esc(cfg.branch)}"></label>
          <button class="btn" data-save>${t('sy.save')}</button></div>
          <p class="sub">${t('sy.token')}: ${esc(tokenText(token))}</p>
          <div class="row"><label>${t('sy.tokenField')} <input type="password" autocomplete="off" data-token></label><button class="btn" data-use-token>${t('sy.tokenUse')}</button></div></div>
        ${card('resources')}${card('sample')}${jobBox()}`
      el.querySelector('[data-save]')?.addEventListener('click', async () => {
        const body = Object.fromEntries([...el.querySelectorAll('[data-cfg]')].map((i) => [i.dataset.cfg, i.value.trim()]))
        try { cfg = (await api('/api/sync/settings', { method: 'PUT', body })).sync; notice = t('sy.saved') } catch (e) { notice = t('sy.error', { msg: e.message }) }
        draw()
      })
      el.querySelector('[data-use-token]')?.addEventListener('click', async () => {
        const input = el.querySelector('[data-token]')
        try { token = (await api('/api/sync/token', { method: 'PUT', body: { token: input.value } })).token } catch (e) { notice = t('sy.error', { msg: e.message }) }
        input.value = ''
        draw()
      })
      el.querySelectorAll('[data-dry]').forEach((b) => b.addEventListener('click', () => dry(b.dataset.dry)))
      el.querySelectorAll('[data-publish]').forEach((b) => b.addEventListener('click', () => publish(b.dataset.publish)))
      el.querySelectorAll('[data-opt]').forEach((i) => i.addEventListener('change', () => {
        const k = i.dataset.opt
        opts[k] = i.type === 'number' ? (i.value === '' ? null : Number(i.value)) : i.value
        draw()
      }))
    }

    draw()
    void load()
    return () => { dead = true; clearTimeout(timer) }
  },
})
