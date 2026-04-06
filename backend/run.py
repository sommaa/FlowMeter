import os
import sys
import threading
import webbrowser
import time
import uvicorn
from app.core.config import get_settings

def open_browser(url):
    """Open the browser after a short delay to allow server startup."""
    time.sleep(1.5)
    webbrowser.open(url)

if __name__ == "__main__":

    # If frozen, we might need to fix sys.path or loading
    if getattr(sys, 'frozen', False):
        # PyInstaller sets _MEIPASS
        # Configure internal env vars if needed
        pass

    settings = get_settings()
    host = "127.0.0.1"
    port = settings.port if settings.port else 8000
    
    # URL to open
    url = f"http://{host}:{port}"
    
    print(f"Starting {settings.app_name}...")
    print(f"Opening browser at {url}")

    # Start browser in a separate thread
    threading.Thread(target=open_browser, args=(url,), daemon=True).start()

    # Run Uvicorn
    # When running via PyInstaller, we must pass the app object directly
    from app.main import app
    uvicorn.run(
        app,
        host=host,
        port=port,
        reload=False,
        log_level="info"
    )
