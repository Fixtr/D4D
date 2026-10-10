#!/usr/bin/env bash
# Uses the standard Arduino Router monitor API without sudo or service changes.
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UART_VENV="${VENV:-$HOME/.venv}"
UART_LOG="$APP_DIR/logs/uart.log"
UART_PID="$APP_DIR/logs/uart.pid"
case "${1:-start}" in
  start)
    if ! systemctl is-active --quiet arduino-router-serial.service; then
      echo '보드의 기본 USB 시리얼 서비스가 실행 중이어야 합니다.' >&2
      exit 2
    fi
    if [[ -f "$UART_PID" ]] && kill -0 "$(cat "$UART_PID")" 2>/dev/null; then
      echo 'UART AI가 이미 실행 중입니다.'; exit 0
    fi
    [[ -x "$UART_VENV/bin/python" ]] || { echo 'AI Python 환경이 없습니다.' >&2; exit 1; }
    mkdir -p "$APP_DIR/logs"
    cd "$APP_DIR"
    export HF_HUB_OFFLINE=1 CLIKA_MODELVERSE_OFFLINE=1
    nohup "$UART_VENV/bin/python" -u uart_server.py >>"$UART_LOG" 2>&1 </dev/null &
    echo $! >"$UART_PID"
    echo "UART AI 시작 PID=$(cat "$UART_PID"); 로그: $UART_LOG"
    ;;
  stop)
    if [[ -f "$UART_PID" ]] && kill -0 "$(cat "$UART_PID")" 2>/dev/null; then kill "$(cat "$UART_PID")"; fi
    rm -f "$UART_PID"
    echo 'UART AI 중지됨. 기본 시리얼 서비스는 유지됩니다.'
    ;;
  status)
    if [[ -f "$UART_PID" ]] && kill -0 "$(cat "$UART_PID")" 2>/dev/null; then echo 'UART AI 실행 중'; else echo 'UART AI 중지됨'; fi
    tail -5 "$UART_LOG" 2>/dev/null || true
    ;;
  *) echo '사용법: run_uart.sh [start|stop|status]' >&2; exit 1 ;;
esac
