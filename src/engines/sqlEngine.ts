/* eslint-disable @typescript-eslint/no-explicit-any */
import alasql from 'alasql'
import type { QueryResult } from '../types'
import { idbSaveTables, idbLoadTables, idbClearTables, idbSaveSchema, type SchemaEntry } from '../db/idbStorage'
import { initQueryLogger, logQuery } from './queryLogger'

// ─── Init ────────────────────────────────────────────────────────────────────

let initialized = false
let initPromise: Promise<void> | null = null

const DB_REGISTRY_KEY = 'simulador_bds_databases'

export function initializeDatabase(): Promise<void> {
  if (initPromise) return initPromise
  initPromise = _init()
  return initPromise
}

async function _init() {
  if (initialized) return
  initialized = true

  const registry = localStorage.getItem(DB_REGISTRY_KEY)
  const hasRegisteredDbs = registry && JSON.parse(registry).length > 0
  if (!hasRegisteredDbs) {
    await idbClearTables()
    return
  }

  await loadPersistedTables()
}

function _createTable(name: string, data: object[]) {
  try { alasql(`DROP TABLE IF EXISTS \`${name}\``) } catch (_) { /* ignore */ }
  alasql(`CREATE TABLE \`${name}\``)
  ;(alasql as any).tables[name].data = data.map(r => ({ ...r }))
}

// ─── Persistence (IndexedDB) ─────────────────────────────────────────────────

export function persistTables() {
  const snapshot = getAllTableInfos().map(t => ({
    name: t.name,
    data: (alasql as any).tables[t.name]?.data ?? [],
  }))
  idbSaveTables(snapshot).catch(() => { /* ignore */ })
}

async function loadPersistedTables() {
  try {
    const tables = await idbLoadTables()
    for (const t of tables) _createTable(t.name, t.data)
  } catch (_) { /* ignore */ }
}

export async function clearAllTables() {
  for (const t of getAllTableInfos()) {
    try { alasql(`DROP TABLE IF EXISTS \`${t.name}\``) } catch (_) { /* ignore */ }
  }
  await idbClearTables()
}

export function dropDatabaseTables(tableNames: string[]) {
  for (const name of tableNames) {
    try { alasql(`DROP TABLE IF EXISTS \`${name}\``) } catch { /* ignore */ }
  }
  persistTables()
}

// ─── Introspection ───────────────────────────────────────────────────────────

export interface TableInfo {
  name: string
  rowCount: number
  columns: string[]
}

export function getAllTableInfos(): TableInfo[] {
  const tables = (alasql as any).tables as Record<string, { data?: unknown[] }>
  return Object.keys(tables).map(name => {
    const data = tables[name]?.data ?? []
    const columns = data.length > 0 ? Object.keys(data[0] as object) : []
    return { name, rowCount: data.length, columns }
  })
}

export function getTablePreview(name: string, limit = 200): QueryResult {
  try {
    const allData = ((alasql as any).tables[name]?.data ?? []) as Record<string, unknown>[]
    const rows = allData.slice(0, limit)
    const columns = rows.length > 0 ? Object.keys(rows[0]) : []
    return { columns, rows, rowCount: allData.length, executionTime: 1, memoryUsage: 0.1, warnings: 0 }
  } catch {
    return { columns: [], rows: [], rowCount: 0, executionTime: 0, memoryUsage: 0, warnings: 0 }
  }
}

export function dropTable(name: string) {
  try { alasql(`DROP TABLE IF EXISTS \`${name}\``) } catch (_) { /* ignore */ }
  persistTables()
}

// ─── SQL Server preprocessor ─────────────────────────────────────────────────

export interface PreprocessResult {
  processed: string
  dbName: string | null
  skipped: string[]
}

