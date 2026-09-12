import { useEffect, useMemo, useState } from 'react'
import { detectLocale, resolveMessages, type MindMapMessages } from './messages'

export function useMessages(locale?: string, overrides?: Partial<MindMapMessages>): MindMapMessages {
  const [detected, setDetected] = useState('en-US')
  useEffect(() => {
    if (!locale) queueMicrotask(() => setDetected(detectLocale()))
  }, [locale])
  return useMemo(() => resolveMessages(locale ?? detected, overrides), [locale, detected, overrides])
}
