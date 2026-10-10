import React from 'react'
import type { TacticalReport } from '../types/tactical'

import { History, CheckCircle2, AlertCircle } from 'lucide-react'

interface ReportHistoryProps {
  reports: TacticalReport[]
  activeReportId: string
  onSelectReport: (report: TacticalReport) => void
}

export const ReportHistory: React.FC<ReportHistoryProps> = ({
  reports,
  activeReportId,
  onSelectReport,
}) => {
  if (reports.length === 0) return null

  return (
    <div className="bg-zinc-950/70 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3 text-xs font-mono text-zinc-400">
        <History className="w-4 h-4 text-emerald-400" />
        <span className="font-bold text-zinc-300">전술 보고서 생성 이력 (HISTORY)</span>
        <span className="text-[11px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
          {reports.length}건
        </span>
      </div>

      <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
        {reports.map((rep) => {
          const isSelected = rep.id === activeReportId
          return (
            <button
              key={rep.id}
              type="button"
              onClick={() => onSelectReport(rep)}
              className={`text-left p-2.5 rounded-lg border transition flex items-center justify-between gap-3 ${
                isSelected
                  ? 'bg-zinc-800/90 border-emerald-500/80 text-white shadow'
                  : 'bg-zinc-900/40 border-zinc-800/70 hover:bg-zinc-900 text-zinc-300'
              }`}
            >
              <div className="truncate">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-emerald-400">
                    {rep.report_type} · {rep.source === 'demo' ? '샘플' : rep.source === 'api' ? 'API 응답' : '출처 미확인'}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400">
                    {rep.timestamp}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 truncate mt-0.5 font-mono">
                  {rep.raw_transcript}
                </p>
              </div>

              <div className="shrink-0">
                {rep.confirmed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