export function preprocessSQL(sql: string): PreprocessResult {
  // Extract DB name from USE statement before removing it
  const useMatch = sql.match(/^\s*USE\s+\[?(\w+)\]?\s*;?\s*$/im)
  const dbName = useMatch ? useMatch[1] : null
  const skipped: string[] = []

  let s = sql

  // ── Step 1: Remove block comments /* ... */
  s = s.replace(/\/\*[\s\S]*?\*\//g, '')

  // ── Step 2: Remove standalone line comments that are just metadata
  // (keep user comments for readability)

  // ── Step 3: Remove GO (SQL Server batch separator)
  s = s.replace(/^\s*GO\s*;?\s*$/gim, '')

  // ── Step 4: Remove CREATE DATABASE
  s = s.replace(/^\s*CREATE\s+DATABASE\s+.*$/gim, () => { skipped.push('CREATE DATABASE'); return '' })

  // ── Step 5: Remove USE [database]
  s = s.replace(/^\s*USE\s+\S+\s*;?\s*$/gim, '')

  // ── Step 6: Remove SET statements (SQL Server specific)
  s = s.replace(/^\s*SET\s+(?:NOCOUNT|ANSI_NULLS|QUOTED_IDENTIFIER|IDENTITY_INSERT|XACT_ABORT|DATEFIRST|DATEFORMAT|LANGUAGE|TRANSACTION\s+ISOLATION\s+LEVEL)\s+.*$/gim, '')

  // ── Step 7: Remove PRINT statements
  s = s.replace(/^\s*PRINT\s+.*$/gim, '')

  // ── Step 8: Remove IF OBJECT_ID / IF EXISTS DROP TABLE patterns
  s = s.replace(/^\s*IF\s+OBJECT_ID\s*\(.*?\)\s*(?:IS\s+NOT\s+NULL\s*\r?\n)?\s*(?:BEGIN\s*)?\r?\n?\s*DROP\s+TABLE\s+\S+\s*;?\s*(?:END\s*;?)?\s*$/gim, '')
  s = s.replace(/^\s*IF\s+EXISTS\s*\(SELECT.*?\)\s*DROP\s+TABLE\s+\S+\s*;?\s*$/gim, '')
  s = s.replace(/^\s*DROP\s+TABLE\s+IF\s+EXISTS\s+\S+\s*;?\s*$/gim, '')

  // ── Step 9: Remove schema prefixes (dbo., schema., etc.)
  s = s.replace(/\b\w+\.\[?(\w+)\]?(?=\s*\(|\s+VALUES|\s+SET\b|\s+WHERE\b|\s*;)/gi, '$1')
  s = s.replace(/\bdbo\./gi, '')

  // ── Step 10: Remove square brackets around identifiers
  s = s.replace(/\[([^\]]+)\]/g, '$1')

  // ── Step 11: Replace SQL Server types → alasql-compatible
  s = s.replace(/\bNVARCHAR\b/gi, 'VARCHAR')
  s = s.replace(/\bNCHAR\b/gi, 'CHAR')
  s = s.replace(/\bNTEXT\b/gi, 'TEXT')
  s = s.replace(/\bDATETIMEOFFSET(?:\s*\(\d+\))?\b/gi, 'VARCHAR')
  s = s.replace(/\bSMALLDATETIME\b/gi, 'DATETIME')
  s = s.replace(/\bTINYINT\b/gi, 'INT')
  s = s.replace(/\bSMALLINT\b/gi, 'INT')
  s = s.replace(/\bBIGINT\b/gi, 'INT')
  s = s.replace(/\bMONEY\b/gi, 'DECIMAL')
  s = s.replace(/\bSMALLMONEY\b/gi, 'DECIMAL')
  s = s.replace(/\bBIT\b/gi, 'INT')
  s = s.replace(/\bIMAGE\b/gi, 'TEXT')
  s = s.replace(/\bVARBINARY\s*\([^)]*\)/gi, 'TEXT')
  s = s.replace(/\bBINARY\s*\(\d+\)/gi, 'TEXT')
  s = s.replace(/\bUNIQUEIDENTIFIER\b/gi, 'VARCHAR')
  s = s.replace(/\bXML\b/gi, 'TEXT')

  // ── Step 12: Replace IDENTITY(n,n) → AUTOINCREMENT and fix order for alasql
  // alasql requires: INT AUTOINCREMENT PRIMARY KEY (not INT PRIMARY KEY AUTOINCREMENT)
  s = s.replace(/\b(INT|BIGINT|SMALLINT|TINYINT)\s+PRIMARY\s+KEY\s+IDENTITY\s*\(\s*\d+\s*,\s*\d+\s*\)/gi, '$1 AUTOINCREMENT PRIMARY KEY')
  s = s.replace(/\s+IDENTITY\s*\(\s*\d+\s*,\s*\d+\s*\)/gi, ' AUTOINCREMENT')

  // ── Step 13: Remove NOT NULL / NULL keywords in column definitions
  s = s.replace(/\s+NOT\s+NULL\b/gi, '')
  // Only remove NULL if it follows a type definition (not in WHERE NULL checks)
  s = s.replace(/(\bVARCHAR\s*\([^)]*\)|\bINT\b|\bDECIMAL\b|\bTEXT\b|\bDATE\b|\bDATETIME\b)\s+NULL\b/gi, '$1')

  // ── Step 14: Remove DEFAULT constraints
  s = s.replace(/\s+DEFAULT\s+(?:N?'[^']*'|\d+(?:\.\d+)?|\(\s*\d+\s*\)|\w+(?:\(\))?)/gi, '')

  // ── Step 15: Remove inline CHECK constraints
  s = s.replace(/\s+CHECK\s*\([^)]*\)/gi, '')

  // ── Step 16: Remove inline REFERENCES (foreign key)
  s = s.replace(/\s+REFERENCES\s+\w+\s*\([^)]*\)(?:\s+ON\s+(?:DELETE|UPDATE)\s+(?:CASCADE|SET\s+NULL|SET\s+DEFAULT|NO\s+ACTION|RESTRICT))?/gi, '')

  // ── Step 17: Remove inline UNIQUE
  s = s.replace(/\b(\w+)\s+(\w+(?:\s*\([^)]*\))?)\s+UNIQUE\b/gi, '$1 $2')

  // ── Step 18: Remove table-level CONSTRAINT definitions (entire line/block)
  // CONSTRAINT FK_xxx FOREIGN KEY (col) REFERENCES table(col)
  s = s.replace(/,\s*\r?\n?\s*CONSTRAINT\s+\w+\s+(?:PRIMARY\s+KEY|UNIQUE|CHECK|FOREIGN\s+KEY)[\s\S]*?(?=,\s*\r?\n|\r?\n\s*\))/gi, '')
  s = s.replace(/,\s*CONSTRAINT\s+\w+\s+[\s\S]*?(?=\))/gi, '')

  // ── Step 19: Remove standalone FOREIGN KEY table constraints
  s = s.replace(/,\s*\r?\n?\s*FOREIGN\s+KEY\s*\([^)]+\)(?:\s*REFERENCES[^,\n)]*)?/gi, '')

  // ── Step 20: Remove table-level PRIMARY KEY (keep column-level)
  // Only remove when it's a standalone table constraint line: PRIMARY KEY (col1, col2)
  s = s.replace(/,\s*\r?\n?\s*PRIMARY\s+KEY\s*\([^)]*\)/gi, '')

  // ── Step 21: Remove WITH (...) options on CREATE TABLE
  s = s.replace(/\bWITH\s*\([^)]*\)\s*(?=;|$)/gi, '')

  // ── Step 22: Remove ON [PRIMARY] / ON FILEGROUP
  s = s.replace(/\s+ON\s+\w+\s*(?:;|$)/gim, ';')

  // ── Step 23: Remove CREATE INDEX statements entirely
  s = s.replace(/^\s*CREATE\s+(?:UNIQUE\s+)?(?:CLUSTERED\s+)?(?:NONCLUSTERED\s+)?INDEX\s+\w+\s+ON[\s\S]*?;/gim, '')

  // ── Step 24: Remove ALTER TABLE statements (foreign keys, constraints)
  s = s.replace(/^\s*ALTER\s+TABLE[\s\S]*?;/gim, '')

  // ── Step 25: Remove EXEC / EXECUTE statements
  s = s.replace(/^\s*(?:EXEC|EXECUTE)\s+.*$/gim, '')

  // ── Step 26: Clean trailing commas before closing paren
  s = s.replace(/,(\s*\r?\n\s*\))/g, '$1')

  // ── Step 27: Fix N'string' → 'string' (Unicode string literals)
  s = s.replace(/\bN'([^']*)'/g, "'$1'")

  // ── Step 28: Remove CLUSTERED / NONCLUSTERED keywords
  s = s.replace(/\b(?:CLUSTERED|NONCLUSTERED)\b\s*/gi, '')

  // ── Step 29: Clean multiple blank lines
  s = s.replace(/\n{3,}/g, '\n\n').trim()

  return { processed: s, dbName, skipped: [...new Set(skipped)] }
}

// ─── Import helpers ───────────────────────────────────────────────────────────

export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const parseRow = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"' && !inQuotes) { inQuotes = true; continue }
      if (ch === '"' && inQuotes && line[i + 1] === '"') { current += '"'; i++; continue }
      if (ch === '"' && inQuotes) { inQuotes = false; continue }
      if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue }
      current += ch
    }
    result.push(current.trim())
    return result
  }
  const headers = parseRow(lines[0])
  return lines.slice(1).map(line => {
    const values = parseRow(line)
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']))
  })
}

function autoCast(obj: Record<string, string>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => {
      if (v === '' || v === 'NULL' || v === 'null') return [k, null]
      if (v === 'true') return [k, true]
      if (v === 'false') return [k, false]
      const n = Number(v)
      if (!isNaN(n) && v !== '') return [k, n]
      return [k, v]
    })
  )
}

export function importTableFromCSV(name: string, csvText: string) {
  const rows = parseCSV(csvText).map(autoCast)
  if (rows.length === 0) throw new Error('CSV vacío o sin datos válidos')
  _createTable(name, rows)
  persistTables()
}

export function importTableFromJSON(name: string, jsonText: string) {
  let parsed: unknown
  try { parsed = JSON.parse(jsonText) } catch { throw new Error('JSON inválido') }
  const rows = Array.isArray(parsed) ? parsed
    : (typeof parsed === 'object' && parsed !== null) ? [parsed] : null
  if (!rows) throw new Error('El JSON debe ser un array de objetos o un objeto')
  _createTable(name, rows as object[])
  persistTables()
}

export interface SQLImportResult {
  tablesCreated: string[]    // tables that didn't exist before
  tablesReferenced: string[] // all tables mentioned in CREATE TABLE (including pre-existing)
  rowsInserted: number
  errors: { statement: string; message: string }[]
  dbName: string | null
  warnings: string[]
}

// ─── SQL Import helpers (JS-native parsers, bypass alasql DML limitations) ───

interface ColumnDef { name: string; isIdentity: boolean }

