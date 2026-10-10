"""
온디바이스 전술 요약기 (ClikaRT modelverse + Qwen2.5-0.5B-Instruct)
STT로 인식된 무전 텍스트를 전술 상황 보고 스크립트로 요약하고 파일로 저장
"""
import os
import threading
from datetime import datetime

import clika_runtime.modelverse as mv

LLM_MODEL = os.getenv("LLM_MODEL", "Qwen/Qwen2.5-0.5B-Instruct")
SCRIPT_DIR = os.getenv("SCRIPT_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "scripts"))

SYSTEM_PROMPT = (
    "너는 대한민국 육군 소대 무전병이다. 입력된 무전 음성 인식 텍스트를 "
    "상급 부대에 전파할 전술 상황 보고 스크립트로 요약한다.\n"
    "규칙:\n"
    "- 반드시 한국어로, 아래 형식만 출력한다.\n"
    "- 텍스트에 없는 정보는 지어내지 말고 '미상'으로 쓴다.\n"
    "- 숫자, 좌표, 호출부호, 무기 명칭은 원문 그대로 유지한다.\n"
    "형식:\n"
    "[보고유형] SALUTE / SITREP / MEDEVAC 중 하나\n"
    "[위협수준] 낮음 / 보통 / 높음 / 긴급 중 하나\n"
    "[상황요약] 한두 문장\n"
    "[적 규모·활동] ...\n"
    "[위치] ...\n"
    "[장비] ...\n"
    "[요청사항] ...\n"
    "[무전 스크립트] 상급 부대에 그대로 읽어줄 짧은 무전 문장, '오버'로 끝낼 것"
)


class TacticalSummarizer:
    def __init__(self, model_id: str = LLM_MODEL, script_dir: str = SCRIPT_DIR):
        self.model_id = model_id
        self.script_dir = script_dir
        os.makedirs(self.script_dir, exist_ok=True)
        # 서버 기동 시 1회 로드 (요청마다 로드하지 않음)
        self.model = mv.AutoModelForCausalLM.from_pretrained(model_id, device="cpu")
        # chat 엔진은 KV 캐시를 재사용하므로 동시 호출을 직렬화
        self._lock = threading.Lock()

    def summarize(self, transcript: str, max_new_tokens: int = 256) -> str:
        """인식된 무전 텍스트를 전술 보고 형식으로 요약"""
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"무전 인식 텍스트: {transcript}"},
        ]
        with self._lock:
            reply = self.model.chat(messages, max_new_tokens=max_new_tokens, temperature=0.0)
        return reply.strip()

    def save_script(self, transcript: str, summary: str) -> str:
        """요약 결과를 시각 기반 파일명의 스크립트(.txt)로 저장하고 경로 반환"""
        now = datetime.now()
        path = os.path.join(self.script_dir, f"tactical_{now:%Y%m%d_%H%M%S_%f}.txt")
        with open(path, "w", encoding="utf-8") as f:
            f.write(f"# 전술 상황 보고 스크립트\n")
            f.write(f"# 생성 시각: {now:%Y-%m-%d %H:%M:%S}\n")
            f.write(f"# 요약 모델: {self.model_id}\n\n")
            f.write(f"[원문 (STT)]\n{transcript}\n\n")
            f.write(f"{summary}\n")
        return path

    def summarize_and_save(self, transcript: str) -> dict:
        summary = self.summarize(transcript)
        path = self.save_script(transcript, summary)
        return {"summary": summary, "script_path": path}
