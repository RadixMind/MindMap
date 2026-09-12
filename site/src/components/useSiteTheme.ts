import { useEffect, useState } from 'react'

export type SiteTheme = 'auto' | 'light' | 'dark'

export const SITE_THEME_CHANGE_EVENT = 'open-mindmap:theme-change'

function readSiteTheme(): SiteTheme {
  if (typeof document === 'undefined') return 'auto'
  const value = document.documentElement.dataset.theme
  return value === 'light' || value === 'dark' ? value : 'auto'
}

export function useSiteTheme(): SiteTheme {
  const [theme, setTheme] = useState<SiteTheme>('auto')

  useEffect(() => {
    const root = document.documentElement
    const syncTheme = () => setTheme(readSiteTheme())
    const observer = new MutationObserver(syncTheme)

    syncTheme()
    window.addEventListener(SITE_THEME_CHANGE_EVENT, syncTheme)
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })

    return () => {
      window.removeEventListener(SITE_THEME_CHANGE_EVENT, syncTheme)
      observer.disconnect()
    }
  }, [])

  return theme
}
