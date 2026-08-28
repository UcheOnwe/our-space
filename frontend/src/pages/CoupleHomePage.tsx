import { AccountSummary } from '../features/auth/AccountSummary'
import { PairedSummary } from '../features/couples/PairedSummary'

export function CoupleHomePage() {
  return (
    <>
      <AccountSummary />
      <PairedSummary />
    </>
  )
}
