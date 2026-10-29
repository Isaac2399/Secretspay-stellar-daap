import { NavLink } from 'react-router-dom'
import { GlassWater, Home, UserRound } from 'lucide-react'
import { useAuth } from '@/lib/auth/AuthContext'
import { isEventStaffRole } from '@/lib/auth/roles'
import { displayNameFromEmail } from '@/lib/userDisplay'

const consumerItems = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/event', label: 'Evento', icon: GlassWater, end: false },
  { to: '/profile', label: 'Perfil', icon: UserRound, end: false },
] as const

const staffItems = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/profile', label: 'Perfil', icon: UserRound, end: false },
] as const

function useNavItems() {
  const { user } = useAuth()
  return user && isEventStaffRole(user.role) ? staffItems : consumerItems
}

export function BottomNav() {
  const items = useNavItems()
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-black/90 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around px-2 pt-1 sm:max-w-lg">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl px-1 py-2 text-[10px] font-medium transition-colors sm:text-xs ${
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

export function SideNav() {
  const { user } = useAuth()
  const items = useNavItems()
  return (
    <nav className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-white/5 bg-black/85 px-4 py-6 backdrop-blur-md lg:flex">
      <p className="px-3 text-lg font-semibold tracking-tight text-app-accent">Stellar Pay</p>
      <div className="mt-8 grid gap-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-white/10 text-app-accent'
                  : 'text-white/70 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className="h-5 w-5 shrink-0" strokeWidth={isActive ? 2.4 : 1.8} />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </div>
      {user ? (
        <div className="mt-auto min-w-0 rounded-2xl bg-app-card px-3 py-3">
          <p className="truncate text-sm font-medium">{displayNameFromEmail(user.email)}</p>
          <p className="truncate text-xs text-app-muted">{user.email}</p>
        </div>
      ) : null}
    </nav>
  )
}
