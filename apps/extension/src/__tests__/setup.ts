/// <reference types="vitest/globals" />

// Minimal chrome API mock for jsdom test environment
const mockStorage: Record<string, unknown> = {}

const storageMock = {
  get: vi.fn(
    (
      keys: string | string[] | Record<string, unknown> | null,
      callback?: (result: Record<string, unknown>) => void
    ) => {
      const keyList =
        typeof keys === 'string'
          ? [keys]
          : Array.isArray(keys)
          ? keys
          : keys
          ? Object.keys(keys)
          : Object.keys(mockStorage)
      const result: Record<string, unknown> = {}
      for (const k of keyList) {
        if (k in mockStorage) result[k] = mockStorage[k]
      }
      if (callback) callback(result)
      return Promise.resolve(result) as unknown as void
    }
  ),
  set: vi.fn(
    (items: Record<string, unknown>, callback?: () => void) => {
      Object.assign(mockStorage, items)
      if (callback) callback()
      return Promise.resolve() as unknown as void
    }
  ),
  remove: vi.fn(),
  clear: vi.fn(),
  getBytesInUse: vi.fn(),
  setAccessLevel: vi.fn(),
  onChanged: { addListener: vi.fn(), removeListener: vi.fn(), hasListener: vi.fn() },
}

const chromeMock = {
  storage: {
    local: storageMock,
    session: storageMock,
    sync: storageMock,
    managed: storageMock,
    onChanged: { addListener: vi.fn(), removeListener: vi.fn(), hasListener: vi.fn() },
  },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(),
    },
  },
} as unknown as typeof chrome

// Expose as global
Object.defineProperty(globalThis, 'chrome', {
  value: chromeMock,
  writable: true,
})

export function resetChromeMock() {
  for (const key of Object.keys(mockStorage)) {
    delete mockStorage[key]
  }
  vi.clearAllMocks()
}

beforeEach(() => {
  resetChromeMock()
})
