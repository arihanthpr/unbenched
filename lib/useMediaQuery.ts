'use client'

import { useEffect, useState } from 'react'

/**
 * A media query, read in an effect, the same way InstallBanner and
 * PushPromptModal already read theirs.
 *
 * Returns `null` until the first effect runs, which is the point: the server
 * cannot know the viewport, so anything that must not exist on the wrong device
 * has to wait rather than guess. Callers render their cheaper branch while the
 * answer is null.
 *
 * This is deliberately not `useState(() => window.matchMedia(...).matches)`.
 * That form reads correctly on the client's first render but disagrees with the
 * server's, and the mismatch is exactly the hydration hazard that has already
 * cost this page one bug, the reduced-motion reveal that stranded a
 * server-rendered `opacity: 0` on the node.
 */
export function useMediaQuery(query: string): boolean | null {
  const [matches, setMatches] = useState<boolean | null>(null)

  useEffect(() => {
    const mq = window.matchMedia(query)
    const apply = () => setMatches(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [query])

  return matches
}

/** Tailwind's `md` breakpoint, so the JS and the CSS agree on where it is. */
export const MD = '(min-width: 768px)'

/**
 * Where AccordionGallery switches to its stacked layout. Mirrors the 520px
 * media query in components/AccordionGallery.css, the two must not drift, or
 * the gallery gets the stacked styling with the hover trigger still attached.
 */
export const AG_STACKED = '(max-width: 520px)'
