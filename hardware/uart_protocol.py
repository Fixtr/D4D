"""Length-delimited USB UART frames shared by PC and UNO Q (no network transport)."""
import json
import struct
import time

MAGIC = b'NUAI'
MAX_HEADER = 4096
MAX_PAYLOAD = 10 * 1024 * 1024


def write_frame(stream, header, payload=b''):
    if len(payload) > MAX_PAYLOAD:
        raise ValueError('UART payload too large')
    metadata = json.dumps({**header, 'length': len(payload)}, ensure_ascii=False).encode()
    if len(metadata) > MAX_HEADER:
        raise ValueError('UART header too large')
    data = MAGIC + struct.pack('!I', len(metadata)) + metadata + payload
    view = memoryview(data)
    while view:
        count = stream.write(view)
        if not count:
            raise OSError('UART write failed')
        view = view[count:]
    stream.flush()


def read_frame(stream, timeout=180):
    deadline = time.monotonic() + timeout

    def exact(length):
        result = bytearray()
        while len(result) < length:
            if time.monotonic() >= deadline:
                raise TimeoutError('UART response timed out')
            chunk = stream.read(length - len(result))
            if chunk:
                result.extend(chunk)
        return bytes(result)

    # Ignore startup diagnostics and recover after a reconnect.
    marker = bytearray()
    while bytes(marker) != MAGIC:
        marker.extend(exact(1))
        if len(marker) > len(MAGIC):
            del marker[0]
    header_length = struct.unpack('!I', exact(4))[0]
    if not 0 < header_length <= MAX_HEADER:
        raise ValueError('Invalid UART header length')
    header = json.loads(exact(header_length))
    length = header.get('length') if isinstance(header, dict) else None
    if type(length) is not int or not 0 <= length <= MAX_PAYLOAD:
        raise ValueError('Invalid UART payload length')
    return header, exact(length)
