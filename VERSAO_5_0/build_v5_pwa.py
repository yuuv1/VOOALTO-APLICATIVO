#!/usr/bin/env python3
"""
Build script for Vooalto V5 PWA
Takes module HTML files from ATUALIZACAO_V5/fontes/
and creates the PWA package in ATUALIZACAO_V5_PWA/
"""
import os, base64, re, shutil, zipfile

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, 'ATUALIZACAO_V5', 'fontes')
PWA = os.path.join(BASE, 'ATUALIZACAO_V5_PWA')

def encode_b64(text):
    return base64.b64encode(text.encode('utf-8')).decode('utf-8')

def build():
    # Read modules
    with open(os.path.join(SRC, 'projeto_principal_dashboard_catalogo.html'), 'r') as f:
        principal = f.read()
    with open(os.path.join(SRC, 'criador_ficha_tecnica.html'), 'r') as f:
        ficha = f.read()
    with open(os.path.join(SRC, 'orcamento_proposta.html'), 'r') as f:
        orcamento = f.read()
    
    # Read current wrapper to get shell structure
    wrapper_path = os.path.join(PWA, 'index.html')
    with open(wrapper_path, 'r') as f:
        wrapper = f.read()
    
    # Build PROJECTS definition
    projects_def = """const PROJECTS={
principal:{name:'Principal',button:'btn-principal',frame:'frame-principal',b64:'""" + encode_b64(principal) + """'},
ficha:{name:'Criador',button:'btn-ficha',frame:'frame-ficha',b64:'""" + encode_b64(ficha) + """'},
orcamento:{name:'Orçamento',button:'btn-orcamento',frame:'frame-orcamento',b64:'""" + encode_b64(orcamento) + """'}
};"""
    
    # Replace in wrapper
    start = wrapper.find('const PROJECTS={')
    end = wrapper.find('};', start) + 2
    new_wrapper = wrapper[:start] + projects_def + wrapper[end:]
    
    with open(wrapper_path, 'w') as f:
        f.write(new_wrapper)
    
    # Copy unified version
    shutil.copy2(wrapper_path, os.path.join(BASE, 'ATUALIZACAO_V5', 'vooalto_sistema_unificado_V5.html'))
    
    # Copy modules to sub-directories
    dirs = {
        'principal_dashboard': 'projeto_principal_dashboard_catalogo.html',
        'criador_ficha_tecnica': 'criador_ficha_tecnica.html',
        'criador_orcamento': 'orcamento_proposta.html'
    }
    for folder, filename in dirs.items():
        with open(os.path.join(SRC, filename), 'r') as f:
            content = f.read()
        outpath = os.path.join(BASE, 'ATUALIZACAO_V5', folder, 'index.html')
        with open(outpath, 'w') as f:
            f.write(content)
    
    print("Build complete!")

def make_zip():
    zip_path = os.path.join(BASE, 'VOOALTO_V5_PWA.zip')
    pwa_dir = os.path.join(BASE, 'ATUALIZACAO_V5_PWA')
    
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(pwa_dir):
            for file in files:
                filepath = os.path.join(root, file)
                arcname = os.path.relpath(filepath, pwa_dir)
                zf.write(filepath, arcname)
    
    print(f"ZIP created: {zip_path}")
    print(f"Size: {os.path.getsize(zip_path)} bytes")

if __name__ == '__main__':
    build()
    make_zip()
