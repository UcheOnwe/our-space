import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BrowserCompanionSection } from '../BrowserCompanionSection'

describe('BrowserCompanionSection', () => {
  it('never claims the extension is publicly available — no "Add to Chrome" button, no Chrome Web Store claim', () => {
    render(<BrowserCompanionSection />)
    expect(screen.queryByText(/add to chrome/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/chrome web store/i)).not.toBeInTheDocument()
    expect(screen.getByText('Coming to your browser')).toBeInTheDocument()
  })

  it('is explicit that this is an early proof of concept, not available to everyone', () => {
    render(<BrowserCompanionSection />)
    expect(screen.getByText(/proof of concept/i)).toBeInTheDocument()
    expect(screen.getByText(/not yet available to everyone/i)).toBeInTheDocument()
  })
})
