"""Build the existing frontend and run its local NU40 BLE bridge."""
import argparse
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import venv

HARDWARE = Path(__file__).resolve().parent
REPO = HARDWARE.parent

def run(command, cwd=REPO):
    subprocess.run([str(part) for part in command], cwd=cwd, check=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build-only', action='store_true', help='Install dependencies and build, without starting BLE/server')
    args = parser.parse_args()
    if sys.version_info < (3, 10):
        raise SystemExit('Python 3.10+ is required.')
    npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
    if not npm or not shutil.which('node'):
        raise SystemExit('Install Node.js/npm before running this script.')
    if not (REPO / 'frontend' / 'package-lock.json').exists():
        raise SystemExit('frontend is missing. For sparse checkout: git sparse-checkout add frontend')
    if not args.build_only:
        with socket.socket() as probe:
            try:
                probe.bind(('127.0.0.1', 5173))
            except OSError:
                raise SystemExit('Port 5173 is already in use. Open http://localhost:5173 or stop the existing server first.')
    environment = HARDWARE / '.venv'
    python = environment / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    if not python.exists():
        print('Creating isolated hardware/.venv...', flush=True)
        venv.create(environment, with_pip=True)
    print('Installing BLE dependencies...', flush=True)
    run([python, '-m', 'pip', 'install', '-r', HARDWARE / 'requirements-ui.txt'])
    print('Installing frontend dependencies and building...', flush=True)
    run([npm, 'ci'], REPO / 'frontend')
    run([npm, 'run', 'build'], REPO / 'frontend')
    if args.build_only:
        print('Build complete. BLE/server was not started.', flush=True)
        return
    print('Open http://localhost:5173 and allow microphone access. Close other NU40 BLE peers.', flush=True)
    run([python, HARDWARE / 'ui_ble_bridge.py'])

if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.returncode)
    except KeyboardInterrupt:
        raise SystemExit(0)
