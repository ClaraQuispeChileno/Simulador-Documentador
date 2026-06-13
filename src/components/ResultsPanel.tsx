import { Download, FileJson, FileSpreadsheet, Terminal, GitBranch } from 'lucide-react'
import { useStore, getActiveTab } from '../store/useStore'
import { saveAs } from 'file-saver'
import * as XLSX from 'xlsx'
import type { QueryResultSet, ExplainStep } from '../types'
import { explainQuery } from '../engines/sqlEngine'

export default function ResultsPanel() {
  const store = useStore()
  const tab = getActiveTab(store)
  const results = tab?.results
  const messages = tab?.messages ?? []

  function exportCSV() {
    if (!results) return
    const header = results.columns.join(',')
    const rows = results.rows.map(r => results.columns.map(c => {
      const v = String(r[c] ?? '')
      return v.includes(',') ? `"${v}"` : v
    }).join(','))
    saveAs(new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' }), 'resultados.csv')
  }

  function exportJSON() {
    if (!results) return
    saveAs(new Blob([JSON.stringify(results.rows, null, 2)], { type: 'application/json' }), 'resultados.json')
  }

  function exportExcel() {
    if (!results) return
    const ws = XLSX.utils.json_to_sheet(results.rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Resultados')
    XLSX.writeFile(wb, 'resultados.xlsx')
  }

  const formatValue = (v: unknown): string => {
    if (v === null || v === undefined) return 'NULL'
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2)
    return String(v)
  }

  const isNumeric = (v: unknown) => typeof v === 'number'

  const hasMultipleSets = results?.sets && results.sets.length > 1

  return (
    <div className="flex flex-col h-full bg-surface-900">
      {/* Tabs + meta */}
      <div className="flex items-center justify-between px-4 border-b border-surface-600 bg-surface-800 shrink-0">
        <div className="flex items-center">
          <button
            onClick={() => store.setActiveResultsTab('results')}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${store.activeResultsTab === 'results' ? 'border-blue-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            {hasMultipleSets ? `Resultados (${results!.sets!.length})` : 'Resultados'}
          </button>
          <button
            onClick={() => store.setActiveResultsTab('messages')}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${store.activeResultsTab === 'messages' ? 'border-blue-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            <span className="flex items-center gap-1.5"><Terminal size={11} />Mensajes</span>
          </button>
          <button
            onClick={() => store.setActiveResultsTab('explain')}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${store.activeResultsTab === 'explain' ? 'border-violet-500 text-violet-300' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            <span className="flex items-center gap-1.5"><GitBranch size={11} />Plan de Ejecución</span>
          </button>
        </div>
        {results && (
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span>Filas: <span className="text-white font-semibold">{results.rowCount}</span></span>
            <span>Tiempo de ejecución: <span className="text-white font-mono">{store.metrics.executionTime}</span></span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto results-scroll">
        {store.activeResultsTab === 'results' ? (
          results && (hasMultipleSets ? results.sets!.length > 0 : results.rows.length > 0) ? (
            hasMultipleSets ? (
              /* ── Multiple result sets ─────────────────────────────── */
              <div className="divide-y divide-surface-600">
                {results.sets!.map((set: QueryResultSet, idx: number) => (
                  <ResultSetTable key={idx} set={set} index={idx} formatValue={formatValue} isNumeric={isNumeric} />
                ))}
              </div>
            ) : (
              /* ── Single result set ────────────────────────────────── */
              <table className="results-table">
                <thead>
                  <tr>{results.columns.map(col => <th key={col}>{col}</th>)}</tr>
                </thead>
                <tbody>
                  {results.rows.map((row, i) => (
                    <tr key={i}>
                      {results.columns.map(col => (
                        <td key={col} className={isNumeric(row[col]) ? 'text-right text-blue-300' : ''}>
                          {formatValue(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-32 text-slate-500 text-sm gap-2">
              {store.isExecuting ? (
                <>
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span>Ejecutando consulta...</span>
                </>
              ) : (
                <>
                  <span className="text-2xl">📊</span>
                  <span>Ejecuta una consulta para ver los resultados</span>
                  <span className="text-xs text-slate-600">F5 para ejecutar</span>
                </>
              )}
            </div>
          )
        ) : store.activeResultsTab === 'explain' ? (
          <ExplainPanel query={tab?.query ?? ''} />
        ) : (
          <div className="p-4 font-mono text-xs space-y-1">
            {messages.length > 0 ? messages.map((m, i) => (
              <div key={i} className={`${m.includes('ERROR') || m.includes('✗') ? 'text-red-400' : m.includes('✓') || m.includes('exitosamente') ? 'text-green-400' : 'text-slate-400'}`}>
                {m}
              </div>
            )) : (
              <div className="text-slate-500">Sin mensajes</div>
            )}
          </div>
        )}
      </div>

      {/* Export bar */}
      {results && results.rows.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-t border-surface-600 bg-surface-800 shrink-0">
          <span className="text-xs text-slate-500 mr-1">Exportar resultados:</span>
          <button onClick={exportCSV} className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-surface-600 hover:bg-surface-500 text-slate-300 hover:text-white rounded border border-surface-500 transition-colors">
            <Download size={11} /> CSV
          </button>
          <button onClick={exportJSON} className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-surface-600 hover:bg-surface-500 text-slate-300 hover:text-white rounded border border-surface-500 transition-colors">
            <FileJson size={11} /> JSON
          </button>
          <button onClick={exportExcel} className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-surface-600 hover:bg-surface-500 text-slate-300 hover:text-white rounded border border-surface-500 transition-colors">
            <FileSpreadsheet size={11} /> Excel
          </button>
        </div>
      )}
    </div>
  )
}

// ── Sub-component: explain plan ───────────────────────────────────────────────

const OP_COLORS: Record<string, string> = {
  scan:       'bg-blue-900/30 border-blue-700/50 text-blue-300',
  join:       'bg-purple-900/30 border-purple-700/50 text-purple-300',
  filter:     'bg-green-900/30 border-green-700/50 text-green-300',
  aggregate:  'bg-orange-900/30 border-orange-700/50 text-orange-300',
  sort:       'bg-yellow-900/30 border-yellow-700/50 text-yellow-300',
  limit:      'bg-slate-700/40 border-slate-600 text-slate-300',
  projection: 'bg-cyan-900/30 border-cyan-700/50 text-cyan-300',
  dml:        'bg-red-900/30 border-red-700/50 text-red-300',
  info:       'bg-surface-700 border-surface-600 text-slate-400',
}

const COST_BADGE: Record<string, string> = {
  low:    'bg-green-900/40 text-green-400 border-green-800/50',
  medium: 'bg-yellow-900/40 text-yellow-400 border-yellow-800/50',
  high:   'bg-red-900/40 text-red-400 border-red-800/50',
}

const COST_LABEL = { low: 'Bajo', medium: 'Medio', high: 'Alto' }

const OP_ICONS: Partial<Record<ExplainStep['type'], string>> = {
  scan:       '📂',
  join:       '🔗',
  filter:     '🔍',
  aggregate:  '∑',
  sort:       '↕',
  limit:      '✂',
  projection: '📋',
  dml:        '✏️',
  info:       'ℹ️',
}

function ExplainPanel({ query }: { query: string }) {
  if (!query.trim()) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-slate-500 text-sm gap-2">
        <GitBranch size={22} className="opacity-40" />
        <span>Escribe una consulta y abre este panel para ver el plan de ejecución</span>
      </div>
    )
  }

  const steps = explainQuery(query)
  const totalCost = steps.reduce((a, s) => a + (s.costLevel === 'high' ? 3 : s.costLevel === 'medium' ? 2 : 1), 0)

  return (
    <div className="p-4 space-y-3">
      {/* Header summary */}
      <div className="flex items-center gap-3 pb-3 border-b border-surface-700">
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-violet-400" />
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Plan de Ejecución</span>
        </div>
        <span className="text-[10px] text-slate-500">{steps.length} paso{steps.length !== 1 ? 's' : ''}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
          totalCost > steps.length * 2 ? COST_BADGE.high : totalCost > steps.length ? COST_BADGE.medium : COST_BADGE.low
        }`}>
          Costo total: {totalCost > steps.length * 2 ? 'Alto' : totalCost > steps.length ? 'Medio' : 'Bajo'}
        </span>
        <span className="text-[10px] text-slate-600 ml-auto">Los costos son estimados para fines educativos</span>
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {steps.map((step, idx) => (
          <div key={step.id} className="flex gap-3 items-start">
            {/* Step number + connector */}
            <div className="flex flex-col items-center shrink-0">
              <div className="w-6 h-6 rounded-full bg-surface-700 border border-surface-500 flex items-center justify-center text-[10px] font-bold text-slate-400">
                {step.id}
              </div>
              {idx < steps.length - 1 && (
                <div className="w-px flex-1 bg-surface-600 mt-1 min-h-[12px]" />
              )}
            </div>

            {/* Step card */}
            <div className={`flex-1 rounded-lg border px-3 py-2.5 mb-1 ${OP_COLORS[step.type]}`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{OP_ICONS[step.type]}</span>
                  <span className="text-[11px] font-bold tracking-wide">{step.operation}</span>
                  {step.table && (
                    <span className="text-[10px] bg-black/20 px-1.5 py-0.5 rounded font-mono">{step.table}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-slate-400">~{step.estimatedRows} fila{step.estimatedRows !== 1 ? 's' : ''}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold ${COST_BADGE[step.costLevel]}`}>
                    {COST_LABEL[step.costLevel]}
                  </span>
                </div>
              </div>
              <div className="text-[10px] opacity-80 mt-1 font-mono">{step.detail}</div>
              {step.note && (
                <div className="mt-1.5 text-[10px] bg-black/20 rounded px-2 py-1 text-yellow-300/80">
                  💡 {step.note}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="pt-2 border-t border-surface-700 flex flex-wrap gap-2">
        {(['scan','join','filter','aggregate','sort','limit','projection','dml'] as const).map(t => (
          <span key={t} className={`text-[9px] px-2 py-0.5 rounded border ${OP_COLORS[t]}`}>
            {OP_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Sub-component: single result set table ────────────────────────────────────

function ResultSetTable({
  set, index, formatValue, isNumeric,
}: {
  set: QueryResultSet
  index: number
  formatValue: (v: unknown) => string
  isNumeric: (v: unknown) => boolean
}) {
  return (
    <div>
      {/* Result set header — sticky, 36px tall, above table th (z-10 > z-5) */}
      <div className="flex items-center gap-3 px-4 bg-surface-800 border-b border-surface-600 sticky top-0 z-10"
           style={{ height: 36 }}>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          #{index + 1}
        </span>
        <span className="text-xs font-semibold text-slate-200">{set.label}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-600/20 text-blue-400 border border-blue-600/30">
          {set.rows.length} {set.rows.length === 1 ? 'fila' : 'filas'}
        </span>
        <span className="text-[10px] text-slate-500">
          {set.columns.length} col{set.columns.length !== 1 ? 's' : ''}
        </span>
      </div>

      {set.rows.length > 0 ? (
        <table className="results-table">
          <thead>
            <tr>{set.columns.map(col => <th key={col}>{col}</th>)}</tr>
          </thead>
          <tbody>
            {set.rows.map((row, i) => (
              <tr key={i}>
                {set.columns.map(col => (
                  <td key={col} className={isNumeric(row[col]) ? 'text-right text-blue-300' : ''}>
                    {formatValue(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="px-4 py-3 text-xs text-slate-500 italic">Sin filas devueltas</div>
      )}
    </div>
  )
}
