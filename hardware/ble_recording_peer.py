import asyncio
from bleak import BleakClient, BleakScanner
NAME='NU40-BLE-Test'
RX='6e400002-b5a3-f393-e0a9-e50e24dcca9e'
TX='6e400003-b5a3-f393-e0a9-e50e24dcca9e'
async def main():
    device=await BleakScanner.find_device_by_filter(lambda d,a:a.local_name==NAME,timeout=20)
    if not device: raise RuntimeError('NU40-BLE-Test not found; close other BLE peers')
    def received(_,data):
        labels={'s':'START recording','e':'END recording; receive phone file','y':'YES answer','n':'NO answer'}
        for byte in data:
            ch=chr(byte)
            print(f'\nNU40 -> {ch}: {labels.get(ch,"UNKNOWN")}',flush=True)
    async with BleakClient(device) as client:
        await client.start_notify(TX,received)
        print('Connected v2. Twist once: s/e. q: ask yes/no. Nod once: y. Sideways once: n. quit: exit.')
        try:
            while client.is_connected:
                command=(await asyncio.to_thread(input,'UNO Q command> ')).strip().lower()
                if command=='quit': break
                if command!='q': print('Enter q to ask yes/no, or quit. c/r are retired.');continue
                await client.write_gatt_char(RX,b'q',response=True)
                print('UNO Q -> q (GATT accepted; watch USB for whether question was accepted)',flush=True)
        finally:
            if client.is_connected: await client.stop_notify(TX)
if __name__=='__main__':
    try: asyncio.run(main())
    except (KeyboardInterrupt,EOFError): print('Disconnected')
