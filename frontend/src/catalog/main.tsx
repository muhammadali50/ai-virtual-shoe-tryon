import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import catalog from 'virtual:logo-formal-catalog'
import '@fontsource-variable/oswald/wght.css'
import CatalogPage from './CatalogPage'
import './catalog.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode><CatalogPage catalog={catalog} /></StrictMode>,
)
