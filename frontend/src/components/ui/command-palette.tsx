'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Search, Command } from 'lucide-react'
import { getShortcuts, type Shortcut } from '@/lib/shortcutRegistry'
import { cn } from '@/lib/utils'

interface CommandPaletteProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function CommandPalette({ open: controlledOpen, onOpenChange }: CommandPaletteProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const isOpen = controlledOpen ?? internalOpen

  const setOpen = useCallback(
    (v: boolean) => {
      if (onOpenChange) onOpenChange(v)
      else setInternalOpen(v)
    },
    [onOpenChange],
  )

  const allShortcuts = useMemo(() => getShortcuts(), [])

  const filtered = useMemo(() => {
    if (!query) return allShortcuts
    const q = query.toLowerCase()
    return allShortcuts.filter(
      (s) =>
        s.description.toLowerCase().includes(q) ||
        s.keys.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q),
    )
  }, [query, allShortcuts])

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(!isOpen)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, setOpen])

  useEffect(() => {
    if (!isOpen || filtered.length === 0) return
    if (selectedIndex >= filtered.length) setSelectedIndex(0)
  }, [filtered, selectedIndex, isOpen])

  const execute = useCallback(
    (shortcut: Shortcut) => {
      shortcut.action()
      setOpen(false)
    },
    [setOpen],
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % Math.max(filtered.length, 1))
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + Math.max(filtered.length, 1)) % Math.max(filtered.length, 1))
      return
    }

    if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault()
      execute(filtered[selectedIndex])
    }
  }

  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[selectedIndex] as HTMLElement | undefined
      if (typeof item?.scrollIntoView === 'function') {
        item.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <div
        className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search size={18} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={selectedIndex >= 0 ? `cmd-item-${selectedIndex}` : undefined}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent border-none outline-none text-sm text-gray-900 placeholder-gray-400"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 bg-gray-100 rounded">
            <Command size={10} />
            K
          </kbd>
        </div>

        <div
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          className="max-h-72 overflow-y-auto py-2"
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              No results found
            </div>
          ) : (
            filtered.map((shortcut, idx) => (
              <button
                key={shortcut.keys + shortcut.description}
                id={`cmd-item-${idx}`}
                role="option"
                aria-selected={idx === selectedIndex}
                className={cn(
                  'w-full flex items-center justify-between px-4 py-2 text-sm text-left transition-colors',
                  idx === selectedIndex
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-50',
                )}
                onClick={() => execute(shortcut)}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <span className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-5">{getCategoryIcon(shortcut.category)}</span>
                  <span>{shortcut.description}</span>
                </span>
                <kbd className="text-[11px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                  {shortcut.keys}
                </kbd>
              </button>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-100 bg-gray-50 text-[11px] text-gray-400">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-200 rounded text-[10px]">↑↓</kbd> Navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-200 rounded text-[10px]">↵</kbd> Select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-gray-200 rounded text-[10px]">Esc</kbd> Close
          </span>
        </div>
      </div>
    </div>
  )
}

function getCategoryIcon(category: string): string {
  switch (category) {
    case 'Navigation':
      return '↗'
    case 'Actions':
      return '⚡'
    case 'Search':
      return '🔍'
    default:
      return '·'
  }
}
