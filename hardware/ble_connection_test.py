"""Compatibility entry point; the previous PONG test is replaced by s/c/r."""
import asyncio
from ble_recording_peer import main

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, EOFError):
        print("Disconnected")
