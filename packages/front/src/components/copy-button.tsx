import { Button } from '@repo/ui'
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

import { copyText } from '#front/pages/capture/model/copy-text'

/** Icon button that copies `value` and briefly confirms with a check mark. */
export function CopyButton({
    value,
    label,
    className,
}: {
    value: string
    /** What is copied, e.g. "capture ID"; used for the accessible name. */
    label: string
    className?: string
}) {
    const [copied, setCopied] = useState(false)

    return (
        <Button
            size="icon-xs"
            variant="ghost"
            aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
            title={copied ? 'Copied' : `Copy ${label}`}
            className={className}
            onClick={() => {
                void copyText(value).then((ok) => {
                    if (!ok) return
                    setCopied(true)
                    window.setTimeout(() => setCopied(false), 1_500)
                })
            }}
        >
            {copied ? <Check /> : <Copy />}
        </Button>
    )
}
