import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { CommandPalette } from '../ui/command-palette'

describe('CommandPalette', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<CommandPalette open={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders when open', () => {
    render(<CommandPalette open={true} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('filters shortcuts when typing', () => {
    render(<CommandPalette open={true} />)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'Home' } })
    expect(screen.getByText(/Go to Home/)).toBeInTheDocument()
  })

  it('closes on Escape key', () => {
    const onOpenChange = jest.fn()
    render(<CommandPalette open={true} onOpenChange={onOpenChange} />)
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows "No results found" when query matches nothing', () => {
    render(<CommandPalette open={true} />)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'zzzznonexistent' } })
    expect(screen.getByText('No results found')).toBeInTheDocument()
  })
})
