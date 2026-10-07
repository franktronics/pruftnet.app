import Lenis from 'lenis'

/** Smooth scrolling plus one-shot section reveals. Both are skipped for reduced-motion users. */
export function startMotion() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    document.documentElement.dataset.motionReady = ''

    new Lenis({ autoRaf: true, lerp: 0.11, anchors: { offset: -72 } })

    const observer = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue
                entry.target.classList.add('is-visible')
                observer.unobserve(entry.target)
            }
        },
        { rootMargin: '0px 0px -12% 0px' },
    )
    for (const element of document.querySelectorAll('[data-reveal]')) observer.observe(element)
}
