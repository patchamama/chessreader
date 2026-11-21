// Benchmark tab: compare up to 3 models on the same sample, review side by side, and ask an external model to judge or improve the prompt.
Console.addStrings({
  en: {
    'bench.tab': 'Benchmark', 'bench.intro': 'Runs the real prompts on the same random comments with up to 3 models, one at a time. A local model is warmed up first (its load time is shown apart).',
    'bench.form': 'New benchmark', 'bench.task': 'Task', 'bench.normalize': 'Normalize (universal text)', 'bench.translate': 'Translate', 'bench.lang': 'Target language',
    'bench.n': 'Sample size', 'bench.seed': 'Seed (empty = random)', 'bench.kind': 'Source', 'bench.any': 'any', 'bench.book': 'books', 'bench.lichess': 'Lichess', 'bench.srcLang': 'Comment language (empty = any)',
    'bench.model': 'Model {n}', 'bench.none': '— none —', 'bench.external': 'External: {name}', 'bench.noExternal': 'External model not set (Queue tab)', 'bench.start': 'Start benchmark', 'bench.cancel': 'Cancel', 'bench.noOllama': 'Ollama does not answer: no local models to list.',
    'bench.runs': 'Previous runs', 'bench.noRuns': 'No runs yet.', 'bench.open': 'Open', 'bench.progress': 'Progress: {done} / {total} · now: {model}',
    'bench.status.running': 'running', 'bench.status.done': 'finished', 'bench.status.cancelled': 'cancelled', 'bench.status.failed': 'failed',
    'bench.results': 'Results', 'bench.metric': 'Metric', 'bench.size': 'Size / quantization', 'bench.load': 'Load time (warm-up)', 'bench.wall': 'Mean time per comment', 'bench.prefill': 'Mean prefill time', 'bench.prefillRate': 'Prefill (prompt tok/s)',
    'bench.promptTok': 'Mean prompt tokens', 'bench.eval': 'Mean generation time', 'bench.toks': 'Generation (tok/s)', 'bench.outTok': 'Mean output tokens', 'bench.pass': 'Pass rate', 'bench.counts': 'accepted / rejected / dropped / failed', 'bench.ratio': 'Mean output length ratio', 'bench.reasons': 'Reasons',
    'bench.side': 'Side by side', 'bench.original': 'Original', 'bench.item': 'Comment #{id}', 'bench.noResult': 'no result',
    'bench.judge': 'External judge', 'bench.judgeBtn': 'Ask the external model to judge', 'bench.improveBtn': 'Propose an improved prompt', 'bench.working': 'Working…', 'bench.overall': 'Overall verdict', 'bench.ranking': 'Ranking',
    'bench.faith': 'faithfulness', 'bench.fluency': 'fluency', 'bench.notation': 'notation', 'bench.quotes': 'quotations', 'bench.raw': 'Raw answer', 'bench.noParsed': 'The answer was not valid JSON; the raw text is shown.',
    'bench.improved': 'Proposed prompt (read it; it is never applied automatically)', 'bench.error': 'Error: {msg}', 'bench.ms': '{v} ms', 'bench.unit.s': 's',
  },
  es: {
    'bench.tab': 'Evaluación', 'bench.intro': 'Ejecuta los prompts reales sobre los mismos comentarios aleatorios con hasta 3 modelos, uno tras otro. Un modelo local se calienta antes (su tiempo de carga se muestra aparte).',
    'bench.form': 'Nueva evaluación', 'bench.task': 'Tarea', 'bench.normalize': 'Normalizar (texto universal)', 'bench.translate': 'Traducir', 'bench.lang': 'Idioma destino',
    'bench.n': 'Tamaño de la muestra', 'bench.seed': 'Semilla (vacía = aleatoria)', 'bench.kind': 'Origen', 'bench.any': 'cualquiera', 'bench.book': 'libros', 'bench.lichess': 'Lichess', 'bench.srcLang': 'Idioma del comentario (vacío = cualquiera)',
    'bench.model': 'Modelo {n}', 'bench.none': '— ninguno —', 'bench.external': 'Externo: {name}', 'bench.noExternal': 'Modelo externo sin configurar (pestaña Cola)', 'bench.start': 'Iniciar evaluación', 'bench.cancel': 'Cancelar', 'bench.noOllama': 'Ollama no responde: no hay modelos locales que listar.',
    'bench.runs': 'Evaluaciones anteriores', 'bench.noRuns': 'Todavía no hay evaluaciones.', 'bench.open': 'Abrir', 'bench.progress': 'Progreso: {done} / {total} · ahora: {model}',
    'bench.status.running': 'en curso', 'bench.status.done': 'terminada', 'bench.status.cancelled': 'cancelada', 'bench.status.failed': 'fallida',
    'bench.results': 'Resultados', 'bench.metric': 'Métrica', 'bench.size': 'Tamaño / cuantización', 'bench.load': 'Tiempo de carga (calentamiento)', 'bench.wall': 'Tiempo medio por comentario', 'bench.prefill': 'Tiempo medio de prefill', 'bench.prefillRate': 'Prefill (tok/s del prompt)',
    'bench.promptTok': 'Tokens medios del prompt', 'bench.eval': 'Tiempo medio de generación', 'bench.toks': 'Generación (tok/s)', 'bench.outTok': 'Tokens medios de salida', 'bench.pass': 'Tasa de aprobados', 'bench.counts': 'aceptados / rechazados / descartados / fallidos', 'bench.ratio': 'Proporción media de longitud', 'bench.reasons': 'Motivos',
    'bench.side': 'Lado a lado', 'bench.original': 'Original', 'bench.item': 'Comentario #{id}', 'bench.noResult': 'sin resultado',
    'bench.judge': 'Juez externo', 'bench.judgeBtn': 'Pedir al modelo externo que juzgue', 'bench.improveBtn': 'Proponer un prompt mejorado', 'bench.working': 'Trabajando…', 'bench.overall': 'Veredicto general', 'bench.ranking': 'Clasificación',
    'bench.faith': 'fidelidad', 'bench.fluency': 'fluidez', 'bench.notation': 'notación', 'bench.quotes': 'citas', 'bench.raw': 'Respuesta original', 'bench.noParsed': 'La respuesta no era JSON válido; se muestra el texto tal cual.',
    'bench.improved': 'Prompt propuesto (léelo; nunca se aplica automáticamente)', 'bench.error': 'Error: {msg}', 'bench.ms': '{v} ms', 'bench.unit.s': 's',
  },
})

