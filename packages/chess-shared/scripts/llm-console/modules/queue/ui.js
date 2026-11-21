// Queue tab: start / stop / pause the runner, the task list, the settings (models with a star for the recommended one,
// languages, concurrency, cool-down, model downloads, external LLM) and the prompts the LLMs receive.
Console.addStrings({
  en: {
    'queue.tab': 'Queue', 'queue.start': 'Start', 'queue.stop': 'Stop', 'queue.pause': 'Pause', 'queue.resume': 'Resume', 'queue.cancel': 'Cancel / remove', 'queue.up': 'Move up', 'queue.down': 'Move down',
    'queue.state.idle': 'IDLE', 'queue.state.running': 'RUNNING', 'queue.state.paused': 'PAUSED', 'queue.pausedUntil': 'cool-down until {time}', 'queue.nextPause': 'next cool-down at {time}',
    'queue.external': 'A translation process (pid {pid}) that this console did not start is running. Only one process may write the database, so the queue cannot start until it ends.',
    'queue.tasks': 'Tasks', 'queue.noTasks': 'The queue is empty. Add tasks from the Status tab (pending items).', 'queue.error': 'Error: {msg}',
    'queue.phase.normalize': 'Normalize', 'queue.phase.translate': 'Translate', 'queue.kind.book': 'Books', 'queue.kind.lichess': 'Lichess', 'queue.onlyLang': 'only {lang}',
    'queue.status.queued': 'queued', 'queue.status.running': 'running', 'queue.status.paused': 'paused', 'queue.status.done': 'done', 'queue.status.failed': 'failed', 'queue.status.canceled': 'canceled',
    'queue.settings': 'Settings', 'queue.save': 'Save settings', 'queue.saved': 'Saved', 'queue.recommended': '★ recommended', 'queue.notInstalled': 'not installed',
    'queue.modelNormalize': 'LLM that normalizes', 'queue.modelTranslate': 'LLM that translates', 'queue.ollamaDown': 'Ollama does not answer: only the saved names are shown.',
    'queue.langs': 'Target languages', 'queue.concurrency': 'Concurrency (requests at a time)', 'queue.removal': 'Removing moves when normalizing', 'queue.removalStrict': 'Strict: reject a result that drops any move', 'queue.removalModerate': 'Moderate: allow dropping moves of later play ("then", "on move 14"…)',
    'queue.cool': 'Cool-down', 'queue.coolEvery': 'Pause every (min, 0 = never)', 'queue.coolFor': 'for (min)', 'queue.coolUnload': 'Unload the Ollama models during the pause',
    'queue.download': 'Download more Ollama models', 'queue.modelName': 'Model name (e.g. qwen3:8b)', 'queue.pull': 'Download', 'queue.pulling': 'Downloading {model}: {status}', 'queue.pullDone': '{model} downloaded', 'queue.pullFail': 'Download failed: {msg}', 'queue.suggestions': 'Suggestions',
    'queue.ext': 'External LLM for the queued tasks', 'queue.extHint': 'The translate script speaks the OpenAI API only: openai or any OpenAI-compatible server. Anthropic is not supported here.', 'queue.extProvider': 'Provider', 'queue.extLocal': 'none (local Ollama)', 'queue.extModel': 'Model', 'queue.extUrl': 'Base URL (empty for OpenAI)', 'queue.extKey': 'API key', 'queue.keySet': 'a key is stored', 'queue.keyNone': 'no key stored', 'queue.keyPlaceholder': 'paste a new key (stored locally, never shown)',
    'queue.prompts': 'Prompts used', 'queue.promptNorm': 'Normalization prompt (sent to the normalizing LLM)', 'queue.promptTrans': 'Translation prompt (target: {lang})', 'queue.system': 'System message', 'queue.user': 'User message (sample comment)', 'queue.rules': 'Validation rules (a proposal that fails any of them is rejected)',
    'queue.rule.empty': 'The proposal must not be empty.', 'queue.rule.length': 'It may not be more than 3 times longer than the original.', 'queue.rule.missing': 'Every move of the original must be kept.', 'queue.rule.added': 'No move may be added that is not in the original.',
  },
  es: {
    'queue.tab': 'Cola', 'queue.start': 'Iniciar', 'queue.stop': 'Detener', 'queue.pause': 'Pausar', 'queue.resume': 'Reanudar', 'queue.cancel': 'Cancelar / quitar', 'queue.up': 'Subir', 'queue.down': 'Bajar',
    'queue.state.idle': 'EN REPOSO', 'queue.state.running': 'EN MARCHA', 'queue.state.paused': 'EN PAUSA', 'queue.pausedUntil': 'enfriando hasta las {time}', 'queue.nextPause': 'próximo enfriamiento a las {time}',
    'queue.external': 'Hay un proceso de traducción (pid {pid}) que esta consola no inició. Solo un proceso puede escribir la base de datos, así que la cola no puede iniciar hasta que termine.',
    'queue.tasks': 'Tareas', 'queue.noTasks': 'La cola está vacía. Añade tareas desde la pestaña Estado (pendientes).', 'queue.error': 'Error: {msg}',
    'queue.phase.normalize': 'Normalizar', 'queue.phase.translate': 'Traducir', 'queue.kind.book': 'Libros', 'queue.kind.lichess': 'Lichess', 'queue.onlyLang': 'solo {lang}',
    'queue.status.queued': 'en cola', 'queue.status.running': 'en curso', 'queue.status.paused': 'en pausa', 'queue.status.done': 'lista', 'queue.status.failed': 'falló', 'queue.status.canceled': 'cancelada',
    'queue.settings': 'Ajustes', 'queue.save': 'Guardar ajustes', 'queue.saved': 'Guardado', 'queue.recommended': '★ recomendado', 'queue.notInstalled': 'no instalado',
    'queue.modelNormalize': 'LLM que normaliza', 'queue.modelTranslate': 'LLM que traduce', 'queue.ollamaDown': 'Ollama no responde: solo se muestran los nombres guardados.',
    'queue.langs': 'Idiomas objetivo', 'queue.concurrency': 'Concurrencia (peticiones a la vez)', 'queue.removal': 'Quitar jugadas al normalizar', 'queue.removalStrict': 'Estricto: rechaza un resultado que quite alguna jugada', 'queue.removalModerate': 'Moderado: permite quitar jugadas de lo que ocurre después ("luego", "en la jugada 14"…)',
    'queue.cool': 'Enfriamiento', 'queue.coolEvery': 'Pausar cada (min, 0 = nunca)', 'queue.coolFor': 'durante (min)', 'queue.coolUnload': 'Descargar los modelos de Ollama durante la pausa',
    'queue.download': 'Descargar más modelos de Ollama', 'queue.modelName': 'Nombre del modelo (p. ej. qwen3:8b)', 'queue.pull': 'Descargar', 'queue.pulling': 'Descargando {model}: {status}', 'queue.pullDone': '{model} descargado', 'queue.pullFail': 'Falló la descarga: {msg}', 'queue.suggestions': 'Sugerencias',
    'queue.ext': 'LLM externo para las tareas de la cola', 'queue.extHint': 'El script de traducción solo habla la API de OpenAI: openai o cualquier servidor compatible. Anthropic no está soportado aquí.', 'queue.extProvider': 'Proveedor', 'queue.extLocal': 'ninguno (Ollama local)', 'queue.extModel': 'Modelo', 'queue.extUrl': 'URL base (vacía para OpenAI)', 'queue.extKey': 'Clave de API', 'queue.keySet': 'hay una clave guardada', 'queue.keyNone': 'no hay clave guardada', 'queue.keyPlaceholder': 'pega una clave nueva (se guarda en local y nunca se muestra)',
    'queue.prompts': 'Prompts usados', 'queue.promptNorm': 'Prompt de normalización (para el LLM que normaliza)', 'queue.promptTrans': 'Prompt de traducción (destino: {lang})', 'queue.system': 'Mensaje del sistema', 'queue.user': 'Mensaje del usuario (comentario de ejemplo)', 'queue.rules': 'Reglas de validación (una propuesta que incumpla alguna se rechaza)',
    'queue.rule.empty': 'La propuesta no puede estar vacía.', 'queue.rule.length': 'No puede ser más de 3 veces más larga que el original.', 'queue.rule.missing': 'Deben conservarse todas las jugadas del original.', 'queue.rule.added': 'No se puede añadir ninguna jugada que no esté en el original.',
  },
})