function splitTopCommas(s: string): string[] {
  const parts: string[] = []; let cur = '', depth = 0, inStr = false, sc = ''
  for (const ch of s) {
    if (inStr) { cur += ch; if (ch === sc) inStr = false }
    else if (ch === "'" || ch === '"') { inStr = true; sc = ch; cur += ch }
    else if (ch === '(') { depth++; cur += ch }
    else if (ch === ')') { depth--; cur += ch }
    else if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = '' }
    else cur += ch
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

function parseCreateTableStmt(sql: string): { name: string; columns: ColumnDef[] } | null {
  const m = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?\s*\(([\s\S]+)\)\s*$/i)
  if (!m) return null
  const columns: ColumnDef[] = []
  for (const line of splitTopCommas(m[2])) {
    const t = line.trim()
    if (/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i.test(t)) continue
    const cm = t.match(/^`?(\w+)`?/)
    if (cm) columns.push({ name: cm[1], isIdentity: /\b(AUTOINCREMENT|IDENTITY|AUTO_INCREMENT)\b/i.test(t) })
  }
  return { name: m[1], columns }
}

function extractRows(valStr: string, cols: string[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = []
  let i = 0; const s = valStr.trim()
  while (i < s.length) {
    while (i < s.length && (s[i] === ',' || /\s/.test(s[i]))) i++
    if (i >= s.length || s[i] !== '(') { if (i < s.length) i++; continue }
    i++ // skip '('
    const vals: unknown[] = []
    while (i < s.length && s[i] !== ')') {
      while (i < s.length && /[ \t]/.test(s[i])) i++
      if (s[i] === ')') break
      if (s[i] === "'") {
        i++; let str = ''
        while (i < s.length) {
          if (s[i] === "'" && s[i + 1] === "'") { str += "'"; i += 2 }
          else if (s[i] === "'") { i++; break }
          else str += s[i++]
        }
        vals.push(str)
      } else if (/^NULL\b/i.test(s.slice(i))) {
        vals.push(null); i += 4
      } else {
        let lit = ''
        while (i < s.length && s[i] !== ',' && s[i] !== ')') lit += s[i++]
        lit = lit.trim()
        const n = Number(lit)
        vals.push(lit !== '' && !isNaN(n) ? n : lit || null)
      }
      while (i < s.length && /[ \t]/.test(s[i])) i++
      if (i < s.length && s[i] === ',') i++
    }
    if (i < s.length && s[i] === ')') i++
    const row: Record<string, unknown> = {}
    cols.forEach((c, j) => { row[c] = vals[j] ?? null })
    rows.push(row)
  }
  return rows
}

function parseInsertStmt(
  sql: string,
  tableColDefs: Record<string, ColumnDef[]>,
): { tableName: string; cols: string[]; rows: Record<string, unknown>[] } | null {
  const withCols = sql.match(/^INSERT\s+INTO\s+`?(\w+)`?\s*\(([^)]+)\)\s+VALUES\s+([\s\S]+)$/i)
  if (withCols) {
    const cols = withCols[2].split(',').map(c => c.trim().replace(/`/g, ''))
    return { tableName: withCols[1], cols, rows: extractRows(withCols[3], cols) }
  }
  const noCols = sql.match(/^INSERT\s+INTO\s+`?(\w+)`?\s+VALUES\s+([\s\S]+)$/i)
  if (noCols) {
    const cols = (tableColDefs[noCols[1]] ?? []).map(c => c.name)
    return { tableName: noCols[1], cols, rows: extractRows(noCols[2], cols) }
  }
  return null
}

// ─── Extract original CREATE TABLE blocks from raw SQL ───────────────────────

// Reuses splitSQLStatements on a lightly preprocessed copy to reliably capture
// original CREATE TABLE blocks (original types, IDENTITY, FOREIGN KEY intact).
function extractRawCreateStatements(rawSQL: string): Record<string, string> {
  const result: Record<string, string> = {}
  // Only strip block comments and GO — keep everything else (types, IDENTITY, etc.)
  const s = rawSQL
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*GO\s*$/gim, '')

  for (const stmt of splitSQLStatements(s)) {
    // Find the first non-comment line to detect statement type
    const firstCode = stmt.split('\n')
      .find(l => l.trim() && !l.trim().startsWith('--'))?.trim() ?? ''
    const m = firstCode.match(/^CREATE\s+TABLE\s+\[?(\w+)\]?/i)
    if (m) result[m[1]] = stmt.trim()
  }
  return result
}

export function importTableFromSQL(sql: string): SQLImportResult {
  const { processed, dbName, skipped } = preprocessSQL(sql)

  // Capture original DDL before preprocessing changes column types
  const rawCreateStatements = extractRawCreateStatements(sql)

  const tablesReferenced = [...processed.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?/gi)]
    .map(m => m[1])
    .filter((v, i, a) => a.indexOf(v) === i)

  // Drop existing tables so re-import is always clean
  for (const name of tablesReferenced) {
    try { alasql(`DROP TABLE IF EXISTS \`${name}\``) } catch { /* ignore */ }
  }

  const tablesBefore = new Set(getAllTableInfos().map(t => t.name))
  const tablesCreated: string[] = []
  const tableColDefs: Record<string, ColumnDef[]> = {}
  const autoIncrCounters: Record<string, number> = {}
  let rowsInserted = 0
  const errors: { statement: string; message: string }[] = []

  for (const stmt of splitSQLStatements(processed)) {
    const clean = stmt.trim()
    if (!clean) continue

    // Strip leading line comments (-- ...) before detecting the statement type
    // Comments grouped with a statement (e.g. "-- Tabla: X\nCREATE TABLE X") would
    // otherwise cause the startsWith('--') guard to skip the entire statement.
    const exec = clean.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').trim()
    if (!exec) continue

    // ── CREATE TABLE: parse schema, create empty table in alasql
    if (/^CREATE\s+TABLE/i.test(exec)) {
      const parsed = parseCreateTableStmt(exec)
      if (!parsed) continue
      tableColDefs[parsed.name] = parsed.columns
      autoIncrCounters[parsed.name] = 0
      try {
        alasql(`CREATE TABLE \`${parsed.name}\``)
        if (!tablesBefore.has(parsed.name) && !tablesCreated.includes(parsed.name)) {
          tablesCreated.push(parsed.name)
          tablesBefore.add(parsed.name)
        }
      } catch { /* ignore */ }
      continue
    }

    // ── INSERT INTO: parse in JS and inject directly — no alasql DML limitations
    if (/^INSERT\s+INTO/i.test(exec)) {
      try {
        const parsed = parseInsertStmt(exec, tableColDefs)
        if (!parsed) continue
        const { tableName, cols, rows } = parsed
        const identityCol = (tableColDefs[tableName] ?? []).find(
          c => c.isIdentity && !cols.includes(c.name)
        )
        const tbl = (alasql as any).tables[tableName]
        if (!tbl) { errors.push({ statement: clean.substring(0, 80), message: `Tabla '${tableName}' no existe` }); continue }
        tbl.data = tbl.data ?? []
        for (const row of rows) {
          if (identityCol) {
            autoIncrCounters[tableName] = (autoIncrCounters[tableName] ?? 0) + 1
            row[identityCol.name] = autoIncrCounters[tableName]
          }
          tbl.data.push(row)
          rowsInserted++
        }
      } catch (e: any) {
        errors.push({ statement: clean.substring(0, 80) + '...', message: e?.message ?? String(e) })
      }
      continue
    }

    // ── Everything else (CREATE INDEX, ALTER TABLE, etc.) → skip silently
  }

  persistTables()

  // Save schema metadata for high-fidelity export
  if (tablesReferenced.length > 0) {
    const schema: SchemaEntry = {
      dbName: dbName ?? 'MyDatabase',
      tableOrder: tablesReferenced,
      createStatements: rawCreateStatements,
      identityCols: Object.fromEntries(
        Object.entries(tableColDefs).map(([name, cols]) => [
          name, cols.find(c => c.isIdentity)?.name ?? null,
        ])
      ),
      insertCols: Object.fromEntries(
        Object.entries(tableColDefs).map(([name, cols]) => [
          name, cols.filter(c => !c.isIdentity).map(c => c.name),
        ])
      ),
    }
    idbSaveSchema(schema).catch(() => { /* ignore */ })
  }

  return { tablesCreated, tablesReferenced, rowsInserted, errors, dbName, warnings: skipped }
}

