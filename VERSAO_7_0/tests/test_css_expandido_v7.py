#!/usr/bin/env python3
"""V7.4 — Trava o CSS do modo "coluna expandida" da Catalogacao.

Historico: o modo expandido tinha 56 regras empilhadas em 6 rodadas de patch
(alturas 360/430/465/470/560/580/620/720/800px...), 457 !important no arquivo e
o resultado dependia de qual rodada "ganhasse" em cada largura de tela.

Na V7.4 esse bloco foi consolidado (56 -> 14 regras, sem !important) com
verificacao automatica: a cascata resolvida de 17 elementos x 16 larguras ficou
identica a de antes. Este teste garante que:

  1. os valores resolvidos continuam os mesmos (fixture gerado do estado
     verificado) — se alguem mexer no CSS sem querer, aparece aqui;
  2. a estrutura nao volta a virar pilha de patches (1 regra por seletor/media,
     sem !important, sem rodadas duplicadas de altura).
"""
import io
import json
import os
import re
import sys
import unittest

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


class CssExpandidoV7(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = io.open(DASH, encoding='utf-8').read()
        cls.regras, _ = parse(cls.src)
        cls.combos = combos_alvo()
        with io.open(FIXTURE, encoding='utf-8') as f:
            cls.fixture = json.load(f)

    def test_valores_resolvidos_iguais_ao_fixture(self):
        erros = []
        for nome in COMBOS:
            for w in LARGURAS:
                res = simular(self.regras, self.combos[nome], w)
                for p in PROPS:
                    chave = f'{nome}|{w}|{p}'
                    if chave not in self.fixture:
                        continue
                    obtido = res[p][0] if p in res else None
                    if obtido != self.fixture[chave]:
                        erros.append(f'{chave}: esperado {self.fixture[chave]!r}, obtido {obtido!r}')
        self.assertEqual([], erros, 'CSS do modo expandido mudou: ' + '; '.join(erros[:8]))

    def test_bloco_expandido_nao_tem_pilha_de_patches(self):
        alvo = [r for r in self.regras if 'expanded-pdf' in r.sel]
        self.assertLessEqual(len(alvo), 16, f'{len(alvo)} regras no modo expandido (V7.4 deixou 14)')
        # 1 regra por (seletor, media): nada de rodadas duplicadas
        vistos = {}
        for r in alvo:
            chave = (r.sel, r.media)
            self.assertNotIn(chave, vistos, f'regra repetida: {r.sel} @ {r.media}')
            vistos[chave] = True
        # a altura do card e' definida em 3 lugares: base + 2 faixas de tela
        alturas = [r for r in alvo if re.fullmatch(r'.*\.expanded-pdf-card', r.sel)
                   and any(p == 'height' for p, _, _ in r.decls)]
        self.assertEqual(3, len(alturas),
                         f'altura do card definida em {len(alturas)} regras (esperado: base + 2 faixas)')

    def test_bloco_expandido_sem_important(self):
        importantes = []
        for r in [r for r in self.regras if 'expanded-pdf' in r.sel]:
            for p, v, imp in r.decls:
                if imp:
                    importantes.append(f'{r.sel}:{p}')
        self.assertEqual([], importantes, '!important sobrando no modo expandido: ' + ', '.join(importantes))

    def test_faixas_de_tela_do_card(self):
        """Base 260x430; telas grandes 285x465; telas pequenas 210x360."""
        esperado = {1920: ('285px', '465px'), 1280: ('260px', '430px'), 500: ('210px', '360px')}
        for w, (larg, alt) in esperado.items():
            res = simular(self.regras, self.combos['card'], w)
            self.assertEqual(larg, res['width'][0], f'largura do card @{w}px')
            self.assertEqual(alt, res['height'][0], f'altura do card @{w}px')


if __name__ == '__main__':
    unittest.main(verbosity=2)