Console.registerTab({
  id: 'queue', order: 20, title: { en: 'Queue', es: 'Cola' },
  render(el, { params, t, api, esc }) {
    const LANGS = ['es', 'en', 'de', 'fr']
    const SUGGESTIONS = ['gpt-oss:20b', 'translategemma:27b', 'qwen3:14b', 'qwen3:8b', 'gemma3:12b', 'llama3.1:8b']
    let timer = null, pullTimer = null, live = null, installed = [], up = true, settings = null, secrets = {}, recommended = { normalize: '', translate: '' }
    let busy = false
    el.innerHTML = `<div id="q-live"></div><div id="q-settings"></div><div id="q-prompts"></div>`
    const $ = (sel) => el.querySelector(sel)
    const langName = (l) => ({ es: 'Español', en: 'English', de: 'Deutsch', fr: 'Français' }[l] ?? l)
    const time = (ms) => new Date(ms).toLocaleTimeString()
    const taskLabel = (x) => `${t(`queue.phase.${x.phase}`)} · ${t(`queue.kind.${x.kind}`)}${x.onlyLang ? ` · ${t('queue.onlyLang', { lang: langName(x.onlyLang) })}` : ''} · ${x.langs.map(langName).join(', ')}`
    const act = async (fn) => { try { await fn() } catch (e) { $('#q-live').dataset.err = e.message } await refresh() }

    async function refresh() {
      try { live = await api('/api/queue'); recommended = live.recommended ?? recommended } catch (e) { live = { error: e.message } }
      drawLive()
    }

    function drawLive() {
      const box = $('#q-live')
      if (!box || !live) return
      if (live.error) { box.innerHTML = `<p class="err">${esc(live.error)}</p>`; return }
      const { tasks, runner, external } = live
      const err = box.dataset.err
      delete box.dataset.err
      const st = runner.state
      const pill = `<span class="pill ${st === 'running' ? 'run' : st === 'paused' ? 'idle' : 'done'}">${t(`queue.state.${st}`)}</span>`
      const extra = st === 'paused' && runner.pausedUntil ? t('queue.pausedUntil', { time: time(runner.pausedUntil) }) : st === 'running' && runner.nextPauseAt ? t('queue.nextPause', { time: time(runner.nextPauseAt) }) : ''
      const btn = (id, label, on) => `<button data-act="${id}" ${on ? '' : 'disabled'}>${t(label)}</button>`
      const rows = tasks.map((x, i) => `<li data-id="${esc(x.id)}"><span class="pill ${x.status === 'running' ? 'run' : x.status === 'failed' ? 'stale' : x.status === 'done' ? 'done' : 'idle'}">${t(`queue.status.${x.status}`)}</span>
        <span style="flex:1">${esc(taskLabel(x))}${x.error ? ` <span class="err">${esc(x.error)}</span>` : ''}</span>
        ${x.status === 'queued' ? `<button data-up="${i}" title="${t('queue.up')}" aria-label="${t('queue.up')}">↑</button><button data-down="${i}" title="${t('queue.down')}" aria-label="${t('queue.down')}">↓</button>` : ''}
        <button data-del="${esc(x.id)}">${t('queue.cancel')}</button></li>`).join('')
      box.innerHTML = `<section class="card"><h2>${t('queue.tab')} ${pill}</h2>
        ${external ? `<p class="err">${t('queue.external', { pid: external.pid })}</p>` : ''}
        ${err ? `<p class="err">${t('queue.error', { msg: esc(err) })}</p>` : ''}
        <p>${btn('start', 'queue.start', st !== 'running' && !external && tasks.some((x) => x.status === 'queued') || st === 'paused')}
        ${btn('stop', 'queue.stop', st !== 'idle')} ${btn('pause', 'queue.pause', st === 'running')} ${btn('resume', 'queue.resume', st === 'paused')} <span class="sub-line">${esc(extra)}</span></p>
        <h2>${t('queue.tasks')}</h2>${tasks.length ? `<ul class="phases">${rows}</ul>` : `<p class="empty">${t('queue.noTasks')}</p>`}</section>`
      box.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => act(() => api(`/api/queue/${b.dataset.act}`, { method: 'POST' }))))
      box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => act(() => api(`/api/queue/${b.dataset.del}`, { method: 'DELETE' }))))
      const move = (i, d) => { const ids = tasks.filter((x) => x.status === 'queued').map((x) => x.id); const k = ids.indexOf(tasks[i].id); const j = k + d; if (j < 0 || j >= ids.length) return; [ids[k], ids[j]] = [ids[j], ids[k]]; act(() => api('/api/queue/order', { method: 'PUT', body: { ids } })) }
      box.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => move(Number(b.dataset.up), -1)))
      box.querySelectorAll('[data-down]').forEach((b) => b.addEventListener('click', () => move(Number(b.dataset.down), 1)))
    }

    const modelSelect = (id, value, kind) => {
      const names = [...new Set([...installed.map((m) => m.name), value, recommended[kind]].filter(Boolean))]
      return `<select id="${id}">${names.map((n) => `<option value="${esc(n)}" ${n === value ? 'selected' : ''}>${n === recommended[kind] ? '★ ' : ''}${esc(n)}${n === recommended[kind] ? ` (${t('queue.recommended')})` : ''}${installed.some((m) => m.name === n) ? '' : up ? ` — ${t('queue.notInstalled')}` : ''}</option>`).join('')}</select>`
    }

    async function loadSettings() {
      const [s, m] = await Promise.all([api('/api/settings'), api('/api/ollama/models').catch(() => ({ up: false, installed: [] }))])
      settings = s.settings; secrets = s.secrets; installed = m.installed; up = m.up
      drawSettings()
    }

    function drawSettings() {
      const s = settings, ext = s.external ?? {}, p = s.pause ?? {}
      $('#q-settings').innerHTML = `<section class="card" style="margin-top:14px"><h2>${t('queue.settings')}</h2>
        ${up ? '' : `<p class="err">${t('queue.ollamaDown')}</p>`}
        <div class="grid">
          <div><label>${t('queue.modelNormalize')}<br>${modelSelect('s-norm', s.models.normalize, 'normalize')}</label><br><br><label>${t('queue.modelTranslate')}<br>${modelSelect('s-trans', s.models.translate, 'translate')}</label>
            <p><label>${t('queue.concurrency')}<br><input id="s-conc" type="number" min="1" max="16" value="${s.concurrency}"></label></p>
            <p><label>${t('queue.removal')}<br><select id="s-removal"><option value="moderate" ${s.removal !== 'strict' ? 'selected' : ''}>${t('queue.removalModerate')}</option><option value="strict" ${s.removal === 'strict' ? 'selected' : ''}>${t('queue.removalStrict')}</option></select></label></p></div>
          <div><b>${t('queue.langs')}</b><br>${LANGS.map((l) => `<label style="margin-right:12px"><input type="checkbox" data-lang="${l}" ${s.langs.includes(l) ? 'checked' : ''}> ${langName(l)}</label>`).join('')}
            <p><b>${t('queue.cool')}</b><br><label>${t('queue.coolEvery')} <input id="s-every" type="number" min="0" value="${p.everyMin ?? 0}" style="width:5em"></label>
            <label>${t('queue.coolFor')} <input id="s-for" type="number" min="1" value="${p.forMin ?? 5}" style="width:5em"></label><br>
            <label><input id="s-unload" type="checkbox" ${p.unload ? 'checked' : ''}> ${t('queue.coolUnload')}</label></p></div>
          <div><b>${t('queue.ext')}</b><p class="sub-line">${t('queue.extHint')}</p>
            <label>${t('queue.extProvider')} <select id="s-prov">${[['', t('queue.extLocal')], ['openai', 'openai'], ['openai-compatible', 'openai-compatible'], ['anthropic', 'anthropic']].map(([v, l]) => `<option value="${v}" ${ext.provider === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label><br>
            <label>${t('queue.extModel')} <input id="s-xmodel" value="${esc(ext.model ?? '')}"></label><br>
            <label>${t('queue.extUrl')} <input id="s-xurl" value="${esc(ext.baseUrl ?? '')}" style="width:20em"></label><br>
            <label>${t('queue.extKey')} <input id="s-xkey" type="password" autocomplete="off" placeholder="${t('queue.keyPlaceholder')}" style="width:20em"></label>
            <span class="sub-line">${secrets[ext.provider || 'openai'] ? t('queue.keySet') : t('queue.keyNone')}</span></div>
        </div>
        <p><button id="s-save">${t('queue.save')}</button> <span id="s-msg" class="sub-line"></span></p>
        <h2>${t('queue.download')}</h2>
        <p><input id="p-name" list="p-list" placeholder="${t('queue.modelName')}" style="width:18em"><datalist id="p-list">${SUGGESTIONS.map((n) => `<option value="${n}">`).join('')}</datalist>
        <button id="p-go">${t('queue.pull')}</button></p>
        <p class="sub-line">${t('queue.suggestions')}: ${SUGGESTIONS.map((n) => `<a href="#" data-sug="${n}">${n}</a>`).join(' · ')}</p>
        <div id="p-box"></div></section>`
      $('#s-save').addEventListener('click', save)
      $('#p-go').addEventListener('click', () => pull($('#p-name').value.trim()))
      el.querySelectorAll('[data-sug]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); $('#p-name').value = a.dataset.sug }))
      watchPull()
    }

    async function save() {
      const msg = $('#s-msg')
      try {
        const prov = $('#s-prov').value
        const patch = {
          models: { normalize: $('#s-norm').value, translate: $('#s-trans').value },
          langs: [...el.querySelectorAll('[data-lang]')].filter((c) => c.checked).map((c) => c.dataset.lang),
          concurrency: Number($('#s-conc').value),
          removal: $('#s-removal').value,
          pause: { everyMin: Number($('#s-every').value), forMin: Number($('#s-for').value), unload: $('#s-unload').checked },
          external: { provider: prov, model: $('#s-xmodel').value.trim(), baseUrl: $('#s-xurl').value.trim() },
        }
        const key = $('#s-xkey').value
        const out = await api('/api/settings', { method: 'PUT', body: patch })
        if (key && prov && prov !== 'anthropic') await api(`/api/secrets/${prov}`, { method: 'PUT', body: { value: key } })
        else if (key) await api('/api/secrets/anthropic', { method: 'PUT', body: { value: key } })
        settings = out.settings
        await loadSettings()
        $('#s-msg').textContent = t('queue.saved')
      } catch (e) { msg.textContent = t('queue.error', { msg: e.message }) }
    }

    async function pull(model) {
      if (!model) return
      try { await api('/api/queue/pull', { method: 'POST', body: { model } }) } catch (e) { $('#p-box').innerHTML = `<p class="err">${esc(t('queue.pullFail', { msg: e.message }))}</p>`; return }
      watchPull()
    }
    async function watchPull() {
      clearTimeout(pullTimer)
      let p
      try { p = await api('/api/queue/pull') } catch { return }
      const box = $('#p-box')
      if (!box || !p.model) return
      const pct = p.total > 0 ? Math.min(100, (p.completed / p.total) * 100) : 0
      if (!p.done) {
        box.innerHTML = `<p>${esc(t('queue.pulling', { model: p.model, status: p.status }))}</p><div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div>`
        pullTimer = setTimeout(watchPull, 1000)
      } else if (p.error) box.innerHTML = `<p class="err">${esc(t('queue.pullFail', { msg: p.error }))}</p>`
      else {
        box.innerHTML = `<p>${esc(t('queue.pullDone', { model: p.model }))}</p>`
        try { installed = (await api('/api/ollama/models')).installed } catch { /* keep the list */ }
        // offer the new model in both selects without losing what was typed in the form
        for (const id of ['#s-norm', '#s-trans']) { const sel = $(id); if (sel && ![...sel.options].some((o) => o.value === p.model)) sel.add(new Option(p.model, p.model)) }
      }
    }

    async function drawPrompts() {
      let d
      try { d = await api(`/api/queue/prompts?lang=${(settings?.langs ?? ['es'])[0]}`) } catch (e) { $('#q-prompts').innerHTML = `<p class="err">${esc(e.message)}</p>`; return }
      const block = (title, p, open) => `<details ${open ? 'open' : ''}><summary>${esc(title)}</summary><b>${t('queue.system')}</b><pre style="white-space:pre-wrap">${esc(p.system)}</pre><b>${t('queue.user')}</b><pre style="white-space:pre-wrap">${esc(p.user)}</pre></details>`
      const open = params.view === 'prompts'
      $('#q-prompts').innerHTML = `<section class="card" id="q-prompts-card" style="margin-top:14px"><details ${open ? 'open' : ''}><summary><h2 style="display:inline">${t('queue.prompts')}</h2></summary>
        ${block(t('queue.promptNorm'), d.normalize, open)}${block(t('queue.promptTrans', { lang: langName(d.targetLang) }), d.translate, open)}
        <details ${open ? 'open' : ''}><summary>${t('queue.rules')}</summary><ul>${d.rules.map((r) => `<li>${esc(t(`queue.rule.${r.key}`))}</li>`).join('')}</ul></details></details></section>`
      if (open) $('#q-prompts-card').scrollIntoView?.()
    }

    // The settings form needs the recommended models that the first refresh brings (the star).
    refresh().then(loadSettings).then(drawPrompts)
    timer = setInterval(refresh, 3000)
    return () => { clearInterval(timer); clearTimeout(pullTimer) }
  },
})
