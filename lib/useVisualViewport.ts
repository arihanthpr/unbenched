'use client'

import { useEffect, useState } from 'react'

/**
 * Keeps a fixed-position chat shell locked to the *visual* viewport.
 *
 * iOS Safari does not resize the layout viewport when the keyboard opens, it
 * shrinks the visual viewport and scrolls the layout viewport underneath it.
 * A `position: fixed; bottom: 0` element is therefore positioned against a
 * viewport that still believes it is full height, so it ends up behind the
 * keyboard (or drifts as the page scrolls). The VisualViewport API is the only
 * reliable source of truth for where the visible area actually is.
 *
 * Publishes three custom properties on <html>:
 *   --vvh      height of the visible area
 *   --vv-top   how far the visual viewport has been pushed down
 *   --kb       current keyboard height (0 when closed)
 *
 * …plus data-kb="open|closed", so CSS can react to the keyboard without React
 * re-rendering on every viewport event.
 *
 * Returns { keyboardOpen } for the bits of behaviour that genuinely need to be
 * driven from JS (e.g. un-collapsing the input bar when the keyboard appears).
 */

// Below this the difference is browser chrome (URL bar hide/show), not a keyboard.
const KEYBOARD_MIN_PX = 120

export function useVisualViewport(enabled = true): { keyboardOpen: boolean } {
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    const root = document.documentElement
    const vv = window.visualViewport

    const apply = () => {
      // Fall back to the layout viewport on browsers without VisualViewport.
      const height = vv?.height ?? window.innerHeight
      const offsetTop = vv?.offsetTop ?? 0
      // window.innerHeight stays at full height on iOS while the keyboard is up,
      // so the difference between the two is the keyboard.
      const kb = Math.max(0, Math.round(window.innerHeight - height - offsetTop))
      const open = kb > KEYBOARD_MIN_PX

      root.style.setProperty('--vvh', `${height}px`)
      root.style.setProperty('--vv-top', `${offsetTop}px`)
      root.style.setProperty('--kb', `${open ? kb : 0}px`)
      root.dataset.kb = open ? 'open' : 'closed'
      setKeyboardOpen((prev) => (prev === open ? prev : open))
    }

    apply()

    // 'scroll' matters as much as 'resize': iOS fires it as the visual viewport
    // slides under the keyboard, and without it the shell drifts out of place.
    vv?.addEventListener('resize', apply)
    vv?.addEventListener('scroll', apply)
    window.addEventListener('orientationchange', apply)

    return () => {
      vv?.removeEventListener('resize', apply)
      vv?.removeEventListener('scroll', apply)
      window.removeEventListener('orientationchange', apply)
      root.style.removeProperty('--vvh')
      root.style.removeProperty('--vv-top')
      root.style.removeProperty('--kb')
      delete root.dataset.kb
    }
  }, [enabled])

  return { keyboardOpen }
}

/**
 * Everything a `.chat-shell` surface needs, in one call.
 *
 * `.chat-shell` is `position: fixed; top: var(--vv-top); height: var(--vvh)` on
 * mobile, so it is only correct while something is publishing those variables.
 * That coupling used to be invisible: each ROUTE remembered to call
 * useVisualViewport() and to add body.chat-open itself, and `/groups`, which
 * renders the same shell and owns the search field in its header, never did.
 * The variables fell back to `top: 0; height: 100dvh` against the LAYOUT
 * viewport, which iOS scrolls out from under the keyboard, so focusing search
 * made the whole shell drift. Nothing was wrong with the search bar itself.
 *
 * Binding the behaviour to the shell rather than to each route is what stops the
 * two surfaces drifting apart again.
 *
 * `lockScroll` is refcounted because more than one shell can legitimately be
 * mounted at once (a layout plus its child page); without it the first unmount
 * would strip body.chat-open while another shell still needed it.
 */
let scrollLocks = 0

export function useChatShell({ lockScroll = true }: { lockScroll?: boolean } = {}) {
  const result = useVisualViewport()

  useEffect(() => {
    if (!lockScroll) return
    scrollLocks += 1
    document.body.classList.add('chat-open')
    return () => {
      scrollLocks = Math.max(0, scrollLocks - 1)
      if (scrollLocks === 0) document.body.classList.remove('chat-open')
    }
  }, [lockScroll])

  return result
}