/** Split SQL into individual statements, respecting parentheses and string literals */
function splitSQLStatements(sql: string): string[] {
  const stmts: string[] = []
  let current = ''
  let depth = 0
  let inString = false
  let stringChar = ''

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    if (inString) {
      current += ch
      if (ch === stringChar && sql[i + 1] !== stringChar) inString = false
      else if (ch === stringChar) { current += sql[++i]; } // escaped quote
      continue
    }
    if (ch === "'" || ch === '"') { inString = true; stringChar = ch; current += ch; continue }
    if (ch === '(') { depth++; current += ch; continue }
    if (ch === ')') { depth--; current += ch; continue }
    if (ch === ';' && depth === 0) {
      const s = current.trim()
      if (s) stmts.push(s)
      current = ''
      continue
    }
    current += ch
  }
  const last = current.trim()
  if (last) stmts.push(last)
  return stmts
}

// ─── DB scope validation ──────────────────────────────────────────────────────

function extractDMLTables(sql: string): string[] {
  const tables = new Set<string>()
  const patterns = [
    /\bFROM\s+`?(\w+)`?/gi,
    /\bJOIN\s+`?(\w+)`?/gi,
    /\bUPDATE\s+`?(\w+)`?\s+SET\b/gi,
    /\bINSERT\s+INTO\s+`?(\w+)`?/gi,
    /\bDELETE\s+FROM\s+`?(\w+)`?/gi,
  ]
  for (const p of patterns)
    for (const m of sql.matchAll(p)) tables.add(m[1])
  return [...tables]
}

function assertDbScope(
  processed: string,
  activeDbName: string,
  databases: { name: string; tables: string[] }[],
) {
  if (!activeDbName || databases.length === 0) return
  // DDL-only queries don't cross DB boundaries
  if (/^\s*(CREATE|DROP|ALTER)\s/i.test(processed)) return

  const activeTables = new Set(
    (databases.find(d => d.name === activeDbName)?.tables ?? []).map(t => t.toLowerCase())
  )
  const otherOwner = new Map<string, string>()
  for (const db of databases) {
    if (db.name === activeDbName) continue
    for (const t of db.tables) {
      if (!activeTables.has(t.toLowerCase())) otherOwner.set(t.toLowerCase(), db.name)
    }
  }

  for (const t of extractDMLTables(processed)) {
    const owner = otherOwner.get(t.toLowerCase())
    if (owner) throw new Error(
      `La tabla "${t}" pertenece a "${owner}", no a "${activeDbName}".\n` +
      `Selecciona "${owner}" como base de datos activa para consultarla.`
    )
  }
}

// ─── Query Explain Plan ───────────────────────────────────────────────────────

import type { ExplainStep } from '../types'

function fromTables(sql: string): string[] {
  const found: string[] = []
  // FROM t1, t2
  const fromClause = sql.match(/\bFROM\s+([\w`\[\], ]+?)(?:\s+(?:WHERE|JOIN|GROUP|ORDER|HAVING|LIMIT|ON)\b|$)/i)
  if (fromClause) {
    fromClause[1].split(',').forEach(t => {
      const name = t.trim().replace(/`|\[|\]/g, '').split(/\s+/)[0]
      if (name && /^\w+$/.test(name)) found.push(name)
    })
  }
  // JOINs
  for (const m of sql.matchAll(/\bJOIN\s+`?(\w+)`?/gi)) found.push(m[1])
  return [...new Set(found)]
}

function extractWhere(sql: string): string {
  const m = sql.match(/\bWHERE\s+([\s\S]+?)(?:\s+(?:GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|$))/i)
  return m ? m[1].trim().replace(/\s+/g, ' ').slice(0, 80) : ''
}

function extractGroupBy(sql: string): string {
  const m = sql.match(/\bGROUP\s+BY\s+([\s\S]+?)(?:\s+(?:HAVING|ORDER\s+BY|LIMIT|$))/i)
  return m ? m[1].trim().replace(/\s+/g, ' ').slice(0, 60) : ''
}

function extractOrderBy(sql: string): string {
  const m = sql.match(/\bORDER\s+BY\s+([\s\S]+?)(?:\s+(?:LIMIT|FETCH|$))/i)
  return m ? m[1].trim().replace(/\s+/g, ' ').slice(0, 60) : ''
}

function extractSelect(sql: string): string {
  const m = sql.match(/^\s*SELECT\s+([\s\S]+?)\s+FROM\b/i)
  if (!m) return '*'
  const cols = m[1].trim().replace(/\s+/g, ' ')
  return cols === '*' ? '*' : cols.slice(0, 70) + (cols.length > 70 ? '…' : '')
}

