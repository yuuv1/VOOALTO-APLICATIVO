# VOOALTO V10 — Plano do Estúdio do Mockup

**O sistema de modificação da peça: onde se coloca o modelo de camiseta e as
artes.**

Documento **separado** do `PLANO_V10.md`. Aquele descreve o sistema inteiro por
dentro (módulos, dados, temas, PWA, contrato). Este aqui trata de **uma coisa
só**: a área do mockup da Ficha Técnica — o lugar onde entra o modelo de
camiseta e as artes — e o **Estúdio da Peça** (o editor vetorial que monta a
camiseta).

**Por que um documento só para isso:** o mockup é a parte que mais mudou e a
que mais acumula regra. Ele vive dentro das 10.687 linhas da ficha técnica
(≈750 referências a `mke*`) e tem um segundo editor do lado
(`mockup/peca_*.js` + o CSS, 1.816 linhas no total). Melhorar "o sistema geral de
modificação" sem mapa próprio vira adivinhação — e cada melhoria vira
arriscada, porque a mesma área é usada na tela, na impressão e no PNG que vai
para a gráfica.

**Objetivo declarado:** fazer o sistema se comportar como as **ferramentas
padrão do Canva** — mesma linguagem de seleção, alças, barras flutuantes,
atalhos e painéis — **sem** mexer no que já está pronto: a folha A4, a
impressão, o `.json` de backup e as chaves de dado.

**Regra herdada do pedido da V9.1 (que continua valendo):** a estrutura da
ficha técnica e do orçamento **não muda**. Nenhum campo, seção, tabela ou
medida da folha A4 é criado, removido ou deslocado. Tudo o que entrar é
**ferramenta**: fica em volta da área do mockup, é escondido na impressão e na
pré-visualização.

---

## 1. Escopo

### 1.1 O que entra

* A **área do mockup** (`#canvasOuter`) da folha 1 e das páginas extras:
  seleção, arraste, redimensionamento, rotação, alinhamento, organização,
  precisão, lista de camadas, ímã, guias, atalhos, exportar PNG.
* O **Estúdio da Peça** (`mockup/peca_editor.js`): cor por recorte, textura,
  arte presa ao tecido, frente/costas, acabamento.
* A **ponte** entre os dois: a peça vira PNG e entra como camada na área do
  mockup.

### 1.2 O que **não** entra (e por quê)

| Fora do escopo | Por quê |
|---|---|
| A folha A4 (campos, tabelas, medidas, produção) | A estrutura do documento impresso não muda. |
| Orçamento, Recibo, Contrato | Módulos independentes; nada a ver com o mockup. |
| Conta de usuário, nuvem, compartilhamento, comentários | O app é 100% offline e local. |
| IA, remoção de fundo com modelo, filtros "mágicos" | Peso e risco desproporcional ao uso (fotos de cliente e logos). |
| Motor de impressão / geração de PDF | Continua igual — o ganho tem que ser **antes** de imprimir. |

---

## 2. Como o sistema é hoje

### 2.1 As duas ferramentas

| | **Área do mockup** | **Estúdio da Peça** |
|---|---|---|
| Onde vive | `criador_ficha_tecnica/index.html` | `mockup/peca_editor.js` (979), `peca.js` (322), `peca_render.js` (299), `peca_editor.css` (216) |
| Modelo de dado | camadas DOM: `layers[]` (folha 1) e `paginas[].layers[]` (extras) | estado vetorial `{frente, costas, acabamento}` |
| Unidades | % da área (`xp/yp/wp/hp`) + mm derivado de `MKE_MM_PX = 210/794` | `viewBox 1000 × 1240` |
| Tipos de camada | `img`, `txt`, `arr`, `rect`, `circle` | — |
| Desenho | HTML/CSS (imprime igual à tela) | SVG puro (mesmo desenho na tela, na ficha e no PNG) |
| Desfazer | global da ficha: `snap()` (debounce 800 ms) + `undoStack` (40 níveis) | próprio: `historico`/`futuro` (40 níveis) |
| Saída | A4/PDF/PNG da folha | `PecaRender.paraPNG(est, 1600)` → PNG → vira camada `img` |
| Testes | `tests/test_mockup_v10.js` (78 KB) | `tests/test_peca_v10.js` (30 KB) |

**A ponte:** botão 🗂/peça da régua → `mkeAbrirPeca()` (ficha:5170) → overlay
`#pecaOverlay` → `PecaEditor.montar()` → **Aplicar** → `mkeAplicarPeca()`
(ficha:5217) → `PecaRender.paraPNG()` → nova camada de imagem com o estado
vetorial guardado em `pecaGuardar()` → dá para reabrir e editar depois.

### 2.2 Anatomia — os ids e as funções que não se mexem

```
#canvasOuter                        ← a área do mockup (folha 1)
  .canvas-inner                    ← palco das camadas
    #mkeGuias                      ← guias de centro/terços/margem (não imprimem)
    #mkeSmartV / #mkeSmartH        ← linha ciano do ímã durante o arraste
    .img-layer .txt-layer .arr-layer .rect-layer .circle-layer
      .lyr-h.lyr-tl/.lyr-tr/.lyr-bl/.lyr-br   ← 4 alças de canto
      .lyr-rot                      ← alça de rotação
  .mke-rail                        ← régua: + imagem · ⤢ · 📐 · 🗂 · 🧲 · peça · 🎛
  .mke-panel                       ← 4 abas: Ajustes / Alinhar / Organizar / Precisão
  .mke-badge                       ← medida (%, mm, X, Y) durante o arraste
  .layers-panel (#layersPanel)     ← lista de camadas
```

Funções de referência (ficha técnica):

