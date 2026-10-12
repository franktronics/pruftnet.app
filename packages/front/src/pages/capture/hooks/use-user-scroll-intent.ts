import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react'

// Wheel momentum and key repeat emit scroll events shortly after the input that caused them.
const USER_SCROLL_INTENT_MS = 250
const SCROLL_KEYS = new Set(['PageDown', 'PageUp', ' '])

/**
 * Tells whether the current scroll of an element was caused by the user (wheel, touch, scrollbar
 * drag, paging keys) rather than by a programmatic `scrollTo`.
 */
export function useUserScrollIntent(scrollRef: RefObject<HTMLElement | null>) {
    const intentUntil = useRef(0)
    const pointerDown = useRef(false)
    useLayoutEffect(() => {
        const element = scrollRef.current
        if (!element) return
        const mark = () => {
            intentUntil.current = performance.now() + USER_SCROLL_INTENT_MS
        }
        const keydown = (event: KeyboardEvent) => {
            if (SCROLL_KEYS.has(event.key)) mark()
        }
        const press = () => {
            pointerDown.current = true
        }
        const release = () => {
            if (!pointerDown.current) return
            pointerDown.current = false
            mark()
        }
        element.addEventListener('wheel', mark, { passive: true })
        element.addEventListener('touchmove', mark, { passive: true })
        element.addEventListener('keydown', keydown)
        element.addEventListener('pointerdown', press)
        window.addEventListener('pointerup', release)
        window.addEventListener('pointercancel', release)
        return () => {
            element.removeEventListener('wheel', mark)
            element.removeEventListener('touchmove', mark)
            element.removeEventListener('keydown', keydown)
            element.removeEventListener('pointerdown', press)
            window.removeEventListener('pointerup', release)
            window.removeEventListener('pointercancel', release)
        }
    }, [scrollRef])
    return useCallback(() => pointerDown.current || performance.now() < intentUntil.current, [])
}
