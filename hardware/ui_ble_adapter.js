// Adapter for the existing frontend's Space/F13/F14 gesture contract.
// Hardware s/e remain explicit commands; they never blindly toggle recording.
(() => {
  const panel = document.createElement('aside');
  panel.style.cssText = 'position:fixed;right:16px;bottom:36px;z-index:1000;background:#18181b;color:#fafafa;padding:12px 16px;border:1px solid #52525b;border-radius:12px;font:14px sans-serif;max-width:360px';
  const label = document.createElement('div');
  label.textContent = 'NU40 연결 중';
  const askButton = document.createElement('button');
  askButton.textContent = '예 / 아니오 질문 보내기';
  askButton.style.cssText = 'margin-top:8px;padding:6px 10px;background:#164DAB;border-radius:6px;color:white';
  panel.append(label, askButton);
  document.body.append(panel);
  let socket, connected = false, armed = false, timer;
  let previous = '', lastSync = null;
  const root = document.getElementById('root');
  function recordingButton() { return root.querySelector('button[aria-label="녹음 종료"]'); }
  function startButton() { return root.querySelector('button[aria-label="녹음 시작"]'); }
  function draftButton(prefix) {
    return [...root.querySelectorAll('button')].find(button => button.textContent.trim().startsWith(prefix));
  }
  function state() {
    if (recordingButton()) return 'recording';
    if (startButton()?.disabled) return 'processing';
    return draftButton('확정') ? 'draft' : 'idle';
  }
  function send(message) {
    if (socket?.readyState !== WebSocket.OPEN || !connected) return false;
    socket.send(JSON.stringify(message));
    return true;
  }
  function disarm() { armed = false; clearTimeout(timer); }
  function ask() {
    if (state() !== 'draft' || !send({type: 'question'})) return;
    label.textContent = '예 / 아니오 질문 전송 중';
  }
  askButton.onclick = ask;
  function key(code) {
    window.dispatchEvent(new KeyboardEvent('keydown', {code, key: code, bubbles: true}));
    window.dispatchEvent(new KeyboardEvent('keyup', {code, key: code, bubbles: true}));
  }
  function updateBadge() {
    const badge = [...root.querySelectorAll('header span')].find(node => node.textContent.startsWith('NUCODE BLE:'));
    const text = connected ? 'NUCODE BLE: 연결됨' : 'NUCODE BLE: 연결 대기';
    if (badge && badge.textContent !== text) badge.textContent = text;
  }
  function observe() {
    updateBadge();
    const current = state();
    const isRecording = current === 'recording';
    if (connected && current !== 'processing' && lastSync !== current) {
      if (send({type: 'state', recording: isRecording})) lastSync = current;
    }
    if (current === 'recording' || current === 'processing' || current === 'idle') disarm();
    if (previous === 'processing' && current === 'draft') ask();
    previous = current;
  }
  new MutationObserver(observe).observe(root, {subtree: true, childList: true, attributes: true});
  function connect() {
    socket = new WebSocket(`ws://${location.host}/hardware/ws`);
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.type === 'status') {
        connected = message.connected;
        disarm(); lastSync = null;
        label.textContent = connected ? 'NU40 연결됨 · 비틀기로 녹음 시작/종료' : 'NU40 검색 중';
        observe();
      } else if (message.type === 'error') {
        label.textContent = message.message;
      } else if (message.type === 'question' && message.sent) {
        armed = true;
        label.textContent = '질문 대기 · 위아래: 예 / 좌우: 아니오';
        clearTimeout(timer);
        timer = setTimeout(() => {disarm(); label.textContent = '질문 시간이 지났습니다. 질문 버튼을 다시 누르세요.';}, 30000);
      } else if (message.type === 'gesture') {
        const current = state();
        const signal = message.signal;
        label.textContent = {s:'녹음 시작', e:'녹음 종료', y:'예 · 확정', n:'아니오 · 재녹음'}[signal];
        if (signal === 's' && current !== 'recording' && current !== 'processing') startButton()?.click();
        else if (signal === 'e' && current === 'recording') recordingButton().click();
        else if (armed && current === 'draft' && (signal === 'y' || signal === 'n')) {
          disarm(); key(signal === 'y' ? 'F13' : 'F14');
        }
        panel.style.borderColor = {s:'#eab308',e:'#eab308',y:'#3b82f6',n:'#ef4444'}[signal];
      }
    };
    socket.onclose = () => { connected = false; disarm(); lastSync = null; label.textContent = '연결 재시도 중'; updateBadge(); setTimeout(connect, 2000); };
  }
  observe(); connect();
})();