| Função | Linha | O que faz |
|---|---|---|
| `mkeTransform(l)` | 4456 | **fonte única** de rotação + espelhamento (`rotate` + `scaleX` + `scaleY`) |
| `mkeAplicarVisual(l, el)` | 4462 | opacidade, oculto, cadeado, `object-fit` |
| `mkeCtx()` | 4518 | decide **em qual página** a ação cai |
| `mkeListaFoco()` | 4552 | lista de camadas da página em foco |
| `mkeLimite(v, tamanho)` | 4647 | mantém ~10% da camada dentro da área |
| `mkeSnapXY(l, x, y, W, H)` | 4663 | ímã: bordas, centro e outras camadas |
| `mkeGuiaViva(eixo, pos, tam)` | 4683 | linha ciano do encaixe |
| `mkeMostrarMedida(l, W, H)` | 4704 | plaquinha de medida durante o arraste |
| `mkeGradeLote(n, ratios, rc, gap)` | 4750 | grade do import em lote (**função pura, testada**) |
| `mkeLoteImagens(arqs, page)` | 4786 | import em lote (2 colunas, 2×2, 3 colunas) |
| `mkeAlinhar(modo)` | 5028 | alinhar na área ou no grupo |
| `mkeDistribuir(eixo)` | 5089 | espaçamento igual |
| `mkeOrganizar(modo)` | 5122 | lado a lado, empilhado, grade, encaixe |
| `mkePrecisaoLer/Aplicar` | 5310/5346 | X/Y/L/A/rotação em % e mm |
| `mkeMontarRail/Painel` | 5671/5694 | UI do estúdio |
| `mkeAcao(nome)` | 5994 | **um único despachante** de todas as ações |
| `mkeNudge(dx, dy)` | 6061 | mover 1 px / 10 px |
| `initResizeImg(e, l, el, c)` | 3933 | redimensionar por um dos 4 cantos |
| `initRotEl(e, l, el)` | 3954 | girar (Shift prende em 15°) |
| `serLayer(l)` / `restState(s)` | 3217/3238 | (de)serializa — **só grava o que foge do padrão** |

### 2.3 Modelo de dado (o que já existe e o que pode crescer)

**Camada** (`layers[]` e `paginas[].layers[]`):

| Campo | Tipo | Significado |
|---|---|---|
| `type` | `img`/`txt`/`arr`/`rect`/`circle` | tipo |
| `id`, `z` | id, ordem | identificação e pilha |
| `xp`, `yp`, `wp`, `hp` | 0–1 | caixa em % da área |
| `rot` | graus | rotação |
| `ratio` | número | proporção para o redimensionamento |
| `prop` | bool | **manter proporção** (≠ `locked`) |
| `locked` | bool | **não mover** (cadeado da lista) |
| `hidden`, `op` | bool, 0–1 | ocultar (não imprime), opacidade |
| `flipH`, `flipV` | bool | espelhamento |
| `fit` | `contain`/`cover` | caber ou preencher |
| `name`, `_fileName` | texto | nome editável / nome do arquivo |
| `_peca` | objeto | **estado do Estúdio da Peça** (só nas peças) |

**Peça** (estado do `PecaEditor`):

```
{ frente: { cores:{corpo,mangas,recorte,gola,punho,interior}, texturas:{<zona>:{…}}, artes:[{id,src,x,y,w,h,rot,opac,flip}] },
  costas: { … igual … },
  acabamento: 'dryfit' | 'algodao' }
```

Zonas de aplicação (as 5): **corpo**, **mangas**, **recortes**, **gola**,
**punhos**.

### 2.4 As regras que **não** se quebram

Herdadas do `PLANO_V10.md` §8.1 — quem continuar precisa manter. Como elas
limitam o trabalho novo, vale repetir aqui:

1. **Nada disso pode imprimir.** Régua, painel, guias, alças, menu e selo estão
   na lista de `@media print` e na de `body.v4-preview-clean`. O modo ampliado
   (`#canvasOuter.mke-studio`, `position:fixed`) também é desfeito em
   `prepPrint`, `v7BaixarPDF` e na própria `@media print`.
2. **Atributos novos de camada são opcionais.** `serLayer()` só grava quando
   fogem do padrão — o `.json` de quem não usa o recurso não engorda.
3. **Transformação em um lugar só.** `mkeTransform(l)` monta
   `rotate + scaleX + scaleY`; `mkeAplicarVisual()` trata opacidade, oculto,
   cadeado e `object-fit`. **Nenhum render novo escreve `style.transform`
   direto** — senão o espelhamento some na impressão.
4. **Cadeado × proporção** são coisas diferentes (`locked` × `prop`). Era a
   confusão da V8.
5. **`mkeCtx()`** decide em qual página a ação cai: página extra ativa com
   seleção > seleção da folha 1 > primeira página com seleção > nada.
6. **`mkeLimite()`**: a camada nunca sai inteira da área (fica ~10% dentro).
7. **Importação em lote** usa `mkeGradeLote` (função pura) — os dois caminhos de
   importação precisam usar o mesmo encaixe.
8. **Ferramentas por página**: `mkePaginaFoco` + `mkeMoverUI` movem régua,
   painel, selo, barra do estúdio, guias e ímãs para a página em foco.
   **Qualquer elemento novo do estúdio precisa entrar na lista do
   `mkeMoverUI`**, senão fica preso na folha 1.
9. **Nada de novo no papel**: toda ferramenta mora fora de `.folha`.
10. **Resolução**: `mkeQualidade()` compara os pixels reais com os necessários
    para 300 dpi (`MKE_MM_PX = 210/794`). O tamanho natural fica em
    `l._nw/_nh` e `MKE_PX[src]`, **nunca** em `serLayer`.

