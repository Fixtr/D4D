import { useState, useCallback, useEffect } from 'react'

export function useReadBack() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [supported, setSupported] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      setSupported(true)
    }
  }, [])

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!supported || !text) return

    window.speechSynthesis.cancel() // 기존 음성 취소

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'ko-KR'
    utterance.rate = 1.05 // 명확하고 신속한 무전 전달 속도
    utterance.pitch = 0.95

    // 한국어 목소리 우선 선택
    const voices = window.speechSynthesis.getVoices()
    const koVoice = voices.find(v => v.lang.includes('ko') || v.lang.includes('KO'))
    if (koVoice) {
      utterance.voice = koVoice
    }

    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => {
      setIsSpeaking(false)
      if (onEnd) onEnd()
    }
    utterance.onerror = () => setIsSpeaking(false)

    window.speechSynthesis.speak(utterance)
  }, [supported])

  const stop = useCallback(() => {
    if (supported) {
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
    }
  }, [supported])

  return { speak, stop, isSpeaking, supported }
}
