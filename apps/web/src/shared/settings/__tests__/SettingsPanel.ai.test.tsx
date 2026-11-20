import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const session = { server: false }
vi.mock('../../api/serverSession', () => ({ hasServerSession: () => session.server }))

import SettingsPanel from '../SettingsPanel'
import { useSettingsStore } from '../settingsStore'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  useSettingsStore.getState().reset()
  vi.unstubAllGlobals()
  session.server = false
})

describe('Settings — AI assistant (S1)', () => {
  it('choosing a provider prefills its base URL; Ollama asks for no key', () => {
    render(<SettingsPanel onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('AI provider'), { target: { value: 'ollama' } })
    expect(useSettingsStore.getState()).toMatchObject({ aiProvider: 'ollama', aiBaseUrl: 'http://localhost:11434/v1', aiModel: '', aiVision: null })
    expect(screen.getByLabelText('AI base URL')).toHaveValue('http://localhost:11434/v1')
    expect(screen.queryByLabelText('AI API key')).toBeNull()
    expect(screen.getByText(/OLLAMA_ORIGINS/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('AI provider'), { target: { value: 'openai' } })
    expect(screen.getByLabelText('AI base URL')).toHaveValue('https://api.openai.com/v1')
    fireEvent.change(screen.getByLabelText('AI API key'), { target: { value: 'sk-x' } })
    expect(screen.getByLabelText('AI API key')).toHaveAttribute('type', 'password')
    fireEvent.change(screen.getByLabelText('AI base URL'), { target: { value: 'https://my.proxy/v1' } })
    fireEvent.change(screen.getByLabelText('AI model'), { target: { value: 'free-text-model' } })
    expect(useSettingsStore.getState()).toMatchObject({ aiKey: 'sk-x', aiBaseUrl: 'https://my.proxy/v1', aiModel: 'free-text-model' })
  })

  it('Load models fills a list to choose from', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ data: [{ id: 'm-b' }, { id: 'm-a' }] })))
    useSettingsStore.getState().set({ aiProvider: 'openai', aiBaseUrl: 'https://api.openai.com/v1', aiKey: 'sk' })
    render(<SettingsPanel onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Load models' }))
    const list = await screen.findByLabelText('Loaded models')
    expect([...(list as HTMLSelectElement).options].map((o) => o.value)).toEqual(['', 'm-a', 'm-b'])
    fireEvent.change(list, { target: { value: 'm-b' } })
    expect(useSettingsStore.getState().aiModel).toBe('m-b')
  })

  it('Test shows the model, the latency and whether it sees, and remembers the vision', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const seen = String(init.body).includes('image_url')
      return json({ model: 'llava', choices: [{ message: { content: seen ? 'red' : 'OK' } }] })
    }))
    useSettingsStore.getState().set({ aiProvider: 'ollama', aiBaseUrl: 'http://localhost:11434/v1', aiModel: 'llava' })
    render(<SettingsPanel onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    const status = await screen.findByRole('status', { name: 'AI test result' })
    await waitFor(() => expect(status.textContent).toMatch(/✓ llava · \d+ ms · vision yes/))
    expect(useSettingsStore.getState().aiVision).toBe(true)
  })

  it('Test shows the readable error of a failing provider', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: { message: 'Incorrect API key provided' } }, 401)))
    useSettingsStore.getState().set({ aiProvider: 'openai', aiBaseUrl: 'https://api.openai.com/v1', aiKey: 'bad', aiModel: 'gpt-x' })
    render(<SettingsPanel onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    const status = await screen.findByRole('status', { name: 'AI test result' })
    await waitFor(() => expect(status.textContent).toContain('The API key was not accepted by OpenAI.'))
  })

  it('the privacy note says where the key goes', () => {
    useSettingsStore.getState().set({ aiProvider: 'openai', aiBaseUrl: 'https://api.openai.com/v1' })
    const { unmount } = render(<SettingsPanel onClose={() => {}} />)
    expect(screen.getByText(/The key stays in this browser and is sent only to the provider/)).toBeInTheDocument()
    unmount()
    session.server = true
    render(<SettingsPanel onClose={() => {}} />)
    expect(screen.getByText(/sent with each request to your own server/)).toBeInTheDocument()
  })
})

describe('Settings — resources write token', () => {
  it('is a password field with a link to create a contents:write token for the repository', () => {
    useSettingsStore.getState().set({ commentDbUrl: 'https://github.com/owner/resources' })
    render(<SettingsPanel onClose={() => {}} />)
    const field = screen.getByLabelText('Resources write token')
    expect(field).toHaveAttribute('type', 'password')
    fireEvent.change(field, { target: { value: ' ghp_w ' } })
    expect(useSettingsStore.getState().resourcesWriteToken).toBe('ghp_w')
    const link = screen.getByRole('link', { name: /Create a write token/ }) as HTMLAnchorElement
    const url = new URL(link.href)
    expect(url.origin + url.pathname).toBe('https://github.com/settings/personal-access-tokens/new')
    expect(url.searchParams.get('contents')).toBe('write')
    expect(url.searchParams.get('target_name')).toBe('owner')
  })

  it('Check asks api.github.com for the repository and reports whether the token can push', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    let push = true
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return push === null ? json({ message: 'Bad credentials' }, 401) : json({ permissions: { push } })
    }))
    useSettingsStore.getState().set({ commentDbUrl: 'https://github.com/owner/resources', resourcesWriteToken: 'ghp_w' })
    render(<SettingsPanel onClose={() => {}} />)
    const check = screen.getByRole('button', { name: 'Check the write token' })
    fireEvent.click(check)
    const status = await screen.findByRole('status', { name: 'Write token check' })
    await waitFor(() => expect(status.textContent).toBe('✓ can write'))
    expect(calls[0].url).toBe('https://api.github.com/repos/owner/resources')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer ghp_w')
    push = false
    fireEvent.click(check)
    await waitFor(() => expect(status.textContent).toBe('read only'))
    push = null as unknown as boolean
    fireEvent.click(check)
    await waitFor(() => expect(status.textContent).toContain('401'))
  })
})
