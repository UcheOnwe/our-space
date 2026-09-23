import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CreatorSection } from '../CreatorSection'

describe('CreatorSection', () => {
  it('identifies the creator by name, with the two real confirmed mailto contacts and no photograph/GitHub/LinkedIn', () => {
    const { container } = render(<CreatorSection />)

    expect(screen.getByText('Built by Uche Onwe')).toBeInTheDocument()

    // Each address is both labeled (so the destination reads as understood,
    // not an unexplained link) and clickable via its own mailto address.
    expect(screen.getByText('Our Space feedback & ideas')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ourspaceuch@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:ourspaceuch@gmail.com',
    )
    expect(screen.getByText('Professional / recruiter inquiries')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'uche0to100developer@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:uche0to100developer@gmail.com',
    )

    expect(container.querySelector('img')).not.toBeInTheDocument()
    const links = Array.from(container.querySelectorAll('a'))
    expect(links.some((a) => /github|linkedin/i.test(a.href))).toBe(false)
  })
})
