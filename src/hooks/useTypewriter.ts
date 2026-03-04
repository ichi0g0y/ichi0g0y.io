import { useEffect, useState } from 'react'

import { BASE_TYPE_SPEED_MS, PUNCTUATION_PAUSE_MS, TYPE_SPEED_RANDOM_MS, TYPE_START_DELAY_MS } from '../constants'

export function useTypewriter(introChars: string[]) {
  const [typedChars, setTypedChars] = useState<string[]>([])
  const [prevIntroChars, setPrevIntroChars] = useState(introChars)

  // レンダー中の状態調整パターン（React推奨）でintroChars変更時にリセット
  if (prevIntroChars !== introChars) {
    setPrevIntroChars(introChars)
    setTypedChars([])
  }

  useEffect(() => {
    let nextTypeTimer: ReturnType<typeof setTimeout> | null = null

    const typeStartTimer = setTimeout(() => {
      let index = 0

      const typeNext = () => {
        const nextChar = introChars[index]
        setTypedChars((previous) => [...previous, nextChar])
        index += 1

        if (index >= introChars.length) {
          return
        }

        const isPunctuation = /[、。,.!?]/.test(nextChar)
        const jitter = Math.floor(Math.random() * TYPE_SPEED_RANDOM_MS)
        const delay = BASE_TYPE_SPEED_MS + jitter + (isPunctuation ? PUNCTUATION_PAUSE_MS : 0)
        nextTypeTimer = setTimeout(typeNext, delay)
      }

      typeNext()
    }, TYPE_START_DELAY_MS)

    return () => {
      clearTimeout(typeStartTimer)
      if (nextTypeTimer) {
        clearTimeout(nextTypeTimer)
      }
    }
  }, [introChars])

  return typedChars
}
