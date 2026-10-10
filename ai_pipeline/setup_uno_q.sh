#!/usr/bin/env bash
# UNO Q 최초 1회 설치 스크립트 (인터넷 연결 필요)
# Python 3.12 가상환경, ClikaRT wheel, 서버 의존성 설치 후 모델을 미리 받아 오프라인 실행을 준비한다.
#
# 사용: ./setup_uno_q.sh [clika_runtime-*.whl 경로]
#   wheel 경로를 생략하면 ~/clika_runtime-*-cp312-*aarch64.whl 을 찾는다.
# 라이선스는 별도 등록: ~/.venv/bin/clikart-license-init <LICENSE_KEY>
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="${VENV:-$HOME/.venv}"
STT_MODEL="${STT_MODEL:-openai/whisper-base}"
LLM_MODEL="${LLM_MODEL:-Qwen/Qwen2.5-0.5B-Instruct}"
WHEEL="${1:-$(ls "$HOME"/clika_runtime-*-cp312-*aarch64.whl 2>/dev/null | sort -V | tail -1 || true)}"

die() { echo "오류: $*" >&2; exit 1; }

# 1. Python 3.12 (Debian 13 기본은 3.13 이라 clika_runtime cp312 wheel 을 쓸 수 없음)
if [[ ! -x "$VENV/bin/python" ]]; then
  if ! command -v uv >/dev/null && [[ ! -x "$HOME/.local/bin/uv" ]]; then
    echo "[1/4] uv 설치"
    curl -LsSf https://astral.sh/uv/install.sh | sh
  fi
  export PATH="$HOME/.local/bin:$PATH"
  echo "[1/4] Python 3.12 가상환경 생성: $VENV"
  uv venv --python 3.12 "$VENV"
  # wheel 압축 방식 때문에 uv pip 대신 pip 사용
  "$VENV/bin/python" -m ensurepip
else
  echo "[1/4] 가상환경 있음: $VENV ($("$VENV/bin/python" --version))"
fi

# 2. ClikaRT
if "$VENV/bin/python" -c "import clika_runtime" 2>/dev/null; then
  echo "[2/4] clika_runtime 설치됨"
else
  [[ -n "$WHEEL" && -f "$WHEEL" ]] || die "clika_runtime wheel 을 찾을 수 없습니다. 경로를 인자로 주세요."
  echo "[2/4] clika_runtime 설치: $WHEEL"
  "$VENV/bin/python" -m pip install -q "$WHEEL"
fi

# 3. 서버 의존성 (FastAPI, PyAV 등)
echo "[3/4] 서버 의존성 설치"
"$VENV/bin/python" -m pip install -q -r "$APP_DIR/requirements.txt"

# 4. 모델 미리 받기 (오프라인 시연 대비)
if [[ -f "$HOME/.clika/runtime/license" || -n "${CLIKA_RT_LICENSE:-}" ]]; then
  echo "[4/4] 모델 다운로드: $STT_MODEL, $LLM_MODEL"
  "$VENV/bin/clikart-cli" -q fetch "$STT_MODEL"
  "$VENV/bin/clikart-cli" -q fetch "$LLM_MODEL"
else
  echo "[4/4] 건너뜀: ClikaRT 라이선스를 먼저 등록하세요"
  echo "      $VENV/bin/clikart-license-init <LICENSE_KEY> 후 이 스크립트를 다시 실행"
fi

chmod +x "$APP_DIR/run_uno_q.sh"
echo "설치 완료. 서버 실행: $APP_DIR/run_uno_q.sh"
