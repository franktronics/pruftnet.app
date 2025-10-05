import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Main } from '@repo/front'

const rootEl = document.getElementById('root')

createRoot(rootEl as HTMLElement).render(
    <StrictMode>
        <Main />
    </StrictMode>,
)
