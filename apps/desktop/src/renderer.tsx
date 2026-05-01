import { createRoot } from 'react-dom/client'
import { createHashHistory } from '@tanstack/react-router'
import { Main } from '../../../packages/front/src/main'

const hashHistory = createHashHistory()
const root = createRoot(document.getElementById('root')!)
root.render(<Main history={hashHistory} />)
