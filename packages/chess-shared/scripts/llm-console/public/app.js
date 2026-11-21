// The console runtime: tabs, language, API helper, the GPU widget. Modules register their tabs with Console.registerTab.
//   Console.registerTab({ id, order, title: { en, es }, render(el, ctx) → optional cleanup })
//   ctx = { params, t, api, navigate, lang, esc, n }   (params come from the hash: #/results?action=translate&status=accepted)
//   Console.addStrings({ en: { 'x.y': 'text' }, es: { 'x.y': 'texto' } });  Console.t('x.y', { name: 'v' }) replaces {name}
(() => {
  const strings = { en: {}, es: {} }
  const tabs = []
  const hooks = []
  let lang = localStorage.getItem('console.lang') || (navigator.language?.startsWith('es') ? 'es' : 'en')
  let cleanup = null
  let current = null

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const n = (v) => Number(v ?? 0).toLocaleString(lang === 'es' ? 'es' : 'en')
  const t = (key, vars) => {
    const s = strings[lang][key] ?? strings.en[key] ?? key
    return vars ? s.replace(/\{(\w+)\}/g, (_m, k) => (vars[k] ?? '')) : s
  }

  async function api(path, { method = 'GET', body } = {}) {
    const r = await fetch(path, { method, cache: 'no-store', headers: { 'X-Console': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
    return j
  }

  const parseHash = () => {
    const m = /^#\/([\w-]+)(?:\?(.*))?$/.exec(location.hash)
    return { id: m?.[1] ?? null, params: Object.fromEntries(new URLSearchParams(m?.[2] ?? '')) }
  }
  const navigate = (id, params = {}) => { location.hash = `#/${id}${Object.keys(params).length ? `?${new URLSearchParams(params)}` : ''}` }

  function renderTabs() {
    const sorted = [...tabs].sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
    document.getElementById('tabs').innerHTML = sorted.map((x) => `<button role="tab" data-tab="${x.id}" aria-selected="${x.id === current}">${esc(x.title[lang] ?? x.title.en)}</button>`).join('')
    document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => navigate(b.dataset.tab)))
  }

  function show() {
    const { id, params } = parseHash()
    const tab = tabs.find((x) => x.id === id) ?? [...tabs].sort((a, b) => (a.order ?? 99) - (b.order ?? 99))[0]
    if (!tab) return
    if (typeof cleanup === 'function') { try { cleanup() } catch { /* ignore */ } }
    cleanup = null
    current = tab.id
    renderTabs()
    const el = document.getElementById('main')
    el.innerHTML = ''
    cleanup = tab.render(el, { params, t, api, navigate, lang, esc, n })
  }

  function applyLang() {
    document.documentElement.lang = lang
    document.querySelectorAll('[data-i18n]').forEach((e) => { e.textContent = t(e.dataset.i18n) })
    document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)))
    document.title = t('app.title')
  }

  function setLang(l) {
    lang = l
    localStorage.setItem('console.lang', l)
    api('/api/settings', { method: 'PUT', body: { language: l } }).catch(() => {})
    applyLang()
    show()
    hooks.forEach((h) => h(l))
  }

  // ---- GPU widget (top right) ----
  let gpuData = null
  async function pollGpu() {
    try {
      gpuData = await api('/api/gpu')
      const g = gpuData.gpu
      const use = g.utilization == null ? '—' : `${g.utilization}%`
      document.getElementById('gpu-text').textContent = `GPU ${use}${g.cores ? ` · ${g.cores} ${t('gpu.cores')}` : ''} · ${gpuData.ollama.loaded.length} LLM`
      if (!document.getElementById('gpu-panel').hidden) renderGpuPanel()
    } catch { document.getElementById('gpu-text').textContent = 'GPU ?' }
  }
  function renderGpuPanel() {
    const p = document.getElementById('gpu-panel')
    if (!gpuData) return
    const g = gpuData.gpu, o = gpuData.ollama
    const mem = g.memory ? `${g.memory.usedGb != null ? `${g.memory.usedGb} / ` : ''}${g.memory.totalGb} GB${g.memory.unified ? ` (${t('gpu.unified')})` : ''}` : '—'
    p.innerHTML = `<h2>${esc(g.name ?? 'GPU')}</h2>
      <div class="bar ${(g.utilization ?? 0) > 90 ? '' : 'ok'}" title="${g.utilization ?? '?'}%"><i style="width:${g.utilization ?? 0}%"></i></div>
      <dl class="kv" style="margin-top:8px"><dt>${t('gpu.usage')}</dt><dd>${g.utilization == null ? '—' : `${g.utilization}%`}</dd><dt>${t('gpu.coresLabel')}</dt><dd>${g.cores ?? '—'}</dd><dt>${t('gpu.memory')}</dt><dd>${esc(mem)}</dd></dl>
      <h2 style="margin-top:12px">${t('gpu.loaded')}</h2>
      ${o.up ? (o.loaded.length ? o.loaded.map((m) => `<div style="margin-bottom:6px"><b class="mono">${esc(m.name)}</b><br><span class="muted">${esc(m.params ?? '')} ${esc(m.quant ?? '')} · ${m.sizeGb} GB · GPU ${m.vramGb} GB${m.context ? ` · ctx ${m.context}` : ''}</span></div>`).join('') : `<p class="empty">${t('gpu.none')}</p>`) : `<p class="err">${t('gpu.ollamaDown')}</p>`}`
  }

  addEventListener('hashchange', show)
  document.addEventListener('DOMContentLoaded', async () => {
    document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)))
    document.getElementById('gpu').addEventListener('click', () => {
      const p = document.getElementById('gpu-panel')
      p.hidden = !p.hidden
      document.getElementById('gpu').setAttribute('aria-expanded', String(!p.hidden))
      if (!p.hidden) renderGpuPanel()
    })
    try { const s = await api('/api/settings'); document.getElementById('dbname').textContent = s.settings.dbPath ? s.settings.dbPath.split('/').slice(-2).join('/') : '' } catch { /* offline */ }
    applyLang()
    show()
    void pollGpu()
    setInterval(pollGpu, 3000)
  })

  window.Console = {
    t, n, esc, api, navigate,
    lang: () => lang,
    setLang,
    onLang: (fn) => hooks.push(fn),
    addStrings: (s) => { for (const l of ['en', 'es']) Object.assign(strings[l], s[l] ?? {}) },
    registerTab: (tab) => { tabs.push(tab); if (document.readyState !== 'loading') { renderTabs(); if (!current || parseHash().id === tab.id) show() } },
  }
  window.Console.addStrings({
    en: { 'app.title': 'LLM tasks console', 'gpu.cores': 'cores', 'gpu.coresLabel': 'GPU cores', 'gpu.usage': 'Usage', 'gpu.memory': 'Memory', 'gpu.unified': 'shared with the CPU', 'gpu.loaded': 'LLMs loaded in the GPU', 'gpu.none': 'No model is loaded.', 'gpu.ollamaDown': 'Ollama does not answer.' },
    es: { 'app.title': 'Consola de tareas de LLM', 'gpu.cores': 'núcleos', 'gpu.coresLabel': 'Núcleos de GPU', 'gpu.usage': 'Uso', 'gpu.memory': 'Memoria', 'gpu.unified': 'compartida con la CPU', 'gpu.loaded': 'LLMs cargados en la GPU', 'gpu.none': 'No hay ningún modelo cargado.', 'gpu.ollamaDown': 'Ollama no responde.' },
  })
})()
