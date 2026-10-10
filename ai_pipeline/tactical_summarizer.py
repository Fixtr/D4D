"""
온디바이스 전술 요약기 (규칙 추출 + ClikaRT modelverse Qwen2.5-0.5B-Instruct 명령 요약)
STT로 인식된 무전 텍스트를 군 표준 보고 양식(SALUTE / SITREP / 9-Line MEDEVAC)으로
구조화하고, 명령 요약·복창(Read-back) 문장과 함께 보고 스크립트 파일로 저장

- 보고 종류, 위협수준, data 필드: tactical_rules 의 정규식 규칙으로 즉시 추출
- 명령 요약 한 줄: COMMAND_MODE=llm(기본)이면 ClikaRT LLM 생성, rule 이면 규칙 문장
  (LLM 출력이 원문에 없는 숫자·단어를 쓰면 규칙 문장으로 대체, command_source 로 구분)
- 복창 요약 한 문장: 기본은 규칙 문장, READBACK_MODE=llm 이면 ClikaRT LLM 생성

규칙 근거: T4-2_Voice_First_Tactical_AI_Guide.md 4.1, 4.3 / API_CONTRACT.md 2
- report_type 은 SALUTE, SITREP, 9-Line MEDEVAC 중 하나
- data 는 보고 종류별 필수 키만, 모든 값은 문자열, 발화에 없는 값은 "식별 불가"
- threat_level 은 LOW, MEDIUM, HIGH, CRITICAL 중 하나
- recommended_action 은 검색된 SOP 근거만 사용, 없으면 빈 문자열
- id, timestamp, confirmed 는 LLM이 아니라 서버가 생성
"""
import glob
import json
import logging
import os
import threading
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

import tactical_rules as rules

logger = logging.getLogger(__name__)

