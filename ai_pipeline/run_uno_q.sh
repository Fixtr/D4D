#!/usr/bin/env bash
# UNO Q 온디바이스 전술 AI 서버 실행 스크립트
# UI(노트북·휴대폰 브라우저)가 녹음 파일을 POST /api/tactical-process 로 보내면
# 오디오 변환 → ClikaRT Whisper STT → 규칙 구조화/교범 검색(→ 선택적 LLM 복창) → 보고서 JSON 응답 + 스크립트 저장
#
# 사용: ./run_uno_q.sh [start|stop|restart|status|logs|fg]
#   start   백그라운드 실행 후 모델 로드 완료(health)까지 대기 (기본)
#   fg      포그라운드 실행 (Ctrl+C 종료)
#
# 환경변수 (기본값)
#   VENV=~/.venv                 Python 3.12 가상환경 (setup_uno_q.sh 로 생성)
#   PORT=8000
#   STT_MODEL=openai/whisper-base
#   READBACK_MODE=rule           llm 이면 Qwen2.5-0.5B 로 복창 생성 (건당 +17~37초)
#   OFFLINE=1                    1 이면 모델 허브에 접속하지 않고 로컬 캐시만 사용 (Air-gap 시연)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="${VENV:-$HOME/.venv}"
PORT="${PORT:-8000}"
LOG_DIR="$APP_DIR/logs"
LOG_FILE="$LOG_DIR/server.log"
PID_FILE="$LOG_DIR/server.pid"
HEALTH_URL="http://127.0.0.1:$PORT/api/health"
STARTUP_TIMEOUT="${STARTUP_TIMEOUT:-180}"

export STT_MODEL="${STT_MODEL:-openai/whisper-base}"
export READBACK_MODE="${READBACK_MODE:-rule}"
if [[ "${OFFLINE:-1}" == "1" ]]; then
  export HF_HUB_OFFLINE=1 CLIKA_MODELVERSE_OFFLINE=1
fi

die() { echo "오류: $*" >&2; exit 1; }

is_running() {
  [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

lan_ip() {
  hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^(192\.168|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)' | grep -v '^172\.17\.' | head -1
}

preflight() {
  [[ -x "$VENV/bin/python" ]] || die "$VENV 가 없습니다. 먼저 ./setup_uno_q.sh 를 실행하세요."
  "$VENV/bin/python" -c "import clika_runtime, fastapi, uvicorn, multipart, av" 2>/dev/null \
    || die "필요한 패키지가 없습니다. ./setup_uno_q.sh 를 다시 실행하세요."
  [[ -f "$HOME/.clika/runtime/license" || -n "${CLIKA_RT_LICENSE:-}" ]] \
    || die "ClikaRT 라이선스가 없습니다: $VENV/bin/clikart-license-init <LICENSE_KEY>"
  mkdir -p "$LOG_DIR"
}

server_cmd() {
  cd "$APP_DIR"
  exec "$VENV/bin/python" -m uvicorn app:app --host 0.0.0.0 --port "$PORT"
}

start() {
  if is_running; then
    echo "이미 실행 중입니다 (PID $(cat "$PID_FILE"))."; status; return
  fi
  preflight
  echo "서버 시작: STT=$STT_MODEL, 복창=$READBACK_MODE, 오프라인=${OFFLINE:-1}, 포트=$PORT"
  ( server_cmd ) >>"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"

  echo -n "모델 로드 대기"
  for ((i = 0; i < STARTUP_TIMEOUT; i += 2)); do
    if curl -sf "$HEALTH_URL" >/dev/null; then
      echo " 완료"; status; return
    fi
    if ! is_running; then
      echo; tail -20 "$LOG_FILE" >&2; rm -f "$PID_FILE"; die "서버가 시작 중 종료됐습니다 (위 로그 참고)."
    fi
    echo -n "."; sleep 2
  done
  echo; die "${STARTUP_TIMEOUT}초 안에 준비되지 않았습니다: $LOG_FILE 확인"
}

stop() {
  if is_running; then
    kill "$(cat "$PID_FILE")" && echo "서버 종료 (PID $(cat "$PID_FILE"))"
    for _ in {1..10}; do is_running || break; sleep 1; done
  else
    echo "실행 중이 아닙니다."
  fi
  rm -f "$PID_FILE"
}

status() {
  if is_running && curl -sf "$HEALTH_URL" >/dev/null; then
    echo "상태: 실행 중 (PID $(cat "$PID_FILE"))"
    echo "  $(curl -s "$HEALTH_URL")"
    local ip; ip="$(lan_ip)"
    echo "  UI 연결 주소: VITE_API_URL=http://${ip:-<보드IP>}:$PORT/api/tactical-process"
  elif is_running; then
    echo "상태: 시작 중 (모델 로드 중, PID $(cat "$PID_FILE"))"
  else
    echo "상태: 중지됨"
  fi
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status) status ;;
  logs) tail -f "$LOG_FILE" ;;
  fg) preflight; echo "포그라운드 실행 (Ctrl+C 종료)"; server_cmd ;;
  *) die "사용법: $0 [start|stop|restart|status|logs|fg]" ;;
esac
