import os
from PIL import Image

# Ensure we run from the project root (parent of scripts/)
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

def regenerate_icon():
    backend_dir = os.path.join(os.getcwd(), 'backend')
    icon_path = os.path.join(backend_dir, 'icon.ico')
    png_path = os.path.join(backend_dir, 'icon.png')
    
    if os.path.exists(png_path):
        print(f"🎨 Generating multi-size icon from {png_path}...")
        try:
            img = Image.open(png_path)
            # Generate ICO with standard Windows sizes
            icon_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
            img.save(icon_path, format='ICO', sizes=icon_sizes)
            print("✅ distinct icon.ico generated successfully.")
            
            # Verify file size
            size = os.path.getsize(icon_path)
            print(f"Icon size: {size} bytes")
            
        except Exception as e:
            print(f"⚠️ Failed to generate icon: {e}")
    else:
        print("❌ icon.png not found")

if __name__ == "__main__":
    regenerate_icon()
