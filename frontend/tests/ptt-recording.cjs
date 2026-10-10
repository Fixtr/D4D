const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

async function check() {
  let recorder
  let sentAudio
  let tracksStopped = false
  let finishPermission
  let delayedPermission = false
  class Recorder extends EventTarget {
    state = 'inactive'
    mimeType = 'audio/webm'
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
  const scenario = { raw_transcript: 'sample' }
  const context = {
    exports: {},
    require: (name) => name === 'react' ? {
      useState: (value) => [value, () => {}],
      useRef: (value) => ({ current: value }),
      useCallback: (callback) => callback,
      useEffect: () => {},
    } : { MOCK_SCENARIOS: [scenario] },
    navigator: { mediaDevices: { getUserMedia: () => delayedPermission
      ? new Promise((resolve) => { finishPermission = () => resolve(stream) })
      : Promise.resolve(stream) } },
    window: { AudioContext: class {
      state = 'running'
      createAnalyser() { return { frequencyBinCount: 1, getByteFrequencyData() {} } }
      createMediaStreamSource() { return { connect() {} } }
      close() { return Promise.resolve() }
    } },
    MediaRecorder: Recorder, Blob, FormData, console,
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    setTimeout: (callback) => callback(), setInterval, clearInterval,
    fetch: async (_url, options) => {
      assert.equal(tracksStopped, true)
      sentAudio = await options.body.get('audio').text()
      return { ok: true, json: async () => scenario }
    },
  }
  const source = fs.readFileSync(require.resolve('../src/hooks/usePTT.ts'), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context)
  const hook = context.exports.usePTT({ apiEndpoint: '/api/tactical-process' })
  await hook.startPTT()
  const stopping = hook.stopPTT()
  assert.equal(sentAudio, undefined, 'must wait for final audio event')
  await hook.startPTT()
  assert.equal(recorder.state, 'inactive', 'must block recording while processing')
  await stopping
  assert.equal(sentAudio, 'last chunk', 'must upload final chunk even without earlier chunks')

  delayedPermission = true
  tracksStopped = false
  const shortPress = context.exports.usePTT()
  const starting = shortPress.startPTT()
  await shortPress.stopPTT()
  finishPermission()
  await starting
  assert.equal(tracksStopped, true, 'late microphone permission must not leave recording active')
  console.log('PTT recording checks passed')
}
check().catch((error) => { console.error(error); process.exitCode = 1 })
