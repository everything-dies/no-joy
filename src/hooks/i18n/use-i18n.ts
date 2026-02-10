import { useMemo } from 'react'
import { useIntl } from 'react-intl'

import { flatten, unflatten } from './flatten'

type NestedMessages = { [key: string]: string | NestedMessages }

// path → asset URL (from import.meta.glob with ?url)
type TranslationMap = Record<string, string>

// Module-level cache: locale+namespace → resolved flat messages
const translationCache = new Map<string, Record<string, string>>()

// Module-level pending promises for Suspense integration
const pendingLoads = new Map<string, Promise<void>>()

function resolveLocaleUrl(
  translations: TranslationMap,
  locale: string
): string | undefined {
  // Try exact match first (e.g., "/src/.../i18n/pt-BR.json" → url)
  for (const key of Object.keys(translations)) {
    if (key.endsWith(`/${locale}.json`)) {
      return translations[key]
    }
  }
  // Try language-only fallback (e.g., "pt" from "pt-BR")
  const language = locale.split('-')[0]
  if (language && language !== locale) {
    for (const key of Object.keys(translations)) {
      if (key.endsWith(`/${language}.json`)) {
        return translations[key]
      }
    }
  }
  return undefined
}

export function useI18n<T extends NestedMessages>(
  defaultsFactory: () => T,
  namespace: string,
  translations: TranslationMap
): T {
  const intl = useIntl()
  const locale = intl.locale

  const defaults = useMemo(() => flatten(defaultsFactory()), [defaultsFactory])

  // Load translations for current locale (Suspense integration)
  const cacheKey = `${locale}:${namespace}`
  const url = resolveLocaleUrl(translations, locale)

  if (url && !translationCache.has(cacheKey)) {
    // Check if already loading
    const pending = pendingLoads.get(cacheKey)
    if (pending) {
      throw pending
    }
    // Fetch raw JSON and throw for Suspense
    const promise = fetch(url)
      .then((res) => res.json() as Promise<Record<string, string>>)
      .then((json) => {
        translationCache.set(cacheKey, json)
        pendingLoads.delete(cacheKey)
      })
      .catch(() => {
        // On failure, cache empty to avoid infinite Suspense loop
        translationCache.set(cacheKey, {})
        pendingLoads.delete(cacheKey)
      })
    pendingLoads.set(cacheKey, promise)
    throw promise
  }

  const resolved = useMemo(() => {
    const cached = translationCache.get(cacheKey) ?? {}
    // Strip namespace prefix from loaded keys (JSON uses namespaced keys)
    const nsPrefix = `${namespace}/`
    const localeOverrides: Record<string, string> = {}
    for (const [key, value] of Object.entries(cached)) {
      localeOverrides[
        key.startsWith(nsPrefix) ? key.slice(nsPrefix.length) : key
      ] = value
    }
    return unflatten({ ...defaults, ...localeOverrides })
  }, [defaults, cacheKey, namespace])

  return resolved as T
}
