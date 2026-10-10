import type { TacticalReport } from '../types/tactical'

export const REPORT_HISTORY_KEY = 'tactical-report-history-v1'

export function createReport(report: TacticalReport): TacticalReport {
  if (report.source === 'api') return report
  return {
    ...report,
    id: crypto.randomUUID(),
    timestamp: new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false }) + ' KST',
    confirmed: false,
  }
}

export function parseReportHistory(value: string): TacticalReport[] {
  const reports = JSON.parse(value)
  if (!Array.isArray(reports)) throw new Error('보고서 이력 형식 오류')
  const ids = new Set<string>()
  for (const report of reports) {
    if (!report ||
      !['id', 'timestamp', 'raw_transcript', 'read_back_text', 'recommended_action'].every(
        (key) => typeof report[key] === 'string') || !report.id || ids.has(report.id) ||
      !['SALUTE', 'SITREP', '9-Line MEDEVAC'].includes(report.report_type) ||
      !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(report.threat_level) ||
      typeof report.confirmed !== 'boolean' ||
      !report.data || typeof report.data !== 'object' || Array.isArray(report.data) ||
      !Object.values(report.data).every((field) => typeof field === 'string') ||
      (report.source !== undefined && report.source !== 'demo' && report.source !== 'api')) {
      throw new Error('보고서 이력 형식 오류')
    }
    ids.add(report.id)
  }
  return reports
}

export function parseApiReport(value: unknown): TacticalReport {
  const fail = () => { throw new Error('AI 응답 형식 오류: 필수 필드와 보고서 구조를 확인하세요.') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail()
  const report = value as Record<string, unknown>
  const fields: Record<string, string[]> = {
    SALUTE: ['size', 'activity', 'location', 'unit', 'time', 'equipment'],
    SITREP: ['unit_status', 'location', 'ammo_supply', 'casualties', 'operational_status'],
    '9-Line MEDEVAC': ['line1_location', 'line2_freq_callsign', 'line3_patients_precedence', 'line4_special_equipment', 'line5_patient_type', 'line6_security', 'line7_marking', 'line8_patient_nationality', 'line9_cbrn'],
  }
  const keys = typeof report.report_type === 'string' && Object.hasOwn(fields, report.report_type)
    ? fields[report.report_type] : undefined
  if (!keys || !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(String(report.threat_level)) ||
    !['id', 'timestamp', 'raw_transcript', 'read_back_text', 'recommended_action'].every(key => typeof report[key] === 'string') ||
    !String(report.id).trim() || report.confirmed !== false ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(String(report.timestamp)) ||
    !Number.isFinite(Date.parse(String(report.timestamp))) ||
    !report.data || typeof report.data !== 'object' || Array.isArray(report.data)) return fail()
  const data = report.data as Record<string, unknown>
  if (Object.keys(data).length !== keys.length || !keys.every(key => Object.hasOwn(data, key) && typeof data[key] === 'string')) return fail()
  return { ...report, source: 'api' } as unknown as TacticalReport
}
