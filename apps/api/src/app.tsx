import { createRoot } from 'react-dom/client'
import { Main } from '@repo/front'
import { ReactNode } from 'react'

const root = createRoot(document.body)
root.render((<Main />) as ReactNode)