Acrescenta-se uma 11ª, que este plano precisa respeitar:

11. **O estado da peça é aditivo.** `PecaRender.normalizar()` já preenche o
    que falta; um estado antigo (sem modelo, sem arte nova) tem de continuar
    abrindo e renderizando igual.

---

## 3. Diagnóstico — a distância até o Canva

### 3.1 Painel comparativo

| Ferramenta do Canva | Como está hoje | Situação |
|---|---|---|
| Seleção por clique, Shift para várias | clique, Shift+clique, marquee na folha 1 | 🟢 |
| Arrastar com ímã e guias | ímã com bordas/centro/outras camadas + linha ciano | 🟢 |
| Alças de redimensionamento | 4 cantos na imagem; **1** em texto e forma | 🟡 |
| Esticar por um lado só (sem proportionar) | não existe | 🔴 |
| Barra flutuante **junto do elemento** | barra fixa no rodapé da área (`.canvas-tb`) | 🔴 |
| Campos de largura/altura/rotação junto do elemento | só na aba Precisão do painel | 🔴 |
| Zoom (25–400%) e navegação (pan) | só o "modo ampliado" (⤢), que muda o layout | 🔴 |
| Medir distância entre elementos no encaixe | mostra só a linha de encaixe | 🟡 |
| Agrupar (Ctrl+G) e mover como um bloco | multi-seleção efêmera; não é grupo | 🔴 |
| Reordenar camadas arrastando na lista | só ↑/↓ | 🟡 |
| Desfazer/Refazer | global, 40 níveis | 🟢 |
| Atalhos de teclado | parcial (Ctrl+D, Ctrl+V, setas, Alt+setas, `[`/`]`) | 🟡 |
| Painel de Propriedades | 4 abas, bom | 🟢 |
| Texto: alinhamento, entrelinha, espaçamento | só fonte, tamanho, cor, negrito, itálico | 🔴 |
| Bordas e sombra na camada | não existe | 🔴 |
| Ajustes de imagem (brilho/contraste/filtro) | não existe | 🔴 |
| Remover fundo | não existe | 🔴 |
| Paleta + HEX + cores salvas | 5 paletas fixas + seletor de cor | 🟡 |
| Medida real (mm) e DPI | aba Precisão, mm do papel, aviso de 300 dpi | 🟢 (melhor que o Canva) |
| Layout automático ("lado a lado", "empilhado", "grade") | já existe (`mkeOrganizar`) | 🟢 |
| Exportar a área em PNG | já existe | 🟢 |

**Resumo honesto:** o que já existe de "engenheiro" (ímã, mm, DPI, layout
automático, undo) está **acima** do Canva. O que falta é a ** ergonomia**:
zoom, barra junto do elemento, campos numéricos colados na seleção, alças de
lado, agrupar. É aí que está a maior parte do ganho de uso.

### 3.2 As lacunas, uma por uma

#### L1 — Não há zoom nem navegação na área do mockup 🔴
A área tem ~500 × 300 px na folha. Quem quer alinhar um detalhe tem que
entrar no modo ampliado (⤢), que é um **layout diferente** (a folha inteira
sai da tela) e obriga a voltar. O Canva dá zoom contínuo (25–400%) e pan.
**Onde mexer:** `mkeAlternarEstudio()` (ficha:5581), que hoje só liga/desliga o
modo ampliado, o CSS de `.canvas-inner` e `mkeQualidade()` (o cálculo de mm é
em % da área — não muda com zoom, mas a leitura da tela sim).
**Como resolver:** um `mkeZoom` (0,5×–4×) aplicado com `transform: scale()` no
`.canvas-inner` **dentro** de um contêiner com `overflow:hidden`, mais pan
(arrastar com o mouse do meio, com a roda, ou com a barra de espaço). A
posição das camadas é em % — o zoom **não** muda dado nenhum, só a
apresentação.

#### L2 — A barra de contexto fica longe do elemento 🔴
`.canvas-tb` aparece colada no rodapé da área do mockup. Com a arte no meio
da área, o olhar vai e volta entre o que se arrasta e a barra. O Canva põe a
barra **em cima** do elemento selecionado, encostada nele.
**Onde mexer:** ficha:1597 (markup da `.canvas-tb`), o CSS de `.canvas-tb` e
`selLayer()` (ficha:3967), que é quem decide o que fica selecionado.
**Como resolver:** manter a barra atual (é o padrão do resto do app) e
**acrescentar** uma barra flutuante mínima junto da seleção, só na área do
mockup: duplicar, girar, alinhar, ordem, apagar, e os campos W/H/giro.

#### L3 — Não há campos numéricos junto da seleção 🔴
Largura, altura, posição e rotação existem, mas na aba Precisão do painel —
que fica do lado de fora da área. O Canva mostra W/H/R na barra do elemento.
**Onde mexer:** `mkePrecisaoLer/Aplicar` (ficha:5310/5346) — as funções de
cálculo em mm/% já existem e podem ser reaproveitadas.
**Como resolver:** a barra flutuante do L2 mostra 3 campos (L, A, giro) que
escrevem em `%` e leem em `%` e mm. Sem dado novo: `xp/yp/wp/hp/rot` já
existem na camada.