export function explainQuery(sql: string): ExplainStep[] {
  const { processed } = preprocessSQL(sql.trim())
  const q = processed.trim()
  const upper = q.toUpperCase()
  const steps: ExplainStep[] = []
  let id = 1

  const isSelect = /^\s*SELECT\b/i.test(q)
  const isInsert = /^\s*INSERT\b/i.test(q)
  const isUpdate = /^\s*UPDATE\b/i.test(q)
  const isDelete = /^\s*DELETE\b/i.test(q)
  const isCreate = /^\s*CREATE\b/i.test(q)
  const isDrop   = /^\s*DROP\b/i.test(q)

  if (isCreate || isDrop) {
    steps.push({ id: id++, type: 'dml', operation: isCreate ? 'CREATE' : 'DROP', detail: q.slice(0, 80), estimatedRows: 0, costLevel: 'low' })
    return steps
  }

  const allTables = getAllTableInfos()
  const tableMap = new Map(allTables.map(t => [t.name.toLowerCase(), t]))

  if (isSelect) {
    const tables = fromTables(q)
    const hasJoin   = /\bJOIN\b/i.test(q)
    const hasWhere  = /\bWHERE\b/i.test(q)
    const hasGroup  = /\bGROUP\s+BY\b/i.test(q)
    const hasHaving = /\bHAVING\b/i.test(q)
    const hasOrder  = /\bORDER\s+BY\b/i.test(q)
    const hasLimit  = /\bLIMIT\b/i.test(q) || /\bTOP\s+\d+\b/i.test(q)
    const hasAgg    = /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(q)
    const hasSub    = /\(\s*SELECT\b/i.test(q)

    // Table scans
    let lastRows = 0
    for (const tname of tables) {
      const info = tableMap.get(tname.toLowerCase())
      const rows = info?.rowCount ?? 0
      lastRows = Math.max(lastRows, rows)
      steps.push({
        id: id++, type: 'scan', operation: 'SEQ SCAN',
        table: tname,
        detail: info ? `${info.rowCount} filas, ${info.columns.length} columnas` : 'tabla no encontrada en memoria',
        estimatedRows: rows,
        costLevel: rows > 1000 ? 'high' : rows > 100 ? 'medium' : 'low',
        note: rows === 0 ? 'La tabla está vacía o no tiene datos cargados' : undefined,
      })
    }

    // Subquery note
    if (hasSub) {
      steps.push({ id: id++, type: 'scan', operation: 'SUBQUERY', detail: 'Consulta anidada detectada — se ejecuta antes que la consulta externa', estimatedRows: 0, costLevel: 'medium' })
    }

    // JOIN
    if (hasJoin) {
      const joinMatches = [...q.matchAll(/\b(INNER|LEFT|RIGHT|FULL|CROSS)?\s*JOIN\s+`?(\w+)`?\s+(?:\w+\s+)?ON\s+([\w\s=.]+?)(?:\s+(?:WHERE|JOIN|GROUP|ORDER|HAVING|LIMIT|\(|$))/gi)]
      if (joinMatches.length > 0) {
        for (const m of joinMatches) {
          const jtype = (m[1] ?? 'INNER').toUpperCase()
          const jtable = m[2]
          const cond = (m[3] ?? '').trim().slice(0, 60)
          steps.push({
            id: id++, type: 'join', operation: `${jtype} JOIN`,
            table: jtable, detail: `ON ${cond}`,
            estimatedRows: Math.max(1, Math.floor(lastRows * 0.7)),
            costLevel: lastRows > 500 ? 'high' : 'medium',
          })
        }
      } else {
        steps.push({ id: id++, type: 'join', operation: 'JOIN', detail: 'Combinación de tablas', estimatedRows: Math.max(1, Math.floor(lastRows * 0.7)), costLevel: 'medium' })
      }
      lastRows = Math.max(1, Math.floor(lastRows * 0.7))
    }

    // WHERE filter
    if (hasWhere) {
      const cond = extractWhere(q)
      const filtered = Math.max(1, Math.floor(lastRows * 0.4))
      steps.push({
        id: id++, type: 'filter', operation: 'FILTER',
        detail: cond ? `WHERE ${cond}` : 'Filtrado por condición WHERE',
        estimatedRows: filtered, costLevel: 'low',
        note: 'Sin índices — se evalúa cada fila. Considera filtrar por columnas con pocos valores distintos.',
      })
      lastRows = filtered
    }

    // GROUP BY + aggregation
    if (hasGroup || hasAgg) {
      const gb = extractGroupBy(q)
      steps.push({
        id: id++, type: 'aggregate', operation: 'HASH AGGREGATE',
        detail: gb ? `GROUP BY ${gb}` : 'Agregación de filas',
        estimatedRows: Math.max(1, Math.floor(lastRows * 0.3)),
        costLevel: lastRows > 500 ? 'high' : 'medium',
        note: 'Las funciones de agregado (COUNT, SUM, AVG…) se calculan en este paso.',
      })
      lastRows = Math.max(1, Math.floor(lastRows * 0.3))
    }

    // HAVING
    if (hasHaving) {
      steps.push({ id: id++, type: 'filter', operation: 'FILTER (HAVING)', detail: 'Filtro aplicado sobre grupos', estimatedRows: Math.max(1, Math.floor(lastRows * 0.6)), costLevel: 'low' })
      lastRows = Math.max(1, Math.floor(lastRows * 0.6))
    }

    // ORDER BY
    if (hasOrder) {
      const ob = extractOrderBy(q)
      steps.push({
        id: id++, type: 'sort', operation: 'SORT',
        detail: ob ? `ORDER BY ${ob}` : 'Ordenar resultado',
        estimatedRows: lastRows,
        costLevel: lastRows > 200 ? 'high' : lastRows > 50 ? 'medium' : 'low',
        note: 'La ordenación requiere cargar todas las filas antes de devolver la primera.',
      })
    }

    // LIMIT / TOP
    if (hasLimit) {
      const lm = q.match(/\bLIMIT\s+(\d+)/i) ?? q.match(/\bTOP\s+(\d+)/i)
      const n = lm ? parseInt(lm[1]) : lastRows
      steps.push({ id: id++, type: 'limit', operation: 'LIMIT', detail: `Retornar máximo ${n} fila${n !== 1 ? 's' : ''}`, estimatedRows: Math.min(n, lastRows), costLevel: 'low' })
      lastRows = Math.min(n, lastRows)
    }

    // Projection
    const cols = extractSelect(q)
    steps.push({ id: id++, type: 'projection', operation: 'PROJECTION', detail: `SELECT ${cols}`, estimatedRows: lastRows, costLevel: 'low' })

  } else if (isInsert) {
    const tbl = q.match(/\bINTO\s+`?(\w+)`?/i)?.[1] ?? ''
    const info = tableMap.get(tbl.toLowerCase())
    steps.push({ id: id++, type: 'scan', operation: 'TABLE ACCESS', table: tbl, detail: info ? `${info.rowCount} filas actualmente` : 'tabla de destino', estimatedRows: info?.rowCount ?? 0, costLevel: 'low' })
    steps.push({ id: id++, type: 'dml', operation: 'INSERT', table: tbl, detail: 'Inserción de nueva(s) fila(s)', estimatedRows: 1, costLevel: 'low' })

  } else if (isUpdate) {
    const tbl = q.match(/\bUPDATE\s+`?(\w+)`?/i)?.[1] ?? ''
    const info = tableMap.get(tbl.toLowerCase())
    const hasWhere = /\bWHERE\b/i.test(q)
    steps.push({ id: id++, type: 'scan', operation: 'SEQ SCAN', table: tbl, detail: info ? `${info.rowCount} filas` : 'tabla no encontrada', estimatedRows: info?.rowCount ?? 0, costLevel: info && info.rowCount > 100 ? 'medium' : 'low' })
    if (hasWhere) {
      const cond = extractWhere(q)
      steps.push({ id: id++, type: 'filter', operation: 'FILTER', detail: cond ? `WHERE ${cond}` : 'Filtro WHERE', estimatedRows: Math.max(1, Math.floor((info?.rowCount ?? 0) * 0.3)), costLevel: 'low' })
    }
    steps.push({ id: id++, type: 'dml', operation: 'UPDATE', table: tbl, detail: !hasWhere ? '⚠️ Sin WHERE — se actualizarán TODAS las filas' : 'Actualizar filas filtradas', estimatedRows: hasWhere ? Math.max(1, Math.floor((info?.rowCount ?? 0) * 0.3)) : (info?.rowCount ?? 0), costLevel: !hasWhere ? 'high' : 'low', note: !hasWhere ? 'Peligro: sin cláusula WHERE, UPDATE afecta toda la tabla.' : undefined })

  } else if (isDelete) {
    const tbl = q.match(/\bFROM\s+`?(\w+)`?/i)?.[1] ?? ''
    const info = tableMap.get(tbl.toLowerCase())
    const hasWhere = /\bWHERE\b/i.test(q)
    steps.push({ id: id++, type: 'scan', operation: 'SEQ SCAN', table: tbl, detail: info ? `${info.rowCount} filas` : 'tabla no encontrada', estimatedRows: info?.rowCount ?? 0, costLevel: 'low' })
    if (hasWhere) {
      const cond = extractWhere(q)
      steps.push({ id: id++, type: 'filter', operation: 'FILTER', detail: cond ? `WHERE ${cond}` : 'Filtro WHERE', estimatedRows: Math.max(1, Math.floor((info?.rowCount ?? 0) * 0.3)), costLevel: 'low' })
    }
    steps.push({ id: id++, type: 'dml', operation: 'DELETE', table: tbl, detail: !hasWhere ? '⚠️ Sin WHERE — se eliminarán TODAS las filas' : 'Eliminar filas filtradas', estimatedRows: hasWhere ? Math.max(1, Math.floor((info?.rowCount ?? 0) * 0.3)) : (info?.rowCount ?? 0), costLevel: !hasWhere ? 'high' : 'low', note: !hasWhere ? 'Peligro: sin cláusula WHERE, DELETE vacía la tabla.' : undefined })

  } else {
    steps.push({ id: 1, type: 'info', operation: 'INFO', detail: 'Selecciona una consulta SELECT, INSERT, UPDATE o DELETE para ver el plan de ejecución.', estimatedRows: 0, costLevel: 'low' })
  }

  // Warn if upper = 'SELECT *'
  if (isSelect && /SELECT\s+\*/i.test(q)) {
    const last = steps[steps.length - 1]
    if (last) last.note = (last.note ? last.note + ' ' : '') + 'Evita SELECT * en producción — selecciona solo las columnas necesarias.'
  }

  return steps
}

// ─── Real memory helper ───────────────────────────────────────────────────────

function getMemoryMB(): number {
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
  if (mem?.usedJSHeapSize) return +(mem.usedJSHeapSize / (1024 * 1024)).toFixed(2)
  // Fallback: estimate from table row count
  const total = getAllTableInfos().reduce((a, t) => a + t.rowCount, 0)
  return +(total * 0.0005 + 0.5).toFixed(2)
}

// ─── Error suggestion helper ──────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

function closest(name: string, candidates: string[]): string | null {
  if (!candidates.length) return null
  const lo = name.toLowerCase()
  const best = candidates
    .map(c => ({ c, d: levenshtein(lo, c.toLowerCase()) }))
    .sort((a, b) => a.d - b.d)[0]
  return best.d <= Math.max(2, Math.floor(name.length / 3)) && best.c.toLowerCase() !== lo
    ? best.c
    : null
}

export function enhanceError(msg: string): string {
  const tableNames = getAllTableInfos().map(t => t.name)
  const colNames   = getAllTableInfos().flatMap(t => t.columns)

  // Table-not-found patterns from AlaSQL
  const tblMatch = msg.match(/table\s+'?(\w+)'?/i)
    ?? msg.match(/no such table\s*:?\s*'?(\w+)'?/i)
    ?? msg.match(/unknown table\s*:?\s*'?(\w+)'?/i)
  if (tblMatch) {
    const sug = closest(tblMatch[1], tableNames)
    if (sug) return `${msg}\n💡 ¿Quisiste decir la tabla "${sug}"?`
  }

  // Column-not-found patterns
  const colMatch = msg.match(/column\s+'?(\w+)'?/i)
    ?? msg.match(/unknown column\s*:?\s*'?(\w+)'?/i)
  if (colMatch) {
    const sug = closest(colMatch[1], colNames)
    if (sug) return `${msg}\n💡 ¿Quisiste decir la columna "${sug}"?`
  }

  return msg
}

// ─── Query execution ──────────────────────────────────────────────────────────

export async function executeSQL(
  query: string,
  networkLatency = 10,
  simulateErrors = false,
  errorProbability = 0,
  activeDbName = '',
  databases: { name: string; tables: string[] }[] = [],
): Promise<QueryResult> {
  const start = performance.now()
  initQueryLogger()
  await new Promise(r => setTimeout(r, networkLatency))

  if (simulateErrors && Math.random() * 100 < errorProbability)
    throw new Error(`Simulated error: connection timeout after ${networkLatency}ms`)

  // Preprocess: strip GO, CREATE DATABASE, USE, SQL Server specifics so all
  // tables land in alasql's default namespace where getAllTableInfos() can see them.
  const { processed } = preprocessSQL(query)
  const clean = processed.trim().replace(/;+\s*$/, '')
  if (!clean) throw new Error('La consulta está vacía')

  // Insert semicolons between consecutive statements that lack them
  const normalized = clean
    .split('\n')
    .reduce((acc: string[], line, i, arr) => {
      const next = (arr[i + 1] ?? '').trim()
      const needsSemi = /\S/.test(line) && !line.trimEnd().endsWith(';')
        && /^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|WITH)\b/i.test(next)
      acc.push(needsSemi ? line.trimEnd() + ';' : line)
      return acc
    }, [])
    .join('\n')

  assertDbScope(normalized, activeDbName, databases)

  const stmts = splitSQLStatements(normalized).filter(s => s.replace(/--[^\n]*/g, '').trim())
  const elapsed_start = performance.now()

  // Execute each statement individually to support multiple result sets
  const sets: import('../types').QueryResultSet[] = []
  let totalAffected = 0
  let hasDDL = false

  for (const stmt of stmts) {
    const exec = stmt.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').trim()
    if (!exec) continue
    const tableMatch = exec.match(/\bFROM\s+`?(\w+)`?/i)
      ?? exec.match(/\bUPDATE\s+`?(\w+)`?/i)
      ?? exec.match(/\bINTO\s+`?(\w+)`?/i)
    const label = tableMatch ? tableMatch[1] : `Resultado ${sets.length + 1}`
    let raw: unknown
    try { raw = alasql(exec) }
    catch (e: any) {
      const msg = e?.message ?? 'Error al ejecutar la consulta'
      await logQuery({
        query,
        processed: normalized,
        durationMs: Math.max(performance.now() - start, 1),
        rowCount: 0,
        affectedRows: totalAffected,
        success: false,
        errorMessage: msg,
        dbName: activeDbName,
        setsCount: sets.length,
      })
      throw new Error(msg)
    }

    if (/^\s*(CREATE|DROP|ALTER|INSERT|UPDATE|DELETE)\s/i.test(exec)) hasDDL = true
    if (Array.isArray(raw)) {
      const rows = raw as Record<string, unknown>[]
      sets.push({ label, columns: rows.length > 0 ? Object.keys(rows[0]) : [], rows })
    } else if (typeof raw === 'number') {
      totalAffected += raw
    }
  }

  const elapsed = performance.now() - elapsed_start
  if (hasDDL) persistTables()

  // Log successful execution summary
  try {
    const overallRowCount = sets.length > 0 ? sets.reduce((s, r) => s + r.rows.length, 0) : totalAffected
    await logQuery({
      query,
      processed: normalized,
      durationMs: Math.max(performance.now() - start, 1),
      rowCount: overallRowCount,
      affectedRows: totalAffected,
      success: true,
      errorMessage: null,
      dbName: activeDbName,
      setsCount: sets.length,
    })
  } catch { /* ignore logging failures */ }

  // Single statement — return plain result (backward compatible)
  if (sets.length === 1) {
    const { columns, rows } = sets[0]
    return { columns, rows, rowCount: rows.length, executionTime: Math.max(elapsed, 1), memoryUsage: getMemoryMB(), warnings: 0 }
  }
  // Multiple SELECT results — return with sets for multi-grid display
  if (sets.length > 1) {
    const allRows = sets[0].rows
    return {
      columns: sets[0].columns, rows: allRows,
      rowCount: sets.reduce((s, r) => s + r.rows.length, 0),
      executionTime: Math.max(elapsed, 1),
      memoryUsage: getMemoryMB(),
      warnings: 0,
      sets,
    }
  }
  // DDL / DML only — no rows returned
  return { columns: ['filas_afectadas'], rows: [{ filas_afectadas: totalAffected }], rowCount: totalAffected, executionTime: Math.max(elapsed, 1), memoryUsage: 0.5, warnings: 0 }
}

// ─── MongoDB helpers ──────────────────────────────────────────────────────────

function mongoFilter(row: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  for (const [key, val] of Object.entries(filter)) {
    if (key.startsWith('$')) continue
    const rv = row[key]
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      const ops = val as Record<string, unknown>
      if ('$eq'  in ops && rv !== ops.$eq)                             return false
      if ('$ne'  in ops && rv === ops.$ne)                             return false
      if ('$gt'  in ops && !(Number(rv) >  Number(ops.$gt)))          return false
      if ('$gte' in ops && !(Number(rv) >= Number(ops.$gte)))         return false
      if ('$lt'  in ops && !(Number(rv) <  Number(ops.$lt)))          return false
      if ('$lte' in ops && !(Number(rv) <= Number(ops.$lte)))         return false
      if ('$in'  in ops && !((ops.$in as unknown[]).includes(rv)))    return false
    } else {
      if (rv !== val && String(rv) !== String(val)) return false
    }
  }
  return true
}

