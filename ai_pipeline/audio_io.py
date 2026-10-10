"""
업로드 오디오 디코딩 (PyAV / 내장 ffmpeg)
브라우저 MediaRecorder 형식(WebM/Opus, MP4/AAC, OGG/Opus)은 ClikaRT 디코더가 지원하지 않으므로
(지원: WAV, FLAC, MP3, OGG Vorbis) 모든 입력을 Whisper 입력 규격인 16kHz 모노 16bit WAV로 변환한다.

오류 구분 (API_CONTRACT.md 3)
- UnsupportedAudioError → 415: 지원하지 않는 MIME 형식
- InvalidAudioError     → 400: 빈 파일, 손상된 오디오, 너무 짧거나 무음인 녹음
"""
import io
import wave
from typing import Optional

import av
import numpy as np

TARGET_RATE = 16000
MIN_SECONDS = 0.3
MAX_SECONDS = 60.0
# 정규화 RMS가 이보다 낮으면 무음으로 판단 (-50 dBFS)
SILENCE_RMS = 0.003

SUPPORTED_MIME_TYPES = {
    "audio/webm", "video/webm",
    "audio/ogg", "application/ogg",
    "audio/mp4", "video/mp4", "audio/x-m4a", "audio/m4a", "audio/aac",
    "audio/mpeg", "audio/mp3",
    "audio/wav", "audio/x-wav", "audio/wave",
    "audio/flac", "audio/x-flac",
}
# 브라우저나 curl이 형식을 알리지 않는 경우: 실제 디코딩으로 판단
UNDECLARED_MIME_TYPES = {"", "application/octet-stream"}


class UnsupportedAudioError(ValueError):
    """서버가 지원하지 않는 오디오 형식 (415)"""


class InvalidAudioError(ValueError):
    """빈 파일, 손상된 오디오, 인식할 발화가 없는 녹음 (400)"""


def _base_mime(content_type: Optional[str]) -> str:
    # "audio/webm;codecs=opus" → "audio/webm"
    return (content_type or "").split(";")[0].strip().lower()


def to_wav_16k(data: bytes, content_type: Optional[str] = None) -> bytes:
    """인코딩된 오디오 bytes → 16kHz 모노 16bit PCM WAV bytes"""
    mime = _base_mime(content_type)
    if mime not in SUPPORTED_MIME_TYPES and mime not in UNDECLARED_MIME_TYPES:
        raise UnsupportedAudioError(
            f"지원하지 않는 오디오 형식입니다: {mime}. WebM/Opus, MP4/AAC, OGG, MP3, WAV, FLAC을 보내세요.")
    if not data:
        raise InvalidAudioError("빈 오디오 파일입니다.")

    resampler = av.AudioResampler(format="s16", layout="mono", rate=TARGET_RATE)
    chunks = []
    try:
        with av.open(io.BytesIO(data), mode="r") as container:
            if not container.streams.audio:
                raise InvalidAudioError("파일에 오디오 트랙이 없습니다.")
            for frame in container.decode(audio=0):
                for out in resampler.resample(frame):
                    chunks.append(out.to_ndarray().reshape(-1))
            for out in resampler.resample(None):
                chunks.append(out.to_ndarray().reshape(-1))
    except InvalidAudioError:
        raise
    except (av.error.FFmpegError, ValueError) as e:
        if mime in UNDECLARED_MIME_TYPES:
            raise UnsupportedAudioError(f"오디오 형식을 인식할 수 없습니다: {e}") from e
        raise InvalidAudioError(f"손상된 오디오 파일입니다: {e}") from e

    samples = np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.int16)
    seconds = len(samples) / TARGET_RATE
    if seconds < MIN_SECONDS:
        raise InvalidAudioError(f"녹음이 너무 짧습니다 ({seconds:.1f}초). PTT를 누른 채 말하세요.")
    if seconds > MAX_SECONDS:
        raise InvalidAudioError(f"녹음이 너무 깁니다 ({seconds:.0f}초). {MAX_SECONDS:.0f}초 이내로 보고하세요.")
    rms = float(np.sqrt(np.mean((samples.astype(np.float32) / 32768.0) ** 2)))
    if rms < SILENCE_RMS:
        raise InvalidAudioError("음성이 감지되지 않았습니다. 마이크를 확인하고 다시 녹음하세요.")

    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(TARGET_RATE)
        w.writeframes(samples.astype("<i2").tobytes())
    return out.getvalue()
