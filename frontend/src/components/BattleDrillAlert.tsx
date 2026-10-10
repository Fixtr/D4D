import React from 'react'
import { BookOpen } from 'lucide-react'


interface BattleDrillAlertProps {
  source?: 'demo' | 'api'
  action: string
}

export const BattleDrillAlert: React.FC<BattleDrillAlertProps> = ({ action, source }) => {
  if (!action) return null

  return (
    <div className="bg-gradient-to-r from-amber-950/40 via-zinc-900/60 to-zinc-950 border border-amber-600/40 rounded-xl p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 shrink-0 mt-0.5">
          <BookOpen className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs font-bold text-amber-400 uppercase tracking-wider">
              BATTLE DRILL // 로컬 교범 즉각 권고 조치
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-950 border border-amber-600/60 text-amber-300">
              {source === 'demo' ? '샘플 권고 · RAG 미검증' : '서버 권고 · RAG 미검증'}
            </span>
          </div>
          <p className="text-sm text-zinc-100 font-medium leading-relaxed">
            {action}
          </p>
        </div>
      </div>
    </div>
  )
}
