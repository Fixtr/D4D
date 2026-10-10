import React, { useEffect } from 'react'
import { Volume2, Send, RotateCcw, Radio } from 'lucide-react'


interface ReadBackBarProps {
  readBackText: string
  isSpeaking: boolean
  onSpeak: () => void
  onConfirm: () => void
  onCancel: () => void
}

export const ReadBackBar: React.FC<ReadBackBarProps> = ({
  readBackText,
  isSpeaking,
  onSpeak,
  onConfirm,
  onCancel,
}) => {
  // 컴포넌트 마운트 시 최초 1회 자동 음성 복창
  useEffect(() => {
    if (readBackText) {
      onSpeak()
    }
  }, [readBackText])

  if (!readBackText) return null

  return (
    <div className="bg-blue-950/40 border-2 border-blue-500/60 rounded-xl p-4 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Left: Read-Back Message */}
        <div className="flex items-start gap-3 flex-1">
          <button
            type="button"
            onClick={onSpeak}
            title="음성 다시 듣기"
            className={`p-2.5 rounded-lg border transition shrink-0 ${
              isSpeaking
                ? 'bg-blue-600 text-white border-blue-400 animate-pulse'
                : 'bg-zinc-900 text-blue-400 border-blue-500/40 hover:bg-zinc-800'
            }`}
          >
            <Volume2 className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5" />
                AI READ-BACK // 되읽기 및 복창 확인
              </span>
              {isSpeaking && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-900 text-blue-200 animate-pulse">
                  SPEAKING...
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-zinc-100 italic">
              "{readBackText}"
            </p>
          </div>
        </div>

        {/* Right: Confirmation Actions */}
        <div className="flex items-center gap-2 self-end md:self-center shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 text-zinc-300 font-mono text-xs font-semibold transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>재녹음 · Yaw / F14</span>
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold shadow-lg shadow-emerald-950 transition active:scale-95"
          >
            <Send className="w-3.5 h-3.5" />
            <span>확정 · Pitch / F13</span>
          </button>
        </div>
      </div>
    </div>
  )
}
