import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createReport, parseReportHistory, parseApiReport } from './reportHistory.ts'
import { MOCK_SCENARIOS } from './mockScenarios.ts'

test('동일 샘플로 생성해도 ID가 다르고 승인은 해당 보고서에만 적용된다', () => {
  const first = createReport(MOCK_SCENARIOS[0])
  const second = createReport(MOCK_SCENARIOS[0])
  assert.notEqual(first.id, second.id)
  const reports = [first, second].map((report) => report.id === first.id ? { ...report, confirmed: true } : report)
  const restored = parseReportHistory(JSON.stringify(reports))
  assert.deepEqual(restored, reports)
  assert.equal(restored[0].confirmed, true)
  assert.equal(restored[1].confirmed, false)
  assert.match(restored[0].timestamp, /KST$/)
  assert.equal(MOCK_SCENARIOS[0].id, 'REP-2026-001')
})

test('손상된 저장 데이터와 중복 ID를 거부하고 빈 이력을 허용한다', () => {
  const report = createReport(MOCK_SCENARIOS[0])
  for (const value of ['invalid', '{}', '[null]', JSON.stringify([report, report]), JSON.stringify([{ ...report, data: null }])]) {
    assert.throws(() => parseReportHistory(value))
  }
  assert.deepEqual(parseReportHistory('[]'), [])
})

test('API 응답 검증과 서버 ID·시각 보존', () => {
  for (const scenario of MOCK_SCENARIOS) {
    const input = { ...scenario, id: 'server-id', timestamp: '2026-10-10T15:00:00+09:00', confirmed: false }
    const report = createReport(parseApiReport(input))
    assert.equal(report.id, input.id)
    assert.equal(report.timestamp, input.timestamp)
    assert.equal(report.source, 'api')
    const missing = { ...input.data }
    delete missing[Object.keys(missing)[0]]
    for (const value of [null, [], {}, { ...input, id: '' }, { ...input, confirmed: true },
      { ...input, timestamp: '15:00 KST' }, { ...input, report_type: 'toString' },
      { ...input, threat_level: 'UNKNOWN' }, { ...input, raw_transcript: null },
      { ...input, data: missing }, { ...input, data: { ...input.data, extra: 'bad' } },
      { ...input, data: Object.fromEntries(Object.keys(input.data).map(key => [key, 3])) }]) {
      assert.throws(() => parseApiReport(value), /AI 응답 형식 오류/)
    }
  }
})
