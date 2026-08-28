import { ChooseAction } from '../features/couples/ChooseAction'

export function ChooseActionPage({ onChooseJoin }: { onChooseJoin: () => void }) {
  return <ChooseAction onChooseJoin={onChooseJoin} />
}
