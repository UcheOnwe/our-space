import { useAuth } from '../auth/AuthContext'
import { useCouple } from '../couples/CoupleContext'
import styles from './PartnerBadge.module.css'

/** Static partner display — live "connected" presence is deliberately out of
 * scope for this slice (see the approved Slice 3 proposal). */
export function PartnerBadge() {
  const { user } = useAuth()
  const { couple } = useCouple()
  const partner = couple?.members.find((member) => member.id !== user?.id)

  return (
    <p className={styles.badge}>
      {partner ? `Watching with ${partner.username}` : "Waiting for your partner to join Our Space"}
    </p>
  )
}
