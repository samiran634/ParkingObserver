#!/usr/bin/env python3
import os
import sys
import time
import subprocess
import threading

def run_command(name, cmd, cwd):
    print(f"[{name}] Starting...")
    
    # On Windows, we can use creationflags to open a new console window
    # so that the logs don't get mixed up in one terminal.
    if sys.platform == "win32":
        # We wrap the command in a cmd /k to keep the window open so we can see errors
        full_cmd = ["cmd", "/k", f"title {name} & " + " ".join(cmd)]
        process = subprocess.Popen(
            full_cmd,
            cwd=cwd,
            creationflags=subprocess.CREATE_NEW_CONSOLE
        )
    else:
        # On Mac/Linux, we'll run them in the background. 
        # For a better experience, we stream their output with a prefix.
        process = subprocess.Popen(
            cmd,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        
        # Thread to read output and print with prefix
        def stream_logs():
            for line in iter(process.stdout.readline, ''):
                print(f"[{name}] {line.strip()}")
            process.stdout.close()
            
        threading.Thread(target=stream_logs, daemon=True).start()
        
    return process

def main():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(root_dir, "Backend")
    frontend_dir = os.path.join(root_dir, "Frontend")
    agent_dir = os.path.join(root_dir, "Agent")

    processes = []

    try:
        print("🚀 Booting up the ParkingObserver System...")

        # 1. Start Backend (Wait a couple seconds to let it initialize)
        p_back = run_command(
            "BACKEND", 
            [sys.executable, "-m", "uvicorn", "main:app", "--reload", "--host", "127.0.0.1", "--port", "8000"], 
            backend_dir
        )
        processes.append(p_back)
        time.sleep(3)

        # 2. Start Frontend
        # npm needs shell=True on windows if not using full path, but we are wrapping in cmd /k on windows anyway.
        # On Unix, we just use npm directly.
        npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
        p_front = run_command(
            "FRONTEND", 
            [npm_cmd, "run", "dev"], 
            frontend_dir
        )
        processes.append(p_front)
        time.sleep(2)

        # 3. Start Edge Node Orchestrator
        p_edge = run_command(
            "EDGE_NODES", 
            [sys.executable, "run_edges.py"], 
            agent_dir
        )
        processes.append(p_edge)

        print("\n✅ All systems are running!")
        print("📡 Backend: http://127.0.0.1:8000")
        print("🌐 Frontend: http://localhost:5173")
        print("\nPress Ctrl+C in this terminal to shut everything down.\n")

        # Keep main thread alive
        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        print("\n🛑 Shutting down systems...")
        
        try:
            # 1. Properly execute the .bat file using cmd.exe (not Python)
            # We use subprocess.run so it executes in the background without spawning a persistent cmd /k window
            if sys.platform == "win32":
                subprocess.run(["cmd.exe", "/c", "stop_edges.bat"], cwd=agent_dir)
            else:
                subprocess.run(["sh", "./stop_edges.bat"], cwd=agent_dir) # If adapted for Linux
            
            time.sleep(1)

            # 2. Kill the other processes (Frontend, Backend, etc.)
            # On Windows, terminating 'cmd /k' doesn't kill child processes, so we must use taskkill /T (Tree kill)
            for p in processes:
                if sys.platform == "win32":
                    subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    p.terminate()

        except Exception as e:
            print(f"Error during shutdown: {e}")
            
        print("✅ Shutdown complete.")

if __name__ == "__main__":
    main()
