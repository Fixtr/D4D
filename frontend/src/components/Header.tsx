import React, { useState, useEffect } from 'react'
import { WifiOff, Radio, BatteryMedium, Clock, MapPin, Cpu } from 'lucide-react'


export const Header: React.FC = () => {
  const [time, setTime] = useState<string>('')

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString('ko-KR', { hour12: false }) + ' KST')
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/90 backdrop-blur px-4 py-3 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Left: Unit & Task Info */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-950/80 border border-emerald-600/50 text-emerald-400">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-sm tracking-wider text-emerald-400">T4-2 VOICE-FIRST AI</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                COYOTE TACTICAL
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-mono flex items-center gap-2">
              <span>샘플 CALLSIGN: EAGLE-1 (독수리1)</span>
              <span>•</span>
              <span className="flex items-center gap-1 text-zinc-400">
                <MapPin className="w-3 h-3 text-emerald-500" />
                샘플 MGRS 52S DH 1234 5678
              </span>
            </p>
          </div>
        </div>

        {/* Right: Operational Status Badges (SC1 & SC2 Highlight) */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* SC1: 완전 오프라인 (Air-Gap) 뱃지 */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-semibold">
            <WifiOff className="w-3.5 h-3.5 text-emerald-400" />
            <span>오프라인 동작: 검증 전</span>
          </div>

          {/* SC2: NUCODE 보드 하드웨어 연결 뱃지 */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-950/60 border border-amber-500/40 text-amber-300 text-xs font-mono font-semibold">
            <Cpu className="w-3.5 h-3.5 text-amber-400" />
            <span>NUCODE BLE: 연결 대기</span>
            <button
              type="button"
              data-nu40-connect
              onClick={() => window.dispatchEvent(new Event('nu40-connect'))}
              className="ml-1 rounded border border-amber-500/50 px-2 py-0.5 hover:bg-amber-900/60 focus-visible:outline-2 focus-visible:outline-amber-400 disabled:opacity-50 disabled:cursor-wait"
            >
              연결 시도
            </button>
          </div>

          {/* System Clock & Battery */}
          <div className="hidden sm:flex items-center gap-3 px-3 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              {time}
            </span>
            <span className="flex items-center gap-1 text-emerald-400">
              <BatteryMedium className="w-3.5 h-3.5" />
              배터리: 확인 안 됨
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}
