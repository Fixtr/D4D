# 프론트엔드 ↔ NU40 BLE 연결

최신 main의 frontend를 그대로 빌드하고 hardware/ui_ble_bridge.py가 HTML에 ui_ble_adapter.js를 주입한다.
frontend 소스 변경 없음. 서버 주소 http://127.0.0.1:5173 (localhost).
BLE Central은 이 Python 프로세스 하나다. 기존 ble_recording_peer.py 콘솔은 종료한다.

## 한 번에 빌드하고 실행
저장소 루트에서 실행한다. 다른 폴더에서 절대 경로로 실행해도 동작한다.

Linux/macOS/UNO Q:
```bash
bash hardware/run_ui.sh
```
Windows:
```cmd
hardware\run_ui.cmd
```

스크립트는 Node.js 확인(없으면 휴대용 Node 22를 ~/.cache/d4d-node에 받음) → AI 서버 주소 설정·연결 확인 → hardware/.venv 생성 → BLE Python 의존성 설치 → frontend npm ci → npm run build → localhost BLE 서버 실행 순서로 처리한다.

### 옵션
| 옵션 | 동작 |
| --- | --- |
| `--api <보드IP 또는 URL>` | UNO Q AI 서버 주소를 `frontend/.env.local`에 기록. 생략하면 기존 값, 없으면 `192.168.0.139` |
| `--dev` | BLE 없이 Vite 개발 서버 실행 (화면 개발·핫 리로드용, 블루투스가 없는 WSL에서 사용) |
| `--build-only` | 의존성 설치와 빌드만 수행 |

예: `bash hardware/run_ui.sh --api 192.168.0.139` (NU40 연동), `bash hardware/run_ui.sh --dev` (BLE 없이 UI만).
화면의 실행 모드를 **실제 API**로 바꿔야 녹음이 AI 서버로 전송된다. AI 서버는 보드에서 `~/D4D/ai_pipeline/run_uno_q.sh`로 실행한다.
http://localhost:5173에 접속하고 마이크를 허용한다. 종료는 Ctrl+C.
기존 hardware/ui_ble_test.cmd도 같은 통합 실행 스크립트로 연결된다.
빌드만 검증하려면 위 명령 뒤에 --build-only를 붙인다.
Python 3.10+가 필요하다. Node.js 20.19+/22.12+가 없으면 휴대용 Node를 자동으로 받는다. Debian/UNO Q에서는 python3-venv도 설치되어 있어야 한다.
첫 실행의 패키지 설치에는 인터넷이 필요하다. OS Bluetooth가 켜져 있어야 한다.
현재 PC의 기존 BLE 콘솔/브리지를 종료한 뒤 다른 기기에서 실행한다. 포트 5173 사용 중이면 기존 서버를 자동 종료하지 않고 안내한다.
이 명령은 frontend와 BLE 브리지만 실행한다. 실제 AI API 서버는 별도로 실행한다(시작 시 연결 여부만 확인).
## 동작
- NU40 s → 화면 녹음 시작 버튼. e → 녹음 종료 버튼. 이미 해당 상태이면 중복 입력 무시.
- 화면 보고서 처리 완료 → BLE q 질문 활성화. y → 기존 F13 확정, n → 기존 F14 재녹음.
- 질문 버튼으로 현재 초안의 예/아니오를 수동 요청할 수도 있다. 초기 저장된 초안에는 자동 질문하지 않는다.
- UI 녹음 버튼/Space 및 n 후 자동 녹음도 보드에 상태를 동기화한다.
- 추가 RX 문자 a = UI 녹음 활성 상태 동기화, z = UI 녹음 비활성/질문 취소. 이 문자는 녹음 요청이 아니며 TX 알림을 발생시키지 않는다.
- UI 닫힘/연결 해제 시 z로 세션 취소. 한 UI만 연결한다. 재연결 시 이전 이벤트/질문은 재생하지 않는다.
- 질문 30초 경과하면 UI 질문 버튼으로 다시 요청한다.
- 브리지는 localhost에만 바인딩한다. UNO Q에서도 Python으로 실행 가능하지만 아이폰 원격 접속에는 HTTPS·네트워크 설정이 추가로 필요하다.

## 현재 마이크와 AI
이 프론트엔드는 열린 브라우저의 마이크를 사용한다. PC 테스트에서는 PC 마이크다.
별도 아이폰 앱 녹음 전달은 아직 연결하지 않았다.
기본 데모 모드는 실제 녹음 내용 대신 샘플 보고서를 사용한다. 실제 API 모드는 AI 서버가 별도 실행되어야 한다.
이번 작업은 실제 BLE↔프론트엔드 조작 연동이며 AI 서버/UNO Q 실행 검증과 구분한다.

## 검증
최신 main d08db61 수신, UI 빌드 성공. 기존 gesture-actions/ptt-recording/status-labels 테스트 통과.
합성 브라우저 마이크 + 실제 PC↔NU40 BLE, USB g/j/k 수동 트리거로 s/e/y/n UI 흐름 검증.
종료→보고서→자동 q→예 확정, 아니오→자동 재녹음→보드 RECORDING 동기화→다음 비틀기 e 흐름 통과.
실제 손동작 판정은 앞선 장갑 테스트와 별도이며 이번 자동검증은 수동 트리거를 사용했다.
