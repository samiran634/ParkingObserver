#!/usr/bin/env python3
import os
import sys
import subprocess

def run_command(cmd, cwd=None, shell=False):
    print(f"\n🚀 Running: {' '.join(cmd)}")
    try:
        subprocess.check_call(cmd, cwd=cwd, shell=shell)
        print("✅ Success!")
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed with error code {e.returncode}")
        sys.exit(1)

def main():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(root_dir, "Backend")
    frontend_dir = os.path.join(root_dir, "Frontend")

    print("==========================================")
    print("   ParkingObserver Dependency Installer   ")
    print("==========================================")

    # 1. Install Python dependencies (Backend + Edge Nodes)
    print("\n📦 Step 1: Installing Python dependencies for Backend & Edge Nodes...")
    # List of all required python packages across the entire project
    python_packages = [
        "opencv-python",
        "ultralytics",
        "requests",
        "pandas",
        "numpy",
        "catboost",
        "fastapi",
        "uvicorn",
        "pydantic",
        "websockets"
    ]
    
    # We use sys.executable to ensure we install into the currently active Python/virtualenv
    pip_cmd = [sys.executable, "-m", "pip", "install"] + python_packages
    run_command(pip_cmd)

    # 2. Install Node.js dependencies (Frontend)
    print("\n📦 Step 2: Installing Node.js dependencies for the Frontend...")
    if not os.path.exists(frontend_dir):
        print(f"⚠️ Warning: Frontend directory not found at {frontend_dir}. Skipping npm install.")
    else:
        # On Windows, npm is actually npm.cmd
        npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
        run_command([npm_cmd, "install"], cwd=frontend_dir)

    print("\n🎉 All dependencies have been installed successfully!")
    print("You can now run 'python start_system.py' to launch the entire ecosystem.")

if __name__ == "__main__":
    main()