function evalArg(s: string): unknown {
  try { return new Function(`"use strict"; return (${s})`)() } catch { return {} }
}

function nextOid(): string {
  return `ObjectId("${(Date.now() + Math.random()).toString(16).replace('.', '').padEnd(24, '0').slice(0, 24)}")`
}

export function executeMongoQuery(query: string): QueryResult {
  const start = performance.now()
  const rows: Record<string, unknown>[] = []

  for (const rawLine of query.trim().split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('//')) continue

    const m = line.match(/^db\.(\w+)\.(\w+)\(([\s\S]*)\)\s*$/)
    if (!m) { rows.push({ error: `Sintaxis inválida: ${line}` }); continue }

    const [, colName, op, argsRaw] = m
    const tbl = (alasql as any).tables?.[colName] as { data?: Record<string, unknown>[] } | undefined
    const argParts = splitTopCommas(argsRaw)
    const args = argParts.map(a => a.trim() ? evalArg(a.trim()) : {})
    const filter = (args[0] as Record<string, unknown>) ?? {}
    const data: Record<string, unknown>[] = tbl ? [...(tbl.data ?? [])] : []

    switch (op.toLowerCase()) {
      case 'find': {
        const projection = (args[1] as Record<string, unknown>) ?? {}
        const hasF = Object.keys(filter).length > 0
        const hasP = Object.keys(projection).length > 0
        let matched: Record<string, unknown>[] = data
          .filter(r => !hasF || mongoFilter(r, filter))
          .map((r, i) => ({ _id: r._id ?? `ObjectId("${String(i + 1).padStart(24, '0')}")`, ...r }))
        if (hasP) {
          const inc = Object.entries(projection).filter(([k, v]) => k !== '_id' && v === 1).map(([k]) => k)
          const showId = projection._id !== 0
          matched = matched.map(r => {
            const out: Record<string, unknown> = {}
            if (showId) out._id = r._id
            inc.forEach(k => { if (k in r) out[k] = (r as Record<string, unknown>)[k] })
            return out
          })
        }
        rows.push(...matched)
        break
      }
      case 'findone': {
        const hasF = Object.keys(filter).length > 0
        const found = data.find(r => !hasF || mongoFilter(r, filter))
        rows.push(found ? { _id: found._id ?? nextOid(), ...found } : { resultado: 'null' })
        break
      }
      case 'insertone': {
        if (!tbl) { rows.push({ error: `Colección '${colName}' no existe — usa CREATE TABLE primero` }); break }
        const doc = { ...filter } as Record<string, unknown>
        if (!doc._id) doc._id = nextOid()
        tbl.data = [...(tbl.data ?? []), doc]
        persistTables()
        rows.push({ acknowledged: true, insertedId: String(doc._id) })
        break
      }
      case 'insertmany': {
        if (!tbl) { rows.push({ error: `Colección '${colName}' no existe` }); break }
        const docs = Array.isArray(args[0]) ? args[0] as Record<string, unknown>[] : [filter]
        const ids = docs.map(d => {
          const doc = { ...d }
          if (!doc._id) doc._id = nextOid()
          tbl.data = [...(tbl.data ?? []), doc]
          return String(doc._id)
        })
        persistTables()
        rows.push({ acknowledged: true, insertedCount: docs.length, insertedIds: ids.slice(0, 3).join(', ') + (ids.length > 3 ? '…' : '') })
        break
      }
      case 'updateone':
      case 'updatemany': {
        if (!tbl) { rows.push({ error: `Colección '${colName}' no existe` }); break }
        const updateOp = (args[1] as Record<string, unknown>) ?? {}
        const setF = (updateOp.$set as Record<string, unknown>) ?? {}
        const unsetF = (updateOp.$unset as Record<string, unknown>) ?? {}
        let count = 0
        tbl.data = (tbl.data ?? []).map(r => {
          if (Object.keys(filter).length === 0 || mongoFilter(r, filter)) {
            if (op.toLowerCase() === 'updateone' && count > 0) return r
            count++
            const updated = { ...r, ...setF }
            Object.keys(unsetF).forEach(k => delete updated[k])
            return updated
          }
          return r
        })
        persistTables()
        rows.push({ acknowledged: true, matchedCount: count, modifiedCount: count })
        break
      }
      case 'deleteone':
      case 'deletemany': {
        if (!tbl) { rows.push({ error: `Colección '${colName}' no existe` }); break }
        let count = 0
        const onlyOne = op.toLowerCase() === 'deleteone'
        tbl.data = (tbl.data ?? []).filter(r => {
          if (Object.keys(filter).length === 0 || mongoFilter(r, filter)) {
            if (onlyOne && count > 0) return true
            count++; return false
          }
          return true
        })
        persistTables()
        rows.push({ acknowledged: true, deletedCount: count })
        break
      }
      case 'countdocuments': {
        const hasF = Object.keys(filter).length > 0
        rows.push({ count: data.filter(r => !hasF || mongoFilter(r, filter)).length })
        break
      }
      case 'drop': {
        if (tbl) { try { alasql(`DROP TABLE IF EXISTS \`${colName}\``) } catch { /* ignore */ } persistTables() }
        rows.push({ resultado: tbl ? `Colección '${colName}' eliminada` : `Colección '${colName}' no existe` })
        break
      }
      default:
        rows.push({ error: `Operación '${op}' no soportada en el simulador` })
    }
  }

  const columns = rows.length > 0 ? Object.keys(rows[0]) : ['resultado']
  return { columns, rows, rowCount: rows.length, executionTime: performance.now() - start, memoryUsage: getMemoryMB(), warnings: 0 }
}

