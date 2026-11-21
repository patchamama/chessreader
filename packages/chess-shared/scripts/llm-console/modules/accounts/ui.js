// Settings tab: accounts and keys (GitHub, Lichess, OpenAI, Anthropic, an OpenAI-compatible server), a real test for each one,
// and the choice of the external LLM (provider + model) that the Queue, Results and Benchmark tabs use.
Console.addStrings({
  en: {
    'acc.tab': 'Settings', 'acc.title': 'Accounts and keys', 'acc.intro': 'Keys are kept in a private file on this computer (or read from the usual environment variable) and are never shown again. Test a key before you save it.',
    'acc.set.file': 'saved', 'acc.set.none': 'not set', 'acc.placeholder': 'paste a token or key', 'acc.test': 'Test', 'acc.save': 'Save', 'acc.remove': 'Remove', 'acc.testing': 'Testing…', 'acc.saved': 'Saved.', 'acc.removed': 'Removed.',
    'acc.ok': 'It works', 'acc.fail': 'It does not work: {msg}', 'acc.needKey': 'Type a key or save one first.',
    'acc.github': 'GitHub', 'acc.github.help': 'Publishes to the resources and sample repositories. A fine-grained token with Contents: read and write on those repositories is enough.', 'acc.github.create': 'Create a token',
    'acc.lichess': 'Lichess', 'acc.lichess.help': 'Optional. The Lichess tab fetches public studies without it; a token adds private studies of its account and higher rate limits (scope study:read).', 'acc.lichess.create': 'Create a token with study:read', 'acc.lichess.studies': 'Browse studies on Lichess',
    'acc.openai': 'OpenAI', 'acc.openai.help': 'An external model to redo, judge and benchmark.', 'acc.anthropic': 'Anthropic', 'acc.anthropic.help': 'An external model to redo, judge and benchmark.',
    'acc.compat': 'OpenAI-compatible server', 'acc.compat.help': 'Any server with the OpenAI API (LM Studio, vLLM, OpenRouter…).', 'acc.baseUrl': 'Base URL',
    'acc.user': 'User: {user}', 'acc.scopes': 'Scopes: {scopes}', 'acc.noScopes': 'no classic scopes (a fine-grained token)', 'acc.studyRead': 'Can read studies (study:read).', 'acc.noStudyRead': 'It cannot read private studies: add the study:read scope.',
    'acc.repo.push': '{repo}: you can push', 'acc.repo.nopush': '{repo}: read only — it needs write access', 'acc.repo.fail': '{repo}: not reachable ({msg})',
    'acc.models': '{n} models', 'acc.model': 'Model', 'acc.modelHint': 'test the key to list models, or type one', 'acc.useExternal': 'Use as the external LLM', 'acc.current': 'External LLM now', 'acc.none': 'none', 'acc.usedAs': 'Now the external LLM is {provider} · {model}.', 'acc.pickModel': 'Choose a model first.',
  },
  es: {
    'acc.tab': 'Ajustes', 'acc.title': 'Cuentas y claves', 'acc.intro': 'Las claves se guardan en un archivo privado de este ordenador (o se leen de la variable de entorno habitual) y nunca se vuelven a mostrar. Prueba una clave antes de guardarla.',
    'acc.set.file': 'guardada', 'acc.set.none': 'sin definir', 'acc.placeholder': 'pega un token o una clave', 'acc.test': 'Probar', 'acc.save': 'Guardar', 'acc.remove': 'Quitar', 'acc.testing': 'Probando…', 'acc.saved': 'Guardada.', 'acc.removed': 'Quitada.',
    'acc.ok': 'Funciona', 'acc.fail': 'No funciona: {msg}', 'acc.needKey': 'Escribe una clave o guarda una primero.',
    'acc.github': 'GitHub', 'acc.github.help': 'Publica en los repositorios de recursos y de muestra. Basta un token de grano fino con Contents: lectura y escritura en esos repositorios.', 'acc.github.create': 'Crear un token',
    'acc.lichess': 'Lichess', 'acc.lichess.help': 'Opcional. La pestaña de Lichess trae estudios públicos sin él; un token añade los estudios privados de su cuenta y límites de uso mayores (permiso study:read).', 'acc.lichess.create': 'Crear un token con study:read', 'acc.lichess.studies': 'Ver estudios en Lichess',
    'acc.openai': 'OpenAI', 'acc.openai.help': 'Un modelo externo para rehacer, juzgar y comparar.', 'acc.anthropic': 'Anthropic', 'acc.anthropic.help': 'Un modelo externo para rehacer, juzgar y comparar.',
    'acc.compat': 'Servidor compatible con OpenAI', 'acc.compat.help': 'Cualquier servidor con la API de OpenAI (LM Studio, vLLM, OpenRouter…).', 'acc.baseUrl': 'URL base',
    'acc.user': 'Usuario: {user}', 'acc.scopes': 'Permisos: {scopes}', 'acc.noScopes': 'sin permisos clásicos (token de grano fino)', 'acc.studyRead': 'Puede leer estudios (study:read).', 'acc.noStudyRead': 'No puede leer estudios privados: añade el permiso study:read.',
    'acc.repo.push': '{repo}: puedes escribir', 'acc.repo.nopush': '{repo}: solo lectura — necesita permiso de escritura', 'acc.repo.fail': '{repo}: no accesible ({msg})',
    'acc.models': '{n} modelos', 'acc.model': 'Modelo', 'acc.modelHint': 'prueba la clave para listar modelos, o escribe uno', 'acc.useExternal': 'Usar como LLM externo', 'acc.current': 'LLM externo ahora', 'acc.none': 'ninguno', 'acc.usedAs': 'Ahora el LLM externo es {provider} · {model}.', 'acc.pickModel': 'Elige un modelo primero.',
  },
})