#### L4 — Só existem 4 alças de canto (e 1 em texto/forma) 🟡
`.lyr-tl/.lyr-tr/.lyr-bl/.lyr-br` na imagem; texto e forma têm só
`.tl-resize` (canto inferior direito) e `.tl-rot`. Não dá para esticar
**só na horizontal** preservando a altura — o Canva tem 8 alças (4 cantos +
4 meios).
**Onde mexer:** ficha:2827 e 3741 (criação das alças), `initResizeImg()`
(ficha:3933) e `initResizeImgExtra()` (ficha:2981), `initResizeTxt/Arr()`.
**Como resolver:** criar as 4 alças de meio (`lyr-l/lyr-r/lyr-t/lyr-b`) e
estender o `initResizeImg` com os casos `l/r/t/b` (um eixo muda, o outro
fica). Mantendo `l.prop` (proporção) como está: com proporção travada, a
alça de meio ajusta os dois eixos; sem ela, ajusta só o eixo.

#### L5 — O ímã não mostra a distância 🟡
O encaixe mostra a linha ciano, mas não "38 px entre as duas bordas". O Canva
mostra a medida durante o arraste. É o que faz a diferença entre "chutei" e
"posicionei".
**Onde mexer:** `mkeSnapXY()` (ficha:4663) devolve `{xp,yp}` — pode devolver
também `{dx, dy}` (distância para o alvo) e `mkeMostrarMedida()` (ficha:4704)
passa a exibir.

#### L6 — Não existe grupo 🔴
Shift+clique seleciona várias camadas, mas elas **não viram um grupo**: não se
movem como um bloco depois, não se duplicam juntas, não se salvam como grupo, e
o `mkeOrganizar` só age em "todas as imagens da página".
**Onde mexer:** `multiSelIds` / `paginas[].msel` (ficha:3081 e siguientes),
`mkeAlvos(ctx)` (ficha:4596), `v8CamadaParaColar` (usada por
`mkeDuplicarCamada`).
**Como resolver:** um grupo é um **campo opcional** na camada
(`grupo: 'g1'`), gravado por `serLayer()` só quando existe. Um botão
"Agrupar"/"Desagrupar" na aba Organizar. O agrupamento é **visual e de
movimento**: arrastar uma camada do grupo arrasta as outras; o grupo não
muda o `z` nem o alinhamento.

#### L7 — A lista de camadas não aceita arrastar 🟡
A ordem é só por ↑/↓; o Canva arrasta. O **duplo clique no nome** já existe
(renomear) — só a reordenação por arrasto falta.
**Onde mexer:** `updList()` (ficha:4302) monta a lista; o `mkeMoverZ()`
(ficha:4866) troca a ordem.

#### L8 — No Estúdio da Peça não há zoom, nem pan, nem rascunho 🔴
O editor da peça é uma tela fixa (peça em ~560 px). Não há zoom, não há
navegação, e — o mais grave — **o `onChange` da ficha é vazio**
(`mkeAbrirPeca`, ficha:5208: *"o estado só é gravado ao aplicar"*). Quem
monta a peça, arrasta a arte e clica em **Fechar** perde tudo, sem aviso.
**Onde mexer:** `peca_editor.js` (`montar`, `ajustarPalco`) e
`mkeAbrirPeca()` (ficha:5170).

#### L9 — Existe **um** modelo de camiseta 🔴
`peca.js` fixa a camisa de pesca UV: `viewBox 1000 × 1240`, simetria em
`x = 500`, cinco zonas (corpo, mangas, recorte, gola, punho), zíper quarto.
Não há como trocar de modelo (manga longa, regata, polo, jaqueta) sem mexer no
código — e a pessoa que usa o app **trabalha com vários modelos**.
**Onde mexer:** `peca.js` inteiro; `PecaRender.normalizar()`; o estado da peça.
**Como resolver (sem quebrar nada):** transformar `peca.js` em um **registro
de modelos** — `Peca.MODELOS = [{id, nome, vb, zonas, paineis, costuras, sombras, estrutura, furo}]` —
com o modelo atual como **primeiro** da lista e como **padrão**. O estado
ganha `modelo: 'camiseta-uv'` (opcional; ausente = o modelo atual). Ficha
antiga continua abrindo e renderizando igual.

#### L10 — A arte presa ao tecido **some** ao exportar 🔴 *(defeito, não só falta)*
No editor, a arte é um `<div>` HTML por cima do SVG
(`.pk-overlay`, `overflow:visible`) — **sem recorte**. No PNG exportado, a arte
é recortada pela silhueta (`clipPath` em `peca_render.js`). Ou seja: **o que
se vê editando não é o que sai**. Pior: durante o arraste o SVG é escondido
(`ocultarArteSvg()`) e a arte aparece **fora** da camiseta; ao soltar, ela
some de novo — o mesmo gesto produz duas imagens diferentes.
**Onde mexer:** `peca_editor.js` → `desenharOverlay()` (a arte em HTML) e
`peca_render.js` → `<clipPath id="clip_...">`.
**Como resolver:** aplicar o **mesmo** recorte do SVG no overlay. Como o
overlay e o SVG vivem no mesmo documento, o `clipPath` pode ser reutilizado
por CSS (`clip-path:url(#clip_frente_x)`) — o id já é gerado
(`'clip_' + ids`, com `ids = lado + '_' + (root.id || 'x')`). Alternativa se
o navegador reclamar: um `<mask>` ou um SVG de recorte por cima. **O que não
pode:** deixar a arte "vazar" na tela e ser cortada só no PNG.

#### L11 — Depois de aplicada, a peça vira uma imagem 🔴
`mkeAplicarPeca()` gera um PNG e cria uma camada `img` normal. A partir
dali, a peça é "uma foto": para mudar a cor da manga é preciso reabrir o
estúdio da peça, e a peça fica **presa no tamanho** em que foi gerada
(1600 px de largura, depois reamostrada no papel).
**Onde mexer:** `mkeAplicarPeca()` (ficha:5217) e `pecaGuardar()`.
**Como resolver:** manter o PNG (é o que garante a impressão igual à tela),
mas **preservar o estado** (`_peca` já é preservado) e abrir um caminho
óbvio para reeditar: duplo clique numa camada que tem `_peca` abre o estúdio
da peça; e a lista de camadas mostra o ícone 🎨.

