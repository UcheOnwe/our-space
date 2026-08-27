import { RegisterForm } from '../features/auth/RegisterForm'

export function RegisterPage({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  return <RegisterForm onSwitchToLogin={onSwitchToLogin} />
}
