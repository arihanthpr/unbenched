'use client'

/**
 * Crash-proof wrappers around localStorage / sessionStorage.
 *
 * Touching either store is not guaranteed to work in a browser. iOS Safari
 * throws SecurityError on *any* access, including a plain getItem, when
 * "Block All Cookies" is enabled, and under some Lockdown Mode configurations.
 * Storage can also throw QuotaExceededError when full, which on Safari happens
 * at a much smaller budget than on Chrome.
 *
 * Every one of those throws used to propagate out of a component effect, and
 * with no error boundary above it React unmounted the whole tree, a blank page
 * with no way back. These helpers swallow the failure instead: reads return
 * null, writes no-op. Losing a cached preference is always preferable to losing
 * the app.
 *
 * Prefer these over direct storage access anywhere in the codebase.
 */

type Store = 'local' | 'session'

function store(kind: Store): Storage | null {
  try {
    // The property access itself can throw, so it has to be inside the try.
    return kind === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

function read(kind: Store, key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return store(kind)?.getItem(key) ?? null
  } catch {
    return null
  }
}

function write(kind: Store, key: string, value: string): boolean {
  if (typeof window === 'undefined') return false
  // Resolve the store explicitly rather than optional-chaining the call: when
  // storage is unavailable `store()` returns null, and `null?.setItem()` would
  // silently no-op and still let this report success.
  const s = store(kind)
  if (!s) return false
  try {
    s.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function drop(kind: Store, key: string): void {
  if (typeof window === 'undefined') return
  try {
    store(kind)?.removeItem(key)
  } catch {
    /* no-op */
  }
}

export const safeLocal = {
  /** The stored string, or null if missing or storage is unavailable. */
  get: (key: string) => read('local', key),
  /** True if the write landed; false if storage is unavailable or full. */
  set: (key: string, value: string) => write('local', key, value),
  remove: (key: string) => drop('local', key),
}

export const safeSession = {
  get: (key: string) => read('session', key),
  set: (key: string, value: string) => write('session', key, value),
  remove: (key: string) => drop('session', key),
}

/** JSON convenience for the local store, returns null on missing or malformed data. */
export const safeLocalJson = {
  get<T>(key: string): T | null {
    const raw = read('local', key)
    if (raw === null) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  },
  set(key: string, value: unknown): boolean {
    try {
      return write('local', key, JSON.stringify(value))
    } catch {
      return false
    }
  },
}
