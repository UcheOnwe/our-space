import { LoginForm } from '../features/auth/LoginForm'

export function LoginPage({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  return <LoginForm onSwitchToRegister={onSwitchToRegister} />
}