// ─── Redis persistent store ───────────────────────────────────────────────────

const _rkv  = new Map<string, string>()
const _rhash = new Map<string, Map<string, string>>()
const _rlist = new Map<string, string[]>()
const _rset  = new Map<string, Set<string>>()
const _rexp  = new Map<string, number>()

function rAlive(key: string): boolean {
  const exp = _rexp.get(key)
  if (exp && Date.now() > exp) { _rkv.delete(key); _rhash.delete(key); _rlist.delete(key); _rset.delete(key); _rexp.delete(key); return false }
  return true
}

;(function seedRedis() {
  if (_rkv.size > 0) return
  _rkv.set('contador:visitas', '1542')
  _rkv.set('config:env', 'development')
  _rkv.set('app:version', '1.0.0')
  const h1 = new Map([['nombre','Juan Pérez'],['email','juan@ejemplo.com'],['rol','admin']])
  const h2 = new Map([['nombre','María López'],['email','maria@ejemplo.com'],['rol','user']])
  _rhash.set('usuario:1', h1); _rhash.set('usuario:2', h2)
  _rlist.set('cola:tareas', ['procesar_pago', 'enviar_email', 'generar_reporte'])
  _rset.set('tags:activos', new Set(['sql', 'nosql', 'redis', 'mongodb']))
})()

