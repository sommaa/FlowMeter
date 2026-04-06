# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

import sys
import os

# Path to local frontend build
frontend_dist = os.path.abspath(os.path.join(os.getcwd(), '..', 'frontend', 'dist'))

a = Analysis(
    ['run.py'],
    pathex=[],
    binaries=[],
    datas=[
        (frontend_dist, 'static'),  # Map local dist to 'static' in bundle
        ('app', 'app'),             # Include source code if needed or rely on pure analysis
        (os.path.abspath(os.path.join(os.getcwd(), '..', 'frontend', 'public', 'logo_white_colored.svg')), '.'),
        (os.path.abspath(os.path.join(os.getcwd(), '..', 'frontend', 'public', 'logo_black_colored.svg')), '.'),
    ],
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'pandas',
        'numpy',
        'sklearn',
        'sklearn.utils._cython_blas',
        'sklearn.neighbors.typedefs',
        'sklearn.neighbors.quad_tree',
        'sklearn.tree',
        'sklearn.tree._utils',
        'scipy',
        'scipy.spatial.transform._rotation_groups',
        'openpyxl',
        'xlrd',
        'matplotlib',

        'app.main',
        'jaraco.text',
        'jaraco.classes',
        'jaraco.context',
        'pkg_resources.extern',
        'sympy',
        'osqp',
        'scipy.sparse',
        'scipy.sparse.linalg',
        'scipy.optimize',
        'scipy.integrate',
        'scipy.special',
    ],
    hookspath=['hooks'],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='FlowMeter',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
