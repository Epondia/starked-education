import { useEffect, useRef, useCallback } from 'react'
import { getEnabledKeys, type Shortcut } from '@/lib/shortcutRegistry'

type KeyHandler = (event: KeyboardEvent) => void

interface ShortcutHandler {
  keys: string
  handler: KeyHandler
  ignoreWhenInput?: boolean
  isGlobal?: boolean
}

const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

function isInputFocused(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  if (INPUT_TAGS.has(target.tagName)) return true
  return target.isContentEditable
}

function matchKeys(event: KeyboardEvent, keys: string): boolean {
  const parts = keys.split('+')
  let key = event.key
  if (key === ' ') key = 'Space'

  const hasCtrl = parts.includes('Ctrl')
  const hasCmd = parts.includes('Cmd')
  const hasShift = parts.includes('Shift')
  const hasAlt = parts.includes('Alt')
  const mainKey = parts[parts.length - 1]

  const modMatch =
    (!hasCtrl || event.ctrlKey) &&
    (!hasCmd || event.metaKey) &&
    (!hasShift || event.shiftKey) &&
    (!hasAlt || event.altKey)

  return modMatch && key === mainKey
}

export function useKeyboardShortcuts(shortcuts: ShortcutHandler[]) {
  const shortcutsRef = useRef(shortcuts)
  shortcutsRef.current = shortcuts

  useEffect(() => {
    const buffer: string[] = []
    let bufferTimer: ReturnType<typeof setTimeout> | null = null

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!getEnabledKeys()) return

      const target = event.target
      const inInput = isInputFocused(target)

      for (const sc of shortcutsRef.current) {
        if (sc.keys.includes(' ')) {
          const seqKeys = sc.keys.split(' ')
          buffer.push(event.key.toLowerCase())

          if (bufferTimer) clearTimeout(bufferTimer)
          bufferTimer = setTimeout(() => {
            buffer.length = 0
          }, 1000)

          if (buffer.length > seqKeys.length) buffer.shift()
          if (
            buffer.length === seqKeys.length &&
            buffer.every((k, i) => k === seqKeys[i].toLowerCase())
          ) {
            buffer.length = 0
            if (bufferTimer) clearTimeout(bufferTimer)
            event.preventDefault()
            sc.handler(event)
          }
          return
        }

        if (inInput && sc.ignoreWhenInput !== false) continue

        if (matchKeys(event, sc.keys)) {
          event.preventDefault()
          sc.handler(event)
          return
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])
}

export function useCommandPaletteShortcuts(
  isOpen: boolean,
  shortcuts: Shortcut[],
  onSelect: (shortcut: Shortcut) => void,
) {
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!isOpen) return

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        return
      }

      if (event.key === 'Enter' && shortcuts.length > 0) {
        event.preventDefault()
        onSelectRef.current(shortcuts[0])
      }
    },
    [isOpen, shortcuts],
  )

  useEffect(() => {
    if (!isOpen) return
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleKeyDown])
}
