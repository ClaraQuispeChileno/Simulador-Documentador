import { useState, useEffect } from 'react'
import { X, FileText, Trash2 } from 'lucide-react'
import { getQueryLogs, clearQueryLogs } from '../../engines/queryLogger'

interface Props { onClose: () => void }

export default function QueryLogsModal({ onClose }: Props) {
  const [logs, setLogs] = useState(() => getQueryLogs())

  useEffect(() => {
    setLogs(getQueryLogs())
  }, [])

  function handleClear() {
    if (!confirm('¿Borrar todos los logs de consultas?')) return
    clearQueryLogs()
    setLogs([])
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[800px] max-h-[80vh] bg-surface-800 border border-surface-500 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-600 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-700 flex items-center justify-center">
              <FileText size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Logs de consultas SQL</h2>
              <p className="text-[10px] text-slate-400">Últimas {logs.length} entradas</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {logs.length > 0 && (
              <button
                onClick={handleClear}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg border border-transparent hover:border-red-800/40 transition-all"
              >
                <Trash2 size={11} /> Borrar todo
              </button>
            )}
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-600 text-slate-400 hover:text-white transition-colors">
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-3">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-slate-500">
              <FileText size={28} className="mb-3 opacity-30" />
              <p className="text-sm">No hay logs de consultas</p>
              <p className="text-xs mt-1 opacity-60">Ejecuta consultas para que aparezcan aquí</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map(l => (
                <div key={l.id} className="bg-surface-700 rounded-lg border border-surface-600 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-400">{new Date(l.timestamp).toLocaleString()}</span>
                        <span className="text-[11px] text-slate-400">•</span>
                        <span className="text-[11px] text-slate-300 font-mono">{l.dbName ?? '—'}</span>
                        <span className="ml-2 text-[11px] text-slate-400">{l.durationMs} ms</span>
                        <span className="ml-2 text-[11px] text-slate-400">{l.rowCount} filas</span>
                        {l.success ? (
                          <span className="ml-2 text-[11px] text-emerald-300">OK</span>
                        ) : (
                          <span className="ml-2 text-[11px] text-red-400">ERROR</span>
                        )}
                      </div>
                      <pre className="mt-2 text-[12px] text-slate-200 font-mono whitespace-pre-wrap break-all leading-relaxed">{l.query}</pre>
                      {l.errorMessage && <div className="mt-2 text-xs text-red-400">{l.errorMessage}</div>}
                    </div>
                    <div className="shrink-0 text-right text-[11px] text-slate-400">
                      <div>{l.affectedRows} afectadas</div>
                      <div className="mt-2">sets: {l.setsCount ?? 0}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
