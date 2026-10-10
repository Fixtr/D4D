"""Serve the frontend build with a BLE adapter and manual connection requests.
Python dependencies: bleak, aiohttp. Bind localhost by default.
"""
import asyncio
import json
from pathlib import Path
from aiohttp import web
from bleak import BleakClient, BleakScanner

ROOT = Path(__file__).resolve().parent
DIST = ROOT.parent / 'frontend' / 'dist'
RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'
TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'

class Bridge:
    def __init__(self):
        self.client = None
        self.ui = None
        self.lock = asyncio.Lock()
        self.connected = False
        self.sequence = 0
        self.retry = asyncio.Event()

    async def wait_retry(self):
        try:
            await asyncio.wait_for(self.retry.wait(), timeout=3)
        except asyncio.TimeoutError:
            pass
        self.retry.clear()

    async def emit(self, **message):
        if self.ui and not self.ui.closed:
            await self.ui.send_json(message)

    async def write(self, command):
        async with self.lock:
            if not self.connected or not self.client:
                await self.emit(type='error', message='NU40 BLE 연결을 기다려 주세요.')
                return False
            try:
                await self.client.write_gatt_char(RX, command.encode('ascii'), response=True)
                print(f'UI -> NU40 {command}', flush=True)
                return True
            except Exception as error:
                await self.emit(type='error', message=f'BLE 전송 실패: {error}')
                return False

    async def run(self):
        while True:
            try:
                device = await BleakScanner.find_device_by_filter(
                    lambda d, a: a.local_name == 'NU40-BLE-Test', timeout=15)
                if not device:
                    await self.emit(type='status', connected=False, message='NU40 검색 중')
                    await self.wait_retry()
                    continue
                async with BleakClient(device) as client:
                    self.client = client
                    def received(_, data):
                        for byte in data:
                            signal = chr(byte)
                            if signal in 'seyn':
                                self.sequence += 1
                                print(f'NU40 -> UI {signal}', flush=True)
                                asyncio.create_task(self.emit(type='gesture', signal=signal, id=self.sequence))
                    await client.start_notify(TX, received)
                    self.connected = True
                    print('BLE connected / frontend ready', flush=True)
                    await self.emit(type='status', connected=True)
                    while client.is_connected:
                        await asyncio.sleep(.3)
            except asyncio.CancelledError:
                raise
            except Exception as error:
                print(f'BLE: {error}', flush=True)
                await self.emit(type='error', message=f'BLE 재연결 중: {error}')
            finally:
                self.connected = False
                self.client = None
                await self.emit(type='status', connected=False)
            await self.wait_retry()

bridge = Bridge()

async def websocket(request):
    # A single page owns recording and question state. Reject foreign origins.
    if request.headers.get('Origin') != f'http://{request.host}':
        raise web.HTTPForbidden()
    if bridge.ui and not bridge.ui.closed:
        raise web.HTTPConflict(text='Another frontend already owns the BLE session')
    ws = web.WebSocketResponse(heartbeat=15)
    await ws.prepare(request)
    bridge.ui = ws
    await bridge.emit(type='status', connected=bridge.connected)
    try:
        async for item in ws:
            if item.type != web.WSMsgType.TEXT:
                continue
            try:
                message = json.loads(item.data)
            except (ValueError, TypeError):
                continue
            if message.get('type') == 'connect':
                if not bridge.connected:
                    bridge.retry.set()
                await bridge.emit(type='status', connected=bridge.connected)
            elif message.get('type') == 'state' and message.get('recording') in (True, False):
                await bridge.write('a' if message['recording'] else 'z')
            elif message.get('type') == 'question':
                sent = await bridge.write('q')
                await bridge.emit(type='question', sent=sent)
    finally:
        bridge.ui = None
        # Cancel a pending question or browser recording when the page leaves.
        if bridge.connected:
            await bridge.write('z')
    return ws

async def index(request):
    html = (DIST / 'index.html').read_text(encoding='utf-8')
    html = html.replace('</body>', '<script src="/hardware-adapter.js"></script></body>')
    return web.Response(text=html, content_type='text/html', headers={'Cache-Control': 'no-store'})

async def adapter(request):
    return web.FileResponse(ROOT / 'ui_ble_adapter.js')

async def health(request):
    return web.json_response({'ble_connected': bridge.connected, 'ui_connected': bool(bridge.ui and not bridge.ui.closed)})

async def lifecycle(app):
    task = asyncio.create_task(bridge.run())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

def create_app():
    app = web.Application()
    app.cleanup_ctx.append(lifecycle)
    app.router.add_get('/', index)
    app.router.add_get('/hardware-adapter.js', adapter)
    app.router.add_get('/hardware/ws', websocket)
    app.router.add_get('/hardware/health', health)
    app.router.add_static('/assets/', DIST / 'assets')
    for asset in ('favicon.svg', 'icons.svg'):
        if (DIST / asset).exists():
            app.router.add_get('/' + asset, lambda request, name=asset: web.FileResponse(DIST / name))
    return app

if __name__ == '__main__':
    if not (DIST / 'index.html').exists():
        raise SystemExit('Build frontend first: cd frontend && npm ci && npm run build')
    web.run_app(create_app(), host='127.0.0.1', port=5173)
