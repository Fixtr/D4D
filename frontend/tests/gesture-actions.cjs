const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

function check(status, confirmed = false) {
  let active = { id: 'one', confirmed, source: 'demo' }
  let reports = [active]
  let stateIndex = 0
  let recordingStarts = 0
  let listener
  const effects = []
  const react = {
    useState(initial) {
      const index = stateIndex++
      const value = index === 1 ? { reports, error: '' } : index === 2 ? reports : index === 3 ? active : typeof initial === 'function' ? initial() : initial
      return [value, next => {
        if (index === 2) reports = typeof next === 'function' ? next(reports) : next
        if (index === 3) active = next
      }]
    },
    useEffect(effect) { effects.push(effect) },
  }
  const context = { exports: {}, localStorage: { setItem() {} }, window: { addEventListener: (_name, fn) => { listener = fn }, removeEventListener() {} }, require(name) {
    if (name === 'react') return react
    if (name === 'react/jsx-runtime') return { jsx() {}, jsxs() {} }
    if (name.endsWith('usePTT')) return { usePTT: () => ({ status, startPTT: () => { recordingStarts++ }, resetToStandby() {} }) }
    if (name.endsWith('useReadBack')) return { useReadBack: () => ({ stop() {}, speak() {} }) }
    return {}
  } }
  const source = fs.readFileSync(require.resolve('../src/App.tsx'), 'utf8').replace('import.meta.env.VITE_TACTICAL_API_ENDPOINT', 'undefined')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, context)
  context.exports.App()
  effects.forEach(effect => effect())
  return { press(code, repeat = false) { listener({ code, repeat, target: { tagName: 'BODY' }, preventDefault() {} }) }, get active() { return active }, get reports() { return reports }, get starts() { return recordingStarts } }
}
const confirm = check('READ_BACK')
confirm.press('F13', true)
assert.equal(confirm.active.confirmed, false)
confirm.press('F13')
assert.equal(confirm.active.confirmed, true)
assert.equal(confirm.reports[0].confirmed, true)
const retry = check('READ_BACK')
retry.press('F14')
assert.equal(retry.active, undefined)
assert.equal(retry.starts, 1)
assert.equal(retry.reports[0].confirmed, false)
for (const status of ['TRANSMITTING', 'PROCESSING']) {
  const blocked = check(status)
  blocked.press('F13'); blocked.press('F14')
  assert.equal(blocked.active.confirmed, false)
  assert.equal(blocked.starts, 0)
}
const confirmed = check('STANDBY', true)
confirmed.press('F14')
assert.equal(confirmed.starts, 0)
console.log('Pitch confirmation and Yaw re-recording checks passed')