LLM_MODEL = os.getenv("LLM_MODEL", "Qwen/Qwen2.5-0.5B-Instruct")
SCRIPT_DIR = os.getenv("SCRIPT_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "scripts"))
# rule: 규칙 문장만 사용 (모델 미로드, 즉시 응답) / llm: 복창 문장을 LLM으로 생성
# UNO Q 실측: llm 은 건당 17~37초에 원문에 없는 표현을 덧붙여 rule 을 기본값으로 둠
READBACK_MODE = os.getenv("READBACK_MODE", "rule")
# llm: 명령 요약을 Qwen 으로 생성 (UNO Q 실측 건당 5~10초) / rule: 규칙 문장 (모델 미로드)
COMMAND_MODE = os.getenv("COMMAND_MODE", "llm")
# 명령 요약 프롬프트: 원문 단어만 쓰는 짧은 명령문. 0.5B 모델은 규칙 설명보다 예시를 더 잘 따른다
COMMAND_PROMPT = "무전 원문에서 중요한 사실만 골라 한 줄 명령문으로 줄인다. 원문 단어와 숫자만 쓴다. 호출부호, 오버는 뺀다. 20자 안팎."
COMMAND_EXAMPLES = (
    ("여기는 매 둘, 전방 200미터 계곡에서 적 차량 2대 남쪽 이동 중, 오버", "적 차량 2대 계곡 남쪽 이동"),
    ("여기는 3분대, 부상자 2명 발생, 출혈 심함, LZ 호랑이, 메디백 요청, 오버", "부상자 2명 LZ 호랑이 메디백 요청"),
)

READBACK_PROMPT = (
    "너는 대한민국 육군 무전병이다. 무전 원문을 상급 부대 복창용 한 문장으로 짧게 요약한다.\n"
    "규칙: 핵심 위협과 행동만 쓴다. 숫자, 좌표, 무기 명칭은 원문 그대로 쓴다. "
    "원문에 없는 정보는 쓰지 않는다. 호출부호와 '오버'는 뺀다. 요약 문장 하나만 출력한다."
)


class TacticalSummarizer:
    def __init__(self, model_id: str = LLM_MODEL, script_dir: str = SCRIPT_DIR,
                 readback_mode: str = READBACK_MODE, command_mode: str = COMMAND_MODE):
        self.readback_mode = readback_mode
        self.command_mode = command_mode
        use_llm = "llm" in (readback_mode, command_mode)
        self.model_id = model_id if use_llm else "rule-based"
        self.script_dir = script_dir
        os.makedirs(self.script_dir, exist_ok=True)
        self.model = None
        if use_llm:
            import clika_runtime.modelverse as mv

            # 서버 기동 시 1회 로드 (요청마다 로드하지 않음). 짧은 입출력만 쓰므로 KV 창을 1024로 제한
            self.model = mv.AutoModelForCausalLM.from_pretrained(model_id, device="cpu", max_seq=1024)
        # chat 엔진은 KV 캐시를 재사용하므로 동시 호출을 직렬화
        self._lock = threading.Lock()

    def _llm_read_back(self, transcript: str, max_new_tokens: int = 48) -> str:
        messages = [
            {"role": "system", "content": READBACK_PROMPT},
            {"role": "user", "content": transcript},
        ]
        with self._lock:
            reply = self.model.chat(messages, max_new_tokens=max_new_tokens, temperature=0.0)
        return reply.strip().splitlines()[0] if reply.strip() else ""

    def command_summary(self, report_type: str, data: Dict[str, str], transcript: str) -> Dict[str, str]:
        """중요 내용만 담은 한 줄 명령 요약. LLM 결과가 원문에 근거하지 않으면 규칙 문장으로 대체"""
        fallback = {"text": rules.template_read_back_summary(report_type, data, transcript), "source": "rule"}
        if self.command_mode != "llm" or self.model is None:
            return fallback
        messages = [{"role": "system", "content": COMMAND_PROMPT}]
        for spoken, command in COMMAND_EXAMPLES:
            messages += [{"role": "user", "content": spoken}, {"role": "assistant", "content": command}]
        messages.append({"role": "user", "content": transcript})
        try:
            with self._lock:
                reply = self.model.chat(messages, max_new_tokens=32, temperature=0.0)
        except Exception as e:
            logger.warning("LLM 명령 요약 실패, 규칙 문장 사용: %s", e)
            return fallback
        command = reply.strip().splitlines()[0].strip(" .\"'") if reply.strip() else ""
        if not command or len(command) > 60 or not rules.is_command_grounded(command, transcript):
            logger.warning("LLM 명령 요약 검증 실패, 규칙 문장 사용: %r", reply)
            return fallback
        return {"text": command, "source": "llm"}

    def read_back_summary(self, report_type: str, data: Dict[str, str], transcript: str) -> str:
        fallback = rules.template_read_back_summary(report_type, data, transcript)
        if self.readback_mode != "llm" or self.model is None:
            return fallback
        try:
            summary = self._llm_read_back(transcript)
        except Exception as e:
            logger.warning("LLM 복창 생성 실패, 규칙 문장 사용: %s", e)
            return fallback
        if not summary.strip(" .…") or not rules.is_grounded(summary, transcript):
            logger.warning("LLM 복창 문장 검증 실패, 규칙 문장 사용: %r", summary)
            return fallback
        return summary

    def build_report(self, transcript: str, sop: str = "") -> Dict[str, Any]:
        """무전 텍스트 → API_CONTRACT 규격의 전술 보고서"""
        report_type = rules.classify_report_type(transcript)
        data = rules.extract_fields(report_type, transcript)
        summary = self.read_back_summary(report_type, data, transcript)
        command = self.command_summary(report_type, data, transcript)
        return {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now().astimezone().isoformat(timespec="seconds"),
            "report_type": report_type,
            "threat_level": rules.classify_threat(report_type, transcript),
            "data": data,
            "raw_transcript": transcript,
            "read_back_text": rules.format_read_back(report_type, summary),
            "recommended_action": sop.strip(),
            "confirmed": False,
            # API_CONTRACT 공통 필드 외 추가 정보: 한 줄 명령 요약과 생성 방식 (llm | rule)
            "command_text": command["text"],
            "command_source": command["source"],
        }

    def render_script(self, report: Dict[str, Any]) -> str:
        """보고서 → 무전 낭독용 스크립트 텍스트"""
        lines = [
            "# 전술 상황 보고 스크립트",
            f"# 보고 ID: {report['id']}",
            f"# 생성 시각: {report['timestamp']}",
            f"# 복창 모델: {self.model_id}",
            "",
            f"[보고유형] {report['report_type']}",
            f"[위협수준] {report['threat_level']}",
            "",
            f"[명령 요약 ({'LLM' if report.get('command_source') == 'llm' else '규칙'})]",
            report.get("command_text", ""),
            "",
            "[원문 (STT)]",
            report["raw_transcript"],
            "",
            f"[{report['report_type']} 양식]",
        ]
        for key, label in rules.REPORT_FIELDS[report["report_type"]].items():
            lines.append(f"- {label}: {report['data'][key]}")
        lines += [
            "",
            "[복창 (Read-back)]",
            report["read_back_text"],
            "",
            "[교범 조치사항]",
            report["recommended_action"] or "관련 교범 근거 없음",
        ]
        return "\n".join(lines) + "\n"

    def save_outputs(self, report: Dict[str, Any], script_text: str) -> Dict[str, str]:
        """보고서 JSON(.json)과 스크립트(.txt)를 같은 이름으로 저장하고 경로 반환"""
        stamp = datetime.fromisoformat(report["timestamp"])
        kind = report["report_type"].replace(" ", "_")
        base = os.path.join(self.script_dir, f"tactical_{stamp:%Y%m%d_%H%M%S}_{kind}_{report['id']}")
        with open(base + ".txt", "w", encoding="utf-8") as f:
            f.write(script_text)
        with open(base + ".json", "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        return {"script_path": base + ".txt", "json_path": base + ".json"}

    def find_output(self, report_id: str, extension: str) -> Optional[str]:
        """보고 ID(UUID)로 저장된 .json / .txt 경로 찾기 (UUID 형식이 아니면 None)"""
        try:
            report_id = str(uuid.UUID(report_id))
        except ValueError:
            return None
        matches = glob.glob(os.path.join(self.script_dir, f"tactical_*_{report_id}.{extension}"))
        return matches[0] if matches else None

    def summarize_and_save(self, transcript: str, sop: str = "") -> Dict[str, Any]:
        report = self.build_report(transcript, sop)
        script_text = self.render_script(report)
        paths = self.save_outputs(report, script_text)
        return {"report": report, "script_text": script_text, **paths}
