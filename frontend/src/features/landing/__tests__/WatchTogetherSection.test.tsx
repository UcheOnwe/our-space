import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WatchTogetherSection } from '../WatchTogetherSection'

describe('WatchTogetherSection', () => {
  it('frames the personalized TV example as an example, not the default', () => {
    render(<WatchTogetherSection />)
    expect(screen.getByText(/an example of a personalized space/i)).toBeInTheDocument()
  })
})
