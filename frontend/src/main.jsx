import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { registerOfflineWorker } from './lib/registerOfflineWorker'

// A data router (rather than <BrowserRouter>) so pages can block navigation
// while there are unsaved edits - see lib/useUnsavedChangesGuard. One splat
// route renders the whole app, so the page routes inside it are unchanged.
const router = createBrowserRouter([{ path: '*', element: <App /> }])

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)

registerOfflineWorker()
