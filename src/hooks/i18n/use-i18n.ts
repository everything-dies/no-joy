import { useMemo } from 'react'
import { useIntl } from 'react-intl'

import { flatten, unflatten } from './flatten'

type NestedMessages = { [key: string]: string | NestedMessages }
type TranslationLoader = () => Promise<{ default: Record<string, string> }>
type TranslationMap = Record<string, TranslationLoader>

// Module-level cache: locale+namespace → resolved flat messages
const translationCache = new Map<string, Record<string, string>>()

// Module-level pending promises for Suspense integration
const pendingLoads = new Map<string, Promise<void>>()

function resolveLocaleLoader(
  translations: TranslationMap,
  locale: string
): TranslationLoader | undefined {
  // Try exact match first (e.g., "./i18n/pt-BR.json")
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
  const loader = resolveLocaleLoader(translations, locale)

  if (loader && !translationCache.has(cacheKey)) {
    // Check if already loading
    const pending = pendingLoads.get(cacheKey)
    if (pending) {
      throw pending
    }
    // Start loading and throw for Suspense
    const promise = loader()
      .then((mod) => {
        translationCache.set(cacheKey, mod.default)
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
    const localeOverrides = translationCache.get(cacheKey) ?? {}
    const merged = { ...defaults, ...localeOverrides }

    const formatted: Record<string, string> = {}
    for (const key of Object.keys(merged)) {
      const id = `${namespace}/${key}`
      const defaultMessage = merged[key] ?? ''
      formatted[key] = intl.formatMessage({ id, defaultMessage })
    }

    return unflatten(formatted)
  }, [defaults, cacheKey, intl, namespace])

  return resolved as T
}
