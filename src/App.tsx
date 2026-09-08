import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@/lib/auth/AuthContext'
import { RwaProvider } from '@/lib/rwa/RwaContext'
import { AppRoutes } from '@/routes/AppRoutes'

export default function App() {
  return (
    <AuthProvider>
      <RwaProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </RwaProvider>
    </AuthProvider>
  )
}
