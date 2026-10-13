#!/usr/bin/env python3
"""Simulador de cascata CSS do modo "coluna expandida" da Catalogacao (V7.4).

Existe para poder mexer no CSS sem "achismo": ele resolve o que o navegador
resolveria (especificidade, ordem, !important, @media min/max-width) para cada
elemento do modo expandido, em varias larguras de tela. E' usado por
test_css_expandido_v7.py (trava os valores atuais) e pelos scripts de
consolidacao.

Suporta o subconjunto que o arquivo usa: classe/id/tag, :hover, descendente,
@media (min/max-width) e !important. Shorthands (margin, padding, gap, border,
border-radius, flex, background) sao expandidos em longhands.
"""
import io
import re
import sys

# ---------------------------------------------------------------- parsing

def style_spans(src):
    return [(m.start(1), m.end(1)) for m in re.finditer(r'<style[^>]*>(.*?)</style>', src, flags=re.S)]


class Regra:
    __slots__ = ('idx', 'media', 'sel', 'decls', 'ini', 'fim', 'comentarios')

    def __init__(self, idx, media, sel, decls, ini, fim, comentarios):
        self.idx, self.media, self.sel, self.decls = idx, media, sel, decls
        self.ini, self.fim, self.comentarios = ini, fim, comentarios

    def __repr__(self):
        return f'<#{self.idx} {"|".join(self.media) or "base"} {self.sel[:60]}>'


def parse(src):
    """Devolve (regras, spans) com offsets absolutos no arquivo."""
    regras = []
    spans = []
    idx = 0
    for (a, b) in style_spans(src):
        css = src[a:b]
        spans.append((a, b))
        i, n = 0, len(css)
        ctx = []
        buf = ''
        coment = []          # span absoluto dos comentarios pendentes
        pend_coment = []
        while i < n:
            c = css[i]
            if css.startswith('/*', i):
                j = css.find('*/', i + 2)
                j = n if j < 0 else j + 2
                pend_coment.append((a + i, a + j))
                i = j
                continue
            if c == '@':
                m = re.match(r'@media([^{]*)\{', css[i:])
                if m:
                    buf = ''          # espaco em branco antes do @media nao pertence a regra
                    ctx.append(m.group(1).strip())
                    i += m.end()
                    continue
                m2 = re.match(r'@[a-z-]+([^{;]*);', css[i:])
                if m2:
                    i += m2.end()
                    continue
                # @keyframes etc: pula o bloco inteiro
                m3 = re.match(r'@[a-z-]+([^{]*)\{', css[i:])
                if m3:
                    depth = 1
                    j = i + m3.end()
                    while j < n and depth:
                        if css[j] == '{':
                            depth += 1
                        elif css[j] == '}':
                            depth -= 1
                        j += 1
                    i = j
                    continue
            if c == '}':
                buf = ''
                if ctx:
                    ctx.pop()
                i += 1
                continue
            if c == '{':
                j = css.find('}', i)
                sel = ' '.join(buf.split())
                ini_rel = i - len(buf)
                buf = ''
                if sel and not sel.startswith('@'):
                    decls = parse_decls(css[i + 1:j])
                    regras.append(Regra(idx, tuple(ctx), sel, decls, a + ini_rel, a + j + 1, list(pend_coment)))
                    idx += 1
                pend_coment = []
                i = j + 1
                continue
            buf += c
            i += 1
    return regras, spans


def parse_decls(txt):
    out = []
    for parte in txt.split(';'):
        if ':' not in parte:
            continue
        p, _, v = parte.partition(':')
        p = p.strip()
        v = v.strip()
        if not p:
            continue
        imp = v.endswith('!important')
        if imp:
            v = v[:-len('!important')].strip()
        v = ' '.join(v.split())
        if p and v:
            out.append((p, v, imp))
    return out


# ------------------------------- expansao de shorthands -> longhands

