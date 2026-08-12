#!/usr/bin/env python3
"""
Build script for Vooalto V7 PWA
- Lê os módulos de ATUALIZACAO_V7/fontes/ (fonte da verdade)
- Regenera o PROJECTS (b64) no wrapper ATUALIZACAO_V7_PWA/index.html
- Copia os módulos para as subpastas (criador_ficha_tecnica/, criador_orcamento/, principal_dashboard/)
- Copia as bibliotecas locais para ATUALIZACAO_V7_PWA/assets/
- Gera vooalto_sistema_unificado_V7.html
- Gera VOOALTO_V7_PWA.zip

Uso: python3 build_v7_pwa.py
"""
import os, base64, re, shutil, zipfile

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, 'ATUALIZACAO_V7', 'fontes')
V7 = os.path.join(BASE, 'ATUALIZACAO_V7')
PWA = os.path.join(BASE, 'ATUALIZACAO_V7_PWA')

MODULES = {
    'principal': 'projeto_principal_dashboard_catalogo.html',
    'ficha': 'criador_ficha_tecnica.html',
    'orcamento': 'orcamento_proposta.html',
}

def encode_b64(text):
    return base64.b64encode(text.encode('utf-8')).decode('utf-8')

def build():
    modules = {}
    for key, fname in MODULES.items():
        with open(os.path.join(SRC, fname), 'r', encoding='utf-8') as f:
            modules[key] = f.read()

    # 1. Rebuild wrapper PROJECTS
    wrapper_path = os.path.join(PWA, 'index.html')
    with open(wrapper_path, 'r', encoding='utf-8') as f:
        wrapper = f.read()

    names = {'principal': 'Principal', 'ficha': 'Criador', 'orcamento': 'Orçamento'}
    entries = []
    for key in ['principal', 'ficha', 'orcamento']:
        entries.append(
            "{0}:{{name:'{1}',button:'btn-{0}',frame:'frame-{0}',b64:'{2}'}}".format(
                key, names[key], encode_b64(modules[key])
            )
        )
    projects_def = "const PROJECTS={\n" + ",\n".join(entries) + "\n};"

    start = wrapper.find('const PROJECTS={')
    end = wrapper.find('};', start) + 2
    if start == -1 or end == -1:
        raise RuntimeError('PROJECTS block not found in wrapper')
    wrapper = wrapper[:start] + projects_def + wrapper[end:]
    with open(wrapper_path, 'w', encoding='utf-8') as f:
        f.write(wrapper)
    print('index.html regenerado (%d bytes)' % len(wrapper))

    # 2. Copies of modules in subdirectories
    pairs = [
        ('principal', os.path.join(V7, 'principal_dashboard', 'index.html')),
        ('ficha', os.path.join(V7, 'criador_ficha_tecnica', 'index.html')),
        ('orcamento', os.path.join(V7, 'criador_orcamento', 'index.html')),
    ]
    for key, dest in pairs:
        with open(dest, 'w', encoding='utf-8') as f:
            f.write(modules[key])
        print('cópia:', os.path.relpath(dest, BASE))

    # 3. Assets locais -> PWA assets
    for name in ['html2canvas.min.js', 'cropper.min.js', 'cropper.min.css']:
        src_a = os.path.join(V7, 'assets', name)
        dst_a = os.path.join(PWA, 'assets', name)
        if os.path.exists(src_a):
            shutil.copy2(src_a, dst_a)
            print('asset:', name)

    # 4. Unificado V7 (mesmo wrapper do PWA)
    unificado = os.path.join(V7, 'vooalto_sistema_unificado_V7.html')
    with open(unificado, 'w', encoding='utf-8') as f:
        f.write(wrapper)
    print('unificado:', os.path.relpath(unificado, BASE))

    # 5. ZIP
    zip_path = os.path.join(BASE, 'VOOALTO_V7_PWA.zip')
    if os.path.exists(zip_path):
        os.remove(zip_path)
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(PWA):
            for fn in files:
                full = os.path.join(root, fn)
                rel = os.path.relpath(full, PWA)
                z.write(full, os.path.join('VOOALTO_V7_PWA', rel))
    print('zip:', os.path.relpath(zip_path, BASE))

if __name__ == '__main__':
    build()
