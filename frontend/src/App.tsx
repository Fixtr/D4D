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


export const App: React.FC = () => {
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
    stopPTT,
    resetToStandby,
  } = usePTT({
    onReportGenerated: handleReportGenerated,
    // UNO Q AI 서버 주소 (frontend/.env.local 의 VITE_API_URL). 없으면 데모 샘플 모드
    apiEndpoint: import.meta.env.VITE_API_URL || undefined,
  })

  // 상급망 전파 승인 처리
  const handleConfirm = () => {
    stopSpeaking()
    if (!activeReport) return
    const updated = { ...activeReport, confirmed: true }
    setActiveReport(updated)
    setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
    resetToStandby()
  }

  // 재보고 처리
  const handleCancel = () => {
    stopSpeaking()
    resetToStandby()
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      {/* Top Tactical HUD Header */}
      <Header />

      {/* Main Tactical Operational View */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: PTT Controller & Voice Logs (5 cols on lg) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {storageError && <p role="alert" className="text-sm text-red-300">{storageError}</p>}
          <p role="status" className="text-sm text-amber-300 border border-amber-600/40 rounded-lg p-3">
            {notice || '데모 모드: 샘플 보고서를 표시합니다. 실제 AI는 연결되지 않았습니다.'}
          </p>
          <PTTControl
            status={status}
            audioLevel={audioLevel}
            onStartPTT={startPTT}
            onStopPTT={stopPTT}
          />

          <LiveTranscript
            transcript={liveTranscript || activeReport?.raw_transcript || ''}
            isRecording={status === 'TRANSMITTING'}
          />

          <ReportHistory
            reports={reports}
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
          {activeReport && !activeReport.confirmed && (
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