def expandir(prop, valor):
    """Longhands equivalentes. Soh o que o arquivo usa."""
    p = prop
    if p in ('margin', 'padding'):
        partes = valor.split()
        if len(partes) == 1:
            t = r = b = l = partes[0]
        elif len(partes) == 2:
            t = b = partes[0]
            r = l = partes[1]
        elif len(partes) == 3:
            t, r, b = partes
            l = r
        else:
            t, r, b, l = partes
        return [(f'{p}-top', t), (f'{p}-right', r), (f'{p}-bottom', b), (f'{p}-left', l)]
    if p == 'gap':
        partes = valor.split()
        row = partes[0]
        col = partes[1] if len(partes) > 1 else row
        return [('row-gap', row), ('column-gap', col)]
    if p == 'flex':
        partes = valor.split()
        if len(partes) == 1:
            g = s = partes[0]
            b = 'auto' if partes[0] != 'none' else 'auto'
            if partes[0] == 'none':
                g, s, b = '0', '0', 'auto'
            elif partes[0] == 'initial':
                g, s, b = '0', '1', 'auto'
            else:
                g, s, b = '1', '1', partes[0]
            return [('flex-grow', g), ('flex-shrink', s), ('flex-basis', b)]
        if len(partes) == 2:
            g, s = partes
            return [('flex-grow', g), ('flex-shrink', s), ('flex-basis', 'auto')]
        if len(partes) == 3:
            return [('flex-grow', partes[0]), ('flex-shrink', partes[1]), ('flex-basis', partes[2])]
    if p == 'border':
        # "1px solid rgba(...)" / "0" / "1px solid rgba(15,23,42,.18)"
        partes = valor.split(None, 2)
        out = []
        if partes and re.match(r'^[\d.]+(px|em|rem)?$', partes[0]):
            out.append(('border-width', partes[0]))
        if len(partes) > 1 and partes[1] in ('solid', 'dashed', 'dotted', 'none', 'double'):
            out.append(('border-style', partes[1]))
        if len(partes) > 2:
            out.append(('border-color', partes[2]))
        elif valor.strip() in ('0', 'none'):
            out.append(('border-width', '0'))
            out.append(('border-style', 'none'))
        return out or [(p, valor)]
    if p == 'border-radius':
        return [('border-radius', valor)]      # nao colide com 'border' em nenhum caso real
    if p == 'background':
        out = []
        if valor.split()[0] in ('#fff', '#ffffff', 'white') or valor.startswith('rgba') or valor.startswith('rgb'):
            out.append(('background-color', valor))
        if 'url(' in valor or 'linear-gradient' in valor:
            out.append(('background-image', valor))
        if not out:
            out.append(('background-color', valor))
        return out
    if p == 'font':
        return [('font', valor)]
    return [(p, valor)]


# ---------------------------------------------------------------- matching

def spec(sel):
    """(ids, classes+attrs+pseudo, tags)."""
    s = re.sub(r'::[a-z-]+', '', sel)
    ids = len(re.findall(r'#[A-Za-z0-9_-]+', s))
    cls = len(re.findall(r'\.[A-Za-z0-9_-]+', s)) + len(re.findall(r'\[[^\]]+\]', s)) + len(re.findall(r':[a-z-]+', s))
    tags = len(re.findall(r'(^|[\s>+~])([a-zA-Z][a-zA-Z0-9-]*)', s))
    tags += len(re.findall(r'::[a-z-]+', sel))
    return (ids, cls, tags)


def parse_sel(sel):
    """Lista de compostos, ou None se usar combinador nao suportado."""
    if re.search(r'\s[>+~]\s|[>+~]', sel):
        return None
    return ' '.join(sel.split()).split(' ')


def composto_ok(comp, el):
    """comp: '.a.b#c' ; el: dict(tag, id, classes:set, pseudo:set)"""
    copia = comp
    for pid in re.findall(r'#([A-Za-z0-9_-]+)', copia):
        if el.get('id') != pid:
            return False
    for pcls in re.findall(r'\.([A-Za-z0-9_-]+)', copia):
        if pcls not in el['classes']:
            return False
    for ptg in re.findall(r'(?:^|[^.#\w-])([a-zA-Z][a-zA-Z0-9-]*)(?=$|[^\w-])', comp):
        if el['tag'] != ptg:
            return False
    # tag no inicio
    m = re.match(r'^([a-zA-Z][a-zA-Z0-9-]*)', comp)
    if m and el['tag'] != m.group(1):
        return False
    for pseudo in re.findall(r'(?<!:):([a-z-]+)', comp):
        if pseudo not in el.get('pseudo', ()):
            return False
    return True


def combina_anc(partes, caminho):
    """Casa as partes restantes (da direita p/ a esquerda) contra os ANCESTRAIS."""
    if not partes:
        return True
    if not caminho:
        return False
    if composto_ok(partes[-1], caminho[-1]):
        if combina_anc(partes[:-1], caminho[:-1]):
            return True
    return combina_anc(partes, caminho[:-1])   # descendente: pula um ancestral


