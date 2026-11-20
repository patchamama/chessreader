import { useEffect, useState } from 'react'
import { lookupPositionComments, type HumanComment } from '../library/commentdb/commentLookup'

/** The database comments of a position; empty until read, and never those of a previous position. */
export function usePositionComments(fen: string, enabled = true): HumanComment[] {
  const [found, setFound] = useState<{ fen: string; list: HumanComment[] }>({ fen: '', list: [] })
  useEffect(() => {
    if (!enabled) return
    let live = true
    void lookupPositionComments(fen).then((list) => { if (live) setFound({ fen, list }) }, () => { if (live) setFound({ fen, list: [] }) })
    return () => { live = false }
  }, [fen, enabled])
  return enabled && found.fen === fen ? found.list : []
}
