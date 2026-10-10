import React, { useRef, useEffect } from 'react'
import { Mic, Radio, Loader2, Volume2 } from 'lucide-react'
import type { SystemStatus } from '../types/tactical'


interface PTTControlProps {
  status: SystemStatus
  audioLevel: number
  onStartPTT: () => void
  onStopPTT: () => void
}

export const PTTControl: React.FC<PTTControlProps> = ({
  status,
  audioLevel,
  onStartPTT,
  onStopPTT,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // 오디오 비주얼라이저 바 애니메이션
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    const bars = 32

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const barWidth = canvas.width / bars - 2

      for (let i = 0; i < bars; i++) {
        let height = 4
        if (status === 'TRANSMITTING') {
          // 중간 바일수록 높게, audioLevel 및 난수 가중
          const distFromCenter = Math.abs(i - bars / 2) / (bars / 2)
          const multiplier = Math.max(0.1, 1 - distFromCenter * 0.7)
          height = Math.max(4, audioLevel * canvas.height * multiplier * (0.8 + Math.random() * 0.4))
        } else if (status === 'PROCESSING') {
          // 웨이브 파동 효과
          height = Math.sin(Date.now() / 150 + i * 0.3) * 12 + 16
        }

        const x = i * (barWidth + 2)
        const y = (canvas.height - height) / 2

        ctx.fillStyle =
          status === 'TRANSMITTING'
            ? '#ef4444' // Red when transmitting
            : status === 'PROCESSING'
            ? '#f59e0b' // Amber when processing
            : status === 'READ_BACK'
            ? '#3b82f6' // Blue when reading back
            : '#27272a' // Dim zinc in standby

        ctx.fillRect(x, y, barWidth, height)
      }

      animId = requestAnimationFrame(render)
    }

    render()
    return () => cancelAnimationFrame(animId)
  }, [status, audioLevel])

  const getStatusBadge = () => {
    switch (status) {
      case 'TRANSMITTING':
        return (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/80 border border-red-500 text-red-400 text-xs font-mono animate-pulse">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            <span>TRANSMITTING (무전 수신 중)</span>
          </div>
        )
      case 'PROCESSING':
        return (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-950/80 border border-amber-500 text-amber-400 text-xs font-mono">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>PROCESSING (결과 준비 중)</span>
          </div>
        )
      case 'READ_BACK':
        return (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-950/80 border border-blue-500 text-blue-400 text-xs font-mono">
            <Volume2 className="w-3.5 h-3.5 animate-bounce" />
            <span>READ-BACK (복창 & 전파 대기)</span>
          </div>
        )
      default:
        return (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-400 text-xs font-mono">
            <Radio className="w-3.5 h-3.5 text-emerald-500" />
            <span>STANDBY (무전 대기)</span>
          </div>
        )
    }
  }

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-zinc-900/60 border border-zinc-800 rounded-2xl relative overflow-hidden shadow-2xl backdrop-blur-md">
      {/* Background glow effect */}
      <div
        className={`absolute -top-24 w-72 h-72 rounded-full blur-3xl pointer-events-none transition-all duration-500 ${
          status === 'TRANSMITTING'
            ? 'bg-red-500/20'
            : status === 'PROCESSING'
            ? 'bg-amber-500/20'
            : status === 'READ_BACK'
            ? 'bg-blue-500/20'
            : 'bg-emerald-500/10'
        }`}
      />

      {/* Status Badge */}
      <div className="mb-4">{getStatusBadge()}</div>

      {/* Waveform Canvas */}
      <div className="w-full max-w-md h-16 mb-6 flex items-center justify-center">
        <canvas ref={canvasRef} width={380} height={64} className="w-full h-full" />
      </div>

      {/* Main Tactical PTT Button */}
      <div className="relative group">
        <button
          type="button"
          onMouseDown={onStartPTT}
          onMouseUp={onStopPTT}
          onTouchStart={(e) => {
            e.preventDefault()
            onStartPTT()
          }}
          onTouchEnd={(e) => {
            e.preventDefault()
            onStopPTT()
          }}
          className={`relative z-10 w-32 h-32 rounded-full flex flex-col items-center justify-center gap-1.5 font-mono text-sm font-bold tracking-wider transition-all duration-150 select-none cursor-pointer shadow-lg active:scale-95 ${
            status === 'TRANSMITTING'
              ? 'bg-red-600 text-white shadow-red-500/50 ring-4 ring-red-400/50 scale-105'
              : status === 'PROCESSING'
              ? 'bg-amber-600 text-white shadow-amber-500/50 ring-4 ring-amber-400/50'
              : 'bg-gradient-to-b from-zinc-800 to-zinc-900 text-zinc-200 border-2 border-zinc-600 hover:border-emerald-500 hover:text-emerald-400 shadow-zinc-950'
          }`}
        >
          {status === 'PROCESSING' ? (
            <Loader2 className="w-10 h-10 animate-spin" />
          ) : (
            <Mic
              className={`w-10 h-10 transition-transform ${
                status === 'TRANSMITTING' ? 'scale-110 text-white' : ''
              }`}
            />
          )}
          <span className="text-[11px] uppercase">
            {status === 'TRANSMITTING' ? 'REC...' : 'HOLD PTT'}
          </span>
        </button>

        {/* Pulse rings during transmission */}
        {status === 'TRANSMITTING' && (
          <div className="absolute inset-0 rounded-full border-2 border-red-500 animate-ping pointer-events-none" />
        )}
      </div>

      {/* PTT Helper Text */}
      <div className="mt-5 text-center">
        <p className="text-xs text-zinc-400 font-mono">
          <kbd className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-zinc-300 font-mono text-xs shadow">
            Space
          </kbd>{' '}
          키 또는 <strong className="text-amber-400 font-semibold">Space 키를 보내는 무선 버튼</strong>을 누른 채 발화하세요
        </p>
      </div>
    </div>
  )
}