def combina(partes, caminho, self_):
    """A ultima parte DEVE casar com o proprio elemento; o resto, com os ancestrais."""
    if not partes or not composto_ok(partes[-1], self_):
        return False
    return combina_anc(partes[:-1], caminho)


def media_ok(media, largura):
    for m in media:
        if m.startswith('print'):
            return False
        for mm in re.finditer(r'\(\s*(min|max)-width\s*:\s*([\d.]+)px\s*\)', m):
            tipo, val = mm.group(1), float(mm.group(2))
            if tipo == 'min' and largura < val:
                return False
            if tipo == 'max' and largura > val:
                return False
    return True


# ---------------------------------------------------------------- simulacao

def simular(regras, combo, largura):
    """Devolve {longhand: (valor, important, spec, idx_regra)}."""
    vencedor = {}
    for reg in regras:
        if not media_ok(reg.media, largura):
            continue
        for partes_sel in reg.sel.split(','):
            partes = parse_sel(partes_sel.strip())
            if not partes:
                continue
            if not combina(partes, combo['caminho'], combo['self']):
                continue
            sp = spec(partes_sel)
            for prop, val, imp in reg.decls:
                for lh, lv in expandir(prop, val):
                    chave = (1 if imp else 0, sp, reg.idx)
                    if lh not in vencedor or chave > vencedor[lh][2]:
                        vencedor[lh] = (lv, imp, chave)
    return vencedor


def el(tag, classes='', id_=None, pseudo=()):
    return {'tag': tag, 'classes': set(classes.split()) if classes else set(), 'id': id_, 'pseudo': set(pseudo)}


def combos_alvo():
    raiz = [el('html'), el('body'), el('div', 'main'), el('section', 'view active', id_='catalogo')]
    colunas = el('div', 'columns expanded', id_='columns')
    col = el('div', 'column expanded')
    dz = el('div', 'dropzone')
    card = el('div', 'order-card expanded-pdf-card baixa')
    sheet = el('div', 'expanded-pdf-sheet')
    ready = el('div', 'expanded-pdf-sheet pdf-canvas-ready')
    base = raiz + [colunas, col, dz]
    c = {}

    def add(nome, caminho, self_):
        c[nome] = {'caminho': caminho, 'self': self_}

    add('card', base, card)
    add('card-hover', base, card | {'pseudo': {'hover'}})
    add('date', base + [card], el('div', 'expanded-pdf-date'))
    add('sheet', base + [card], sheet)
    add('sheet-ready', base + [card], ready)
    add('loading', base + [card, sheet], el('div', 'expanded-pdf-loading'))
    add('empty', base + [card, ready], el('div', 'expanded-pdf-empty'))
    add('canvas', base + [card, sheet], el('canvas'))
    add('canvas-ready', base + [card, ready], el('canvas'))
    add('iframe', base + [card, sheet], el('iframe'))
    add('iframe-fallback', base + [card, sheet], el('iframe', 'fallback-pdf'))
    for st in ('media', 'alta', 'concluido'):
        add('card-' + st, base, el('div', 'order-card expanded-pdf-card ' + st))
    add('card-plain', base, el('div', 'order-card expanded-pdf-card'))
    # fora do modo expandido (garante que nada la e afetado)
    colunas2 = el('div', 'columns', id_='columns')
    add('card-colapsado', raiz + [colunas2, col, dz], card)
    add('sheet-colapsado', raiz + [colunas2, col, dz], sheet)
    return c


LARGURAS = [2560, 1920, 1600, 1599, 1500, 1499, 1280, 1000, 901, 900, 899, 820, 760, 600, 500, 360]


def foto(regras):
    combos = combos_alvo()
    return {(nome, w): {k: v[0] for k, v in simular(regras, combo, w).items()}
            for nome, combo in combos.items() for w in LARGURAS}


if __name__ == '__main__':
    src = io.open(sys.argv[1], encoding='utf-8').read()
    regras, _ = parse(src)
    if len(sys.argv) > 2 and sys.argv[2] == 'antes':
        f = foto(regras)
        for (nome, w), props in f.items():
            sel = {k: v for k, v in props.items() if k in ('height', 'min-height', 'max-height', 'width', 'flex-basis', 'aspect-ratio', 'display', 'object-fit', 'flex-grow', 'flex-shrink', 'padding-top', 'margin-bottom', 'overflow')}
            print(f'{nome:<16} @{w:<5} {sel}')
    else:
        print(f'{len(regras)} regras em {sys.argv[1]}')