Console.registerTab({
  id: 'settings', order: 90, title: { en: 'Settings', es: 'Ajustes' },
  render(el, { t, api, esc }) {
    let status = { secrets: {}, external: { provider: '', model: '', baseUrl: '' } }
    // What the last test of each service returned (models, user…) and the text typed or chosen; kept across redraws.
    const result = {}, typed = {}, chosen = {}
    let baseUrl = ''

    const SERVICES = [
      { id: 'github', create: 'https://github.com/settings/personal-access-tokens/new' },
      { id: 'lichess', create: 'https://lichess.org/account/oauth/token/create?scopes[]=study:read&description=LLM+tasks+console', browse: 'https://lichess.org/study' },
      { id: 'openai', ai: true },
      { id: 'anthropic', ai: true },
      { id: 'openai-compatible', ai: true, compat: true },
    ]
    const nameOf = (id) => (id === 'openai-compatible' ? t('acc.compat') : t(`acc.${id}`))
    const helpOf = (id) => (id === 'openai-compatible' ? t('acc.compat.help') : t(`acc.${id}.help`))

    function detailHtml(s, r) {
      if (!r) return ''
      if (r.error) return `<p class="err">${esc(t('acc.fail', { msg: r.error }))}</p>`
      if (r.busy) return `<p class="muted">${t('acc.testing')}</p>`
      const d = r.detail ?? {}
      const lines = [`<p class="ok" style="color:var(--ok);font-weight:600;margin:6px 0 2px">✓ ${t('acc.ok')}</p>`]
      if (d.user) lines.push(`<p class="muted" style="margin:2px 0">${esc(t('acc.user', { user: d.user }))}</p>`)
      if (s.id === 'github') {
        lines.push(`<p class="muted" style="margin:2px 0">${esc(d.scopes?.length ? t('acc.scopes', { scopes: d.scopes.join(', ') }) : t('acc.noScopes'))}</p>`)
        for (const x of d.repos ?? []) lines.push(`<p class="${x.ok && x.push ? 'muted' : 'warn'}" style="margin:2px 0">${esc(x.ok ? t(x.push ? 'acc.repo.push' : 'acc.repo.nopush', { repo: x.repo }) : t('acc.repo.fail', { repo: x.repo, msg: x.error }))}</p>`)
      }
      if (s.id === 'lichess') {
        lines.push(`<p class="muted" style="margin:2px 0">${esc(t('acc.scopes', { scopes: (d.scopes ?? []).join(', ') || '—' }))}</p>`)
        lines.push(`<p class="${d.studyRead ? 'muted' : 'warn'}" style="margin:2px 0">${esc(t(d.studyRead ? 'acc.studyRead' : 'acc.noStudyRead'))}</p>`)
      }
      return lines.join('')
    }

    function modelHtml(s, r) {
      if (!s.ai) return ''
      const models = r?.detail ? (s.id === 'anthropic' ? r.detail.named?.map((m) => m.id) : r.detail.chatModels?.length ? r.detail.chatModels : r.detail.models) ?? [] : []
      const current = status.external?.provider === s.id ? status.external.model : ''
      const value = chosen[s.id] ?? current
      const names = s.id === 'anthropic' ? Object.fromEntries((r?.detail?.named ?? []).map((m) => [m.id, m.name])) : {}
      const options = [...new Set([...(value ? [value] : []), ...models])]
      return `<div style="margin-top:8px">
        <label>${t('acc.model')} ${models.length ? `<span class="muted">(${t('acc.models', { n: models.length })})</span>` : ''}<br>
        ${options.length ? `<select data-model="${s.id}">${options.map((m) => `<option value="${esc(m)}" ${m === value ? 'selected' : ''}>${esc(names[m] ? `${names[m]} — ${m}` : m)}</option>`).join('')}</select>` : `<input data-model-text="${s.id}" placeholder="${s.id === 'openai-compatible' ? 'model-name' : t('acc.modelHint')}" value="${esc(value)}">`}</label>
        <button class="btn small" data-use="${s.id}">${t('acc.useExternal')}</button></div>`
    }

    function draw() {
      const ext = status.external ?? {}
      el.innerHTML = `<h1>${t('acc.title')}</h1><p class="sub-line">${t('acc.intro')}</p>
        <p class="sub-line"><b>${t('acc.current')}:</b> ${ext.provider && ext.model ? `${esc(ext.provider)} · ${esc(ext.model)}` : t('acc.none')}${ext.baseUrl ? ` · ${esc(ext.baseUrl)}` : ''}</p>
        <div class="grid">${SERVICES.map((s) => {
          const set = !!status.secrets[s.id]
          return `<section class="card" data-svc="${s.id}"><h2>${esc(nameOf(s.id))} <span class="pill ${set ? 'done' : 'idle'}">${t(set ? 'acc.set.file' : 'acc.set.none')}</span></h2>
            <p class="muted" style="margin:0 0 8px">${esc(helpOf(s.id))}</p>
            ${s.compat ? `<p><label>${t('acc.baseUrl')}<br><input data-base type="text" placeholder="http://localhost:1234/v1" value="${esc(baseUrl || ext.baseUrl || '')}" style="width:100%"></label></p>` : ''}
            <p><input data-key="${s.id}" type="password" autocomplete="off" placeholder="${t('acc.placeholder')}" value="${esc(typed[s.id] ?? '')}" style="width:100%"></p>
            <p><button class="btn small" data-test="${s.id}">${t('acc.test')}</button> <button class="btn small primary" data-save="${s.id}">${t('acc.save')}</button> ${set ? `<button class="btn small" data-remove="${s.id}">${t('acc.remove')}</button>` : ''}
            ${s.create ? ` <a href="${s.create}" target="_blank" rel="noopener noreferrer">${t(`acc.${s.id}.create`)}</a>` : ''}${s.browse ? ` · <a href="${s.browse}" target="_blank" rel="noopener noreferrer">${t('acc.lichess.studies')}</a>` : ''}</p>
            ${detailHtml(s, result[s.id])}${modelHtml(s, result[s.id])}</section>`
        }).join('')}</div>`
      el.querySelectorAll('[data-key]').forEach((i) => i.addEventListener('input', () => { typed[i.dataset.key] = i.value }))
      el.querySelector('[data-base]')?.addEventListener('input', (e) => { baseUrl = e.target.value })
      el.querySelectorAll('[data-model]').forEach((i) => i.addEventListener('change', () => { chosen[i.dataset.model] = i.value }))
      el.querySelectorAll('[data-model-text]').forEach((i) => i.addEventListener('input', () => { chosen[i.dataset.modelText] = i.value }))
      el.querySelectorAll('[data-test]').forEach((b) => b.addEventListener('click', () => test(b.dataset.test)))
      el.querySelectorAll('[data-save]').forEach((b) => b.addEventListener('click', () => save(b.dataset.save)))
      el.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => remove(b.dataset.remove)))
      el.querySelectorAll('[data-use]').forEach((b) => b.addEventListener('click', () => use(b.dataset.use)))
    }

    async function load() {
      status = await api('/api/accounts')
      baseUrl = baseUrl || status.external?.baseUrl || ''
      draw()
    }
    async function saveBase(id) {
      if (id !== 'openai-compatible') return
      await api('/api/settings', { method: 'PUT', body: { external: { baseUrl } } })
    }
    async function test(id) {
      if (!typed[id] && !status.secrets[id]) { result[id] = { error: t('acc.needKey') }; draw(); return }
      result[id] = { busy: true }; draw()
      try {
        await saveBase(id)
        result[id] = await api('/api/accounts/test', { method: 'POST', body: { service: id, token: typed[id] ?? '' } })
      } catch (e) { result[id] = { error: e.message } }
      draw()
    }
    async function save(id) {
      if (!typed[id]) { result[id] = { error: t('acc.needKey') }; draw(); return }
      try {
        await api(`/api/secrets/${id}`, { method: 'PUT', body: { value: typed[id] } })
        typed[id] = ''
        await saveBase(id)
        await load()
        result[id] = { ...(result[id] ?? {}), note: t('acc.saved') }
      } catch (e) { result[id] = { error: e.message } }
      draw()
    }
    async function remove(id) {
      try { await api(`/api/secrets/${id}`, { method: 'PUT', body: { value: '' } }); delete result[id]; await load() } catch (e) { result[id] = { error: e.message }; draw() }
    }
    async function use(id) {
      const model = (chosen[id] ?? (status.external?.provider === id ? status.external.model : '') ?? '').trim()
      if (!model) { result[id] = { ...(result[id] ?? {}), error: t('acc.pickModel') }; draw(); return }
      try {
        await api('/api/settings', { method: 'PUT', body: { external: { provider: id, model, baseUrl: id === 'openai-compatible' ? baseUrl : '' } } })
        await load()
      } catch (e) { result[id] = { ...(result[id] ?? {}), error: e.message }; draw() }
    }

    load().catch((e) => { el.innerHTML = `<p class="err">${esc(e.message)}</p>` })
  },
})
