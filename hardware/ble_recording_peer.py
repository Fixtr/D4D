"""UNO Q / PC manual recording protocol peer. pip install bleak.
This tool does not record audio; c/r are manual phone-result simulations.
"""
import asyncio
from datetime import datetime
from pathlib import Path
from bleak import BleakClient, BleakScanner
NAME = "NU40-BLE-Test"
SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"

def event(message):
    print(message, flush=True)
    work = Path(__file__).resolve().parents[2] / 'work'
    if work.is_dir():
        with (work / 'ble-recording-events.log').open('a', encoding='utf-8') as log:
            log.write(f'{datetime.now().isoformat(timespec="milliseconds")} {message}\n')

async def main():
    device = await BleakScanner.find_device_by_filter(lambda d,a:a.local_name==NAME, timeout=20)
    if device is None:
        raise RuntimeError("NU40-BLE-Test not found")
    pending = False
    def received(_, data):
        nonlocal pending
        for byte in data:
            if byte == ord('s'):
                if pending:
                    print("Duplicate s ignored", flush=True)
                else:
                    pending = True
                    event("\nNU40 -> s: request iPhone recording; send c/r after result")
            else:
                print(f"Unexpected byte: 0x{byte:02x}", flush=True)
    async with BleakClient(device, timeout=20) as client:
        if client.services.get_service(SERVICE) is None:
            raise RuntimeError("Missing Nordic UART service")
        await client.start_notify(TX, received)
        print("Connected. Shake NU40. c=completed / r=record again / q=quit", flush=True)
        print("Manual test only: this console does not record audio.")
        try:
            while client.is_connected:
                command = (await asyncio.to_thread(input, "UNO Q command> ")).strip().lower()
                if command == 'q': break
                if command not in {'c','r'} or not pending:
                    print("Wait for s, then enter c or r."); continue
                await client.write_gatt_char(RX, command.encode('ascii'), response=True)
                pending = False
                event(f"UNO Q -> {command}; GATT write accepted (no application ACK)")
        finally:
            if client.is_connected: await client.stop_notify(TX)

if __name__ == '__main__':
    try: asyncio.run(main())
    except (KeyboardInterrupt, EOFError): print("Disconnected")
