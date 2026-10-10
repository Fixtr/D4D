# UI·도메인 자료 인계

`chunks.jsonl`은 20개 청크입니다. 공식 교범 20개를 확보한 상태는 아닙니다.

- TAC-001~008: 기존 초안 내용 보존. 외부 출처 미확인으로 synthetic=true, review_status=unverified 표시. 검증된 권고에 사용하지 않습니다.
- TAC-009~020: 누락 정보, 좌표·시간·수량, 정정, 복창, 검색 실패, 데모 구분을 위한 프로젝트 자체 작성 합성 규칙. review_status=demo_only 표시.
- 기존 id/category/title/content 유지. keywords/source/synthetic/review_status 추가. source는 작성 경로이며 실제 외부 교범 인용이 아닙니다.

공식 자료로 교체할 때 실제 공개 원문을 확인하고 source에 문서명·URL·절을 기록한 뒤 내용을 검토합니다.

## AI 담당 연결 작업

1. system_prompt.txt를 모델의 시스템 프롬프트로 읽습니다. 현재 백엔드는 이 파일을 사용하지 않습니다.
2. 관련 청크와 출처 메타데이터를 발화 원문과 함께 모델에 전달합니다.
3. keywords 검색과 unverified 제외를 연결합니다. 현재 retrieve_sop는 일부 category만 검사하며 검색 실패 시 첫 청크를 반환합니다.
4. 모델 JSON의 보고 종류별 필드와 문자열 타입, confirmed=false를 서버에서 검증합니다.
5. 앱 또는 서버가 고유 id와 생성 timestamp를 부여합니다. 관측 시각과 생성 시각은 구분합니다.

## 모델 연동 후 검수 기준

- SALUTE: "인원 약 3명 관측" → 약 유지, 나머지 필드 미확인.
- SITREP: "탄약 75%" → 부상자 0명이나 위치를 생성하지 않음.
- MEDEVAC: "환자 1명 후송 요청" → 긴급도·주파수·국적을 생성하지 않음.
- "3명, 정정 2명" → 최종 수량 2명.
- 검색 결과 없음 → 검증된 자료 없음 표시.
- 승인 전 → confirmed=false, 실제 전송 완료 표현 없음.

이 항목은 검수 기준이며 실제 모델이 통과한 결과는 아닙니다.