#### L12 — Texto, sombra e borda são fracos 🔴
O texto tem fonte, tamanho, cor, negrito e itálico — sem alinhamento,
entrelinha ou espaçamento. E não há sombra nem borda em nenhuma camada.
**Onde mexer:** `text-tb` (ficha:1660), `applyTxtProps()`, `mkeAplicarVisual()`
(ficha:4462).
**Como resolver:** alinhamento do texto (esquerda/centro/direita) e
espaçamento entre linhas são poucos campos e **nenhum dado novo além do que a
camada já tem** (`txt` é HTML com `contenteditable` — o alinhamento pode ser
CSS do elemento). Sombra/borda entram como `sombra`/`borda` opcionais da
camada, aplicados em `mkeAplicarVisual()` para que **imprima igual à tela**.

#### L13 — Ajuste fino e medida ao vivo são pobres 🟡
Só o teclado move (`mkeNudge`, ficha:6061). Não há um "ajuste fino" numérico
nem a medida **fixa** ao lado do elemento (a plaquinha de medida só existe
durante o arraste e some depois).
**Onde mexer:** `mkeMostrarMedida()` (ficha:4704) e a barra flutuante (L2).

#### L14 — As cores do mockup não têm nome nem HEX 🟡
A área do mockup **não tem** paleta de cores própria: as cores que existem
são as do Estúdio da Peça (`PALETAS`, 5 fileiras fixas). Não há cor da empresa
salva, nem digitar o HEX.
**Onde mexer:** `peca_editor.js` → `PALETAS` e `desenharZonas()`.

---

## 4. A proposta: três frentes

### Frente A — Seleção e manipulação (a área do mockup)

*Objetivo:* a pessoa deve poder pegar a arte, ajustar e conferir **sem tirar
os olhos dela**.

1. **Barra flutuante junto do elemento** (L2) — duplicar, girar ±, alinhar,
   frente/trás, apagar, e os campos **L / A / giro** (L3). Fica acima da
   seleção, dentro da área do mockup, some na impressão.
2. **Zoom e navegação** (L1) — 50% / 100% / 150% / 200% / 400%, roda do mouse
   (Ctrl+roda), pan com a barra de espaço ou arrastando o fundo. Botões no
   canto da área.
3. **Alças de meio lado** (L4) — 8 alças na imagem; texto e forma ganham as
   4 de canto.
4. **Distância no ímã** (L5) — "38 px" / "12,5 mm" entre as bordas durante o
   encaixe.
5. **Agrupar** (L6) — Ctrl+G / Ctrl+Shift+G, grupo salvo no campo opcional
   `grupo`.

### Frente B — A peça (o modelo de camiseta)

*Objetivo:* dar vários modelos de verdade e fazer o que se vê na tela
bater com o que sai no PNG.

6. **Registro de modelos** (L9) — `Peca.MODELOS`; hoje há 1 (camisa de pesca
   UV), como primeiro e como padrão. Novos modelos entram **sem** mexer no
   editor nem no renderizador.
7. **Recorte da arte igual ao da exportação** (L10) — a arte presa ao tecido
   é recortada pela silhueta **enquanto se arrasta**.
8. **Zoom e pan no Estúdio da Peça** (L8) — a mesma engrenagem da Frente A,
   reusada.
9. **Rascunho da peça** (L8) — `onChange` da ficha passa a gravar o estado em
   memória (e no `localStorage` da própria peça, com chave nova e versionada),
   para que **Fechar** sem aplicar pergunte "descartar?".
10. **Reeditar a peça com dois cliques** (L11) + ícone 🎨 na lista de
    camadas.

### Frente C — Organização, produção e saída

*Objetivo:* as ferramentas de produção que o Canva tem e que aqui são
importantes para a gráfica.

11. **Arrastar para reordenar camadas** (L7).
12. **Sombra e borda na camada** (L12) — aplicadas em `mkeAplicarVisual()`
    para que saiam iguais na impressão.
13. **Texto com alinhamento e entrelinha** (L12).
14. **Ajuste fino e medida fixa** (L13) — a plaquinha de medida fica visível
    enquanto a camada estiver selecionada.
15. **Cores com nome e HEX, e cores salvas da empresa** (L14) — útil para
    repetir a cor da marca em todas as fichas.
16. **Marcar a arte como "pronta"** — uma camada `selo` visual que não
    imprime: serve para a pessoa saber que a arte já foi conferida.

---

## 5. Backlog priorizado

**P0 = corrigir/clareza (faz agora). P1 = ganho de uso grande. P2 = resposta
a casos menos comuns.**

