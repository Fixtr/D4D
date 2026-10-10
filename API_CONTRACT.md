# UI ↔ AI 연동 규격

상태: UI 담당이 작성한 합의안. AI 담당 검토 및 실제 연동 검증 전.
현재 코드의 `TacticalReport`와 `/api/tactical-process`를 기준으로 한다.
이 문서는 목표 규격이며, 아래 미구현 항목은 별도로 작업해야 한다.

## 1. 음성 요청

- 메서드·경로: `POST /api/tactical-process`
- 같은 노트북에서 개발할 때 서버 주소: `http://localhost:8000`
- 요청: `multipart/form-data`, 파일 필드 이름은 `audio`
- UI는 `FormData`를 사용하며 Content-Type 헤더를 직접 지정하지 않는다.
- PTT를 누르면 녹음 시작, 떼면 종료. 마지막 `dataavailable` 이벤트를 받고 `stop` 이벤트가 발생한 뒤 완성된 파일을 전송한다.
- UI는 브라우저에서 지원하는 녹음 형식을 선택하고 실제 `MediaRecorder.mimeType`과 일치하는 MIME·확장자를 보낸다. 우선 연동 대상은 WebM/Opus(`audio/webm`, `.webm`), 모바일에서 MP4/AAC(`audio/mp4`, `.mp4`)가 필요하면 AI 담당과 지원을 확인한다. 지원되지 않는 형식은 전송 전에 오류로 표시한다.
- 브라우저 오디오의 샘플레이트를 고정값으로 가정하지 않는다. AI 서버가 컨테이너를 디코딩하고 STT 모델에 필요한 PCM·채널 수·샘플레이트로 변환한다.
- 서버는 빈 파일, 손상된 오디오, 미지원 형식을 검증한다.
- 스마트폰에서 `localhost`는 스마트폰 자신이다. 별도 노트북 서버에 접속하는 경우 서버 주소 및 마이크 사용 가능한 보안 컨텍스트를 따로 설정하고, 단말 자체 온디바이스 시연과 구분한다.

## 2. 성공 응답

HTTP `200`, `application/json`. 아래 공통 필드는 모두 필수다.

| 필드 | 타입·규칙 |
| --- | --- |
| `id` | 문자열. 서버가 요청마다 새 UUID를 생성한다. LLM이 생성하지 않는다. |
| `timestamp` | 문자열. 서버가 생성하는 ISO 8601 시각, 시간대 오프셋 포함. 예: `2026-10-10T14:30:00+09:00` |
| `report_type` | `SALUTE`, `SITREP`, `9-Line MEDEVAC` 중 하나. 표기 그대로 사용 |
| `threat_level` | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` 중 하나 |
| `data` | 보고 종류에 해당하는 필드만 가진 객체. 모든 값은 문자열 |
| `raw_transcript` | 실제 STT 결과 원문 문자열 |
| `read_back_text` | 실제 보고 사실을 요약한 복창 문자열 |
| `recommended_action` | 검색된 SOP에 근거한 문자열. 관련 근거가 없으면 빈 문자열 |
| `confirmed` | 새 보고서는 항상 `false`. 서버가 설정 |

발화에 없는 `data` 값은 `"식별 불가"`로 통일한다. 좌표·시간·장비·환자 상태 등을 샘플 값으로 채우지 않는다.
서버는 모델 출력을 검증한 뒤 응답한다. UI도 수신한 JSON의 필수 필드와 보고 종류별 구조를 검증한다.

### 보고 종류별 data 키

| report_type | 필수 키 |
| --- | --- |
| `SALUTE` | `size`, `activity`, `location`, `unit`, `time`, `equipment` |
| `SITREP` | `unit_status`, `location`, `ammo_supply`, `casualties`, `operational_status` |
| `9-Line MEDEVAC` | `line1_location`, `line2_freq_callsign`, `line3_patients_precedence`, `line4_special_equipment`, `line5_patient_type`, `line6_security`, `line7_marking`, `line8_patient_nationality`, `line9_cbrn` |

### SALUTE 응답 예시 (합성 데이터)

입력 발화: “전방 100미터에 인원 3명, 북쪽으로 이동 중.”

```json
{
  "id": "052ecdf3-55c2-4b1e-9cd0-ea2c10ecef11",
  "timestamp": "2026-10-10T14:30:00+09:00",
  "report_type": "SALUTE",
  "threat_level": "LOW",
  "data": {
    "size": "인원 3명",
    "activity": "북쪽으로 이동 중",
    "location": "전방 100미터",
    "unit": "식별 불가",
    "time": "식별 불가",
    "equipment": "식별 불가"
  },
  "raw_transcript": "전방 100미터에 인원 3명, 북쪽으로 이동 중.",
  "read_back_text": "전방 100미터 인원 3명, 북쪽 이동 중. SALUTE 보고를 전파합니까?",
  "recommended_action": "",
  "confirmed": false
}
```

## 3. 실패 응답

HTTP 비정상 상태 코드와 JSON `{"detail": "사용자가 이해할 수 있는 오류 설명"}`을 반환한다.

| 상태 코드 | 의미 |
| --- | --- |
| `400` | 빈 파일, 손상된 오디오 또는 인식 가능한 발화 없음 |
| `415` | 서버가 지원하지 않는 오디오 형식 |
| `422` | 필수 `audio` 필드 누락 |
| `503` | STT/LLM 모델 미준비 또는 처리 실패 |

UI는 실패를 표시하고 재녹음을 허용한다. 서버 오류나 마이크 권한 거부를 샘플 보고서 성공으로 대체하지 않는다. 샘플 데모를 제공한다면 실제 모드와 구분해서 표시한다.

## 4. 담당 범위와 현재 차이

| 담당 | 다음 작업 |
| --- | --- |
| UI | 서버 주소 연결, 녹음 종료 이벤트 이후 전송, 실제 MIME 사용, 응답 검증, 오류 표시, 시각 표시 포맷 적용 |
| AI | 오디오 디코딩 및 실제 STT/LLM 연결, 종류별 응답 검증, `id`·`timestamp`·`confirmed` 서버 생성, 실패 응답 구현 |
| UI & 도메인 | 프롬프트의 누락 값 규칙 통일, SOP 데이터 검수 및 AI 담당에게 전달 |

현재 UI는 서버 주소를 전달하지 않아 샘플을 사용한다. 서버도 실제 STT/LLM 대신 고정 문장·필드 값을 반환하며 `id`와 `timestamp`가 없다. 프롬프트 파일은 아직 엔진에서 사용하지 않는다.
승인 버튼은 현재 로컬 확인 상태만 변경한다. 실제 외부 전송 API는 이 규격에 포함하지 않는다.

## 5. 함께 확인할 통합 기준

- [ ] AI 담당이 WebM/Opus 지원, 응답 구조 및 오류 코드를 확인한다.
- [ ] 서로 다른 두 발화를 보내면 실제 내용에 따른 보고서와 서로 다른 ID가 반환된다.
- [ ] 언급하지 않은 필드는 `식별 불가`이며 임의 정보가 추가되지 않는다.
- [ ] 짧은 녹음도 마지막 오디오 조각까지 서버에 전달된다.
- [ ] 빈 녹음·서버 중단 시 오류가 표시되고 재녹음할 수 있다.
- [ ] 한 보고서 승인 시 해당 보고서만 변경된다.
- [ ] 네트워크 차단 상태에서 실제 모델 처리와 한국어 복창을 검증한다.