export function executeRedisCommand(query: string): QueryResult {
  const start = performance.now()
  const rows: Record<string, unknown>[] = []

  for (const rawLine of query.trim().split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []
    const cmd = (parts[0] ?? '').toUpperCase()
    const key = (parts[1] ?? '').replace(/^["']|["']$/g, '')
    const val = (parts[2] ?? '').replace(/^["']|["']$/g, '')

    const ok  = (r: string) => rows.push({ comando: line, resultado: r })
    const err = (r: string) => rows.push({ comando: line, error: r })

    switch (cmd) {
      case 'SET': {
        _rkv.set(key, val)
        const ex = parts.findIndex(p => p.toUpperCase() === 'EX')
        if (ex >= 0 && parts[ex + 1]) _rexp.set(key, Date.now() + Number(parts[ex + 1]) * 1000)
        ok('OK'); break
      }
      case 'GET':
        ok(rAlive(key) && _rkv.has(key) ? _rkv.get(key)! : '(nil)'); break
      case 'DEL': {
        let count = 0
        for (let i = 1; i < parts.length; i++) {
          const k = parts[i]
          ;[_rkv, _rhash, _rlist, _rset].forEach(m => { if ((m as Map<string, unknown>).delete(k)) count++ })
        }
        rows.push({ comando: line, resultado: `(integer) ${count}` }); break
      }
      case 'EXISTS':
        rows.push({ comando: line, resultado: `(integer) ${(rAlive(key) && (_rkv.has(key) || _rhash.has(key) || _rlist.has(key) || _rset.has(key))) ? 1 : 0}` }); break
      case 'EXPIRE':
        if (_rkv.has(key) || _rhash.has(key) || _rlist.has(key) || _rset.has(key)) { _rexp.set(key, Date.now() + Number(val) * 1000); ok('(integer) 1') } else ok('(integer) 0'); break
      case 'TTL': {
        const exp = _rexp.get(key)
        rows.push({ comando: line, resultado: exp ? `(integer) ${Math.max(0, Math.ceil((exp - Date.now()) / 1000))}` : '(integer) -1' }); break
      }
      case 'INCR': case 'INCRBY': {
        const by = cmd === 'INCRBY' ? Number(val || 1) : 1
        const cur = parseInt(_rkv.get(key) ?? '0', 10)
        if (isNaN(cur)) { err('ERR value is not an integer'); break }
        const next = cur + by; _rkv.set(key, String(next))
        rows.push({ comando: line, resultado: `(integer) ${next}` }); break
      }
      case 'DECR': case 'DECRBY': {
        const by = cmd === 'DECRBY' ? Number(val || 1) : 1
        const cur = parseInt(_rkv.get(key) ?? '0', 10)
        if (isNaN(cur)) { err('ERR value is not an integer'); break }
        const next = cur - by; _rkv.set(key, String(next))
        rows.push({ comando: line, resultado: `(integer) ${next}` }); break
      }
      case 'HSET': {
        if (!_rhash.has(key)) _rhash.set(key, new Map())
        let added = 0
        for (let i = 2; i + 1 < parts.length; i += 2) {
          const f = parts[i].replace(/^["']|["']$/g, '')
          const v = parts[i + 1].replace(/^["']|["']$/g, '')
          if (!_rhash.get(key)!.has(f)) added++
          _rhash.get(key)!.set(f, v)
        }
        rows.push({ comando: line, resultado: `(integer) ${added}` }); break
      }
      case 'HGET': {
        const h = _rhash.get(key)
        ok(h ? (h.get(val) ?? '(nil)') : '(nil)'); break
      }
      case 'HMGET': {
        const h = _rhash.get(key) ?? new Map()
        const values = parts.slice(2).map(f => h.get(f.replace(/^["']|["']$/g, '')) ?? '(nil)')
        rows.push({ comando: line, resultado: values.join(', ') }); break
      }
      case 'HGETALL': {
        const h = _rhash.get(key)
        if (!h || h.size === 0) { rows.push({ comando: line, campo: '(empty)', valor: '' }); break }
        for (const [f, v] of h) rows.push({ comando: key, campo: f, valor: v })
        break
      }
      case 'HDEL': {
        const h = _rhash.get(key)
        const count = h ? parts.slice(2).filter(f => h.delete(f.replace(/^["']|["']$/g, ''))).length : 0
        rows.push({ comando: line, resultado: `(integer) ${count}` }); break
      }
      case 'LPUSH': case 'RPUSH': {
        if (!_rlist.has(key)) _rlist.set(key, [])
        const items = parts.slice(2).map(p => p.replace(/^["']|["']$/g, ''))
        const list = _rlist.get(key)!
        cmd === 'LPUSH' ? list.unshift(...items.reverse()) : list.push(...items)
        rows.push({ comando: line, resultado: `(integer) ${list.length}` }); break
      }
      case 'LRANGE': {
        const list = _rlist.get(key) ?? []
        const s = parseInt(val, 10), e = parseInt(parts[3] ?? '-1', 10)
        const end = e < 0 ? list.length + e : e
        list.slice(s, end + 1).forEach((v, i) => rows.push({ comando: key, indice: i + s, valor: v }))
        if (!list.length) rows.push({ comando: line, resultado: '(empty list)' })
        break
      }
      case 'LLEN':
        rows.push({ comando: line, resultado: `(integer) ${(_rlist.get(key) ?? []).length}` }); break
      case 'LPOP': case 'RPOP': {
        const list = _rlist.get(key) ?? []
        const popped = cmd === 'LPOP' ? list.shift() : list.pop()
        ok(popped ?? '(nil)'); break
      }
      case 'SADD': {
        if (!_rset.has(key)) _rset.set(key, new Set())
        const added = parts.slice(2).filter(m => !_rset.get(key)!.has(m.replace(/^["']|["']$/g, ''))).length
        parts.slice(2).forEach(m => _rset.get(key)!.add(m.replace(/^["']|["']$/g, '')))
        rows.push({ comando: line, resultado: `(integer) ${added}` }); break
      }
      case 'SMEMBERS': {
        const s = _rset.get(key) ?? new Set()
        if (!s.size) { rows.push({ comando: line, resultado: '(empty set)' }); break }
        let i = 0; for (const m of s) rows.push({ comando: key, indice: ++i, miembro: m })
        break
      }
      case 'SISMEMBER':
        rows.push({ comando: line, resultado: `(integer) ${(_rset.get(key)?.has(val) ? 1 : 0)}` }); break
      case 'SCARD':
        rows.push({ comando: line, resultado: `(integer) ${(_rset.get(key)?.size ?? 0)}` }); break
      case 'KEYS': {
        const pattern = (parts[1] ?? '*').replace(/^["']|["']$/g, '')
        const allKeys = [...new Set([..._rkv.keys(), ..._rhash.keys(), ..._rlist.keys(), ..._rset.keys()])]
          .filter(k => rAlive(k))
        const matched = pattern === '*' ? allKeys
          : allKeys.filter(k => {
              const re = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$')
              return re.test(k)
            })
        if (!matched.length) { rows.push({ comando: line, resultado: '(empty)' }); break }
        matched.forEach((k, i) => rows.push({ comando: line, indice: i + 1, clave: k }))
        break
      }
      case 'DBSIZE':
        rows.push({ comando: line, resultado: `(integer) ${new Set([..._rkv.keys(), ..._rhash.keys(), ..._rlist.keys(), ..._rset.keys()]).size}` }); break
      case 'FLUSHDB':
        _rkv.clear(); _rhash.clear(); _rlist.clear(); _rset.clear(); _rexp.clear()
        ok('OK'); break
      case 'PING':
        ok(val ? val : 'PONG'); break
      case 'TYPE': {
        const t = _rkv.has(key) ? 'string' : _rhash.has(key) ? 'hash' : _rlist.has(key) ? 'list' : _rset.has(key) ? 'set' : 'none'
        ok(t); break
      }
      default:
        err(`ERR unknown command '${cmd}'. Consulta la guía de comandos.`)
    }
  }

  const columns = rows.length > 0 ? Object.keys(rows[0]) : ['comando', 'resultado']
  return { columns, rows, rowCount: rows.length, executionTime: performance.now() - start, memoryUsage: getMemoryMB(), warnings: 0 }
}
