"""UNO Q AI results over USB UART /dev/ttyGS0; does not start an HTTP server."""
import asyncio
import io
import json
import os
from pathlib import Path
import socket
import sys
import time
import msgpack

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'hardware'))
from uart_protocol import read_frame, write_frame


class SerialStream:
    """Use the official Router's monitor API, leaving its USB service running."""
    def __init__(self, path='/var/run/arduino-router.sock'):
        self.socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.socket.settimeout(10)
        self.socket.connect(path)
        self.unpacker = msgpack.Unpacker(raw=False, max_buffer_size=1024*1024)
        self.sequence = 0

    def call(self, method, arguments):
        self.sequence += 1
        self.socket.sendall(msgpack.packb([0,self.sequence,method,arguments], use_bin_type=True))
        while True:
            for response in self.unpacker:
                if isinstance(response,list) and len(response)==4 and response[0]==1 and response[1]==self.sequence:
                    if response[2] is not None:
                        raise OSError(f'UART router error: {response[2]}')
                    return response[3]
            data = self.socket.recv(4096)
            if not data:
                raise OSError('UART router disconnected')
            self.unpacker.feed(data)

    def read(self, count):
        data = self.call('mon/read', [min(count,1024)])
        if not data:
            time.sleep(.02)
        return bytes(data)

    def write(self, data):
        return self.call('mon/write', [bytes(data[:4096])])

    def flush(self):
        pass

    def close(self):
        self.socket.close()


async def dispatch(header, payload):
    # Use the identical on-device STT/RAG/LLM functions, without HTTP requests.
    from app import health, process_tactical_voice
    from fastapi import HTTPException, UploadFile
    from starlette.datastructures import Headers
    if header.get('op') == 'health':
        return 200, {**health(), 'transport': 'usb-uart'}
    if header.get('op') != 'process':
        return 400, {'detail': 'Unknown UART operation'}
    audio = UploadFile(file=io.BytesIO(payload), filename=header.get('filename', 'audio.webm'),
                       headers=Headers({'content-type': header.get('content_type', 'audio/webm')}))
    try:
        return 200, await process_tactical_voice(audio)
    except HTTPException as error:
        return error.status_code, {'detail': error.detail}
    finally:
        await audio.close()


def main():
    # Load models before accepting requests.
    import app
    stream = None
    print('UART AI ready: Arduino Router monitor -> USB ttyGS0', flush=True)
    while True:
        try:
            if stream is None:
                stream = SerialStream()
            header, payload = read_frame(stream, timeout=3600)
        except (TimeoutError, ValueError, json.JSONDecodeError):
            continue
        except OSError:
            if stream is not None:
                stream.close()
            stream = None
            time.sleep(1)
            continue
        try:
            try:
                status, result = asyncio.run(dispatch(header, payload))
            except Exception as error:
                status, result = 500, {'detail': f'UART AI processing failed: {error}'}
            write_frame(stream, {'id': header.get('id'), 'status': status},
                        json.dumps(result, ensure_ascii=False).encode())
        except OSError:
            stream.close()
            stream = None


if __name__ == '__main__':
    main()
