#!/usr/bin/env python3
"""Gera o fixture de valores resolvidos do modo coluna expandida.

Rode SEMPRE depois de conferir visualmente uma mudanca proposital no modo
expandido da Catalogacao:

    cd VERSAO_7_0 && python tests/_gerar_fixture_css_v7.py

Sem isso, test_css_expandido_v7.py vai acusar a mudanca (que e' o objetivo:
ele existe para avisar quando o CSS do modo expandido muda sem querer).
"""
import io
import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from css_cascata import parse, simular, combos_alvo  # noqa: E402

DASH = os.path.join(AQUI, '..', 'ATUALIZACAO_V7', 'principal_dashboard', 'index.html')
FIXTURE = os.path.join(AQUI, 'fixtures', 'css_expandido_v7.json')

COMBOS = ['card', 'card-hover', 'date', 'sheet', 'sheet-ready', 'loading', 'canvas', 'iframe']
LARGURAS = [1920, 1500, 1280, 900, 500]
PROPS = ['height', 'min-height', 'max-height', 'width', 'flex-basis', 'flex-grow', 'flex-shrink',
         'display', 'flex-direction', 'align-items', 'justify-content', 'align-self', 'justify-self',
         'overflow', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
         'margin-top', 'margin-bottom', 'row-gap', 'column-gap', 'aspect-ratio', 'object-fit',
         'position', 'transform', 'border-radius', 'border-width', 'border-style', 'box-shadow']


def main():
    src = io.open(DASH, encoding='utf-8').read()
    regras, _ = parse(src)
    combos = combos_alvo()
    saida = {}
    for nome in COMBOS:
        for w in LARGURAS:
            res = simular(regras, combos[nome], w)
            for p in PROPS:
                if p in res:
                    saida[f'{nome}|{w}|{p}'] = res[p][0]
    os.makedirs(os.path.dirname(FIXTURE), exist_ok=True)
    with io.open(FIXTURE, 'w', encoding='utf-8') as f:
        json.dump(saida, f, indent=0, sort_keys=True, ensure_ascii=False)
        f.write('\n')
    print(f'fixture gravado: {FIXTURE} ({len(saida)} valores)')


if __name__ == '__main__':
    main()
