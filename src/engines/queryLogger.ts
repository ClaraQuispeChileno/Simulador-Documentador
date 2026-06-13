export interface QueryLogEntry {
  id: string
  timestamp: string
  query: string
  processed?: string
  durationMs: number
  rowCount: number
  affectedRows: number
  success: boolean
  errorMessage?: string | null
  dbName?: string | null
  setsCount?: number
}

const LS_KEY = 'simulador_bds_query_logs_v1'
const MAX_ENTRIES = 1000

let logs: QueryLogEntry[] = []
let initialized = false

function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`
}

export function initQueryLogger() {
  if (initialized) return
  initialized = true
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) logs = JSON.parse(raw) as QueryLogEntry[]
  } catch {
    logs = []
  }
}

export async function logQuery(entry: Omit<QueryLogEntry, 'id' | 'timestamp'> & Partial<Pick<QueryLogEntry, 'timestamp'>>) {
  initQueryLogger()
  const now = entry.timestamp ?? new Date().toISOString()
  const e: QueryLogEntry = {
    id: genId(),
    timestamp: now,
    query: entry.query,
    processed: entry.processed ?? undefined,
    durationMs: entry.durationMs ?? 0,
    rowCount: entry.rowCount ?? 0,
    affectedRows: entry.affectedRows ?? 0,
    success: !!entry.success,
    errorMessage: entry.errorMessage ?? null,
    dbName: entry.dbName ?? null,
    setsCount: entry.setsCount ?? 0,
  }
  logs.push(e)
  if (logs.length > MAX_ENTRIES) logs = logs.slice(-MAX_ENTRIES)
  try { localStorage.setItem(LS_KEY, JSON.stringify(logs)) } catch { /* ignore */ }
  return e
}

export function getQueryLogs(): QueryLogEntry[] {
  initQueryLogger()
  return [...logs].reverse()
}

export function clearQueryLogs() {
  logs = []
  try { localStorage.removeItem(LS_KEY) } catch { /* ignore */ }
}

export default {
  initQueryLogger,
  logQuery,
  getQueryLogs,
  clearQueryLogs,
}
