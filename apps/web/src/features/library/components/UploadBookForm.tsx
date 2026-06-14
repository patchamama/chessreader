import { useRef, useState } from 'react'
import { useUploadBook } from '../api/libraryApi'

type Tab = 'file' | 'url'

export default function UploadBookForm() {
  const [tab, setTab] = useState<Tab>('file')
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const { mutateAsync, isPending, isError, error } = useUploadBook()

  function pickFile(f: File) {
    if (f.name.endsWith('.epub') || f.type === 'application/epub+zip') {
      setFile(f)
      setTab('file')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (tab === 'file' && file) {
      await mutateAsync({ file })
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
    } else if (tab === 'url' && url.trim()) {
      await mutateAsync({ url: url.trim() })
      setUrl('')
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) pickFile(dropped)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm mb-6"
      aria-label="Upload book"
    >
      <h2 className="mb-3 text-lg font-semibold text-gray-800">Add a book</h2>

      {/* Tabs */}
      <div role="tablist" className="mb-4 flex gap-2 border-b border-gray-200">
        <button
          role="tab"
          type="button"
          aria-selected={tab === 'file'}
          onClick={() => setTab('file')}
          className={`pb-2 px-1 text-sm font-medium transition-colors ${
            tab === 'file'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          EPUB File
        </button>
        <button
          role="tab"
          type="button"
          aria-selected={tab === 'url'}
          onClick={() => setTab('url')}
          className={`pb-2 px-1 text-sm font-medium transition-colors ${
            tab === 'url'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          URL
        </button>
      </div>

      {/* File input + drag & drop */}
      {tab === 'file' && (
        <div className="mb-4">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 transition-colors ${
              isDragging
                ? 'border-blue-400 bg-blue-50'
                : file
                  ? 'border-emerald-400 bg-emerald-50'
                  : 'border-gray-300 bg-gray-50 hover:border-blue-300 hover:bg-blue-50'
            }`}
          >
            <svg className={`mb-2 h-8 w-8 ${file ? 'text-emerald-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {file
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              }
            </svg>
            {file ? (
              <p className="text-sm font-medium text-emerald-700">{file.name}</p>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-700">Drop an EPUB here or <span className="text-blue-600 underline">browse</span></p>
                <p className="mt-1 text-xs text-gray-400">.epub files only</p>
              </>
            )}
          </div>
          <input
            ref={inputRef}
            id="epub-file-input"
            type="file"
            accept=".epub,application/epub+zip"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) pickFile(f)
            }}
          />
        </div>
      )}

      {/* URL input */}
      {tab === 'url' && (
        <div className="mb-4">
          <label htmlFor="url-input" className="mb-1 block text-sm font-medium text-gray-700">
            URL
          </label>
          <input
            id="url-input"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/chess-article"
            className="block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      )}

      {/* Error */}
      {isError && error && (
        <div role="alert" className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
          {error.message}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? 'Uploading…' : 'Upload'}
      </button>
    </form>
  )
}
