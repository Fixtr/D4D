import React from 'react'
import type { 
  TacticalReport, 
  SaluteData, 
  SitrepData, 
  MedevacData 
} from '../types/tactical'

import { 
  FileText, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Crosshair, 
  MapPin, 
  Users, 
  Activity, 
  Shield,
  Download
} from 'lucide-react'

// 브라우저에서 파일로 저장 (서버 응답에 담긴 내용으로 생성하므로 보드와 다른 출처여도 동작)
function saveFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function downloadJson(report: TacticalReport) {
  // 화면 전용 값(출처 표시, 스크립트 본문, 다운로드 경로)을 뺀 API 규격 보고서만 저장
  const body: Partial<TacticalReport> = { ...report }
  delete body.source
  delete body.script_text
  delete body.json_url
  delete body.script_url
  saveFile(`tactical_${report.id}.json`, JSON.stringify(body, null, 2), 'application/json')
}

interface ReportCardProps {
  report: TacticalReport
}

export const ReportCard: React.FC<ReportCardProps> = ({ report }) => {
  const getThreatBadge = (level: TacticalReport['threat_level']) => {
    switch (level) {
      case 'CRITICAL':
        return 'bg-red-950/80 border-red-500 text-red-300'
      case 'HIGH':
        return 'bg-orange-950/80 border-orange-500 text-orange-300'
      case 'MEDIUM':
        return 'bg-amber-950/80 border-amber-500 text-amber-300'
      default:
        return 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
    }
  }

  // SALUTE 카드 렌더링
  const renderSalute = (data: SaluteData) => {
    const fields = [
      { key: 'S', label: 'Size (적 규모)', value: data.size, icon: Users },
      { key: 'A', label: 'Activity (적 활동/기동)', value: data.activity, icon: Activity },
      { key: 'L', label: 'Location (위치/좌표)', value: data.location, icon: MapPin },
      { key: 'U', label: 'Unit (적 소속/복장)', value: data.unit, icon: Shield },
      { key: 'T', label: 'Time (식별 일시)', value: data.time, icon: Clock },
      { key: 'E', label: 'Equipment (화기/장비)', value: data.equipment, icon: Crosshair },
    ]

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
        {fields.map((f) => {
          const Icon = f.icon
          return (
            <div
              key={f.key}
              className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-3 hover:border-zinc-700 transition"
            >
              <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 mb-1">
                <span className="w-5 h-5 rounded bg-emerald-950/80 border border-emerald-600/60 text-emerald-400 font-bold flex items-center justify-center text-[11px]">
                  {f.key}
                </span>
                <Icon className="w-3.5 h-3.5 text-zinc-400" />
                <span>{f.label}</span>
              </div>
              <p className="text-sm font-semibold text-zinc-100 pl-7">{f.value || '-'}</p>
            </div>
          )
        })}
      </div>
    )
  }

  // SITREP 카드 렌더링
  const renderSitrep = (data: SitrepData) => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-3">
          <span className="text-xs font-mono text-zinc-400 block mb-1">부대 상태 (Unit Status)</span>
          <p className="text-sm font-semibold text-zinc-100">{data.unit_status}</p>
        </div>
        <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-3">
          <span className="text-xs font-mono text-zinc-400 block mb-1">현재 위치 (Location)</span>
          <p className="text-sm font-semibold text-zinc-100">{data.location}</p>
        </div>
        <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-3">
          <span className="text-xs font-mono text-zinc-400 block mb-1">탄약 및 보급 (Supplies)</span>
          <p className="text-sm font-semibold text-amber-300">{data.ammo_supply}</p>
        </div>
        <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-3">
          <span className="text-xs font-mono text-zinc-400 block mb-1">인명 피해 (Casualties)</span>
          <p className="text-sm font-semibold text-emerald-400">{data.casualties}</p>
        </div>
        <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-3 md:col-span-2">
          <span className="text-xs font-mono text-zinc-400 block mb-1">작전 진행 상황 (Operation)</span>
          <p className="text-sm text-zinc-200">{data.operational_status}</p>
        </div>
      </div>
    )
  }

  // 9-Line MEDEVAC 카드 렌더링
  const renderMedevac = (data: MedevacData) => {
    const lines = [
      { num: 'Line 1', label: '위치 / Pickup Location', val: data.line1_location },
      { num: 'Line 2', label: '무선 주파수 / Radio Freq', val: data.line2_freq_callsign },
      { num: 'Line 3', label: '환자 수 & 긴급도 / Precedence', val: data.line3_patients_precedence },
      { num: 'Line 4', label: '특수 장비 / Special Equipment', val: data.line4_special_equipment },
      { num: 'Line 5', label: '환자 유형 / Type of Patients', val: data.line5_patient_type },
      { num: 'Line 6', label: '착륙지점 보안 / Security', val: data.line6_security },
      { num: 'Line 7', label: '착륙지점 표식 / Marking', val: data.line7_marking },
      { num: 'Line 8', label: '환자 국적 / Nationality', val: data.line8_patient_nationality },
      { num: 'Line 9', label: '화생방 위협 / CBRN Contamination', val: data.line9_cbrn },
    ]

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mt-3">
        {lines.map((l) => (
          <div key={l.num} className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-2.5">
            <span className="text-[11px] font-mono text-red-400 font-bold block">{l.num}</span>
            <span className="text-[10px] text-zinc-400 block truncate">{l.label}</span>
            <p className="text-xs font-semibold text-zinc-100 mt-1">{l.val || '-'}</p>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5 shadow-xl relative overflow-hidden backdrop-blur">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-zinc-800 text-emerald-400">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-mono font-bold text-base text-zinc-100 tracking-wide">
                {report.report_type} 전술 보고서 · {report.source === 'demo' ? '샘플' : report.source === 'api' ? 'API 응답 (모델 미검증)' : '출처 미확인'}
              </h3>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${getThreatBadge(report.threat_level)}`}>
                THREAT: {report.threat_level}
              </span>
            </div>
            <span className="text-xs font-mono text-zinc-400">DOC ID: {report.id} • {report.timestamp}</span>
          </div>
        </div>

        {/* Confirmation Status */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => downloadJson(report)}
            className="flex items-center gap-1 px-2 py-1 rounded border border-zinc-700 text-zinc-300 text-xs font-mono hover:border-emerald-500 hover:text-emerald-300 transition"
          >
            <Download className="w-3.5 h-3.5" />
            JSON 저장
          </button>
          {report.script_text && (
            <button
              type="button"
              onClick={() => saveFile(`tactical_${report.id}.txt`, report.script_text ?? '', 'text/plain;charset=utf-8')}
              className="flex items-center gap-1 px-2 py-1 rounded border border-zinc-700 text-zinc-300 text-xs font-mono hover:border-emerald-500 hover:text-emerald-300 transition"
            >
              <Download className="w-3.5 h-3.5" />
              스크립트 저장
            </button>
          )}
          {report.confirmed ? (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-xs font-mono font-bold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              복창 승인 완료 · 전송 안 됨
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-950/80 border border-amber-500/50 text-amber-300 text-xs font-mono font-bold animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5" />
              복창 승인 대기 중
            </span>
          )}
        </div>
      </div>

      {/* 한 줄 명령 요약 (UNO Q 서버 응답) */}
      {report.command_text && (
        <div className="mt-3 flex items-start gap-2 bg-emerald-950/40 border border-emerald-700/50 rounded-lg px-3 py-2">
          <span className="shrink-0 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border border-emerald-600/60 text-emerald-300">
            {report.command_source === 'llm' ? '명령 · LLM' : '명령 · 규칙'}
          </span>
          <p className="text-sm font-mono font-bold text-emerald-100">{report.command_text}</p>
        </div>
      )}

      {/* Render Specific Report Content */}
      {report.report_type === 'SALUTE' && renderSalute(report.data as SaluteData)}
      {report.report_type === 'SITREP' && renderSitrep(report.data as SitrepData)}
      {report.report_type === '9-Line MEDEVAC' && renderMedevac(report.data as MedevacData)}

      {/* UNO Q 서버가 저장한 보고 스크립트 */}
      {report.script_text && (
        <details className="mt-4 bg-zinc-950/70 border border-zinc-800 rounded-lg">
          <summary className="cursor-pointer px-3 py-2 text-xs font-mono text-zinc-400">보고 스크립트 보기</summary>
          <pre className="px-3 pb-3 text-xs font-mono text-zinc-300 whitespace-pre-wrap">{report.script_text}</pre>
        </details>
      )}
    </div>
  )
}