| # | Item | Onde mexer | Tamanho | Risco | Teste |
|---|---|---|---|---|---|
| P0-1 | **L10** — arte recortada igual ao PNG | `peca_editor.js` (`desenharOverlay`) + `peca_render.js` (`clipPath`) | médio | **médio** (visual) | `test_peca_v10.js`: o overlay usa o mesmo `clipPath` do SVG |
| P0-2 | **L8** — não perder a peça ao fechar | `mkeAbrirPeca` (ficha:5208) + `pecaGuardar` (ficha:5162) | pequeno | baixo | ficha: `onChange` grava rascunho; Fechar com mudança avisa |
| P0-3 | **L3/L13** — campos L/A/giro junto do elemento | `mkePrecisaoLer/Aplicar` reusados | pequeno | baixo | ficha: campo muda `wp/hp/rot` e vice-versa |
| P0-4 | **L2** — barra flutuante na seleção | nova UI em `mkeMontarPainel`/`selLayer` | médio | médio (impressão) | ficha: barra não aparece no PNG exportado nem na impressão |
| P0-5 | Medida fixa ao lado da seleção | `mkeMostrarMedida` | pequeno | baixo | ficha: medida aparece com a camada selecionada |
| P1-1 | **L1** — zoom e navegação | CSS de `.canvas-inner` + novos botões | **grande** | **médio** | ficha: zoom não muda `xp/yp/wp/hp`; o PNG exportado sai igual |
| P1-2 | **L9** — registro de modelos de peça | `peca.js` + `PecaRender.normalizar` | **grande** | médio | `test_peca_v10.js`: estado sem `modelo` renderiza igual ao de hoje |
| P1-3 | **L4** — alças de meio lado | ficha:2827, 3741, `initResizeImg*` | médio | baixo | ficha: redimensionar só na horizontal preserva a altura |
| P1-4 | **L5** — distância no ímã | `mkeSnapXY` | pequeno | baixo | ficha: a plaquinha mostra a distância |
| P1-5 | **L6** — agrupar | `mkeAlvos`, `serLayer`, `mkeOrganizar` | médio | **médio** (dado novo) | ficha: grupo salvo e restaurado; arrasta junto |
| P1-6 | **L11** — reeditar peça com 2 cliques | `mkeAplicarPeca` + `selLayer` | pequeno | baixo | ficha: duplo clique abre o estúdio com o estado |
| P1-7 | Zoom/pan no Estúdio da Peça | `peca_editor.js` | médio | baixo | `test_peca_v10.js`: zoom não altera o estado |
| P1-8 | Camada pronta (selo) | novo campo opcional + CSS | pequeno | baixo | ficha: selo não imprime |
| P2-1 | **L12** — sombra e borda | `mkeAplicarVisual` | médio | médio | ficha: borda/sombra saem no PDF |
| P2-2 | **L12** — texto: alinhamento e entrelinha | `text-tb`, `applyTxtProps` | pequeno | baixo | ficha: campo novo é opcional no `.json` |
| P2-3 | **L7** — reordenar camadas arrastando | `updList` | médio | baixo | ficha: ordem salva |
| P2-4 | **L14** — HEX, nomes e cores salvas | `peca_editor.js` (`PALETAS`) | pequeno | baixo | peça: cor salva por zona |
| P2-5 | Pré-visualização "como sai no papel" | `prepPrint` + área | médio | médio | ficha: o modo de pré-visualização mostra o papel |

**Fora da lista (de propósito):** remover fundo com IA, filtros de imagem,
colaboração em nuvem, comentários, animações, tipos de letra do Google.

---

## 6. Modelo de dados proposto (aditivo)

Tudo abaixo é **opcional**. `serLayer()` só grava o que foge do padrão
(regra 2 do §2.4) e `PecaRender.normalizar()`/`PecaEditor.carregar()`
preenchem o que falta — ficha antiga abre igual.

**Camada** (novos campos, todos opcionais):

| Campo | Tipo | Para quê |
|---|---|---|
| `grupo` | string | id do grupo (L6) |
| `borda` | `{cor, px}` | contorno da camada (L12) |
| `sombra` | `{cor, blur, x, y}` | sombra da camada (L12) |
| `selo` | bool | "arte conferida" — não imprime (P1-8) |

**Peça** (novos campos, todos opcionais):

| Campo | Tipo | Para quê |
|---|---|---|
| `modelo` | string | id em `Peca.MODELOS` (L9); ausente = `camiseta-uv` |

**Chave nova de rascunho** (L8): `vooalto_v10_peca_rascunho` — guarda o estado
da peça em edição **por camada** (`{camadaId: estado}`). Entra no backup?
**Não** (é rascunho de ferramenta, não dado da ficha) — e mesmo assim tem de
ser opcional: quem não usa o recurso não tem a chave, e nada quebra.

---

## 6.1 Etapa 0 — O que já foi implementado (V10.8.0, 2026-11-23)

Esta etapa existiu para **destravar o uso diário** antes das frentes maiores.
Ela não é o plano inteiro: é o que faltava para a pessoa conseguir trabalhar
com a arte sem ficar frustrada. Todas as correções abaixo são **dentro da
regras do §2.4** — nada mudou na folha A4, no `.json` nem na impressão.

### Alinhar (L4 do §3.2, parte de ergonomia)

| Antes | Agora |
|---|---|
| Com 2+ camadas, "alinhar à esquerda" encostava todas na mais à esquerda do grupo e **parecia não fazer nada** | Escolha da referência: **⏹ Automático** (1 objeto → área; vários → entre eles, como o Canva) · **▣ Área** · **⧉ Objetos**. Guardada em `vooalto_v10_mke_alvo`. |
| Alinhava pelo `xp` cru — uma arte **girada** não encostava na borda | `mkeCaixaCamada()` / `mkeMoverParaCaixa()`: alinha pela **caixa visível** (AABB) e a seta pelas **duas pontas** |
| Silêncio (ninguém sabia se tinha funcionado) | O painel **avisa**: "3 camadas alinhadas à esquerda na área" |
| "Objetos" com 1 camada não fazia nada | Explica o motivo em vez de sumir |
| Camada travada se mexia | Travada **não** se mexe |

`mkeDistribuir()` passou a usar a mesma caixa visível (antes o espaço saía
errado com arte torta ou seta).

### Copiar / colar / desfazer

