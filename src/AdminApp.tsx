import { useEffect, useState } from 'react'
import {
  Activity, Users, Shield, Circle, Database,
  Zap, LogOut, AlertTriangle, UserCog, ChevronDown, TrendingUp,
} from 'lucide-react'
import { signOut } from 'firebase/auth'
import { auth } from './lib/firebase'
import { subscribeToSimulatorSessions, type SimulatorSession } from './lib/simulatorSession'
import { subscribeToUsers, updateUserRole, isAdminByUid, type ManagedUser } from './lib/adminUsers'
import AdminLogin from './components/AdminLogin'

function isStaticAdmin(email: string): boolean {
  const raw = import.meta.env.VITE_ADMIN_EMAILS as string | undefined
  if (!raw) return false
  return raw.split(',').map(e => e.trim().toLowerCase()).includes(email.toLowerCase())
}

const ENGINE_LABELS: Record<string, string> = {
  sqlserver: 'SQL Server', mysql: 'MySQL', postgresql: 'PostgreSQL',
  oracle: 'Oracle', sqlite: 'SQLite', mongodb: 'MongoDB', redis: 'Redis',
}

// Accent system
const ACCENT = {
  indigo: { color: '#818cf8', border: '#3730a3', bg: 'rgba(99,102,241,0.1)', glow: 'rgba(99,102,241,0.15)' },
  green:  { color: '#34d399', border: '#065f46', bg: 'rgba(52,211,153,0.1)',  glow: 'rgba(52,211,153,0.12)' },
  amber:  { color: '#fbbf24', border: '#92400e', bg: 'rgba(251,191,36,0.1)',  glow: 'rgba(251,191,36,0.12)' },
  sky:    { color: '#38bdf8', border: '#075985', bg: 'rgba(56,189,248,0.1)',  glow: 'rgba(56,189,248,0.12)' },
  violet: { color: '#c084fc', border: '#581c87', bg: 'rgba(192,132,252,0.1)', glow: 'rgba(192,132,252,0.12)' },
}

const QT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  SELECT: { bg: 'rgba(59,130,246,0.15)', text: '#93c5fd', border: 'rgba(59,130,246,0.35)' },
  INSERT: { bg: 'rgba(34,197,94,0.12)',  text: '#86efac', border: 'rgba(34,197,94,0.3)'   },
  UPDATE: { bg: 'rgba(234,179,8,0.12)',  text: '#fde047', border: 'rgba(234,179,8,0.3)'   },
  DELETE: { bg: 'rgba(239,68,68,0.12)',  text: '#fca5a5', border: 'rgba(239,68,68,0.3)'   },
}

const CARD_BG    = '#0f1626'
const CARD_BORD  = '#1b2640'
const PAGE_BG    = '#080d18'
const HEADER_BG  = '#0b1120'
const ROW_HOVER  = 'rgba(255,255,255,0.025)'
const TH_BG      = '#0a1020'

function StatusDot({ status }: { status: SimulatorSession['status'] }) {
  if (status === 'running') return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
    </span>
  )
  if (status === 'completed') return <Circle size={10} style={{ color: '#475569', fill: '#475569' }} className="shrink-0" />
  return <Circle size={10} style={{ color: '#1e293b', fill: '#1e293b' }} className="shrink-0" />
}

interface KpiCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  accent: keyof typeof ACCENT
  trend?: string
}

function KpiCard({ icon, label, value, sub, accent, trend }: KpiCardProps) {
  const a = ACCENT[accent]
  return (
    <div style={{
      background: CARD_BG,
      border: `1px solid ${CARD_BORD}`,
      borderRadius: 16,
      padding: '20px 22px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Top accent line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${a.color}, transparent)`,
        borderRadius: '16px 16px 0 0',
      }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#475569', textTransform: 'uppercase' }}>
          {label}
        </p>
        <div style={{
          width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: a.bg, border: `1px solid ${a.border}`,
        }}>
          {icon}
        </div>
      </div>
      <div>
        <p style={{ fontSize: 42, fontWeight: 900, lineHeight: 1, color: a.color, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
          {trend && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: '#34d399' }}>
              <TrendingUp size={11} /> {trend}
            </span>
          )}
          {sub && <p style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>{sub}</p>}
        </div>
      </div>
    </div>
  )
}

