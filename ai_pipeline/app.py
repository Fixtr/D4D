import os

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
import clika_runtime.modelverse as mv
from tactical_engine import TacticalEngine
from tactical_summarizer import TacticalSummarizer
import uvicorn

# ClikaRT modelverse 온디바이스 STT 설정
STT_MODEL = os.getenv("STT_MODEL", "openai/whisper-tiny")
STT_LANGUAGE = os.getenv("STT_LANGUAGE", "ko")
# 전술 용어 바이어싱 프롬프트 (Whisper 이전 문맥으로 사용)
STT_PROMPT = "SALUTE, SITREP, MEDEVAC, 좌표, 적 전차, 오버, 이상"

app = FastAPI(title="T4-2 On-Device Tactical Voice AI Backend")

# 로컬 개발 및 오프라인 단말 간 통신을 위한 CORS 전면 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = TacticalEngine()
summarizer = TacticalSummarizer()

# 서버 기동 시 1회 로드 (요청마다 로드하지 않음)
transcribe = mv.pipeline("automatic-speech-recognition", model=STT_MODEL)


def run_stt(audio_bytes: bytes) -> str:
    """업로드된 오디오(인코딩된 bytes)를 ClikaRT Whisper로 텍스트 변환"""
    result = transcribe(audio_bytes, language=STT_LANGUAGE, prompt=STT_PROMPT)
    return result["text"].strip()

@app.get("/api/health")
def health():
    return {"status": "HEALTHY", "mode": "ON_DEVICE_AIR_GAP", "model": "ClikaRT-Qwen2.5-1.5B", "stt_model": STT_MODEL, "llm_model": summarizer.model_id}

@app.post("/api/tactical-process")
async def process_tactical_voice(audio: UploadFile = File(...)):
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="빈 오디오 파일입니다.")

    # 1. 음성인식 (STT) - CPU 연산이므로 이벤트 루프를 막지 않도록 스레드풀에서 실행
    try:
        transcript = await run_in_threadpool(run_stt, audio_bytes)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"음성인식 실패: {e}")
    
    # 2. 전술 JSON 추출 및 RAG 교범 조치 매칭
    result = engine.extract_tactical_json(transcript)

    # 3. sLLM 전술 요약 및 스크립트 파일 저장
    try:
        script = await run_in_threadpool(summarizer.summarize_and_save, transcript)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"전술 요약 실패: {e}")
    result["tactical_summary"] = script["summary"]
    result["script_path"] = script["script_path"]
    
    return result

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
