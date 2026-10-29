import { Outlet, useLocation } from 'react-router-dom'
import { GuestDemoBanner } from '@/components/guestDemo/GuestDemoBanner'
import { BottomNav, SideNav } from '@/components/navigation/BottomNav'
import { useAuth } from '@/lib/auth/AuthContext'

export function AppShell() {
  const { user, isGuestDemo } = useAuth()
  const location = useLocation()

  if (!user) {
    return null
  }

  return (
    <div className="min-h-dvh bg-transparent text-white">
      {isGuestDemo ? <GuestDemoBanner /> : null}
      <SideNav />
      <div className="flex min-h-dvh flex-col lg:pl-60">
        <main
          className="app-scroll app-surface mx-auto w-full max-w-md flex-1 px-4 pb-28 min-[380px]:px-5 sm:max-w-2xl sm:px-6 lg:max-w-5xl lg:px-10 lg:pb-12"
          style={{
            paddingTop: isGuestDemo
              ? 'max(4.75rem, calc(env(safe-area-inset-top) + 3.5rem))'
              : 'max(1rem, env(safe-area-inset-top))',
          }}
        >
          <div key={location.pathname} className="app-page lg:pt-6">
            <Outlet />
          </div>
        </main>
        <BottomNav />
      </div>
    </div>
  )
}
