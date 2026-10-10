import { useState, useEffect, useRef, useCallback } from 'react'
import type { SystemStatus, TacticalReport } from '../types/tactical'
import { MOCK_SCENARIOS } from '../data/mockScenarios'


interface UsePTTOptions {
  onReportGenerated?: (report: TacticalReport) => void
  onTranscriptUpdate?: (transcript: string) => void
  apiEndpoint?: string
}

export function usePTT({ onReportGenerated, onTranscriptUpdate, apiEndpoint }: UsePTTOptions = {}) {
  const [status, setStatus] = useState<SystemStatus>('STANDBY')
  const [audioLevel, setAudioLevel] = useState<number>(0)
  const [mockIndex, setMockIndex] = useState<number>(0)
  const [liveTranscript, setLiveTranscript] = useState<string>('')
  const [notice, setNotice] = useState('')

  const isPressedRef = useRef(false)
  const isProcessingRef = useRef(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // 오디오 분석 루프
  const updateAudioVisuals = useCallback(() => {
    if (!analyserRef.current) return

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(dataArray)

    // 평균 볼륨 계산
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i]
    }
    const avg = sum / dataArray.length
    setAudioLevel(avg / 255) // 0.0 ~ 1.0

    animFrameRef.current = requestAnimationFrame(updateAudioVisuals)
  }, [])

  // PTT 활성화 (버튼 누름)
  const startPTT = useCallback(async () => {
    if (isPressedRef.current || isProcessingRef.current) return
    isPressedRef.current = true
    setNotice(apiEndpoint ? '' : '데모 모드: 녹음 내용과 관계없이 샘플 보고서를 표시합니다.')
    setStatus('TRANSMITTING')
    audioChunksRef.current = []
    setLiveTranscript('수음 중... [무전 음성 수신 중]')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      })
      if (!isPressedRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      const source = audioCtx.createMediaStreamSource(stream)
      source.connect(analyser)

      audioContextRef.current = audioCtx
      analyserRef.current = analyser

      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.start(100)
      updateAudioVisuals()
    } catch (err) {
      console.warn('마이크 접근 제한 또는 권한 필요. 시뮬레이션 모드로 작동합니다.', err)
      setNotice('마이크를 사용할 수 없습니다. 권한과 장치를 확인하세요. 표시되는 결과는 샘플입니다.')
      setLiveTranscript('마이크 수음 실패')
      streamRef.current?.getTracks().forEach((track) => track.stop())
      mediaRecorderRef.current = null
      audioContextRef.current?.close().catch(() => {})
    }
  }, [updateAudioVisuals, apiEndpoint])

  // PTT 비활성화 (버튼 뗌) -> AI 파이프라인 처리
  const stopPTT = useCallback(async () => {
    if (!isPressedRef.current) return
    isPressedRef.current = false
    isProcessingRef.current = true
    setStatus('PROCESSING')
    setAudioLevel(0)

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
    }

    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      // stop 이벤트는 마지막 dataavailable 이벤트 이후 발생한다.
      await new Promise<void>((resolve) => {
        recorder.addEventListener('stop', () => resolve(), { once: true })
        recorder.stop()
      })
    }
    const audioChunks = audioChunksRef.current.slice()
    mediaRecorderRef.current = null

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {})
    }

    // AI 파이프라인 (STT -> LLM/RAG) 처리 시뮬레이션 또는 실제 호출
    const targetScenario = MOCK_SCENARIOS[mockIndex % MOCK_SCENARIOS.length]
    setMockIndex((prev) => prev + 1)

    // 실제 백엔드가 연결되어 있을 경우 시도
    let processedReport: TacticalReport = targetScenario

    if (apiEndpoint && audioChunks.length > 0) {
      try {
        const audioBlob = new Blob(audioChunks, { type: recorder?.mimeType || 'audio/webm' })
        const formData = new FormData()
        formData.append('audio', audioBlob, 'tactical_voice.webm')

        const res = await fetch(apiEndpoint, {
          method: 'POST',
          body: formData,
        })
        if (!res.ok) throw new Error(`AI 서버 응답 오류: ${res.status}`)
        processedReport = { ...await res.json(), source: 'api' }
        setNotice('API 응답 수신: 실제 모델 처리 여부는 서버에서 확인해야 합니다.')
      } catch {
        setNotice('AI 서버 처리에 실패했습니다. 녹음 내용과 무관한 샘플 보고서를 표시합니다.')
      }
    }

    if (apiEndpoint && audioChunks.length === 0) {
      setNotice('전송할 녹음이 없습니다. 녹음 내용과 무관한 샘플 보고서를 표시합니다.')
    }

    // 처리 지연 시뮬레이션 (약 1.2초 후 STT 및 구조화 완료)
    setTimeout(() => {
      setLiveTranscript(processedReport.raw_transcript)
      if (onTranscriptUpdate) {
        onTranscriptUpdate(processedReport.raw_transcript)
      }
      setStatus('READ_BACK')
      isProcessingRef.current = false
      if (onReportGenerated) {
        onReportGenerated(processedReport)
      }
    }, 1200)
  }, [mockIndex, apiEndpoint, onReportGenerated, onTranscriptUpdate])

  // 하드웨어 PTT (Space Bar 또는 BleKeyboard) 키 이벤트 리스너
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 텍스트 입력창이 아닐 때 Space 누름
      if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        e.preventDefault()
        if (!e.repeat) {
          startPTT()
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        e.preventDefault()
        stopPTT()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [startPTT, stopPTT])

  const resetToStandby = useCallback(() => {
    setStatus('STANDBY')
  }, [])

  return {
    status,
    audioLevel,
    liveTranscript,
    notice,
    startPTT,
    stopPTT,
    resetToStandby,
    isPressed: isPressedRef.current,
  }
}
