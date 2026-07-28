#!/usr/bin/env python3
"""
Build script for Vooalto V6 PWA
Takes module HTML files from ATUALIZACAO_V6/fontes/
and updates the PWA package in ATUALIZACAO_V6_PWA/
"""
import os, base64, re, shutil, zipfile

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, 'ATUALIZACAO_V6', 'fontes')
PWA = os.path.join(BASE, 'ATUALIZACAO_V6_PWA')

def encode_b64(text):
    return base64.b64encode(text.encode('utf-8')).decode('utf-8')

def build():
    # Read modules
    with open(os.path.join(SRC, 'projeto_principal_dashboard_catalogo.html'), 'r', encoding='utf-8') as f:
        principal = f.read()
    with open(os.path.join(SRC, 'criador_ficha_tecnica.html'), 'r', encoding='utf-8') as f:
        ficha = f.read()
    with open(os.path.join(SRC, 'orcamento_proposta.html'), 'r', encoding='utf-8') as f:
        orcamento = f.read()
    
    # Read current wrapper to get shell structure
    wrapper_path = os.path.join(PWA, 'index.html')
    with open(wrapper_path, 'r', encoding='utf-8') as f:
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
    
    with open(wrapper_path, 'w', encoding='utf-8') as f:
        f.write(new_wrapper)
    
    # Copy modules to sub-directories
    dirs = {
        'principal_dashboard': 'projeto_principal_dashboard_catalogo.html',
        'criador_ficha_tecnica': 'criador_ficha_tecnica.html',
        'criador_orcamento': 'orcamento_proposta.html'
    }
    for folder, filename in dirs.items():
        with open(os.path.join(SRC, filename), 'r', encoding='utf-8') as f:
            content = f.read()
        outpath = os.path.join(BASE, 'ATUALIZACAO_V6', folder, 'index.html')
        with open(outpath, 'w', encoding='utf-8') as f:
            f.write(content)
    
    print("Build complete!")
    print(f"Wrapper size: {len(new_wrapper)} chars")

def make_zip():
    zip_path = os.path.join(BASE, 'VOOALTO_V6_PWA.zip')
    pwa_dir = PWA
    
    if os.path.exists(zip_path):
        os.remove(zip_path)
    
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(pwa_dir):
            for file in files:
                filepath = os.path.join(root, file)
                arcname = os.path.relpath(filepath, pwa_dir)
                zf.write(filepath, arcname)
    
    print(f"ZIP created: {zip_path}")
    print(f"Size: {os.path.getsize(zip_path)} bytes ({os.path.getsize(zip_path)/1024:.1f} KB)")

if __name__ == '__main__':
    build()
    make_zip()
