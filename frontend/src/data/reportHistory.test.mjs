import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createReport, parseReportHistory } from './reportHistory.ts'
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
