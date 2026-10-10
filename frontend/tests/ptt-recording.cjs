const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

async function check() {
  let recorder
  const listeners = {}
  let sentAudio
  let sentFile
  let recordingMime = 'audio/webm'
  const stateUpdates = []
  let tracksStopped = false
  let finishPermission
  let delayedPermission = false
  class Recorder extends EventTarget {
    state = 'inactive'
    mimeType = recordingMime
    constructor() { super(); recorder = this }
    start() { this.state = 'recording' }
    stop() {
      this.state = 'inactive'
      setImmediate(() => {
        this.ondataavailable({ data: new Blob(['last chunk']) })
        this.dispatchEvent(new Event('stop'))
      })
    }
  }
  const stream = { getTracks: () => [{ stop: () => { tracksStopped = true } }] }
  const scenario = { id: 'server-id', timestamp: '2026-10-10T15:00:00+09:00', report_type: 'SALUTE', threat_level: 'LOW', confirmed: false, raw_transcript: 'sample', read_back_text: 'sample', recommended_action: '', data: { size: '', activity: '', location: '', unit: '', time: '', equipment: '' } }
  let response = scenario
  const receivedReports = []
  const helper = { exports: {}, require: () => ({}) }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../src/data/reportHistory.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, helper)
  let failFetch = false
  let denyMicrophone = false
  const context = {
    exports: {},
    require: (name) => name === 'react' ? {
      useState: (value) => [value, (next) => stateUpdates.push({ initial: value, next })],
      useRef: (value) => ({ current: value }),
      useCallback: (callback) => callback,
      useEffect: (effect) => effect(),
    } : { MOCK_SCENARIOS: [scenario], parseApiReport: helper.exports.parseApiReport },
    navigator: { mediaDevices: { getUserMedia: () => denyMicrophone ? Promise.reject(new Error('denied')) : delayedPermission
      ? new Promise((resolve) => { finishPermission = () => resolve(stream) })
      : Promise.resolve(stream) } },
    window: { addEventListener: (name, callback) => { listeners[name] = callback }, removeEventListener() {}, AudioContext: class {
      state = 'running'
      createAnalyser() { return { frequencyBinCount: 1, getByteFrequencyData() {} } }
      createMediaStreamSource() { return { connect() {} } }
      close() { return Promise.resolve() }
    } },
    MediaRecorder: Recorder, Blob, FormData, console, AbortController,
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    setTimeout: (callback, ms) => ms === 30000 ? 1 : callback(), clearTimeout() {}, setInterval, clearInterval,
    fetch: async (_url, options) => {
      assert.equal(tracksStopped, true)
      if (failFetch) throw new TypeError('offline')
      sentAudio = await options.body.get('audio').text()
      sentFile = options.body.get('audio')
      return { ok: true, json: async () => response }
    },
  }
  const source = fs.readFileSync(require.resolve('../src/hooks/usePTT.ts'), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context)
  const hook = context.exports.usePTT({ apiEndpoint: '/api/tactical-process', onReportGenerated: report => receivedReports.push(report) })
  await hook.startPTT()
  const stopping = hook.stopPTT()
  assert.equal(sentAudio, undefined, 'must wait for final audio event')
  await hook.startPTT()
  assert.equal(recorder.state, 'inactive', 'must block recording while processing')
  await stopping
  assert.equal(sentAudio, 'last chunk', 'must upload final chunk even without earlier chunks')

  const key = (repeat = false, tagName = 'BODY') => ({ code: 'Space', repeat, target: { tagName }, preventDefault() {} })
  listeners.keydown(key(false, 'INPUT'))
  assert.equal(recorder.state, 'inactive', 'input fields must not start recording')
  listeners.keydown(key())
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(recorder.state, 'recording', 'first Space starts recording')
  listeners.keydown(key(true))
  assert.equal(recorder.state, 'recording', 'held key repeat must not stop recording')
  assert.equal(listeners.keyup, undefined, 'key release must not stop recording')
  listeners.keydown(key())
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(recorder.state, 'inactive', 'second Space stops recording')
  assert.equal(receivedReports.length, 2)
  receivedReports.pop()

  assert.equal(receivedReports.length, 1)
  response = { raw_transcript: 'invalid' }
  await hook.startPTT()
  await hook.stopPTT()
  assert.equal(receivedReports.length, 1, 'invalid response must not generate a report')
  response = scenario
  await hook.startPTT()
  await hook.stopPTT()
  assert.equal(receivedReports.length, 2, 'recording must recover after rejection')

  for (const [mime, extension] of [['audio/webm;codecs=opus', 'webm'], ['audio/mp4;codecs=mp4a.40.2', 'mp4'], ['audio/ogg;codecs=opus', 'ogg']]) {
    recordingMime = mime
    await hook.startPTT()
    await hook.stopPTT()
    assert.equal(sentFile.name, `tactical_voice.${extension}`)
    assert.equal(sentFile.type, mime)
  }
  const beforeUnsupported = receivedReports.length
  recordingMime = 'audio/unknown'
  await hook.startPTT()
  await hook.stopPTT()
  assert.equal(receivedReports.length, beforeUnsupported, 'unsupported format must not generate a report')
  recordingMime = 'audio/webm'
  stateUpdates.length = 0
  hook.resetToStandby()
  assert.equal(stateUpdates.filter(update => update.initial === '' && update.next === '').length, 2, 'mode reset must clear notice and transcript')
  const appSource = fs.readFileSync(require.resolve('../src/App.tsx'), 'utf8')
  assert.match(appSource, /resetToStandby\(\)\s+setMode\(nextMode\)/, 'mode switch must reset transcript before changing modes')

  delayedPermission = true
  tracksStopped = false
  const shortPress = context.exports.usePTT()
  const starting = shortPress.startPTT()
  await shortPress.stopPTT()
  finishPermission()
  await starting
  assert.equal(tracksStopped, true, 'late microphone permission must not leave recording active')
  let modeGenerated = 0
  const noServer = context.exports.usePTT({ mode: 'api', onReportGenerated: () => modeGenerated++ })
  await noServer.startPTT()
  await noServer.stopPTT()
  assert.equal(modeGenerated, 0, 'API mode without endpoint must not generate samples')

  delayedPermission = false
  context.fetch = async () => { throw new Error('server unavailable') }
  const failedApi = context.exports.usePTT({ mode: 'api', apiEndpoint: '/api/tactical-process', onReportGenerated: () => modeGenerated++ })
  await failedApi.startPTT()
  await failedApi.stopPTT()
  assert.equal(modeGenerated, 0, 'API failure must not generate samples')
  await failedApi.startPTT()
  assert.equal(recorder.state, 'recording', 'API failure must allow another recording')
  await failedApi.stopPTT()

  const demo = context.exports.usePTT({ mode: 'demo', onReportGenerated: () => modeGenerated++ })
  await demo.startPTT()
  await demo.stopPTT()
  assert.equal(modeGenerated, 1, 'demo mode must still generate samples')
  denyMicrophone = true
  await demo.startPTT()
  await demo.stopPTT()
  assert.equal(modeGenerated, 1, 'microphone failure must not generate a report')
  console.log('PTT recording, mode and error checks passed')
}
check().catch((error) => { console.error(error); process.exitCode = 1 })
