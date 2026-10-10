import asyncio
import io
import json
from pathlib import Path
import struct
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from uart_protocol import MAGIC, MAX_PAYLOAD, read_frame, write_frame
from aiohttp import FormData, web
from aiohttp.test_utils import TestClient, TestServer
import ui_ble_bridge


class Fragmented(io.BytesIO):
    def read(self, count=-1):
        return super().read(min(count, 3))


class ProtocolTests(unittest.TestCase):
    def test_binary_audio_and_unicode_result(self):
        for payload in (bytes(range(256))*100, json.dumps({'text': '적 전차 발견'}, ensure_ascii=False).encode()):
            output = io.BytesIO()
            write_frame(output, {'id': 'request-1', 'status': 200}, payload)
            header, received = read_frame(Fragmented(b'boot log\n'+output.getvalue()), timeout=1)
            self.assertEqual(header['id'], 'request-1')
            self.assertEqual(received, payload)

    def test_oversized_payload_rejected(self):
        metadata = json.dumps({'length': MAX_PAYLOAD+1}).encode()
        with self.assertRaises(ValueError):
            read_frame(io.BytesIO(MAGIC+struct.pack('!I',len(metadata))+metadata))

    def test_disconnected_port_times_out(self):
        with self.assertRaises(TimeoutError):
            read_frame(io.BytesIO(), timeout=.01)


class RouteTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        port_patch = patch.object(ui_ble_bridge.uart_ai, 'port', return_value='COM5')
        port_patch.start()
        self.addCleanup(port_patch.stop)
        app = web.Application()
        app.router.add_post('/api/tactical-process', ui_ble_bridge.uart_api)
        app.router.add_get('/api/health', ui_ble_bridge.uart_api)
        self.client = TestClient(TestServer(app))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()

    async def test_upload_returns_uart_ai_json(self):
        result = {'raw_transcript': '적 전차 발견', 'report_type': 'SALUTE'}
        form = FormData()
        form.add_field('audio', b'binary-audio', filename='voice.webm', content_type='audio/webm')
        origin = str(self.client.make_url('/')).rstrip('/')
        with patch.object(ui_ble_bridge.uart_ai, 'request', return_value=(200,result)) as serial_request:
            response = await self.client.post('/api/tactical-process', data=form, headers={'Origin':origin})
            self.assertEqual(await response.json(), result)
            serial_request.assert_called_once_with('process',b'binary-audio','audio/webm','voice.webm')

    async def test_usb_missing_fails_without_network_fallback(self):
        with patch.object(ui_ble_bridge.uart_ai, 'request', side_effect=OSError('USB disconnected')):
            response = await self.client.get('/api/health')
            self.assertEqual(response.status,503)
            self.assertIn('USB disconnected',(await response.json())['detail'])

    async def test_health_does_not_queue_behind_ai_processing(self):
        with ui_ble_bridge.uart_ai.lock, patch.object(ui_ble_bridge.uart_ai, 'request') as request:
            response = await self.client.get('/api/health')
            self.assertEqual(response.status, 202)
            self.assertEqual((await response.json())['status'], 'BUSY')
            request.assert_not_called()


if __name__ == '__main__':
    unittest.main()
