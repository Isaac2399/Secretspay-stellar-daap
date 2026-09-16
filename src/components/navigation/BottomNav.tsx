import { NavLink } from 'react-router-dom'
import { CreditCard, Home, Landmark, Map, UserRound } from 'lucide-react'
import { useAuth } from '@/lib/auth/AuthContext'
import { isEventStaffRole } from '@/lib/auth/roles'

const consumerItems = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/card', label: 'Tarjeta', icon: CreditCard, end: false },
  { to: '/map', label: 'Mapa', icon: Map, end: false },
  { to: '/rwa', label: 'RWA', icon: Landmark, end: false },
  { to: '/profile', label: 'Perfil', icon: UserRound, end: false },
] as const

const staffItems = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/profile', label: 'Perfil', icon: UserRound, end: false },
] as const

export function BottomNav() {
  const { user } = useAuth()
  const items = user && isEventStaffRole(user.role) ? staffItems : consumerItems
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-black/90 backdrop-blur-md"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around px-2 pt-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl px-1 py-2 text-[10px] font-medium transition-colors ${
                isActive
                  ? 'bg-white/10 text-app-accent'
                  : 'text-white/70 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={`h-5 w-5 ${isActive ? 'text-app-accent' : ''}`}
                  strokeWidth={isActive ? 2.4 : 1.8}
                />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
