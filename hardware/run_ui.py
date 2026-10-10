"""Build the existing frontend and run its local NU40 BLE bridge.

Also configures the UNO Q AI server address (frontend/.env.local), checks that the
server answers, and fetches a portable Node.js when none is installed.
--dev runs the Vite dev server without BLE (hot reload, for UI development).
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import platform
import shutil
import socket
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
import venv
import zipfile

HARDWARE = Path(__file__).resolve().parent
REPO = HARDWARE.parent
FRONTEND = REPO / 'frontend'
ENV_FILE = FRONTEND / '.env.local'
ENV_KEY = 'VITE_TACTICAL_API_ENDPOINT'
DEFAULT_BOARD = '192.168.0.139'
NODE_VERSION = 'v22.20.0'
NODE_CACHE = Path.home() / '.cache' / 'd4d-node'

def run(command, cwd=REPO, env=None):
    subprocess.run([str(part) for part in command], cwd=cwd, check=True, env=env)

def node_supported(node):
    # Vite 8 requires Node.js 20.19+ or 22.12+
    try:
        version = subprocess.run([node, '--version'], capture_output=True, text=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        return False
    major, minor = (int(part) for part in version.strip().lstrip('v').split('.')[:2])
    return major > 22 or (major == 22 and minor >= 12) or (major == 20 and minor >= 19)

def ensure_node():
    """Return (env, npm) using installed Node.js, or a portable copy in ~/.cache/d4d-node."""
    env = os.environ.copy()
    node = shutil.which('node')
    npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
    if node and npm and node_supported(node):
        return env, npm
    system = {'Linux': 'linux', 'Darwin': 'darwin', 'Windows': 'win'}.get(platform.system())
    arch = {'x86_64': 'x64', 'amd64': 'x64', 'aarch64': 'arm64', 'arm64': 'arm64'}.get(platform.machine().lower())
    if not system or not arch:
        raise SystemExit('Install Node.js 20.19+ / 22.12+ and npm before running this script.')
    name = f'node-{NODE_VERSION}-{system}-{arch}'
    home = NODE_CACHE / name
    if not home.exists():
        archive = name + ('.zip' if system == 'win' else '.tar.xz')
        print(f'Node.js not found; downloading portable {NODE_VERSION} to {NODE_CACHE}...', flush=True)
        NODE_CACHE.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / archive
            urllib.request.urlretrieve(f'https://nodejs.org/dist/{NODE_VERSION}/{archive}', path)
            if system == 'win':
                with zipfile.ZipFile(path) as package:
                    package.extractall(NODE_CACHE)
            else:
                with tarfile.open(path) as package:
                    package.extractall(NODE_CACHE)
    bin_dir = home if system == 'win' else home / 'bin'
    env['PATH'] = f'{bin_dir}{os.pathsep}{env.get("PATH", "")}'
    npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm', path=env['PATH'])
    if not npm:
        raise SystemExit(f'Portable Node.js is incomplete: {home}')
    return env, npm

def ensure_ble_venv():
    """Create hardware/.venv. Debian without python3-venv lacks ensurepip (e.g. UNO Q): fall back to uv."""
    environment = HARDWARE / '.venv'
    python = environment / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    uv = shutil.which('uv') or shutil.which('uv', path=str(Path.home() / '.local' / 'bin'))
    has_ensurepip = importlib.util.find_spec('ensurepip') is not None
    if not python.exists():
        print('Creating isolated hardware/.venv...', flush=True)
        if has_ensurepip:
            venv.create(environment, with_pip=True)
        elif uv:
            run([uv, 'venv', environment])
        else:
            raise SystemExit('Python venv/pip is unavailable. Install python3-venv (sudo apt install python3-venv) or uv.')
    if subprocess.run([str(python), '-m', 'pip', '--version'], capture_output=True).returncode == 0:
        return python, [python, '-m', 'pip', 'install']
    if uv:
        return python, [uv, 'pip', 'install', '--python', python]
    raise SystemExit('pip is missing in hardware/.venv. Delete it and install python3-venv or uv.')

def configure_api(target):
    """Write the UNO Q API address to frontend/.env.local (read by vite build/dev)."""
    url = ''
    if target:
        url = target if target.startswith('http') else f'http://{target}:8000/api/tactical-process'
    elif ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding='utf-8').splitlines():
            if line.startswith(ENV_KEY + '='):
                url = line.split('=', 1)[1].strip()
    url = url or f'http://{DEFAULT_BOARD}:8000/api/tactical-process'
    ENV_FILE.write_text(f'{ENV_KEY}={url}\n', encoding='utf-8')
    print(f'AI server: {url} (saved to frontend/.env.local)', flush=True)
    health = url.split('/api/')[0] + '/api/health'
    try:
        with urllib.request.urlopen(health, timeout=5) as response:
            print(f'AI server OK: {json.load(response)}', flush=True)
    except Exception as error:
        print(f'WARNING: AI server not reachable ({health}: {error}).', flush=True)
        print('  Start it on the board: ~/D4D/ai_pipeline/run_uno_q.sh  (same Wi-Fi required)', flush=True)
        print('  The UI still starts; "실제 API" mode uploads will fail until the server is up.', flush=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--build-only', action='store_true', help='Install dependencies and build, without starting BLE/server')
    parser.add_argument('--api', metavar='IP_OR_URL', help=f'UNO Q AI server (board IP or full URL). Default: frontend/.env.local, else {DEFAULT_BOARD}')
    parser.add_argument('--dev', action='store_true', help='Run the Vite dev server without BLE (hot reload)')
    args = parser.parse_args()
    if sys.version_info < (3, 10):
        raise SystemExit('Python 3.10+ is required.')
    if not (FRONTEND / 'package-lock.json').exists():
        raise SystemExit('frontend is missing. For sparse checkout: git sparse-checkout add frontend')
    if not args.build_only:
        with socket.socket() as probe:
            try:
                probe.bind(('127.0.0.1', 5173))
            except OSError:
                raise SystemExit('Port 5173 is already in use. Open http://localhost:5173 or stop the existing server first.')
    node_env, npm = ensure_node()
    configure_api(args.api)

    if args.dev:
        print('Installing frontend dependencies...', flush=True)
        run([npm, 'ci'], FRONTEND, node_env)
        print('Dev mode (no BLE): open http://localhost:5173, choose "실제 API", allow microphone. Ctrl+C to stop.', flush=True)
        run([npm, 'run', 'dev'], FRONTEND, node_env)
        return

    python, pip_install = ensure_ble_venv()
    print('Installing BLE dependencies...', flush=True)
    run(pip_install + ['-r', HARDWARE / 'requirements-ui.txt'])
    print('Installing frontend dependencies and building...', flush=True)
    run([npm, 'ci'], FRONTEND, node_env)
    run([npm, 'run', 'build'], FRONTEND, node_env)
    if args.build_only:
        print('Build complete. BLE/server was not started.', flush=True)
        return
    print('Open http://localhost:5173, choose "실제 API", and allow microphone access. Close other NU40 BLE peers.', flush=True)
    run([python, HARDWARE / 'ui_ble_bridge.py'])

if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.returncode)
    except KeyboardInterrupt:
        raise SystemExit(0)
