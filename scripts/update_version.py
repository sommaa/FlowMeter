import re
import os
import json
import sys

# Ensure we run from the project root (parent of scripts/)
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

VERSION_FILE = 'VERSION'

def read_version():
    """Reads the version from the VERSION file."""
    try:
        with open(VERSION_FILE, 'r') as f:
            return f.read().strip()
    except FileNotFoundError:
        print(f"❌ Error: {VERSION_FILE} not found.")
        sys.exit(1)

def update_json(file_path, key, value):
    """Updates a specific key in a JSON file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        if data.get(key) != value:
            data[key] = value
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
                f.write('\n') # Ensure newline at EOF
            print(f"Updated {file_path}")
        else:
            print(f"No changes needed for {file_path}")
            
    except FileNotFoundError:
        print(f"Skipping {file_path} (not found)")
    except json.JSONDecodeError:
        print(f"Error decoding JSON in {file_path}")

def update_regex(file_path, pattern, replacement_template, version):
    """Updates a file using regex substitution."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        replacement = replacement_template.format(version=version)
        new_content = re.sub(pattern, replacement, content)
        
        if content != new_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Updated {file_path}")
        else:
            print(f"No changes needed for {file_path}")

    except FileNotFoundError:
        print(f"Skipping {file_path} (not found)")

# Configuration: Define all files to update here
TARGETS = [
    {
        "file": "frontend/package.json",
        "type": "json",
        "key": "version"
    },
    {
        "file": "backend/app/core/config.py",
        "type": "regex",
        "pattern": r'(app_version: str = ")([^"]+)(")',
        "replacement": r'\g<1>{version}\g<3>'
    },
    {
        "file": "backend/app/__init__.py",
        "type": "regex",
        "pattern": r'(__version__ = ")([^"]+)(")',
        "replacement": r'\g<1>{version}\g<3>'
    },
    {
        "file": "backend/docs/conf.py",
        "type": "regex",
        "pattern": r'(release = ")([^"]+)(")',
        "replacement": r'\g<1>{version}\g<3>'
    },
    {
        "file": "README.md",
        "type": "regex",
        "pattern": r'(badge/version-)([^?]+)(\?)',
        "replacement": r'\g<1>{version}-7C3AED\g<3',
        # Shield.io requires dashes to be escaped with double dashes
        "value_mapper": lambda v: v.replace('-', '--') 
    },
    {
        "file": "website/index.html",
        "type": "regex",
        "pattern": r'(v)([^ <]+)( — Open Source)',
        "replacement": r'\g<1>{version}\g<3>'
    },
    {
        # Additional footer version in website/index.html
        "file": "website/index.html",
        "type": "regex",
        "pattern": r'(<span>v)([^<]+)(</span>\s*<span>MIT License)',
        "replacement": r'\g<1>{version}\g<3>'
    }

]

def main():
    version = read_version()
    print(f"Updating version to: {version}\n")

    for target in TARGETS:
        file_path = target["file"]
        
        # Determine the version string to use (apply mapper if present)
        current_version = version
        if "value_mapper" in target:
            current_version = target["value_mapper"](version)

        if target["type"] == "json":
            update_json(file_path, target["key"], current_version)
            
        elif target["type"] == "regex":
            update_regex(file_path, target["pattern"], target["replacement"], current_version)

    print("\nVersion update complete!")

if __name__ == '__main__':
    main()
