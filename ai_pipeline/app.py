from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from tactical_engine import TacticalEngine
import uvicorn

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

@app.get("/api/health")
def health():
    return {"status": "HEALTHY", "mode": "ON_DEVICE_AIR_GAP", "model": "ClikaRT-Qwen2.5-1.5B"}

@app.post("/api/tactical-process")
async def process_tactical_voice(audio: UploadFile = File(...)):
    audio_bytes = await audio.read()
    
    # 1. 음성인식 (STT)
    transcript = engine.transcribe_audio(audio_bytes)
    
    # 2. 전술 JSON 추출 및 RAG 교범 조치 매칭
    result = engine.extract_tactical_json(transcript)
    
    return result

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
