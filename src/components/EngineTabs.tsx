import { useRef, useState, useEffect } from 'react'
import { X, Plus } from 'lucide-react'
import { useStore } from '../store/useStore'
import { ENGINE_CONFIGS } from '../types'
import type { EngineType } from '../types'

const ENGINE_ORDER: EngineType[] = ['sqlserver', 'mysql', 'postgresql', 'mongodb', 'oracle', 'sqlite', 'redis']

const ENGINE_ICONS: Record<EngineType, string> = {
  sqlserver:  '🔴',
  mysql:      '🐬',
  postgresql: '🐘',
  mongodb:    '🍃',
  oracle:     '🔶',
  sqlite:     '💎',
  redis:      '⚡',
}

export default function EngineTabs() {
  const { tabs, activeTabId, addTab, removeTab, setActiveTab } = useStore()

  // Count tabs per engine to know when to show numbers
  const engineCounts: Partial<Record<EngineType, number>> = {}
  tabs.forEach(t => { engineCounts[t.engine] = (engineCounts[t.engine] ?? 0) + 1 })

  // Assign a sequential number within each engine
  const engineSeq: Partial<Record<EngineType, number>> = {}
  const tabLabels: Record<string, string> = {}
  tabs.forEach(t => {
    engineSeq[t.engine] = (engineSeq[t.engine] ?? 0) + 1
    const name = ENGINE_CONFIGS[t.engine].name
    tabLabels[t.id] = (engineCounts[t.engine] ?? 1) > 1
      ? `${name} ${engineSeq[t.engine]}`
      : name
  })

  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  return (
    <div className="flex items-center border-b border-surface-600 bg-surface-800 shrink-0">

      {/* ── Tabs (scrollable) ─────────────────────────────────────────── */}
      <div className="flex items-center overflow-x-auto">
        {tabs.map(tab => {
          const cfg    = ENGINE_CONFIGS[tab.engine]
          const active = tab.id === activeTabId
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-r border-surface-600',
                'transition-colors whitespace-nowrap group shrink-0',
                active
                  ? 'bg-surface-700 text-white border-t-2'
                  : 'bg-surface-800 text-slate-400 hover:text-slate-200 hover:bg-surface-700',
              ].join(' ')}
              style={active ? { borderTopColor: cfg.color } : {}}
            >
              <span className="text-base leading-none">{ENGINE_ICONS[tab.engine]}</span>
              <span>{tabLabels[tab.id]}</span>
              {tabs.length > 1 && (
                <span
                  role="button"
                  title="Cerrar consulta"
                  onClick={e => { e.stopPropagation(); removeTab(tab.id) }}
                  className="ml-1 w-4 h-4 flex items-center justify-center rounded-full
                             opacity-0 group-hover:opacity-100
                             hover:bg-surface-500 text-slate-400 hover:text-white transition-all"
                >
                  <X size={10} />
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── New query button (outside overflow so dropdown is never clipped) ── */}
      <div className="relative px-2 shrink-0" ref={dropdownRef}>
        <button
          title="Nueva consulta"
          onClick={() => setOpen(v => !v)}
          className={[
            'w-7 h-7 flex items-center justify-center rounded transition-colors',
            open ? 'bg-surface-600 text-white' : 'text-slate-500 hover:text-slate-200 hover:bg-surface-600',
          ].join(' ')}
        >
          <Plus size={16} />
        </button>

        {open && (
          <div className="absolute top-full left-0 mt-1 w-56 bg-surface-700 border border-surface-500 rounded-lg shadow-xl z-30 py-1">
            <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Nueva consulta
            </div>
            {ENGINE_ORDER.map(engine => {
              const count = engineCounts[engine] ?? 0
              return (
                <button
                  key={engine}
                  onClick={() => { addTab(engine); setOpen(false) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-300
                             hover:text-white hover:bg-surface-600 transition-colors"
                >
                  <span className="text-base leading-none w-5">{ENGINE_ICONS[engine]}</span>
                  <span className="flex-1 text-left">{ENGINE_CONFIGS[engine].name}</span>
                  {count > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-600 text-slate-400">
                      {count} abierta{count > 1 ? 's' : ''}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
