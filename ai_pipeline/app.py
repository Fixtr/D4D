import os

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import clika_runtime.modelverse as mv
from audio_io import InvalidAudioError, UnsupportedAudioError, to_wav_16k
from tactical_engine import TacticalEngine
from tactical_summarizer import TacticalSummarizer
import uvicorn

# ClikaRT modelverse 온디바이스 STT 설정
STT_MODEL = os.getenv("STT_MODEL", "openai/whisper-base")
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


def run_stt(wav_bytes: bytes) -> str:
    """16kHz 모노 WAV bytes를 ClikaRT Whisper로 텍스트 변환"""
    result = transcribe(wav_bytes, language=STT_LANGUAGE, prompt=STT_PROMPT)
    return result["text"].strip()

@app.get("/api/health")
def health():
    # 실제 로드된 모델만 표시 (LLM 미사용이면 llm_model 은 "rule-based")
    return {"status": "HEALTHY", "mode": "ON_DEVICE_AIR_GAP", "runtime": "ClikaRT (CPU)", "stt_model": STT_MODEL,
            "llm_model": summarizer.model_id, "command_mode": summarizer.command_mode, "readback_mode": summarizer.readback_mode}

@app.post("/api/tactical-process")
async def process_tactical_voice(audio: UploadFile = File(...)):
    audio_bytes = await audio.read()

    # 0. 브라우저 녹음(WebM/MP4 등) → 16kHz 모노 WAV (ClikaRT 디코더 미지원 형식 변환)
    try:
        wav_bytes = await run_in_threadpool(to_wav_16k, audio_bytes, audio.content_type)
    except UnsupportedAudioError as e:
        raise HTTPException(status_code=415, detail=str(e))
    except InvalidAudioError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 1. 음성인식 (STT) - CPU 연산이므로 이벤트 루프를 막지 않도록 스레드풀에서 실행
    try:
        transcript = await run_in_threadpool(run_stt, wav_bytes)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"음성인식 실패: {e}")

    if not transcript:
        raise HTTPException(status_code=400, detail="인식 가능한 발화가 없습니다.")

    # 2. RAG 교범 조치 매칭
    sop = engine.retrieve_sop(transcript)

    # 3. sLLM 표준 양식(SALUTE/SITREP/9-Line MEDEVAC) 구조화 및 스크립트 파일 저장
    try:
        script = await run_in_threadpool(summarizer.summarize_and_save, transcript, sop)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"전술 요약 실패: {e}")
    # 4. 브라우저로 결과 반환: 보고서 JSON + 스크립트 본문 + 저장 파일 다운로드 주소
    result = dict(script["report"])
    result["script_text"] = script["script_text"]
    result["json_url"] = f"/api/reports/{result['id']}.json"
    result["script_url"] = f"/api/reports/{result['id']}/script"
    result["script_path"] = script["script_path"]

    return result


@app.get("/api/reports/{report_id}.json")
def download_report_json(report_id: str):
    """보드에 저장된 보고서 JSON 다운로드"""
    path = summarizer.find_output(report_id, "json")
    if path is None:
        raise HTTPException(status_code=404, detail="보고서를 찾을 수 없습니다.")
    return FileResponse(path, media_type="application/json", filename=os.path.basename(path))


@app.get("/api/reports/{report_id}/script")
def download_report_script(report_id: str):
    """보드에 저장된 보고 스크립트(.txt) 다운로드"""
    path = summarizer.find_output(report_id, "txt")
    if path is None:
        raise HTTPException(status_code=404, detail="보고 스크립트를 찾을 수 없습니다.")
    return FileResponse(path, media_type="text/plain; charset=utf-8", filename=os.path.basename(path))

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
