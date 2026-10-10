import type { TacticalReport } from '../types/tactical'

export const REPORT_HISTORY_KEY = 'tactical-report-history-v1'

export function createReport(report: TacticalReport): TacticalReport {
  // 서버 응답은 서버가 부여한 id·timestamp를 유지 (보드에 저장된 JSON/스크립트 파일과 같은 ID)
  const fromServer = report.source === 'api' && Boolean(report.id) && Boolean(report.timestamp)
  return {
    ...report,
    id: fromServer ? report.id : crypto.randomUUID(),
    timestamp: fromServer
      ? report.timestamp
      : new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false }) + ' KST',
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