function TabMonitoreo() {
  const [sessions, setSessions] = useState<SimulatorSession[]>([])
  const [, setTick] = useState(0)

  useEffect(() => {
    const unsub = subscribeToSimulatorSessions(setSessions)
    return () => { if (typeof unsub === 'function') unsub() }
  }, [])

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  function sinceNow(ts: number | null): string {
    if (!ts) return '—'
    const s = Math.floor((Date.now() - ts) / 1000)
    if (s < 60) return `${s}s`
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
    return `${Math.floor(s / 3600)}h`
  }

  const running = sessions.filter(s => s.status === 'running').length
  const avgTps  = sessions.length ? Math.round(sessions.reduce((a, s) => a + s.tps, 0) / sessions.length) : 0
  const engines = new Set(sessions.filter(s => s.status === 'running').map(s => s.engine)).size

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <KpiCard icon={<Users size={14} style={{ color: ACCENT.indigo.color }} />} accent="indigo" label="Conectados"      value={sessions.length} />
        <KpiCard icon={<Activity size={14} style={{ color: ACCENT.green.color }} />} accent="green"  label="Simulando"      value={running}
          sub={sessions.filter(s => s.status === 'idle').length + ' en espera'} />
        <KpiCard icon={<Zap size={14} style={{ color: ACCENT.amber.color }} />} accent="amber"  label="TPS promedio"   value={avgTps} sub="transac / seg" />
        <KpiCard icon={<Database size={14} style={{ color: ACCENT.sky.color }} />} accent="sky"    label="Motores activos" value={engines} />
      </div>

      {/* Sessions panel */}
      <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORD}`, borderRadius: 16, overflow: 'hidden' }}>
        {/* Panel header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px',
          borderBottom: `1px solid ${CARD_BORD}`, background: TH_BG,
        }}>
          <Activity size={14} style={{ color: ACCENT.indigo.color }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>Sesiones activas</span>
          {sessions.length > 0 && (
            <span style={{
              marginLeft: 4, padding: '2px 10px', borderRadius: 20,
              background: ACCENT.indigo.bg, border: `1px solid ${ACCENT.indigo.border}`,
              fontSize: 11, fontWeight: 800, color: ACCENT.indigo.color,
            }}>{sessions.length}</span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#1e2d45', fontWeight: 600 }}>
            Actualización en tiempo real
          </span>
        </div>

        {sessions.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', gap: 14 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: ACCENT.indigo.bg, border: `1px solid ${ACCENT.indigo.border}`,
            }}>
              <Activity size={24} style={{ color: ACCENT.indigo.color, opacity: 0.6 }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#cbd5e1', fontWeight: 700, fontSize: 15 }}>Sin sesiones activas</p>
              <p style={{ color: '#334155', fontSize: 13, marginTop: 4 }}>Los usuarios aparecerán aquí en tiempo real</p>
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: TH_BG, borderBottom: `1px solid ${CARD_BORD}` }}>
                  {['Estado','Usuario','Motor','Operaciones','Usuarios','TPS','CPU','Latencia','Tiempo'].map(h => (
                    <th key={h} style={{
                      padding: '10px 18px', textAlign: 'left',
                      fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#334155',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => {
                  const activeQTs = Object.entries(s.queryTypes).filter(([, v]) => v).map(([k]) => k)
                  return (
                    <tr key={s.id}
                      style={{ borderBottom: i < sessions.length - 1 ? `1px solid rgba(27,38,64,0.8)` : 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.background = ROW_HOVER)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <StatusDot status={s.status} />
                          <span style={{
                            fontSize: 11, fontWeight: 700,
                            color: s.status === 'running' ? '#34d399' : s.status === 'completed' ? '#475569' : '#1e293b',
                          }}>
                            {s.status === 'running' ? 'Corriendo' : s.status === 'completed' ? 'Finalizado' : 'Inactivo'}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 18px', fontWeight: 700, color: '#f1f5f9' }}>{s.name}</td>
                      <td style={{ padding: '14px 18px' }}>
                        <span style={{
                          fontSize: 11, padding: '4px 10px', borderRadius: 8, fontWeight: 600,
                          background: 'rgba(255,255,255,0.05)', border: `1px solid ${CARD_BORD}`, color: '#94a3b8',
                        }}>{ENGINE_LABELS[s.engine] ?? s.engine}</span>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {activeQTs.length === 0
                            ? <span style={{ color: '#1e293b', fontSize: 12 }}>—</span>
                            : activeQTs.map(qt => {
                                const c = QT_COLORS[qt]
                                return c ? (
                                  <span key={qt} style={{
                                    fontSize: 10, padding: '3px 8px', borderRadius: 6, fontWeight: 800,
                                    background: c.bg, color: c.text, border: `1px solid ${c.border}`,
                                  }}>{qt}</span>
                                ) : null
                              })}
                        </div>
                      </td>
                      <td style={{ padding: '14px 18px', fontVariantNumeric: 'tabular-nums' }}>
                        {s.status === 'running'
                          ? <><span style={{ fontWeight: 700, color: '#e2e8f0' }}>{s.currentUsers}</span><span style={{ color: '#334155', fontSize: 11 }}>/{s.maxUsers}</span></>
                          : <span style={{ color: '#1e293b' }}>—</span>}
                      </td>
                      <td style={{ padding: '14px 18px', fontVariantNumeric: 'tabular-nums' }}>
                        {s.status === 'running'
                          ? <span style={{ fontWeight: 900, fontSize: 15, color: s.tps > 200 ? '#fbbf24' : '#34d399' }}>{s.tps}</span>
                          : <span style={{ color: '#1e293b' }}>—</span>}
                      </td>
                      <td style={{ padding: '14px 18px', fontVariantNumeric: 'tabular-nums' }}>
                        {s.status === 'running'
                          ? <span style={{ fontWeight: 700, color: s.cpuUsage >= 90 ? '#f87171' : s.cpuUsage >= 70 ? '#fbbf24' : '#94a3b8' }}>
                              {s.cpuUsage.toFixed(0)}%
                            </span>
                          : <span style={{ color: '#1e293b' }}>—</span>}
                      </td>
                      <td style={{ padding: '14px 18px', fontVariantNumeric: 'tabular-nums' }}>
                        {s.status === 'running'
                          ? <span style={{ fontWeight: 700, color: s.latency > 200 ? '#f87171' : '#94a3b8' }}>{s.latency.toFixed(0)}ms</span>
                          : <span style={{ color: '#1e293b' }}>—</span>}
                      </td>
                      <td style={{ padding: '14px 18px', fontSize: 11, color: '#334155', fontVariantNumeric: 'tabular-nums' }}>
                        {sinceNow(s.connectedAt)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function RoleSelector({ uid, currentRole, loading, onChange }: {
  uid: string; currentRole: string; loading: string | null
  onChange: (uid: string, role: 'Usuario' | 'Administrador') => void
}) {
  const isAdmin = currentRole === 'Administrador'
  const busy    = loading === uid
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <select
        value={currentRole}
        disabled={busy}
        onChange={e => onChange(uid, e.target.value as 'Usuario' | 'Administrador')}
        style={{
          appearance: 'none', paddingLeft: 12, paddingRight: 28, paddingTop: 6, paddingBottom: 6,
          borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', outline: 'none',
          border: `1px solid ${isAdmin ? ACCENT.indigo.border : CARD_BORD}`,
          background: isAdmin ? ACCENT.indigo.bg : 'rgba(255,255,255,0.03)',
          color: isAdmin ? ACCENT.indigo.color : '#475569',
          opacity: busy ? 0.6 : 1,
        }}
      >
        <option value="Usuario">Usuario</option>
        <option value="Administrador">Administrador</option>
      </select>
      <ChevronDown size={10} style={{
        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
        pointerEvents: 'none', color: '#334155',
      }} />
      {busy && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${CARD_BG}cc`, borderRadius: 8,
        }}>
          <div style={{
            width: 14, height: 14, borderRadius: '50%', animation: 'spin 0.7s linear infinite',
            border: `2px solid ${ACCENT.indigo.border}`, borderTopColor: ACCENT.indigo.color,
          }} />
        </div>
      )}
    </div>
  )
}

