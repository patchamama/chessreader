import { useMutation } from '@tanstack/react-query'
import { httpClient } from '../../../shared/api/httpClient'
import type { RecognizedGame } from '@chess-ebook/chess-shared'

export interface DiagramImage {
  src: string
  alt: string
}

export interface ParsedWebpage {
  html: string
  games: RecognizedGame[]
  images: DiagramImage[]
}

export function useParseWebpage() {
  return useMutation<ParsedWebpage, Error, string>({
    mutationFn: (url: string) =>
      httpClient<ParsedWebpage>('/api/webparser/parse', {
        method: 'POST',
        body: JSON.stringify({ url }),
      }),
  })
}