Console.registerTab({
  id: 'bench', order: 40, title: { en: 'Benchmark', es: 'Evaluación' },
  render(el, { t, api, esc, n }) {
    let installed = [], up = true, external = null, runs = [], run = null, timer = null, notice = '', busy = ''
    let form = { task: 'normalize', lang: 'es', n: 10, seed: '', kind: '', sourceLang: '', models: ['', '', ''] }
    let disposed = false

    const ms = (v) => (v == null ? '—' : t('bench.ms', { v: n(Math.round(v)) }))
    const num = (v) => (v == null ? '—' : n(v))
    const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)} %`)
    const err = (e) => { notice = t('bench.error', { msg: e.message }) }

    async function loadBase() {
      const [s, o] = await Promise.all([api('/api/settings').catch(() => null), api('/api/ollama/models').catch(() => ({ up: false, installed: [] }))])
      installed = o.installed ?? []; up = o.up !== false
      const e = s?.settings?.external
      external = e?.provider && e?.model ? `${e.provider}/${e.model}` : null
      if (!form.models[0] && installed[0]) form.models[0] = installed[0].name
      await loadRuns()
    }
    async function loadRuns() { runs = (await api('/api/bench/runs').catch(() => ({ runs: [] }))).runs }
    async function openRun(id) {
      run = await api(`/api/bench/runs/${id}`)
      clearTimeout(timer)
      if (run.status === 'running') timer = setTimeout(async () => { if (!disposed) { try { await openRun(id); await loadRuns() } catch (e) { err(e) } draw() } }, 2000)
      draw()
    }

    function formHtml() {
      const opts = (cur) => `<option value="">${esc(t('bench.none'))}</option>${installed.map((m) => `<option value="${esc(m.name)}" ${m.name === cur ? 'selected' : ''}>${esc(m.name)}${m.params ? ` · ${esc(m.params)}` : ''}${m.quant ? ` · ${esc(m.quant)}` : ''}</option>`).join('')}<option value="@external" ${cur === '@external' ? 'selected' : ''} ${external ? '' : 'disabled'}>${esc(external ? t('bench.external', { name: external }) : t('bench.noExternal'))}</option>`
      return `<section class="card"><h2>${esc(t('bench.form'))}</h2>${up ? '' : `<p class="warn">${esc(t('bench.noOllama'))}</p>`}
        <div class="grid">
          <label>${esc(t('bench.task'))} <select data-f="task"><option value="normalize" ${form.task === 'normalize' ? 'selected' : ''}>${esc(t('bench.normalize'))}</option><option value="translate" ${form.task === 'translate' ? 'selected' : ''}>${esc(t('bench.translate'))}</option></select></label>
          ${form.task === 'translate' ? `<label>${esc(t('bench.lang'))} <select data-f="lang">${['es', 'en', 'de', 'fr'].map((l) => `<option value="${l}" ${form.lang === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
          <label>${esc(t('bench.n'))} <input data-f="n" type="number" min="1" max="200" value="${esc(form.n)}"></label>
          <label>${esc(t('bench.seed'))} <input data-f="seed" type="number" value="${esc(form.seed)}"></label>
          <label>${esc(t('bench.kind'))} <select data-f="kind"><option value="">${esc(t('bench.any'))}</option><option value="book" ${form.kind === 'book' ? 'selected' : ''}>${esc(t('bench.book'))}</option><option value="lichess" ${form.kind === 'lichess' ? 'selected' : ''}>${esc(t('bench.lichess'))}</option></select></label>
          <label>${esc(t('bench.srcLang'))} <input data-f="sourceLang" maxlength="2" value="${esc(form.sourceLang)}"></label>
        </div>
        <div class="grid">${form.models.map((m, i) => `<label>${esc(t('bench.model', { n: i + 1 }))} <select data-m="${i}">${opts(m)}</select></label>`).join('')}</div>
        <p><button data-act="start" ${busy || run?.status === 'running' ? 'disabled' : ''}>${esc(t('bench.start'))}</button></p></section>`
    }

    function runsHtml() {
      return `<section class="card"><h2>${esc(t('bench.runs'))}</h2>${runs.length ? `<table><tbody>${runs.map((r) => `<tr><td>${esc(new Date(r.startedAt).toLocaleString())}</td><td>${esc(t(`bench.${r.task}`))}${r.lang ? ` → ${esc(r.lang)}` : ''}</td><td>${esc(r.models.join(' · '))}</td><td>${esc(t(`bench.status.${r.status}`))}</td><td><button data-open="${esc(r.id)}">${esc(t('bench.open'))}</button></td></tr>`).join('')}</tbody></table>` : `<p>${esc(t('bench.noRuns'))}</p>`}</section>`
    }

    function resultsHtml() {
      const keys = run.models.map((m) => m.key)
      const row = (label, fn) => `<tr><th scope="row">${esc(t(label))}</th>${keys.map((k) => `<td>${fn(run.aggregates?.[k] ?? {}, run.models.find((m) => m.key === k))}</td>`).join('')}</tr>`
      return `<h3>${esc(t('bench.results'))}</h3><div class="scroll"><table><thead><tr><th>${esc(t('bench.metric'))}</th>${keys.map((k) => `<th>${esc(k)}</th>`).join('')}</tr></thead><tbody>
        ${row('bench.size', (_a, m) => (m.external ? esc(m.provider) : `${m.sizeGb ?? '—'} GB · ${esc(m.quant ?? '—')}`))}
        ${row('bench.load', (a) => ms(a.loadMs))}${row('bench.wall', (a) => ms(a.meanWallMs))}${row('bench.prefill', (a) => ms(a.meanPrefillMs))}${row('bench.prefillRate', (a) => num(a.prefillTokPerS))}
        ${row('bench.promptTok', (a) => num(a.meanPromptTokens))}${row('bench.eval', (a) => ms(a.meanEvalMs))}${row('bench.toks', (a) => num(a.tokPerS))}${row('bench.outTok', (a) => num(a.meanOutputTokens))}
        ${row('bench.pass', (a) => pct(a.passRate))}${row('bench.counts', (a) => `${a.accepted ?? 0} / ${a.rejected ?? 0} / ${a.dropped ?? 0} / ${a.failed ?? 0}`)}${row('bench.ratio', (a) => num(a.meanRatio))}
        ${row('bench.reasons', (a) => Object.entries(a.reasons ?? {}).map(([r, c]) => `${esc(r)} (${c})`).join('<br>') || '—')}</tbody></table></div>`
    }

    function sideHtml() {
      const keys = run.models.map((m) => m.key)
      return `<h3>${esc(t('bench.side'))}</h3>${run.items.map((i) => `<article class="card"><h4>${esc(t('bench.item', { id: i.id }))} <small>${esc(i.lang)}</small></h4>
        <div class="grid"><div><strong>${esc(t('bench.original'))}</strong><p>${esc(i.original)}</p></div>${keys.map((k) => {
    const r = i.results[k]
    return `<div><strong>${esc(k)}</strong> ${r ? `<span class="badge st-${esc(r.status)}">${esc(r.status)}</span> <small>${ms(r.metrics?.wallMs)} · ${num(r.metrics?.prefillMs)} ms prefill · ${num(r.metrics?.outputTokens)} tok</small><p>${esc(r.text) || '—'}</p>${r.problems?.length ? `<small class="warn">${esc(r.problems.join('; '))}</small>` : ''}` : `<p>${esc(t('bench.noResult'))}</p>`}</div>`
  }).join('')}</div></article>`).join('')}`
    }

    function judgeHtml() {
      if (run.status === 'running') return ''
      const j = run.judge, p = j?.parsed
      let out = `<section class="card"><h3>${esc(t('bench.judge'))}</h3><p><button data-act="judge" ${busy ? 'disabled' : ''}>${esc(busy === 'judge' ? t('bench.working') : t('bench.judgeBtn'))}</button> <button data-act="improve" ${busy ? 'disabled' : ''}>${esc(busy === 'improve' ? t('bench.working') : t('bench.improveBtn'))}</button></p>`
      if (j) {
        if (p?.overall) out += `<p><strong>${esc(t('bench.overall'))}:</strong> ${esc(p.overall.verdict ?? '')}</p>${p.overall.ranking ? `<p><strong>${esc(t('bench.ranking'))}:</strong> ${esc(p.overall.ranking.join(' > '))}</p>` : ''}`
        if (Array.isArray(p?.items)) {
          out += `<div class="scroll"><table><thead><tr><th>#</th>${run.models.map((m) => `<th>${esc(m.key)}</th>`).join('')}</tr></thead><tbody>${p.items.map((it) => `<tr><td>${esc(it.id)}</td>${run.models.map((m) => { const v = it.verdicts?.[m.key]; return `<td>${v ? `${esc(t('bench.faith'))} ${esc(v.faithfulness)} · ${esc(t('bench.fluency'))} ${esc(v.fluency)} · ${esc(t('bench.notation'))} ${esc(v.notation)} · ${esc(t('bench.quotes'))} ${esc(v.quotations)}${v.remark ? `<br><small>${esc(v.remark)}</small>` : ''}` : '—'}</td>` }).join('')}</tr>`).join('')}</tbody></table></div>`
        }
        if (!p) out += `<p class="warn">${esc(t('bench.noParsed'))}</p>`
        out += `<details><summary>${esc(t('bench.raw'))}</summary><pre>${esc(j.raw)}</pre></details>`
      }
      if (run.improvedPrompt) out += `<h4>${esc(t('bench.improved'))}</h4><pre>${esc(run.improvedPrompt.text)}</pre>`
      return `${out}</section>`
    }

    function runHtml() {
      if (!run) return ''
      const pr = run.progress
      return `<section class="card"><h2>${esc(t(`bench.${run.task}`))}${run.lang ? ` → ${esc(run.lang)}` : ''} · ${esc(t(`bench.status.${run.status}`))}</h2>
        <p>${esc(t('bench.progress', { done: pr.done, total: pr.total, model: pr.model ?? '—' }))} <progress max="${esc(pr.total)}" value="${esc(pr.done)}"></progress> ${run.status === 'running' ? `<button data-act="cancel">${esc(t('bench.cancel'))}</button>` : ''}</p>
        ${run.error ? `<p class="warn">${esc(run.error)}</p>` : ''}${run.items.some((i) => Object.keys(i.results).length) ? resultsHtml() : ''}${run.status === 'running' ? '' : sideHtml()}</section>${judgeHtml()}`
    }

    function draw() {
      if (disposed) return
      el.innerHTML = `<h2>${esc(t('bench.tab'))}</h2><p>${esc(t('bench.intro'))}</p>${notice ? `<p class="warn" role="alert">${esc(notice)}</p>` : ''}${formHtml()}${runHtml()}${runsHtml()}`
      el.querySelectorAll('[data-f]').forEach((x) => x.addEventListener('change', () => { form[x.dataset.f] = x.value; if (x.dataset.f === 'task') draw() }))
      el.querySelectorAll('[data-m]').forEach((x) => x.addEventListener('change', () => { form.models[Number(x.dataset.m)] = x.value }))
      el.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openRun(b.dataset.open).catch((e) => { err(e); draw() })))
      el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act)))
    }

    async function act(name) {
      notice = ''
      try {
        if (name === 'start') {
          const models = form.models.filter(Boolean).map((m) => (m === '@external' ? { external: true } : { model: m }))
          busy = 'start'
          const { id } = await api('/api/bench/runs', { method: 'POST', body: { task: form.task, lang: form.task === 'translate' ? form.lang : undefined, n: Number(form.n) || 10, seed: form.seed === '' ? undefined : Number(form.seed), kind: form.kind || undefined, sourceLang: form.sourceLang || undefined, models } })
          busy = ''
          await openRun(id)
        } else if (name === 'cancel') await api(`/api/bench/runs/${run.id}/cancel`, { method: 'POST' })
        else if (name === 'judge' || name === 'improve') {
          busy = name; draw()
          await api(`/api/bench/runs/${run.id}/${name === 'judge' ? 'judge' : 'improve-prompt'}`, { method: 'POST' })
          busy = ''
          run = await api(`/api/bench/runs/${run.id}`)
        }
      } catch (e) { busy = ''; err(e) }
      await loadRuns()
      draw()
    }

    draw()
    loadBase().then(() => { const running = runs.find((r) => r.status === 'running'); return running ? openRun(running.id) : draw() }).catch((e) => { err(e); draw() })
    return () => { disposed = true; clearTimeout(timer) }
  },
})
