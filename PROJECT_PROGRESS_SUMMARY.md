# T4-2 프로젝트 진행 상황

기준: 2026-10-10. 현재 코드를 기준으로 정리한 개발 상태이며, 현장 실동작을 검증한 결과는 아닙니다.

## 3인 팀 담당 범위

| 담당 | 경로 | 역할 |
| --- | --- | --- |
| HW | hardware/ | NUCODE PTT 펌웨어와 하드웨어 구성도 |
| AI | ai_pipeline/ | 음성 인식, 보고 구조화, 로컬 검색 및 API |
| UI & 도메인 | frontend/, knowledge_base/ | 녹음 화면, 보고 카드, 복창, 합성 지식 자료 |

공통 연동 규격은 [API_CONTRACT.md](API_CONTRACT.md)를 기준으로 함께 검토합니다. 폴더를 나눠도 공통 파일과 인터페이스 변경에는 충돌이 발생할 수 있습니다.

## 현재 구현

- UI: React 기반 PTT 버튼과 Space 키 입력, 마이크 녹음·파형, 보고 카드, 복창, 보고 이력 저장을 구현했습니다. 현재 App은 AI API 주소를 전달하지 않아 합성 샘플을 표시합니다.
- 보고 샘플: [mockScenarios.ts](frontend/src/data/mockScenarios.ts)에 데모 표시가 있는 SALUTE·SITREP·MEDEVAC 예시 3개가 있습니다.
- 복창: 브라우저 Web Speech API를 사용합니다. 실제 단말의 한국어 음성 설치 여부와 오프라인 동작은 검증 전입니다. 승인 버튼은 로컬 확인 상태만 변경하며 실제 외부 전송은 구현되지 않았습니다.
- AI: [app.py](ai_pipeline/app.py)에 오디오 업로드 API가 있습니다. [tactical_engine.py](ai_pipeline/tactical_engine.py)의 STT는 고정 문장을 반환하고, 보고 필드는 고정 샘플입니다. 실제 STT·LLM·ClikaRT는 미연결입니다.
- 검색: 일부 category와 키워드를 검사하며, 검색 실패 시 첫 청크를 반환합니다. 미검증 자료 제외 및 검색 실패 처리는 추가 작업이 필요합니다.
- HW: [nucode_ptt.ino](hardware/nucode_ptt.ino)에 BLE Space 누름·해제와 디바운스를 구현했습니다. [구성도](hardware/README.md)는 작성됐지만 보드 업로드·핀 호환·페어링·실동작은 검증 전입니다.
- 지식 자료: [chunks.jsonl](knowledge_base/chunks.jsonl)은 합성 청크 20개입니다. TAC-001~008은 외부 출처 미확인, TAC-009~020은 자체 작성 데모 규칙입니다. 공식 교범으로 소개하지 않습니다.
- [시스템 프롬프트](knowledge_base/system_prompt.txt)는 작성됐지만 현재 엔진에서 읽지 않습니다.
- [피칭 대본](knowledge_base/pitching_script.md)은 목표 시연 대본입니다. 오프라인·실제 모델·처리 시간 관련 표현은 실측 검증 후 사용해야 합니다.

## 다음 작업

1. HW와 UI: 실제 보드에서 Space 입력과 녹음 시작·종료를 확인합니다.
2. AI: 오디오 디코딩, 실제 STT·LLM, 프롬프트와 검색 메타데이터 연결, 응답 검증과 오류 처리를 구현합니다.
3. UI & 도메인: API 연결, 응답 검증, 오류 시 샘플 대체 처리 개선, 미검증 권고 제외를 확인합니다.
4. 전체: 서로 다른 발화와 누락 정보, 정정, 검색 실패를 검사하고 실제 오프라인 환경과 스마트폰에서 검증합니다.

## Git 제출 범위

소스·테스트·의존성 목록·문서와 최소 합성 샘플을 포함합니다. 외부 프로젝트 49건을 모은 all_showcases.json, 설치 의존성, 빌드 결과, 로컬 데이터·녹음·모델 가중치·인증정보는 제외합니다.
