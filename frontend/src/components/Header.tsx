import React, { useState, useEffect } from 'react'
import { Radio, MapPin, Cpu, Usb } from 'lucide-react'


export const Header: React.FC = () => {
  const [uart, setUart] = useState<'checking' | 'connected' | 'busy' | 'unavailable'>('checking')
  const [uartDetail, setUartDetail] = useState('보드 AI 응답 확인 중')
  const [checkingUart, setCheckingUart] = useState(false)
  const [uartRetry, setUartRetry] = useState(0)

  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    let controller: AbortController
    const check = async () => {
      controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)
      setCheckingUart(true)
      try {
        const response = await fetch('/api/health', { signal: controller.signal, cache: 'no-store' })
        const result = await response.json()
        if (disposed) return
        if (response.ok && result.transport === 'usb-uart' && ['HEALTHY', 'BUSY'].includes(result.status)) {
          setUart(result.status === 'BUSY' ? 'busy' : 'connected')
          setUartDetail(result.status === 'BUSY' ? 'USB 포트 인식됨 · AI 처리 중, 완료 후 응답 재확인' : '보드 AI가 USB UART로 응답했습니다.')
        } else {
          setUart('unavailable')
          setUartDetail(result.detail || 'USB UART 보드 AI 응답을 확인할 수 없습니다.')
        }
      } catch {
        if (!disposed) {
          setUart('unavailable')
          setUartDetail('USB 연결과 보드 AI 실행 상태를 확인하세요.')
        }
      } finally {
        clearTimeout(timeout)
        if (!disposed) {
          setCheckingUart(false)
          timer = setTimeout(check, 5000)
        }
      }
    }
    void check()
    return () => { disposed = true; clearTimeout(timer); controller?.abort() }
  }, [uartRetry])

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

          {/* USB UART AI connection */}
          <div title={uartDetail} role="status" className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono font-semibold ${uart === 'connected' ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300' : 'bg-amber-950/60 border-amber-500/40 text-amber-300'}`}>
            <Usb className="w-3.5 h-3.5" />
            <span>UNO Q USB: {uart === 'connected' ? '연결됨' : uart === 'busy' ? 'AI 처리 중' : uart === 'checking' ? '확인 중' : '연결 대기'}</span>
            <button type="button" disabled={checkingUart} onClick={() => setUartRetry(value => value + 1)} className="ml-1 rounded border border-current px-2 py-0.5 disabled:opacity-50">
              {checkingUart ? '확인 중' : '다시 확인'}
            </button>
          </div>

        </div>
      </div>
    </header>
  )
}
