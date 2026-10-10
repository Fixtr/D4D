import { useState, useEffect, useRef, useCallback } from 'react'
import type { SystemStatus, TacticalReport } from '../types/tactical'
import { MOCK_SCENARIOS } from '../data/mockScenarios'
import { parseApiReport } from '../data/reportHistory'


interface UsePTTOptions {
  onReportGenerated?: (report: TacticalReport) => void
  onTranscriptUpdate?: (transcript: string) => void
  mode?: 'demo' | 'api'
  apiEndpoint?: string
}

export function usePTT({ onReportGenerated, onTranscriptUpdate, apiEndpoint, mode = apiEndpoint ? 'api' : 'demo' }: UsePTTOptions = {}) {
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
    if (mode === 'api' && !apiEndpoint) {
      setNotice('실제 API 모드: 서버 주소가 아직 설정되지 않았습니다. 샘플은 생성하지 않습니다.')
      return
    }
    isPressedRef.current = true
    setNotice(mode === 'api' ? '' : '데모 모드: 녹음 내용과 관계없이 샘플 보고서를 표시합니다.')
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
      console.warn('마이크 수음 실패', err)
      setNotice('마이크를 사용할 수 없습니다. 권한과 장치를 확인하고 재녹음하세요.')
      isPressedRef.current = false
      setStatus('STANDBY')
      setAudioLevel(0)
      setLiveTranscript('마이크 수음 실패')
      streamRef.current?.getTracks().forEach((track) => track.stop())
      mediaRecorderRef.current = null
      audioContextRef.current?.close().catch(() => {})
    }
  }, [updateAudioVisuals, apiEndpoint, mode])

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
      try {
        await new Promise<void>((resolve, reject) => {
          recorder.addEventListener('stop', () => resolve(), { once: true })
          recorder.addEventListener('error', () => reject(new Error('녹음 종료 실패')), { once: true })
          recorder.stop()
        })
      } catch {
        streamRef.current?.getTracks().forEach((track) => track.stop())
        audioContextRef.current?.close().catch(() => {})
        mediaRecorderRef.current = null
        setNotice('녹음을 완료하지 못했습니다. 다시 녹음하세요.')
        setLiveTranscript('')
        setStatus('STANDBY')
        isProcessingRef.current = false
        return
      }
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

    if (mode === 'api' && apiEndpoint && audioChunks.length > 0) {
      const controller = new AbortController()
      // UNO Q 실측 처리 시간 16~19초 (READBACK_MODE=llm 이면 +17~37초)
      const timeout = setTimeout(() => controller.abort(), 210000)
      try {
        const mimeType = recorder?.mimeType || audioChunks[0]?.type
        const format = mimeType?.split(';')[0].trim().toLowerCase()
        const extension = format === 'audio/webm' ? 'webm' : format === 'audio/mp4' ? 'mp4' : format === 'audio/ogg' ? 'ogg' : undefined
        if (!mimeType || !extension) throw new Error('지원하지 않는 녹음 형식입니다.')
        const audioBlob = new Blob(audioChunks, { type: mimeType })
        const formData = new FormData()
        formData.append('audio', audioBlob, `tactical_voice.${extension}`)

        const res = await fetch(apiEndpoint, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        })
        if (!res.ok) {
          // 서버의 {"detail": "..."} 오류 설명을 그대로 표시 (API_CONTRACT.md 3)
          const detail = await res.json().then((body) => body?.detail).catch(() => undefined)
          throw new Error(typeof detail === 'string' ? detail : `AI 서버 응답 오류: ${res.status}`)
        }
        processedReport = parseApiReport(await res.json())
        setNotice('USB UART: UNO Q의 AI 결과를 수신했습니다.')
      } catch (error) {
        setNotice(controller.signal.aborted ? 'AI 서버 응답 시간이 초과됐습니다. 다시 녹음하세요.' : error instanceof Error && error.name !== 'TypeError' ? `${error.message} 다시 녹음하세요.` : 'AI 서버에 연결할 수 없습니다. 서버 주소와 실행 상태를 확인하고 다시 녹음하세요.')
        setLiveTranscript('')
        setStatus('STANDBY')
        isProcessingRef.current = false
        return
      } finally {
        clearTimeout(timeout)
      }
    }

    if (mode === 'api' && audioChunks.length === 0) {
      setNotice('전송할 녹음이 없습니다. 다시 녹음하세요. 샘플은 생성하지 않습니다.')
      setLiveTranscript('')
      setStatus('STANDBY')
      isProcessingRef.current = false
      return
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
  }, [mockIndex, apiEndpoint, mode, onReportGenerated, onTranscriptUpdate])

  const togglePTT = useCallback(() => {
    if (isPressedRef.current) return stopPTT()
    return startPTT()
  }, [startPTT, stopPTT])

  // Roll 모션 한 번은 Space 누름/해제 한 쌍으로 전달한다.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (e.code !== 'Space' || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return
      e.preventDefault()
      if (!e.repeat) void togglePTT()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePTT])

  const resetToStandby = useCallback(() => {
    setStatus('STANDBY')
    setNotice('')
    setLiveTranscript('')
  }, [])

  return {
    status,
    audioLevel,
    liveTranscript,
    notice,
    startPTT,
    stopPTT,
    togglePTT,
    resetToStandby,
    isPressed: isPressedRef.current,
  }
}
