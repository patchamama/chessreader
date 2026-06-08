import { useAuthStore } from '../../features/auth/store/authStore'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function httpClient<T = unknown>(
  url: string,
  init: RequestInit = {}
): Promise<T> {
  const { token } = useAuthStore.getState()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(url, { ...init, headers })

  const data = await response.json()

  if (!response.ok) {
    throw new ApiError(response.status, data?.error ?? data?.message ?? 'Unknown error')
  }

  return data as T
}