function TabUsuarios() {
  const [users,   setUsers]   = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState<string | null>(null)
  const [search,  setSearch]  = useState('')

  useEffect(() => {
    const unsub = subscribeToUsers(setUsers)
    return () => { if (typeof unsub === 'function') unsub() }
  }, [])

  async function handleRoleChange(uid: string, newRole: 'Usuario' | 'Administrador') {
    setLoading(uid)
    try { await updateUserRole(uid, newRole) }
    finally { setLoading(null) }
  }

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  const admins  = users.filter(u => u.role === 'Administrador').length
  const regular = users.filter(u => u.role !== 'Administrador').length

  function formatDate(ts: number) {
    if (!ts) return '—'
    return new Date(ts).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <KpiCard icon={<Users size={14} style={{ color: ACCENT.indigo.color }} />} accent="indigo" label="Total usuarios"     value={users.length} />
        <KpiCard icon={<Shield size={14} style={{ color: ACCENT.violet.color }} />} accent="violet" label="Administradores"    value={admins} />
        <KpiCard icon={<UserCog size={14} style={{ color: ACCENT.sky.color }} />} accent="sky"    label="Usuarios regulares" value={regular} />
      </div>

      <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORD}`, borderRadius: 16, overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '14px 22px', flexWrap: 'wrap',
          borderBottom: `1px solid ${CARD_BORD}`, background: TH_BG,
        }}>
          <UserCog size={14} style={{ color: ACCENT.indigo.color }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>Gestión de usuarios</span>
          <div style={{ marginLeft: 'auto' }}>
            <input
              type="text" value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar usuario o correo..."
              style={{
                background: PAGE_BG, border: `1px solid ${CARD_BORD}`,
                borderRadius: 10, padding: '7px 14px', fontSize: 12, color: '#e2e8f0',
                outline: 'none', width: 220, fontWeight: 500,
              }}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: 10 }}>
            <Users size={28} style={{ color: '#1e293b' }} />
            <p style={{ fontSize: 13, color: '#334155' }}>No se encontraron usuarios</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: TH_BG, borderBottom: `1px solid ${CARD_BORD}` }}>
                  {['Usuario','Correo','Proveedor','Registrado','Rol'].map(h => (
                    <th key={h} style={{
                      padding: '10px 18px', textAlign: 'left',
                      fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#334155',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => (
                  <tr key={u.uid}
                    style={{ borderBottom: i < filtered.length - 1 ? `1px solid rgba(27,38,64,0.8)` : 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.background = ROW_HOVER)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 900, color: '#fff', background: u.color, flexShrink: 0,
                        }}>
                          {u.username[0]?.toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 700, color: '#f1f5f9' }}>{u.username}</span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: 12, color: '#475569', fontWeight: 500 }}>{u.email}</td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{
                        fontSize: 11, padding: '4px 10px', borderRadius: 8, fontWeight: 700,
                        background: 'rgba(255,255,255,0.05)', border: `1px solid ${CARD_BORD}`, color: '#94a3b8',
                      }}>{u.provider === 'google' ? 'Google' : 'Email'}</span>
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: 12, color: '#334155', fontWeight: 600 }}>{formatDate(u.createdAt)}</td>
                    <td style={{ padding: '14px 18px' }}>
                      <RoleSelector uid={u.uid} currentRole={u.role} loading={loading} onChange={handleRoleChange} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AdminApp() {
  const [adminEmail, setAdminEmail] = useState<string | null>(null)
  const [denied,     setDenied]     = useState(false)
  const [checking,   setChecking]   = useState(false)
  const [activeTab,  setActiveTab]  = useState<'monitor' | 'users'>('monitor')

  useEffect(() => { document.documentElement.classList.remove('light') }, [])

  async function handleAuth(email: string, uid: string) {
    if (isStaticAdmin(email)) { setAdminEmail(email); return }
    setChecking(true)
    const ok = await isAdminByUid(uid)
    setChecking(false)
    if (ok) { setAdminEmail(email) } else { setDenied(true) }
  }

  async function handleLogout() {
    if (auth) await signOut(auth).catch(() => {})
    setAdminEmail(null)
    setDenied(false)
  }

  if (checking) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: PAGE_BG }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%', animation: 'spin 0.8s linear infinite',
          border: `2px solid ${ACCENT.indigo.border}`, borderTopColor: ACCENT.indigo.color,
        }} />
        <p style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Verificando permisos…</p>
      </div>
    </div>
  )

  if (denied) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: PAGE_BG, padding: 16 }}>
      <div style={{
        width: '100%', maxWidth: 360, background: CARD_BG, border: `1px solid rgba(239,68,68,0.25)`,
        borderRadius: 20, padding: 36, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, textAlign: 'center',
      }}>
        <div style={{
          width: 60, height: 60, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
        }}>
          <AlertTriangle size={26} style={{ color: '#f87171' }} />
        </div>
        <div>
          <h2 style={{ color: '#f1f5f9', fontWeight: 900, fontSize: 20, marginBottom: 8 }}>Acceso denegado</h2>
          <p style={{ color: '#475569', fontSize: 14, lineHeight: 1.6 }}>Tu cuenta no tiene permisos para acceder al panel de control.</p>
        </div>
        <button onClick={handleLogout} style={{
          fontSize: 13, fontWeight: 700, color: ACCENT.indigo.color, background: 'none', border: 'none', cursor: 'pointer',
        }}>
          Intentar con otra cuenta
        </button>
      </div>
    </div>
  )

  if (!adminEmail) return <AdminLogin onAuth={handleAuth} />

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: PAGE_BG }}>

      {/* ── Header ── */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '0 clamp(12px, 3vw, 28px)', height: 58, flexShrink: 0,
        background: HEADER_BG, borderBottom: `1px solid ${CARD_BORD}`,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          background: 'linear-gradient(135deg,#6366f1,#4338ca)',
          boxShadow: '0 0 18px rgba(99,102,241,0.35)',
        }}>
          <Shield size={15} style={{ color: '#fff' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.01em' }}>Centro de Control</p>
          <p style={{ fontSize: 11, color: '#334155', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{adminEmail}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginRight: 16 }}>
          <span style={{ position: 'relative', display: 'flex', width: 8, height: 8 }}>
            <span style={{
              position: 'absolute', inset: 0, borderRadius: '50%', background: '#34d399', opacity: 0.7,
              animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite',
            }} />
            <span style={{ position: 'relative', width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'block' }} />
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#34d399' }}>En vivo</span>
        </div>
        <button
          onClick={handleLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 10,
            border: `1px solid ${CARD_BORD}`, background: 'transparent', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, color: '#475569', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#e2e8f0'; e.currentTarget.style.borderColor = '#334155' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#475569'; e.currentTarget.style.borderColor = CARD_BORD }}
        >
          <LogOut size={13} />
          Salir
        </button>
      </header>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', background: HEADER_BG, borderBottom: `1px solid ${CARD_BORD}`, padding: '0 clamp(12px, 3vw, 28px)' }}>
        {([
          { key: 'monitor', label: 'Monitoreo', Icon: Activity },
          { key: 'users',   label: 'Usuarios',  Icon: Users   },
        ] as const).map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '0 18px', height: 46,
              fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none', background: 'transparent',
              borderBottom: `2px solid ${activeTab === key ? ACCENT.indigo.color : 'transparent'}`,
              color: activeTab === key ? ACCENT.indigo.color : '#334155',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (activeTab !== key) e.currentTarget.style.color = '#64748b' }}
            onMouseLeave={e => { if (activeTab !== key) e.currentTarget.style.color = '#334155' }}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <main style={{ flex: 1, overflowY: 'auto', padding: 'clamp(16px, 4vw, 32px) clamp(12px, 3vw, 28px)', maxWidth: 1440, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {activeTab === 'monitor' ? <TabMonitoreo /> : <TabUsuarios />}
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0 } }
      `}</style>
    </div>
  )
}
