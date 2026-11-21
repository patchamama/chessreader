import { splitUrls } from './splitUrls'

/** Plain text in which every http(s) url is a link that opens in another window. */
export default function LinkedText({ text }: { text: string }) {
  return (
    <>
      {splitUrls(text).map((p, i) => 'url' in p
        ? <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">{p.url}</a>
        : <span key={i}>{p.text}</span>)}
    </>
  )
}
