import {
  ref, set, remove, onValue, onDisconnect,
  serverTimestamp, type Unsubscribe,
} from 'firebase/database'
import { db, isConfigured } from './firebase'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OnlineUser {
  id:          string
  name:        string
  role:        string
  color:       string
  engine:      string
  connectedAt: number | null
}

// ─── Session id único por pestaña ─────────────────────────────────────────────

let sessionId: string | null = null

function getSessionId(): string {
  if (!sessionId) {
    sessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }
  return sessionId
}

// ─── Registrar presencia al iniciar sesión ────────────────────────────────────

export function registerPresence(user: {
  name:   string
  role:   string
  color:  string
  engine: string
}): void {
  if (!isConfigured || !db) return

  const id       = getSessionId()
  const userRef  = ref(db, `presence/${id}`)

  // Escribir datos del usuario
  set(userRef, {
    name:        user.name,
    role:        user.role,
    color:       user.color,
    engine:      user.engine,
    connectedAt: serverTimestamp(),
  })

  // Borrar automáticamente cuando el navegador/pestaña se cierra
  onDisconnect(userRef).remove()
}

// ─── Actualizar el motor activo ───────────────────────────────────────────────

export function updatePresenceEngine(engine: string): void {
  if (!isConfigured || !db || !sessionId) return
  set(ref(db, `presence/${sessionId}/engine`), engine)
}

// ─── Eliminar presencia al cerrar sesión ──────────────────────────────────────

export function unregisterPresence(): void {
  if (!isConfigured || !db || !sessionId) return
  remove(ref(db, `presence/${sessionId}`))
  sessionId = null
}

// ─── Suscripción a la lista completa de usuarios conectados ──────────────────

export function subscribeToPresence(
  callback: (users: OnlineUser[]) => void
): Unsubscribe | (() => void) {
  if (!isConfigured || !db) {
    callback([])
    return () => {}
  }

  const presenceRef = ref(db, 'presence')
  return onValue(presenceRef, snapshot => {
    const data = snapshot.val() as Record<string, Omit<OnlineUser, 'id'>> | null
    if (!data) { callback([]); return }

    const users: OnlineUser[] = Object.entries(data).map(([id, v]) => ({
      id,
      name:        v.name        ?? 'Usuario',
      role:        v.role        ?? 'Demo',
      color:       v.color       ?? '#3b82f6',
      engine:      v.engine      ?? 'mysql',
      connectedAt: v.connectedAt ?? null,
    }))

    callback(users)
  })
}

// ─── Suscripción solo al número (usada en TopBar) ────────────────────────────

export function subscribeToCount(
  callback: (count: number) => void
): Unsubscribe | (() => void) {
  return subscribeToPresence(users => callback(users.length))
}
