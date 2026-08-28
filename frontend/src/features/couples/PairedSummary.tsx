import { useCouple } from './CoupleContext'

/** Minimal Couple Home placeholder confirming the paired state for Vertical Slice 2. */
export function PairedSummary() {
  const { couple } = useCouple()

  if (!couple) {
    return null
  }

  return (
    <section>
      <h2>You're paired!</h2>
      <p>Members: {couple.members.map((member) => member.username).join(' & ')}</p>
    </section>
  )
}
