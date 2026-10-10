"""PC USB serial AI client. No IP address, socket or Wi-Fi fallback."""
import json
import os
import threading
import uuid
import serial
from serial.tools import list_ports
from uart_protocol import read_frame, write_frame


class UartAIClient:
    def __init__(self):
        self.lock = threading.Lock()

    def port(self):
        ports = [p for p in list_ports.comports() if p.vid == 0x2341 and p.pid == 0x0078]
        selected = os.environ.get('UNO_Q_UART_PORT')
        if selected:
            ports = [p for p in ports if p.device == selected]
        if len(ports) != 1:
            raise OSError('USB로 연결된 UNO Q를 한 대 연결하세요. 여러 대면 UNO_Q_UART_PORT를 지정하세요.')
        return ports[0].device

    def request(self, operation, payload=b'', content_type='application/octet-stream', filename='audio.webm'):
        with self.lock:
            request_id = uuid.uuid4().hex
            with serial.Serial(self.port(), 115200, timeout=.2, write_timeout=30) as stream:
                stream.reset_input_buffer()
                write_frame(stream, {'id': request_id, 'op': operation,
                                     'content_type': content_type, 'filename': filename}, payload)
                header, response = read_frame(stream, timeout=180 if operation == 'process' else 10)
            if header.get('id') != request_id:
                raise ValueError('UART response ID mismatch')
            return int(header.get('status', 502)), json.loads(response)
