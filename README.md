# T4-2 핸즈프리 음성 온디바이스 전술 AI (Voice-first Tactical AI)
> **Korean Defense Tech Hackathon 2026 (D4D × EDTH SEOUL)**  
> **트랙:** T4. Tactical Edge: Sensor Fusion & Edge AI  
> **스페셜 챌린지:** SC1(CLIKA BYOD On-Device) + SC2(NUCODE Board)

---

## 3인 팀 병렬 개발 및 폴더 구조

HW는 hardware/, AI는 ai_pipeline/, UI & 도메인은 frontend/와 knowledge_base/를 담당합니다. 공통 문서와 연동 규격은 함께 검토합니다.

```
D4D/
├── frontend/             # [Front/UI] React + Vite 전술 HUD 대시보드
├── ai_pipeline/          # [AI/ClikaRT] 온디바이스 STT + 로컬 RAG + sLLM 백엔드
├── hardware/             # [HW/NUCODE] 아두이노 BLE PTT 펌웨어 및 하드웨어 구성도
└── knowledge_base/       # [도메인/기획] 보병 교범 RAG 청크, 시스템 프롬프트, 3분 피칭 대본
```

---

## 팀원별 빠른 시작 가이드 (Quick Start)

### 1. Front/UI 담당 (`/frontend`)
* **역할**: 전술 대시보드, PTT 키보드 이벤트 리스닝, Web Audio 마이크 수음, SALUTE 카드 렌더링.
* **실행**:
  ```bash
  cd frontend
  npm install
  npm run dev   # http://localhost:5173
  ```
* **하드웨어 연동**: 별도 작업 없이 단말기에 연결된 키보드의 `Space` 키 입력을 즉시 감지합니다.

### 2. HW/NUCODE 담당 (`/hardware`)
* **역할**: NUCODE 보드에 스위치를 연결하고 BLE HID 키보드로 동작시켜 `Space` 키 신호 전송.
* **파일**: `nucode_ptt.ino` (아두이노 IDE에서 `ESP32-BLE-Keyboard` 라이브러리로 업로드).
* **SC2 제출물**: `hardware/README.md` 내 **하드웨어 구성도(Architecture Diagram)** 포함 완료.

### 3. AI/ClikaRT 담당 (`/ai_pipeline`)
* **역할**: 로컬 오디오 Blob 수신 $\rightarrow$ Whisper STT $\rightarrow$ ClikaRT LLM JSON 추출 서버 구동.
* **파일**: `app.py`, `tactical_engine.py` (FastAPI 엔드포인트: `POST /api/tactical-process`).
* **실행**:
  ```bash
  cd ai_pipeline
  pip install -r requirements.txt
  python app.py  # http://localhost:8000
  ```

### UI 담당의 도메인 작업 (`/knowledge_base`)
* **역할**: 군사 교범 RAG 지식 보강(`chunks.jsonl`), 전술 추출 프롬프트 검수(`system_prompt.txt`), 심사위원 대응 현장 3분 라이브 시연 리허설(`pitching_script.md`).

## 현재 구현 상태

현재 UI와 AI 서버는 합성 샘플을 사용하는 개발용 데모입니다. 실제 STT·ClikaRT 모델, 보드 연결, 한국어 TTS 오프라인 동작은 검증 전입니다. 상세 상태는 PROJECT_PROGRESS_SUMMARY.md와 API_CONTRACT.md를 참고하세요.

## 협업 및 제출 데이터

- main은 시연 가능한 상태로 유지하고, 작업 브랜치의 PR을 다른 팀원 한 명이 확인한 뒤 합칩니다.
- 보고 샘플 3개와 RAG 합성 청크 20개를 포함합니다. 공식 교범이나 실제 작전 자료가 아닙니다.
- 원본 DB, 인증정보, 실제 녹음·개인정보는 커밋하지 않습니다. .gitignore는 일부 파일의 실수 방지용이며 커밋 전 내용을 직접 확인합니다.
- all_showcases.json은 참고용 외부 프로젝트 모음으로 제출 대상에서 제외합니다.
