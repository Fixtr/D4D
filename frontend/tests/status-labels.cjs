const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

function load(relativePath) {
  const filename = path.resolve(__dirname, '..', relativePath)
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  loaded._compile(code, filename)
  return loaded.exports
}

const { MOCK_SCENARIOS } = load('src/data/mockScenarios.ts')
const { ReportCard } = load('src/components/ReportCard.tsx')
const { ReportHistory } = load('src/components/ReportHistory.tsx')
const { BattleDrillAlert } = load('src/components/BattleDrillAlert.tsx')
const { Header } = load('src/components/Header.tsx')
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props))
for (const report of MOCK_SCENARIOS) {
  assert.equal(report.source, 'demo')
  assert.match(render(ReportCard, { report }), /샘플/)
}
assert.match(render(ReportCard, { report: { ...MOCK_SCENARIOS[0], source: 'api' } }), /API 응답 \(모델 미검증\)/)
assert.match(render(ReportCard, { report: { ...MOCK_SCENARIOS[0], source: undefined } }), /출처 미확인/)
assert.match(render(ReportCard, { report: { ...MOCK_SCENARIOS[0], confirmed: true } }), /전송 안 됨/)
assert.match(render(ReportHistory, { reports: MOCK_SCENARIOS, activeReportId: '', onSelectReport() {} }), /샘플/)
assert.match(render(BattleDrillAlert, { action: 'test', source: 'demo' }), /샘플 권고 · RAG 미검증/)
assert.match(render(BattleDrillAlert, { action: 'test', source: 'api' }), /서버 권고 · RAG 미검증/)
assert.doesNotMatch(render(Header), /AIR-GAP 100%|LINKED|98%/)
console.log('Status label checks passed')
