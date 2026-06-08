import { useMutation } from '@tanstack/react-query'
import { httpClient } from '../../../shared/api/httpClient'

interface RegisterInput {
  email: string
  password: string
}

interface RegisterResponse {
  id: number
  email: string
  status: string
}

interface LoginInput {
  email: string
  password: string
}

interface LoginResponse {
  token: string
}

export function useRegisterMutation() {
  return useMutation({
    mutationFn: (input: RegisterInput) =>
      httpClient<RegisterResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  })
}

export function useLoginMutation() {
  return useMutation({
    mutationFn: (input: LoginInput) =>
      httpClient<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  })
}
