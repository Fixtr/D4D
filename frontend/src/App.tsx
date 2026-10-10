import React, { useEffect, useState } from 'react'
import { Header } from './components/Header'
import { PTTControl } from './components/PTTControl'
import { LiveTranscript } from './components/LiveTranscript'
import { ReportCard } from './components/ReportCard'
import { BattleDrillAlert } from './components/BattleDrillAlert'
import { ReadBackBar } from './components/ReadBackBar'
import { ReportHistory } from './components/ReportHistory'
import { usePTT } from './hooks/usePTT'
import { useReadBack } from './hooks/useReadBack'
import type { TacticalReport } from './types/tactical'
import { MOCK_SCENARIOS } from './data/mockScenarios'
import { createReport, parseReportHistory, REPORT_HISTORY_KEY } from './data/reportHistory'
import { Radio } from 'lucide-react'

const apiEndpoint = import.meta.env.VITE_TACTICAL_API_ENDPOINT || 'http://localhost:8000/api/tactical-process'

export const App: React.FC = () => {
  const [mode, setMode] = useState<'demo' | 'api'>('demo')
  const [history] = useState(() => {
    try {
      const saved = localStorage.getItem(REPORT_HISTORY_KEY)
      return { reports: saved === null ? [createReport(MOCK_SCENARIOS[0])] : parseReportHistory(saved), error: '' }
    } catch {
      return { reports: [createReport(MOCK_SCENARIOS[0])], error: '저장된 이력을 읽을 수 없습니다. 기존 저장 데이터는 유지합니다.' }
    }
  })
  const [reports, setReports] = useState<TacticalReport[]>(history.reports)
  const [activeReport, setActiveReport] = useState<TacticalReport | undefined>(history.reports[0])
  const [storageError, setStorageError] = useState(history.error)

  useEffect(() => {
    if (history.error) return
    try {
      localStorage.setItem(REPORT_HISTORY_KEY, JSON.stringify(reports))
      setStorageError('')
    } catch {
      setStorageError('이력을 저장하지 못했습니다. 새로고침하면 이번 변경이 사라질 수 있습니다.')
    }
  }, [reports, history.error])
  const { speak, stop: stopSpeaking, isSpeaking } = useReadBack()

  const handleReportGenerated = (newReport: TacticalReport) => {
    const report = createReport(newReport)
    setReports((prev) => [report, ...prev])
    setActiveReport(report)
    // AI 음성 복창 자동 시작
    speak(report.read_back_text)
  }

  const {
    status,
    audioLevel,
    liveTranscript,
    notice,
    startPTT,
    togglePTT,
    resetToStandby,
  } = usePTT({
    apiEndpoint,
    onReportGenerated: handleReportGenerated,
    mode,
  })

  // 상급망 전파 승인 처리
  const handleConfirm = () => {
    stopSpeaking()
    if (!activeReport || activeReport.confirmed || status === 'TRANSMITTING' || status === 'PROCESSING') return
    const updated = { ...activeReport, confirmed: true }
    setActiveReport(updated)
    setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
    resetToStandby()
  }

  // 재보고 처리
  const handleCancel = () => {
    if (!activeReport || activeReport.confirmed || status === 'TRANSMITTING' || status === 'PROCESSING') return
    stopSpeaking()
    setActiveReport(undefined)
    resetToStandby()
    void startPTT()
  }

  useEffect(() => {
    const handleGestureKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable || event.repeat) return
      if (!activeReport || activeReport.confirmed || status === 'TRANSMITTING' || status === 'PROCESSING') return
      if (event.code === 'F13') {
        event.preventDefault()
        handleConfirm()
      } else if (event.code === 'F14') {
        event.preventDefault()
        handleCancel()
      }
    }
    window.addEventListener('keydown', handleGestureKey)
    return () => window.removeEventListener('keydown', handleGestureKey)
  }, [activeReport, status, handleConfirm, handleCancel])

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      {/* Top Tactical HUD Header */}
      <Header />

      {/* Main Tactical Operational View */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: PTT Controller & Voice Logs (5 cols on lg) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <label className="text-sm text-zinc-300 flex items-center gap-3">
            실행 모드
            <select
              value={mode}
              disabled={status === 'TRANSMITTING' || status === 'PROCESSING'}
              onChange={(event) => {
                const nextMode = event.target.value as 'demo' | 'api'
                stopSpeaking()
                resetToStandby()
                setMode(nextMode)
                setActiveReport(undefined)
              }}
              className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 disabled:opacity-50"
            >
              <option value="demo">데모 · 샘플 보고서</option>
              <option value="api">실제 API · 서버 응답</option>
            </select>
          </label>
          <p className="text-sm text-zinc-400">
            {mode === 'demo' ? '데모: 녹음 내용과 무관한 샘플을 사용합니다.' : '실제 API: 녹음을 서버로 전송합니다. 샘플은 생성하지 않습니다.'}
          </p>
          {storageError && <p role="alert" className="text-sm text-red-300">{storageError}</p>}
          <p role="status" className="text-sm text-amber-300 border border-amber-600/40 rounded-lg p-3">
            {notice || (mode === 'demo' ? '데모 모드: 실제 AI는 연결되지 않았습니다.' : '실제 API 모드: 서버 연결 및 실제 모델 처리는 아직 검증되지 않았습니다.')}
          </p>
          <PTTControl
            status={status}
            audioLevel={audioLevel}
            onTogglePTT={() => { stopSpeaking(); void togglePTT() }}
          />

          <LiveTranscript
            transcript={liveTranscript || activeReport?.raw_transcript || ''}
            isRecording={status === 'TRANSMITTING'}
          />

          <ReportHistory
            reports={reports.filter((report) => report.source === mode)}
            activeReportId={activeReport?.id || ''}
            onSelectReport={(rep) => {
              setActiveReport(rep)
              speak(rep.read_back_text)
            }}
          />
        </div>

        {/* Right Column: Structured Tactical Reports & RAG Guidance (7 cols on lg) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Read-Back Voice Verification Bar (Appears when status is READ_BACK or unconfirmed report) */}
          {activeReport && !activeReport.confirmed && status !== 'TRANSMITTING' && status !== 'PROCESSING' && (
            <ReadBackBar
              readBackText={activeReport.read_back_text}
              isSpeaking={isSpeaking}
              onSpeak={() => speak(activeReport.read_back_text)}
              onConfirm={handleConfirm}
              onCancel={handleCancel}
            />
          )}

          {/* Battle Drill SOP RAG Alert */}
          {activeReport && (
            <BattleDrillAlert action={activeReport.recommended_action} source={activeReport.source} />
          )}

          {/* Structured Tactical Card (SALUTE / SITREP / MEDEVAC) */}
          {activeReport ? (
            <ReportCard report={activeReport} />
          ) : (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500 font-mono text-sm flex flex-col items-center justify-center min-h-[300px]">
              <Radio className="w-8 h-8 mb-2 opacity-50" />
              <span>생성된 전술 보고서가 없습니다. PTT를 눌러 무전을 시작하십시오.</span>
            </div>
          )}
        </div>
      </main>

      {/* Footer Info */}
      <footer className="border-t border-zinc-900 py-2.5 px-4 text-center text-xs font-mono text-zinc-400 bg-zinc-950">
        Korean Defense Tech Hackathon 2026 • T4-2 Voice-first Tactical AI • 오프라인 실동작 검증 전
      </footer>
    </div>
  )
}

export default App
