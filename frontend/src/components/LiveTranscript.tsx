import React from 'react'
import { Terminal, Radio } from 'lucide-react'

interface LiveTranscriptProps {
  transcript: string
  isRecording: boolean
}

export const LiveTranscript: React.FC<LiveTranscriptProps> = ({ transcript, isRecording }) => {
  return (
    <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-4 font-mono text-sm relative">
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2 mb-2 text-xs text-zinc-400">
        <span className="flex items-center gap-1.5 text-emerald-400">
          <Terminal className="w-3.5 h-3.5" />
          <span>음성 텍스트 / 데모에서는 샘플 표시</span>
        </span>
        <span className="text-[11px] text-zinc-400">실시간 STT 미연결</span>
      </div>

      <div className="min-h-[52px] flex items-center">
        {transcript ? (
          <p className="text-zinc-200 leading-relaxed">
            <span className="text-emerald-500 mr-2 font-bold">&gt;&gt;</span>
            {transcript}
            {isRecording && <span className="inline-block w-2 h-4 bg-emerald-400 ml-1 animate-pulse" />}
          </p>
        ) : (
          <p className="text-zinc-400 italic text-xs flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-zinc-400" />
            PTT 버튼을 누르고 음성으로 보고하거나 명령을 발화하십시오. (예: "여기는 독수리 하나, 적 보병 3명...")
          </p>
        )}
      </div>
    </div>
  )
}