| Antes | Agora |
|---|---|
| Ctrl+C levava **só a última** camada clicada | Leva **todas** as marcadas (Shift+clique) — clipboard interno `{__varios:true,itens:[…]}` em `vooalto_v8_layer_clip` |
| Ctrl+V colava todas **uma em cima da outra** | Cada uma entra **um degrau abaixo** da anterior |
| Ctrl+X tirava só uma | Recorta **todas** |
| Ctrl+Z tinha **800 ms de atraso** (`snap()`) — mexia rápido e "não fazia nada" | `snapAplicar()` grava na hora; `undo()` joga o pendente no histórico antes de desfazer; `redo()` **não** descarta a pilha de refazer |
| O **primeiro** Ctrl+Z depois de abrir a ficha não tinha o que desfazer | `v8SemearHistorico()`: a ficha aberta/criada é o estado "antes" do próximo gesto |

### Ampliar / redimensionar sem a arte sumir

| Antes | Agora |
|---|---|
| Puxar a alça criava uma arte **4× maior que a área** — ela sumia (a área recorta) sem volta | `mkeLimiteResize()`: a arte **nunca passa da área nem sai dela**, nos 4 cantos, na folha 1 e nas extras |
| `mkeLimite()` era fixo (0,9): uma arte **grande** saía quase toda da tela | Garante **10% da área e 20% da arte** dentro, para qualquer tamanho — vale para a folha 1, extras, grupo arrastado e seta (as 2 pontas) |
| Alça de 12 px: no dedo o clique "erraba" a arte | Alça de 14 px + área de clique maior (pseudo-elemento transparente de 7 px) |
| — | Botão **⇹** na barra da arte abre a aba Alinhar direto |

### Suítes

* `tests/test_mockup_atalhos_v10.js` — **nova, 29 verificações**: alinhar com 1
  e com várias camadas, os três alvos, seta e camada girada, Ctrl+C/V/X com
  várias camadas, Ctrl+Z imediato, primeiro Ctrl+Z depois de abrir, ampliar
  sem sumir, proporção travada e limite de arraste.
* `tests/test_mockup_v10.js` — 291 → **292 verificações** (a regra do limite
  mudou e a suíte antiga estava travando o valor antigo).

**O que continua no backlog:** L1 (zoom/pan), L2/L3 (barra e campos junto do
elemento), L4 (alças de meio lado), L5 (distância no ímã), L6 (agrupar),
L7 (arrastar para reordenar), L8/L9/L10/L11 (Estúdio da Peça), L12 (sombra,
borda, texto), L13 (ajuste fino) e L14 (cores com HEX).

---

## 7. Ordem de execução

**Etapa 1 — clareza (P0).** Duas folhas, poucos dias:
a arte da peça passa a ser recortada igual ao PNG (L10); a peça não se perde
ao fechar (L8); os campos L/A/giro ficam junto do elemento (L3/L13) e a
medida fica visível. **Ganho:** o sistema para de mentir.

**Etapa 2 — ergonomia (P0-4 + P1-1 + P1-3 + P1-4).** Barra flutuante, zoom e
navegação, alças de lado, distância no ímã. **Ganho:** é aqui que a sensação
de "Canva" aparece. Esta etapa é a que mais mexe em CSS e exige conferir
impressão e PNG a cada passo.

**Etapa 3 — a peça vira biblioteca (P1-2 + P1-6 + P1-7).** `peca.js` vira
registro de modelos; o estado ganha `modelo`; o duplo clique reabre a peça;
zoom e pan no estúdio. **Ganho:** dá para trabalhar com **vários modelos de
camiseta** sem programador.

**Etapa 4 — organização e produção (P1-5 + P1-8 + P2-*).** Agrupar, selo de
"pronta", sombra/borda, texto com alinhamento, reordenar arrastando, HEX e
cores salvas. **Ganho:** acabamento.

Cada etapa fecha com `npm test` (29 suítes) + `npm run build` e uma
impressão real de uma ficha de verdade.

---

## 8. Como cada item é testado

A suíte já tem o esqueleto certo:

* `tests/test_mockup_v10.js` — 78 KB, já cobre interface montada, alinhar,
  espelhar, girar, opacidade, travar, ocultar, renomear, ordem, menu de
  contexto, precisão, guias, ímã, limite, encaixe, organizar em 2 colunas,
  estúdio, `prepPrint` saindo do estúdio, persistência em `serLayer`,
  ausência de campos padrão no `.json`, geometria do lote, aviso de resolução
  e "as ferramentas fora do PNG exportado".
* `tests/test_peca_v10.js` — 30 KB, cobre geometria da peça, render, estado,
  cores, texturas e artes.

**Testes que este plano exige** (e que travam as decisões):

| Teste | O que trava |
|---|---|
| O overlay da arte usa o mesmo `clipPath` do SVG | L10: o que se vê é o que sai |
| `Peca.MODELOS[0].id` = o modelo atual e `normalizar()` sem `modelo` renderiza igual | L9: ficha antiga não muda |
| Zoom não altera `xp/yp/wp/hp` nem o PNG exportado | L1: zoom é apresentação |
| Alça de meio lado mexe só em um eixo (sem proporção) | L4 |
| Arraste de uma camada do grupo leva as outras | L6 |
| `serLayer()` **não** grava `grupo`/`borda`/`sombra`/`selo` quando são o padrão | regra 2 |
| A barra flutuante e o zoom não aparecem no PNG exportado | regra 1 |
| Estado da peça sem `modelo`/`texturas`/`artes` renderiza igual | regra 11 |

O jeito de testar o resto é o mesmo de sempre: carregar a ficha em **jsdom**
(`runScripts:'dangerously'`, stubs de `matchMedia`, `ResizeObserver`, `canvas`
e `print`) e chamar as funções diretamente.

