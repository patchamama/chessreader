import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TrapTrainer } from './TrapTrainer'
import { PuzzlePanel } from '../gamesearch/PuzzlePanel'
import { LevelTest } from './LevelTest'
import { usePageWidth } from '../../shared/layout/pageWidth'

type Tab = 'traps' | 'patterns' | 'level'

/** Training: traps (celadas), tactical patterns and a test of your level. */
export default function TrainingPage() {
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) ?? 'traps')
  const width = usePageWidth('max-w-5xl')
  const tabs: [Tab, string][] = [['traps', 'Traps'], ['patterns', 'Tactical patterns'], ['level', 'Your level']]
  return (
    <div className={`mx-auto ${width} px-4 py-6`}>
      <h1 className="text-xl font-bold text-slate-800">Training</h1>
      <div role="tablist" className="mt-3 flex gap-1 border-b border-slate-200">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`rounded-t border px-3 py-1.5 text-sm ${tab === id ? 'border-slate-200 border-b-white bg-white font-semibold' : 'border-transparent text-slate-600'}`}>{label}</button>
        ))}
      </div>
      <div role="tabpanel" className="mt-4">
        {tab === 'traps' && <TrapTrainer />}
        {tab === 'patterns' && <PuzzlePanel initialTheme={params.get('theme') ?? undefined} />}
        {tab === 'level' && <LevelTest />}
      </div>
    </div>
  )
}
