import { useEffect, useRef } from 'react'
import Editor, { loader } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import { Maximize2, Plus, X } from 'lucide-react'
import { useStore, getActiveTab } from '../store/useStore'
import { executeSQL, executeMongoQuery, executeRedisCommand, initializeDatabase, enhanceError } from '../engines/sqlEngine'

loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } })

export default function SQLEditor() {
  const store = useStore()
  const tab = getActiveTab(store)
  const { addQueryPane, removeQueryPane, setActiveQueryPane } = store
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)

  // Always points to the latest runQuery — avoids stale closure in Monaco actions
  const runQueryRef = useRef<() => void>(() => {})

  function getEffectiveQuery(): string {
    const fullQuery = tab?.query ?? ''
    const editor = editorRef.current
    if (!editor) return fullQuery
    const selection = editor.getSelection()
    if (!selection || selection.isEmpty()) return fullQuery
    return editor.getModel()?.getValueInRange(selection)?.trim() || fullQuery
  }

  function onSelectionChange() {
    if (!tab || !editorRef.current) return
    const sel = editorRef.current.getSelection()
    const text = (!sel || sel.isEmpty())
      ? ''
      : (editorRef.current.getModel()?.getValueInRange(sel)?.trim() ?? '')
    store.setTabSelectedText(tab.id, text)
  }

  async function runQuery() {
    if (!tab || store.isExecuting) return
    const queryToRun = getEffectiveQuery()
    if (!queryToRun.trim()) return

    initializeDatabase()
    store.setIsExecuting(true)
    store.setActiveResultsTab('results')
    const t0 = performance.now()
    try {
      const result = tab.engine === 'mongodb'
        ? executeMongoQuery(queryToRun)
        : tab.engine === 'redis'
          ? executeRedisCommand(queryToRun)
          : await executeSQL(
              queryToRun,
              store.simulation.networkLatency,
              store.simulation.simulateErrors,
              store.simulation.errorProbability,
              store.activeDbName,
              store.databases,
            )
      store.setTabResults(tab.id, result)

      const isSelection = queryToRun !== tab.query
      store.setTabMessages(tab.id, [
        `[${new Date().toLocaleTimeString()}] ✓ Consulta ejecutada exitosamente${isSelection ? ' (selección)' : ''}`,
        `   Filas devueltas : ${result.rowCount}`,
        `   Tiempo          : ${result.executionTime.toFixed(3)} ms`,
        `   Memoria         : ${result.memoryUsage.toFixed(2)} MB`,
        `   Motor           : ${tab.engine.toUpperCase()}`,
        `   Base de datos   : ${tab.database}`,
      ])
      const elapsed = performance.now() - t0
      const mm = Math.floor(elapsed / 60000).toString().padStart(2, '0')
      const ss = Math.floor((elapsed % 60000) / 1000).toString().padStart(2, '0')
      const ms = Math.floor(elapsed % 1000).toString().padStart(3, '0')
      store.setMetrics({
        executionTime: `00:${mm}:${ss}.${ms}`,
        rowsAffected: result.rowCount,
        warnings: result.warnings,
        memoryUsage: `${result.memoryUsage.toFixed(2)} MB`,
      })
      store.addHistory({
        id: Date.now().toString(),
        query: queryToRun,
        timestamp: new Date(),
        engine: tab.engine,
        rowCount: result.rowCount,
        executionTime: result.executionTime,
      })
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : 'Error desconocido'
      const msg = enhanceError(raw)
      store.setTabMessages(tab.id, [`[${new Date().toLocaleTimeString()}] ✗ ERROR: ${msg}`])
      store.setActiveResultsTab('messages')
    } finally {
      store.setIsExecuting(false)
    }
  }

  // Keep ref in sync every render so Monaco action always calls the latest version
  runQueryRef.current = runQuery

  // Window-level F5 / Ctrl+Enter / F11 fallback (when editor is not focused)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F5' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault()
        runQueryRef.current()
      }
      if (e.key === 'F11') {
        e.preventDefault()
        store.toggleEditorFullscreen()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const language = tab?.engine === 'mongodb' ? 'javascript'
    : tab?.engine === 'redis' ? 'plaintext'
    : 'sql'

  return (
    <div className="flex flex-col border-b border-surface-600 h-full">
      {/* Query sub-tabs bar */}
      <div className="flex items-center bg-surface-800 border-b border-surface-600 shrink-0">
        <div className="flex items-center overflow-x-auto flex-1">
          {tab?.queryPanes.map((pane, idx) => {
            const active = pane.id === tab.activeQueryPaneId
            return (
              <button
                key={pane.id}
                onClick={() => tab && setActiveQueryPane(tab.id, pane.id)}
                className={[
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-r border-surface-600',
                  'transition-colors whitespace-nowrap group shrink-0',
                  active
                    ? 'bg-surface-700 text-white border-t-2 border-t-blue-500'
                    : 'bg-surface-800 text-slate-400 hover:text-slate-200 hover:bg-surface-700',
                ].join(' ')}
              >
                <span>Consulta {idx + 1}</span>
                {tab.queryPanes.length > 1 && (
                  <span
                    role="button"
                    title="Cerrar consulta"
                    onClick={e => { e.stopPropagation(); tab && removeQueryPane(tab.id, pane.id) }}
                    className="w-3.5 h-3.5 flex items-center justify-center rounded-full
                               opacity-0 group-hover:opacity-100
                               hover:bg-surface-500 text-slate-400 hover:text-white transition-all"
                  >
                    <X size={9} />
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Right side: add pane + executing + fullscreen */}
        <div className="flex items-center gap-1 px-2 shrink-0">
          {store.isExecuting && (
            <span className="flex items-center gap-1.5 text-xs text-yellow-400 mr-1">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
              Ejecutando...
            </span>
          )}
          {tab && (
            <button
              title="Nueva consulta"
              onClick={() => addQueryPane(tab.id)}
              className="w-6 h-6 flex items-center justify-center rounded text-slate-500
                         hover:text-slate-200 hover:bg-surface-600 transition-colors"
            >
              <Plus size={14} />
            </button>
          )}
          <button
            title={store.editorFullscreen ? 'Salir de pantalla completa (F11)' : 'Pantalla completa (F11)'}
            onClick={store.toggleEditorFullscreen}
            className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${store.editorFullscreen ? 'bg-blue-600/30 text-blue-400 hover:bg-blue-600/40' : 'hover:bg-surface-600 text-slate-400 hover:text-white'}`}
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          language={language}
          theme={store.editorTheme}
          value={tab?.query ?? ''}
          onChange={value => { if (tab) store.updateQuery(tab.id, value ?? '') }}
          onMount={(editor, monaco) => {
            editorRef.current = editor

            // Sync selection to store
            editor.onDidChangeCursorSelection(onSelectionChange)

            // F5 and Ctrl+Enter execute the query
            editor.addAction({
              id: 'execute-query-f5',
              label: 'Ejecutar consulta',
              keybindings: [monaco.KeyCode.F5],
              contextMenuGroupId: 'navigation',
              contextMenuOrder: 1,
              run: () => runQueryRef.current(),
            })
            editor.addAction({
              id: 'execute-query-ctrl-enter',
              label: 'Ejecutar consulta (Ctrl+Enter)',
              keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
              contextMenuGroupId: 'navigation',
              contextMenuOrder: 2,
              run: () => runQueryRef.current(),
            })
            editor.addCommand(monaco.KeyCode.F5, () => runQueryRef.current())
          }}
          options={{
            minimap: { enabled: false },
            fontSize: store.editorFontSize,
            lineHeight: store.editorFontSize * 1.6,
            fontFamily: `'${store.editorFontFamily}', 'Fira Code', Consolas, monospace`,
            lineNumbers: store.editorLineNumbers ? 'on' : 'off',
            scrollBeyondLastLine: false,
            wordWrap: store.editorWordWrap ? 'on' : 'off',
            automaticLayout: true,
            tabSize: 2,
            padding: { top: 8, bottom: 8 },
            scrollbar: { verticalScrollbarSize: 5, horizontalScrollbarSize: 5 },
            overviewRulerBorder: false,
            overviewRulerLanes: 0,
            renderLineHighlight: 'line',
            cursorBlinking: 'smooth',
            suggestOnTriggerCharacters: true,
            quickSuggestions: true,
          }}
        />
      </div>
    </div>
  )
}
