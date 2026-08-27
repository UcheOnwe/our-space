import { AuthProvider } from '../features/auth/AuthContext'
import { AuthGate } from './AuthGate'

export function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  )
}
