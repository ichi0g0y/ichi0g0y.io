import { useEffect, useState } from 'react'

import { APP_LOCALE_STORAGE_KEY, APP_THEME_STORAGE_KEY, UI_LABELS } from '../constants'
import type { AppLocale } from '../types'

export type AppLocalePreference = AppLocale | 'system'
export type AppTheme = 'light' | 'dark'
export type AppThemePreference = AppTheme | 'system'

function detectSystemLocale(): AppLocale {
  if (typeof window === 'undefined') {
    return 'ja'
  }
  return window.navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en'
}

function detectSystemTheme(): AppTheme {
  if (typeof window === 'undefined') {
    return 'light'
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme() {
  const [languagePreference, setLanguagePreference] = useState<AppLocalePreference>(() => {
    if (typeof window === 'undefined') {
      return 'system'
    }
    const stored = window.localStorage.getItem(APP_LOCALE_STORAGE_KEY)
    if (stored === 'system' || stored === 'ja' || stored === 'en') {
      return stored
    }
    return 'system'
  })
  const [themePreference, setThemePreference] = useState<AppThemePreference>(() => {
    if (typeof window === 'undefined') {
      return 'system'
    }
    const stored = window.localStorage.getItem(APP_THEME_STORAGE_KEY)
    if (stored === 'system' || stored === 'light' || stored === 'dark') {
      return stored
    }
    return 'system'
  })
  const [systemLanguage, setSystemLanguage] = useState<AppLocale>(detectSystemLocale)
  const [systemTheme, setSystemTheme] = useState<AppTheme>(detectSystemTheme)
  const activeLanguage = languagePreference === 'system' ? systemLanguage : languagePreference
  const activeTheme = themePreference === 'system' ? systemTheme : themePreference
  const labels = UI_LABELS[activeLanguage]

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, languagePreference)
  }, [languagePreference])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, themePreference)
    window.document.body.dataset.theme = activeTheme
    window.document.documentElement.dataset.theme = activeTheme
  }, [activeTheme, themePreference])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const handleLanguageChange = () => {
      setSystemLanguage(detectSystemLocale())
    }
    window.addEventListener('languagechange', handleLanguageChange)
    return () => {
      window.removeEventListener('languagechange', handleLanguageChange)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleThemeChange = () => {
      setSystemTheme(mediaQuery.matches ? 'dark' : 'light')
    }
    handleThemeChange()
    mediaQuery.addEventListener('change', handleThemeChange)
    return () => {
      mediaQuery.removeEventListener('change', handleThemeChange)
    }
  }, [])

  return {
    languagePreference,
    setLanguagePreference,
    themePreference,
    setThemePreference,
    activeLanguage,
    activeTheme,
    labels,
  }
}
