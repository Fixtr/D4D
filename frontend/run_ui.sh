#!/usr/bin/env bash
# 전술 UI 실행 스크립트 (Linux / WSL / macOS)
# UNO Q AI 서버 주소를 .env.local 에 기록하고 Vite 개발 서버를 띄운다.
#
# 사용: ./run_ui.sh [보드IP 또는 API 주소]
#   ./run_ui.sh                      → 기존 .env.local 사용, 없으면 192.168.0.139
#   ./run_ui.sh 192.168.0.139        → http://192.168.0.139:8000/api/tactical-process
#   ./run_ui.sh demo                 → 서버 없이 데모 샘플 모드
# 브라우저: http://localhost:5173 (마이크는 localhost 또는 HTTPS에서만 허용됨)
set -euo pipefail

UI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$UI_DIR/.env.local"
DEFAULT_BOARD="192.168.0.139"
NODE_VERSION="v22.20.0"
NODE_CACHE="$HOME/.cache/d4d-node"

die() { echo "오류: $*" >&2; exit 1; }

# 1. Node.js (Vite 8 은 Node 20.19+ 필요). 없거나 오래됐으면 휴대용 Node 를 받아 이 스크립트에서만 사용
node_ok() {
  command -v node >/dev/null && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=12)||(a===20&&b>=19)?0:1)'
}
if ! node_ok; then
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) platform=linux-x64 ;;
    Linux-aarch64) platform=linux-arm64 ;;
    Darwin-x86_64) platform=darwin-x64 ;;
    Darwin-arm64) platform=darwin-arm64 ;;
    *) die "Node.js 20.19+ 를 직접 설치하세요 (지원하지 않는 플랫폼: $(uname -sm))" ;;
  esac
  node_dir="$NODE_CACHE/node-$NODE_VERSION-$platform"
  if [[ ! -x "$node_dir/bin/node" ]]; then
    echo "[1/4] Node.js $NODE_VERSION 다운로드 → $NODE_CACHE"
    mkdir -p "$NODE_CACHE"
    curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-$platform.tar.xz" | tar xJf - -C "$NODE_CACHE"
  fi
  export PATH="$node_dir/bin:$PATH"
fi
echo "[1/4] Node.js $(node --version)"

# 2. 의존성
cd "$UI_DIR"
if [[ ! -d node_modules ]] || [[ package-lock.json -nt node_modules ]]; then
  echo "[2/4] 의존성 설치 (npm ci)"
  npm ci --no-audit --no-fund
else
  echo "[2/4] 의존성 설치됨"
fi

# 3. AI 서버 주소 (.env.local, git 에 커밋되지 않음)
target="${1:-}"
if [[ "$target" == "demo" ]]; then
  api_url=""
elif [[ -n "$target" ]]; then
  [[ "$target" == http* ]] && api_url="$target" || api_url="http://$target:8000/api/tactical-process"
elif [[ -f "$ENV_FILE" ]]; then
  api_url="$(grep -E '^VITE_API_URL=' "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"
else
  api_url="http://$DEFAULT_BOARD:8000/api/tactical-process"
fi
echo "VITE_API_URL=$api_url" >"$ENV_FILE"

if [[ -z "$api_url" ]]; then
  echo "[3/4] 데모 모드: AI 서버에 보내지 않고 샘플 보고서를 표시합니다"
else
  health_url="${api_url%/api/*}/api/health"
  if health="$(curl -sf --max-time 5 "$health_url")"; then
    echo "[3/4] AI 서버 연결 확인: $health"
  else
    echo "[3/4] 경고: AI 서버에 연결할 수 없습니다 ($health_url)"
    echo "      보드에서 ~/D4D/ai_pipeline/run_uno_q.sh 실행 여부와 같은 Wi-Fi 연결을 확인하세요."
    echo "      UI는 실행되지만 녹음 결과 대신 샘플 보고서가 표시됩니다."
  fi
fi

# 4. 개발 서버
echo "[4/4] UI 실행: 브라우저에서 http://localhost:5173 을 여세요 (종료: Ctrl+C)"
echo "      PTT: 화면 버튼을 누르고 있거나 Space 키를 누른 채 말하고, 떼면 보드로 전송됩니다."
exec npm run dev
