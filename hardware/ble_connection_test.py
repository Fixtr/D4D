"""NU40 BLE UART connection test. Dependency: pip install bleak"""
import asyncio
import argparse
from bleak import BleakClient, BleakScanner

NAME = "NU40-BLE-Test"
RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"

async def session(number, device=None):
    if device is None:
        device = await BleakScanner.find_device_by_filter(
            lambda d, a: a.local_name == NAME, timeout=20
        )
    if device is None:
        raise RuntimeError("NU40-BLE-Test not found; check power and PC Bluetooth")
    print(f"Session {number}: discovered {device.name} {device.address}", flush=True)
    async with BleakClient(device, timeout=20) as client:
        print(f"Connected: {client.is_connected}", flush=True)
        lines = asyncio.Queue()
        buffer = bytearray()
        def received(_, data):
            buffer.extend(data)
            while b"\n" in buffer:
                end = buffer.index(10)
                line = bytes(buffer[:end]).decode().strip()
                del buffer[:end + 1]
                lines.put_nowait(line)
        await client.start_notify(TX, received)
        for command, expected in [(b"p", "PONG"), (b"s", "STATUS HAPTIC_READY")]:
            await client.write_gatt_char(RX, command, response=True)
            reply = await asyncio.wait_for(lines.get(), timeout=5)
            print(f"TX {command.decode()} -> RX {reply}", flush=True)
            if reply != expected:
                raise RuntimeError(f"Unexpected reply: {reply}")
        await client.stop_notify(TX)
    print("Disconnected cleanly", flush=True)
    return device

async def main():
    device = await session(1)
    await asyncio.sleep(1)
    await session(2, device)
    print("PASS: BLE discovery, connection, bidirectional data, reconnect", flush=True)

async def interactive():
    device = await BleakScanner.find_device_by_filter(
        lambda d, a: a.local_name == NAME, timeout=20
    )
    if device is None:
        raise RuntimeError("NU40-BLE-Test not found; check power and PC Bluetooth")
    async with BleakClient(device, timeout=20) as client:
        buffer = bytearray()
        def received(_, data):
            buffer.extend(data)
            while b"\n" in buffer:
                end = buffer.index(10)
                print("\nBOARD ->", bytes(buffer[:end]).decode(errors="replace").strip(), flush=True)
                del buffer[:end + 1]
        await client.start_notify(TX, received)
        print("Connected to NU40-BLE-Test over BLE.", flush=True)
        print("p=ping | s=status | x=stop vibration | v=two pulses | r=repeat | q=quit")
        print("For a single vibration test: send x first, then v.")
        try:
            while client.is_connected:
                command = (await asyncio.to_thread(input, "BLE command> ")).strip().lower()
                if command == "q":
                    break
                if command not in {"p", "s", "x", "v", "r"}:
                    print("Use p, s, x, v, r, or q.")
                    continue
                await client.write_gatt_char(RX, command.encode(), response=True)
                print("PC ->", command, flush=True)
                await asyncio.sleep(0.1)
        finally:
            await client.stop_notify(TX)
    print("Disconnected. Send x before q if you want vibration stopped.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--interactive", action="store_true")
    args = parser.parse_args()
    try:
        asyncio.run(interactive() if args.interactive else main())
    except (KeyboardInterrupt, EOFError):
        print("Disconnected.")
