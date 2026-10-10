"""
온디바이스 전술 AI 엔진 (STT + 로컬 RAG + sLLM 구조화)
ClikaRT 또는 로컬 llama.cpp / whisper.cpp 바인딩을 위한 통합 인터페이스
"""
import json
import os
from typing import Dict, Any

class TacticalEngine:
    def __init__(self, knowledge_path: str = "../knowledge_base/chunks.jsonl"):
        self.knowledge_path = knowledge_path
        self.chunks = self._load_chunks()

    def _load_chunks(self):
        chunks = []
        if os.path.exists(self.knowledge_path):
            with open(self.knowledge_path, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        chunks.append(json.loads(line))
        return chunks

    def transcribe_audio(self, audio_bytes: bytes) -> str:
        """
        오프라인 STT (Whisper.cpp 또는 Sherpa-ONNX 연동 포인트)
        실제 로컬 바이너리가 없을 경우 안전한 휴리스틱/샘플 반환
        """
        # TODO: AI 팀원이 pywhispercpp 또는 sherpa-onnx를 여기에 직접 바인딩
        # 바이어싱 프롬프트: "SALUTE, SITREP, MEDEVAC, 좌표, 적 전차, 오버, 이상"
        return "여기는 독수리 하나, 전방 100m 북쪽 능선에서 적 보병 3명 이동 중, RPG 1문 식별, 오버!"

    def retrieve_sop(self, query: str) -> str:
        """로컬 키워드/임베딩 기반 교범 즉각조치 RAG 매칭"""
        for chunk in self.chunks:
            if "대기갑" in chunk["category"] and ("RPG" in query or "전차" in query):
                return chunk["content"]
            if "부상" in query or "메디백" in query:
                if "부상자후송" in chunk["category"]:
                    return chunk["content"]
        
        if self.chunks:
            return self.chunks[0]["content"]
        return "보병교범 제3장: 아군 은·엄폐 후 정밀 관측 유지 및 화력 유도 준비."

    def extract_tactical_json(self, transcript: str) -> Dict[str, Any]:
        """
        비정형 음성 텍스트를 군 표준 SALUTE/SITREP/MEDEVAC 양식으로 정형화
        ClikaRT / Qwen-2.5-1.5B-GGUF 연동 포인트
        """
        sop_action = self.retrieve_sop(transcript)

        # 9-Line MEDEVAC 판별
        if "메디백" in transcript or "부상자" in transcript or "MEDEVAC" in transcript:
            return {
                "report_type": "9-Line MEDEVAC",
                "threat_level": "CRITICAL",
                "raw_transcript": transcript,
                "data": {
                    "line1_location": "52S DH 1102 9940 (LZ 백호)",
                    "line2_freq_callsign": "VHF 42.50MHz / 호출부호 독수리1",
                    "line3_patients_precedence": "1명 긴급(Urgent - 2시간 내)",
                    "line4_special_equipment": "들것(Litter), 지혈대 및 수혈 팩 필요",
                    "line5_patient_type": "들것 환자 1명 (Litter)",
                    "line6_security": "P (가능한 적 접촉 우려, 경계 대기)",
                    "line7_marking": "적색 연막탄(Red Smoke) 유도",
                    "line8_patient_nationality": "대한민국 육군 1명",
                    "line9_cbrn": "None (CBRN 위협 없음)",
                },
                "read_back_text": "LZ 백호 긴급 들것 환자 1명, 적색 연막 표식. 9-Line 메디백을 항공의무대에 전송합니까?",
                "recommended_action": f"교범 매칭: {sop_action}",
                "confirmed": False
            }

        # SITREP 판별
        if "고지 확보" in transcript or "잔여 탄약" in transcript or "SITREP" in transcript:
            return {
                "report_type": "SITREP",
                "threat_level": "MEDIUM",
                "raw_transcript": transcript,
                "data": {
                    "unit_status": "소대 작전 가능",
                    "location": "3고지 (MGRS 52S DH 2230 4510)",
                    "ammo_supply": "탄약 75%, 식수 1일분 보유",
                    "casualties": "아군 부상자 0명",
                    "operational_status": "목표 고지 점령 완료, 360도 원형 경계 진지 구축 중",
                },
                "read_back_text": "목표 고지 확보 완료, 탄약 75%, 부상자 없음. SITREP을 사단망에 전파합니까?",
                "recommended_action": f"교범 매칭: {sop_action}",
                "confirmed": False
            }

        # 기본: SALUTE 보고서
        return {
            "report_type": "SALUTE",
            "threat_level": "HIGH",
            "raw_transcript": transcript,
            "data": {
                "size": "적 보병 3명",
                "activity": "북쪽 능선 방향 도보 기동 중",
                "location": "좌표 52S DH 1234 5678 (전방 100m)",
                "unit": "식별 불가 (신형 위장복 착용)",
                "time": "10:30 경",
                "equipment": "소총 3정, 대전차화기(RPG 추정) 1문",
            },
            "read_back_text": "적 보병 3명 북쪽 능선 이동, RPG 1문 식별. SALUTE 보고를 전파합니까?",
            "recommended_action": f"교범 매칭: {sop_action}",
            "confirmed": False
        }
