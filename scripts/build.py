import os
import subprocess
import sys
import shutil
import platform

# Ensure we run from the project root (parent of scripts/)
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

if sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def run_command(command, cwd=None, shell=True):
    """Run a shell command and check for errors."""
    print(f"🚀 Running: {command} in {cwd or '.'}")
    try:
        subprocess.check_call(command, cwd=cwd, shell=shell)
    except subprocess.CalledProcessError as e:
        print(f"❌ Error running command: {command}")
        sys.exit(1)

def build_frontend():
    """Build the React frontend."""
    print("\n📦 Building Frontend...")
    frontend_dir = os.path.join(os.getcwd(), 'frontend')
    
    # Use npm.cmd on Windows, npm on others
    npm_cmd = 'npm.cmd' if platform.system() == 'Windows' else 'npm'
    
    run_command(f'{npm_cmd} install', cwd=frontend_dir)
    run_command(f'{npm_cmd} run build', cwd=frontend_dir)



def ensure_icon_exists(backend_dir):
    """Ensure icon.ico exists and has multiple sizes for Windows."""
    icon_path = os.path.join(backend_dir, 'icon.ico')
    png_path = os.path.join(backend_dir, 'icon.png')
    
    if os.path.exists(png_path):
        print(f"🎨 Generating multi-size icon from {png_path}...")
        try:
            from PIL import Image
            img = Image.open(png_path)
            # Generate ICO with standard Windows sizes
            icon_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
            img.save(icon_path, format='ICO', sizes=icon_sizes)
            print("✅ distinct icon.ico generated successfully.")
        except ImportError:
            print("⚠️ Pillow (PIL) not found. Cannot regenerate icon.ico. Install it with: pip install Pillow")
        except Exception as e:
            print(f"⚠️ Failed to generate icon: {e}")
    elif not os.path.exists(icon_path):
        print("⚠️ No icon.png found to generate icon.ico from, and icon.ico is missing.")

def build_backend():
    """Build the Python backend into a single executable."""
    print("\n🐍 Building Backend (FlowMeter)...")
    backend_dir = os.path.join(os.getcwd(), 'backend')
    
    # Install dependencies
    print("Installing python dependencies...")
    run_command(f'{sys.executable} -m pip install -r requirements.txt', cwd=backend_dir)
    # Ensure Pillow is installed for icon generation
    run_command(f'{sys.executable} -m pip install Pillow', cwd=backend_dir)
    
    # Run PyInstaller
    print("Running PyInstaller...")
    # Clean previous builds
    dist_dir = os.path.join(backend_dir, 'dist')
    build_dir = os.path.join(backend_dir, 'build')
    def on_rm_error(func, path, exc_info):
        """
        Error handler for ``shutil.rmtree``.

        If the error is due to an access error (read only file)
        it attempts to add write permission and then retries.

        If the error is because the file is being used by another process, it waits and retries.
        """
        import stat
        # Is the error an access error?
        if not os.access(path, os.W_OK):
            os.chmod(path, stat.S_IWRITE)
            func(path)
        else:
            print(f"Warning: Could not remove {path}. It might be in use.")

    if os.path.exists(dist_dir):
        shutil.rmtree(dist_dir, onerror=on_rm_error)
    if os.path.exists(build_dir):
        shutil.rmtree(build_dir, onerror=on_rm_error)

    spec_file = 'build_windows.spec' if platform.system() == 'Windows' else 'build_linux.spec'
    print(f"Using spec file: {spec_file}")
    
    if platform.system() == 'Windows':
        ensure_icon_exists(backend_dir)

    run_command(f'pyinstaller {spec_file} --clean', cwd=backend_dir)

def main():
    print("🚀 Starting Cross-Platform Build Process...")
    print(f"System: {platform.system()} {platform.release()}")
    
    build_frontend()
    build_backend()
    
    # Result
    backend_dir = os.path.join(os.getcwd(), 'backend')
    dist_dir = os.path.join(backend_dir, 'dist')
    
    exe_name = 'FlowMeter.exe' if platform.system() == 'Windows' else 'FlowMeter'
    exe_path = os.path.join(dist_dir, exe_name)
    
    if os.path.exists(exe_path):
        print("\n✅ Build Complete!")
        print("-" * 40)
        print(f"Executable location: {exe_path}")
        print(f"To run: {exe_path}")
        print("-" * 40)
    else:
        print("\n❌ Build seemingly failed. Executable not found.")
        sys.exit(1)

if __name__ == '__main__':
    main()
