export interface Shortcut {
  keys: string
  description: string
  category: string
  action: () => void
  customKeys?: string
}

export type ShortcutCategory = 'Navigation' | 'Actions' | 'Search'

const listeners: Array<() => void> = []

export function onShortcutsChange(fn: () => void) {
  listeners.push(fn)
  return () => {
    const idx = listeners.indexOf(fn)
    if (idx !== -1) listeners.splice(idx, 1)
  }
}

function notify() {
  listeners.forEach((fn) => fn())
}

const STORAGE_KEY = 'starked-shortcuts'

function loadOverrides(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveOverrides(overrides: Record<string, string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
}

const defaultShortcuts: Shortcut[] = [
  { keys: 'G H', description: 'Go to Home', category: 'Navigation', action: () => {} },
  { keys: 'G C', description: 'Go to Courses', category: 'Navigation', action: () => {} },
  { keys: 'G P', description: 'Go to Profile', category: 'Navigation', action: () => {} },
  { keys: 'N', description: 'New Course', category: 'Actions', action: () => {} },
  { keys: '/', description: 'Focus Search', category: 'Search', action: () => {} },
  { keys: '?', description: 'Show Shortcuts', category: 'Search', action: () => {} },
]

let shortcuts = [...defaultShortcuts]
let overrides = loadOverrides()

export function getShortcuts(): Shortcut[] {
  return shortcuts.map((s) => ({
    ...s,
    customKeys: overrides[s.keys] || undefined,
  }))
}

export function getGlobalShortcuts(): Shortcut[] {
  return shortcuts.filter((s) => !s.keys.includes(' '))
}

export function getCategoryShortcuts(): { category: string; items: Shortcut[] }[] {
  const map: Record<string, Shortcut[]> = {}
  for (const s of shortcuts) {
    if (!map[s.category]) map[s.category] = []
    map[s.category].push(s)
  }
  return Object.entries(map).map(([category, items]) => ({ category, items }))
}

export function getEnabledKeys(): boolean {
  try {
    return localStorage.getItem('starked-shortcuts-enabled') !== 'false'
  } catch {
    return true
  }
}

export function setEnabledKeys(enabled: boolean) {
  localStorage.setItem('starked-shortcuts-enabled', String(enabled))
  notify()
}

export function rebindShortcut(originalKeys: string, newKeys: string) {
  const shortcut = shortcuts.find((s) => s.keys === originalKeys)
  if (!shortcut || !newKeys.trim()) return
  overrides[originalKeys] = newKeys.trim()
  saveOverrides(overrides)
  notify()
}

export function resetShortcut(originalKeys: string) {
  delete overrides[originalKeys]
  saveOverrides(overrides)
  notify()
}

export function resetAllShortcuts() {
  overrides = {}
  localStorage.removeItem(STORAGE_KEY)
  notify()
}

export function resolveKeys(shortcut: Shortcut): string {
  return shortcut.customKeys || shortcut.keys
}