---

## 9. Riscos e armadilhas

| Risco | Como fica | Como evitar |
|---|---|---|
| **Ferramenta na impressão** | A régua, o painel e as alças já são escondidos por `@media print` e `body.v4-preview-clean`. **A barra flutuante e o zoom são novos** e podem entrar no PDF sem querer. | Nascer dentro de uma classe já escondida (`mke-*`) e acrescentar o id novo à lista de `@media print` **e** à de `body.mke-exportando` (o PNG usa o mesmo caminho da impressão). |
| **`mkeMoverUI` esquece o elemento novo** | Um botão novo preso na folha 1 age na página errada — o `mkeMoverUI` (ficha:5558) é quem move a régua, o painel, o selo, a barra do estúdio, a lista de camadas e as guias para a página em foco. | Todo elemento novo entra em `alvosCasca` (a lista do `mkeMoverUI`, ficha:5560) ou na lista de dentro da área, conforme o caso. |
| **`mkeTransform` duplicado** | Escrever `style.transform` direto no render tira o espelhamento da impressão. | Usar `mkeTransform()`/`mkeAplicarVisual()` sempre; o teste da suíte já verifica o espelhamento. |
| **Dado novo no `.json`** | `serLayer()` grava o que foge do padrão — campo novo em camada quebra o backup se for gravado sempre. | Campo novo **sempre** opcional e só gravado quando muda (§6). |
| **Zoom × mm** | `mkeQualidade()` converte % da área em mm com `MKE_MM_PX = 210/794` — a conta é da **folha**, não da tela. | Zoom é só CSS: não entra em conta nenhuma. Se um dia o zoom virar "escala real", tem que ser à parte. |
| **Peça × desfazer da ficha** | O editor da peça tem desfazer próprio; a ficha tem o dela. Aplicar a peça passa pelo `snap()` e vira um passo só. | Aceitar (é o comportamento do Canva também) e **dizer isso na ajuda**. Se incomodar, empilhar a peça como um passo só, e não como vários. |
| **Peça × fonte de verdade** | A peça é rasterizada (PNG) para entrar na área. Se a arte mudar, o PNG precisa ser refeito. | Manter `_peca` (o estado vetorial) junto da camada — é o que permite reeditar (L11). |
| **Área pequena** | Zoom e barra flutuante disputam espaço com a área de ~500 × 300 px. | A barra flutuante é **contextual** (aparece só com seleção) e o zoom é um botão pequeno no canto. |
| **Modelos novos** | Cada modelo novo é geometria vetorial — trabalho de desenho, não de código. | O registro tem que aceitar um modelo novo **sem** tocar no editor nem no renderizador (§4, item 6). |

---

## 10. O que deliberadamente **não** fazer

* **Não virar o Canva.** Sem nuvem, sem conta, sem comentário, sem IA, sem
  animação, sem marca. O app é local e offline — essa é a força dele.
* **Não mexer na folha A4.** Nenhum campo, tabela ou medida entra ou sai. A
  regra do pedido da V9.1 continua valendo.
* **Não criar um terceiro tema.** O Estúdio da Peça tem paleta própria
  (`peca_editor.css`, escuro fixo) — é ferramenta, não documento.
* **Não guardar imagem grande no `localStorage`.** A peça é rasterizada em PNG
  dentro do IndexedDB, como as outras camadas.
* **Não trocar o motor de camadas.** `layers[]` + `posEl()` + `z` é o motor
  desde a V7 e a V9.1 **não** trocou esse motor — só cercou de ferramenta.
  Continua assim.
* **Não criar etapa nova entre criar e usar a ficha.** (Foi o que matou a
  Catalogação da V7.)
* **Não renomear chave de dado.** Se precisar, leitura dupla por uma versão
  inteira.

---

## 11. Mapa de referência

| Arquivo | Linhas | O que é |
|---|---|---|
| `ATUALIZACAO_V10/criador_ficha_tecnica/index.html` | 10.687 | a ficha inteira; o mockup é a fatia entre ~2.700 e ~6.200 |
| `ATUALIZACAO_V10/mockup/peca.js` | 322 | geometria vetorial do modelo de peça (hoje: **um** modelo) |
| `ATUALIZACAO_V10/mockup/peca_render.js` | 299 | estado → SVG (mesmo desenho na tela, na ficha e no PNG) |
| `ATUALIZACAO_V10/mockup/peca_editor.js` | 979 | o editor da peça (cores, texturas, artes, desfazer) |
| `ATUALIZACAO_V10/mockup/peca_editor.css` | 216 | o visual do editor da peça |
| `ATUALIZACAO_V10/mockup/index.html` | 43 | página de teste do estúdio, fora da ficha |
| `VERSAO_10_0/tests/test_mockup_v10.js` | 78 KB | suíte do mockup |
| `VERSAO_10_0/tests/test_peca_v10.js` | 30 KB | suíte da peça |
| `VERSAO_10_0/PLANO_V10.md` §8.1 | — | as regras que não se quebram |

**Glossário rápido**

* **Área do mockup** — o retângulo da folha onde entram as artes
  (`#canvasOuter`).
* **Estúdio da Peça** — o editor vetorial que monta a camiseta
  (`PecaEditor`).
* **Peça** — a camiseta pronta, exportada como PNG e colocada na área como
  camada `img` com `_peca` (o estado que permite reeditar).
* **Camada** — um item da pilha da área (`img`, `txt`, `arr`, `rect`,
  `circle`).
* **Zona** — um recorte da camiseta que recebe cor e textura (corpo, mangas,
  recortes, gola, punhos).
* **Ímã** — o encaixe automático durante o arraste (`mkeSnapXY`).
