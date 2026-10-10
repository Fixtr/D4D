# UNO Q AI: USB UART 전용

PC 웹 → localhost:5173의 Python 브리지 → USB 시리얼(COM 포트) → UNO Q `/dev/ttyGS0` → 기본 Arduino Router의 mon/read·mon/write → 기존 STT/RAG/LLM → 같은 UART로 결과 JSON → 웹.
localhost HTTP는 PC 내부에서만 사용한다. 보드와 PC 사이에는 IP 통신·ADB 터널·Wi-Fi 대체 경로가 없다.
브라우저는 녹음을 보내며, 결과는 처리 완료 후 한 번에 표시한다. 기본 모드는 USB UART이며 데모 모드는 명시적으로 선택한 샘플이다.

## UNO Q 준비

저장소의 `ai_pipeline/uart_server.py`, `ai_pipeline/run_uart.sh`, `hardware/uart_protocol.py`가 보드에도 있어야 한다.
기존 AI 가상환경과 모델 캐시를 사용한다. 새 MCU 펌웨어 업로드는 필요 없다.
AI 환경에는 msgpack도 설치돼 있어야 한다(`requirements.txt`). Arduino Router는 보드 내부 Unix 소켓(`/var/run/arduino-router.sock`)으로 접근한다.

```bash
cd /home/arduino/D4D/ai_pipeline
bash run_uno_q.sh stop
bash run_uart.sh start
bash run_uart.sh status
```

기본 시리얼 서비스를 그대로 사용한다. 관리자 비밀번호·sudo·서비스 변경은 필요 없다. 보드 재부팅 후 UART AI를 다시 시작한다.
Arduino 시리얼 모니터는 동시에 열지 않는다. ADB는 초기 파일 배포에만 사용하며 AI 데이터 통신에는 사용하지 않는다.

## PC 실행

```cmd
hardware\run_ui.cmd
```

http://localhost:5173에서 USB UART 모드로 녹음한다. http://localhost:5173/api/health의 `transport: usb-uart`가 보드 응답 확인이다.
USB UNO Q(USB VID 2341/PID 0078)를 자동 검색한다. 여러 대라면 실행 전에 `UNO_Q_UART_PORT=COM5`처럼 지정한다.
USB 연결이 없거나 보드 프로세스가 실행되지 않으면 오류를 표시하며 Wi-Fi로 전환하지 않는다.

## 프로토콜

115200bps USB CDC 가상 UART, 프레임 `NUAI` + 4바이트 big-endian JSON 헤더 길이 + UTF-8 JSON 헤더 + 바이너리 본문.
헤더에는 요청 ID, op(health/process), 본문 length, 파일명·MIME 또는 응답 status를 담는다.
최대 녹음 10MiB, 결과 대기 180초. 요청 ID를 확인하고 한 번에 한 요청을 처리한다.
자동 재전송은 하지 않아 중복 AI 처리/보고서 생성을 방지한다. USB를 다시 연결하고 재녹음하면 새 요청을 보낸다.

복원: `bash run_uart.sh stop`. 기본 시리얼 서비스는 유지된다.
