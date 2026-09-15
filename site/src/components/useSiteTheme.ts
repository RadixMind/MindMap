import { useSyncExternalStore } from 'react'

type SiteTheme = 'light' | 'dark'
const QUERY = '(prefers-color-scheme: dark)'

function readTheme(): SiteTheme {
  return window.matchMedia?.(QUERY).matches ? 'dark' : 'light'
}

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia?.(QUERY)
  media?.addEventListener?.('change', onChange)
  return () => media?.removeEventListener?.('change', onChange)
}

export function useSiteTheme(): SiteTheme {
  return useSyncExternalStore(subscribe, readTheme, () => 'light')
}
