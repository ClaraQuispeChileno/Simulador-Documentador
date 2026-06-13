import { useState } from 'react'
import { X, Lock, Mail, User, ShieldCheck, ChevronRight } from 'lucide-react'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: (user: { id: string; email: string; nombres: string; apellidos: string }) => void
}

const API_BASE_URL = import.meta.env.VITE_API_URL

export default function AuthModal({ isOpen, onClose, onSuccess }: Props) {
  const [isLogin, setIsLogin] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Form states
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombres, setNombres] = useState('')
  const [apellidos, setApellidos] = useState('')
  const [usuario, setUsuario] = useState('')
  const [tipoUso, setTipoUso] = useState('Personal')
  const [confirmPassword, setConfirmPassword] = useState('')

  if (!isOpen) return null

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setError('Por favor ingresa correo y contraseña')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/external/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Error al iniciar sesión')
      }

      onSuccess(result.user)
    } catch (err: any) {
      setError(err.message || 'Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombres || !apellidos || !email || !usuario || !password) {
      setError('Todos los campos obligatorios son requeridos')
      return
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/external/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombres,
          apellidos,
          email,
          password,
          usuario,
          tipo_uso: tipoUso,
        }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Error en el registro')
      }

      // Autologin after registration
      const loginRes = await fetch(`${API_BASE_URL}/api/external/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const loginResult = await loginRes.json()
      if (loginRes.ok) {
        onSuccess(loginResult.user)
      } else {
        setIsLogin(true)
        setError('Registro exitoso. Por favor inicia sesión.')
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-surface-800 border border-surface-600 rounded-3xl p-6 shadow-2xl overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -top-20 -right-20 w-44 h-44 rounded-full bg-orange-600/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-44 h-44 rounded-full bg-purple-600/10 blur-3xl pointer-events-none" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full hover:bg-surface-700 transition-colors"
        >
          <X size={16} />
        </button>

        {/* Logo/Icon */}
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-orange-600 to-red-500 flex items-center justify-center shadow-lg">
            <ShieldCheck size={24} className="text-white" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold text-white tracking-tight">
              {isLogin ? 'Accede a tu cuenta' : 'Crea una nueva cuenta'}
            </h2>
            <p className="text-xs text-slate-400">
              {isLogin ? 'Guarda y organiza tu documentación en la nube' : 'Regístrate en pocos segundos'}
            </p>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-red-950/40 border border-red-800/40 rounded-xl text-red-400 text-xs font-medium">
            ⚠️ {error}
          </div>
        )}

        {/* Tab selector */}
        <div className="flex bg-surface-900 p-1 rounded-xl border border-surface-600 mb-6 shrink-0">
          <button
            onClick={() => { setIsLogin(true); setError('') }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${isLogin ? 'bg-orange-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
          >
            Iniciar Sesión
          </button>
          <button
            onClick={() => { setIsLogin(false); setError('') }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${!isLogin ? 'bg-orange-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
          >
            Registrarse
          </button>
        </div>

        {/* Forms */}
        {isLogin ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Correo Electrónico</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="email"
                  required
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-surface-900/60 border border-surface-500 focus:border-orange-500 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Contraseña</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-surface-900/60 border border-surface-500 focus:border-orange-500 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 bg-gradient-to-r from-orange-600 to-red-500 hover:from-orange-500 hover:to-red-400 text-white font-semibold text-xs rounded-xl shadow-lg shadow-orange-950/20 transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  Ingresar <ChevronRight size={14} />
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-3.5 max-h-[380px] overflow-y-auto pr-1 select-none">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nombres</label>
                <input
                  type="text"
                  required
                  placeholder="Nombres"
                  value={nombres}
                  onChange={e => setNombres(e.target.value)}
                  className="w-full bg-surface-900/60 border border-surface-500 focus:border-orange-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none transition-colors"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Apellidos</label>
                <input
                  type="text"
                  required
                  placeholder="Apellidos"
                  value={apellidos}
                  onChange={e => setApellidos(e.target.value)}
                  className="w-full bg-surface-900/60 border border-surface-500 focus:border-orange-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Correo</label>
              <input
                type="email"
                required
                placeholder="correo@ejemplo.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-surface-900/60 border border-surface-500 focus:border-orange-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Usuario</label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  required
                  placeholder="Nombre de usuario"
                  value={usuario}
                  onChange={e => setUsuario(e.target.value)}
                  className="w-full bg-surface-900/60 border border-surface-500 focus:border-orange-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-600 outline-none transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tipo de uso</label>
              <select
                value={tipoUso}
                onChange={e => setTipoUso(e.target.value)}
                className="w-full bg-surface-900 border border-surface-500 focus:border-orange-500 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none transition-colors"
              >
                <option>Personal</option>
                <option>Profesional</option>
                <option>Educativo</option>
                <option>Empresarial</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Contraseña</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-surface-900/60 border border-surface-500 focus:border-orange-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none transition-colors"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Repetir</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full bg-surface-900/60 border border-surface-500 focus:border-orange-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-3 py-3 bg-gradient-to-r from-orange-600 to-red-500 hover:from-orange-500 hover:to-red-400 text-white font-semibold text-xs rounded-xl shadow-lg shadow-orange-950/20 transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  Crear Cuenta <ChevronRight size={14} />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
