# VOOALTO V9 — Plano do sistema

Documento de arquitetura da V9. Descreve o sistema **como ele é agora**, para
que a próxima mudança comece daqui em vez de reconstruir o entendimento.

A V9 é a **única versão do projeto**: as pastas `VERSAO_5_0`, `VERSAO_6_0`,
`VERSAO_7_0` e `VERSAO_8_0` foram removidas do repositório. O que a V8 fazia e a
V9 herdou está no `CHANGELOG_V9.md`.

---

## 1. O que o sistema é

Duas ferramentas de produção de documento, rodando **inteiramente no
navegador**:

| Módulo | Pasta | Produz |
|---|---|---|
| 📋 Ficha Técnica | `criador_ficha_tecnica/` | folha(s) A4 de produção, em PDF/PNG |
| 💰 Orçamento | `criador_orcamento/` | proposta de venda A4, em PDF/PNG |

Nada é enviado para a internet. O servidor local serve arquivos estáticos e
mais nada — não há API, não há banco no servidor.

## 2. Estrutura

```
VERSAO_9_0/
  build_v9_pwa.py             gera sw.js + VOOALTO_V9_PWA.zip
  tests/                      suíte automatizada (jsdom + unittest)
  tools/servir_preview.py     servidor de preview (0.0.0.0)

ATUALIZACAO_V9/               ← é esta pasta que recebe o serviço
  index.html                  shell: barra do topo + 2 iframes em tela cheia
  criador_ficha_tecnica/      módulo 1
  criador_orcamento/          módulo 2
  manual.html                 manual completo (abre pelo ? Ajuda)
  limpar_cache.html           apaga só o cache do service worker
  zerar_dados.html            apaga os dados (duas confirmações)
  manifest.webmanifest        identidade PWA
  sw.js                       GERADO por build_v9_pwa.py
  server.js / server.py       servidor local (Node ou Python), 127.0.0.1:4800
  instalar_e_abrir_V9.bat     inicializador Windows
  assets/  icons/             bibliotecas locais, fontes, logos, ícones
```

O shell é fino de propósito: navegação, tema, instalação e nada de regra de
negócio. Cada módulo é um documento HTML autossuficiente e funciona aberto
direto, sem o shell.

### Por que iframe e não uma SPA

Cada módulo tem ~5.000 linhas de JS próprio, com `document.getElementById`
direto, `contenteditable` e um motor de camadas. Unificar num só documento
significaria reescrever os dois. O iframe isola CSS/JS, permite recarregar um
módulo sem tocar no outro e deixa cada arquivo testável sozinho em jsdom. O
preço é a comunicação por `postMessage` — que hoje só carrega **tema** e
**troca de aba**.

## 3. Comunicação entre as partes

Todo o contrato é `postMessage` com `{type: ...}`:

| Mensagem | Direção | Efeito |
|---|---|---|
| `vooalto-theme` | shell → módulo | aplica o tema |
| `vooalto-theme` | módulo → shell | aplica no shell e repassa **só aos outros** iframes (nunca de volta para quem enviou — isso evita o loop) |
| `vooalto-switch-tab` | módulo → shell | troca a aba |
| `vooalto-abrir-manual` | módulo → shell | abre o manual |

Não há mais nenhuma mensagem de negócio entre módulos: a V7 tinha quatro
(`ficha-to-catalog`, `ficha-edit`, `ficha-updated`, `counts`) e todas serviam à
Catalogação.

## 4. Onde os dados ficam

Três camadas, do mais frágil ao mais durável:

As chaves **não mudaram de nome na V9** (inclusive as que carregam `v8`/`v7`).
Renomear chave é perder dado: quem atualiza da V8 abre a V9 no mesmo endereço
(`http://localhost:4800/`) e encontra tudo como deixou.

| Camada | Meio | Chave | Conteúdo |
|---|---|---|---|
| Rascunho vivo | `localStorage` | `vooalto_v7_ficha_ativa` | a ficha em edição (a chave **não** foi renomeada: é o que faz a ficha da V7 continuar abrindo) |
| Rascunho vivo | `localStorage` | `vooalto_orcamento_autosave` | o orçamento em edição |
| Minhas fichas | **IndexedDB** `vooalto_ficha_rascunhos_db_v4` / store `drafts` | id → dados completos | fichas salvas pelo usuário |
| Índice de Minhas fichas | `localStorage` | `vooalto_ficha_rascunhos_v4_meta` | `[{id,name,date,num}]` — só o que a lista mostra |
| Preferências | `localStorage` | `vooalto_tema`, `vooalto_tour_v8`, `va3_*`, `va4_*` | tema, tour, nº da próxima ficha, cores, posição das barras |
| Rascunhos da Ficha | `localStorage` | `vooalto_v8_rascunho_meta`, `vooalto_v8_rascunho_anterior` | o "anterior" para restaurar e o índice do cartão de rascunho |
| Último backup | `localStorage` | `vooalto_ultimo_backup_v8` | data do último backup exportado (a V9 lê a mesma) |

**Por que os dados no IndexedDB e o índice no localStorage:** os dados têm
imagens em base64 e estouram a cota do `localStorage` (≈5 MB) com poucas
fichas. O índice cabe em alguns KB e pode ser lido de forma síncrona para
desenhar a lista na hora.

**Regra que isso impõe:** se o índice falhar, a ficha existe mas não aparece.
Por isso o salvamento trata esse caso separadamente e avisa (item 4 das
correções no `CHANGELOG_V9.md`).

A **única cópia que sai do navegador** é o `.json` exportado.

## 5. Temas

Dois, e só dois: **Claro** (padrão) e **Escuro**.

- O shell resolve o nome por `v8TemaValido()`: `'escuro'` → escuro; nomes de
  paletas antigas (`tech`, `neon`, …) → escuro; **qualquer outra coisa** → claro.
- O valor é gravado em `vooalto_tema`. A chave antiga `vooalto_theme_v5`
  continua sendo **lida** (não escrita) para quem vier de versão anterior.
- O shell aplica o tema **antes do primeiro paint** (script síncrono no `<head>`)
  e troca a variável `--shell-bg` no `:root`.
- Os módulos recebem por `postMessage`; se abrirem sozinhos, leem o salvo.
- **A folha A4 continua branca nos dois temas.** O escuro mexe apenas em
  painéis e barras que não imprimem. Existe teste estático que falha se alguém
  adicionar uma regra `[data-theme="escuro"]` tocando em elemento de dentro da
  folha.

## 6. PWA e atualização

`build_v9_pwa.py` calcula um hash do conteúdo dos arquivos do app e grava
`sw.js` com `CACHE = 'vooalto-v9-<hash>'`. Mudou qualquer arquivo do app → muda
o hash → o service worker novo substitui o cache antigo no `activate`.

Detalhes que não podem ser perdidos:

- `sw.js` **não entra** no próprio hash (senão cada build geraria um hash novo
  mesmo sem mudança nenhuma).
- `server.js`, `server.py`, `.bat` e `README.txt` também ficam fora: são
  distribuição, não app instalado.
- O `activate` apaga caches com o prefixo `vooalto-v9-` **e** os da V8
  (`LEGACY_CACHE_PREFIXES = ['vooalto-v8-']`): as duas versões usam o mesmo
  endereço, então a troca precisa recolher o cache antigo. Nunca toca em cache
  de outro aplicativo na mesma origem.
- O cache é `cache-first` só para a **mesma origem**; dados do usuário nunca
  passam pelo service worker.

## 7. Servidor local

- `server.js` (preferido) e `server.py` (reserva) servem a pasta em
  **`127.0.0.1:4800`** — de propósito só aceita conexão do próprio computador.
- Recusa `Host` que não seja `localhost`/`127.0.0.1`/`::1` (DNS rebinding).
- Resolve o caminho **dentro** da pasta: `..` e `%00` dão 404/400.
- Só `GET`/`HEAD`; o resto dá 405.
- `/__vooalto_health` responde `{app: 'vooalto-v9', version: '9.0.0'}` — é o
  que permite ao `.bat` saber se já existe um Vooalto rodando naquela porta em
  vez de abrir uma página errada. Se quem estiver na porta for **outra versão**
  (`app` começando com `vooalto-v`), o servidor diz isso e manda fechar a janela
  antiga, em vez de acusar "porta ocupada por outro processo".

`tools/servir_preview.py` é **outra coisa**: serve em `0.0.0.0` para preview em
navegador, com `Cache-Control: no-store`. Não é o servidor do app.

## 8. Testes

```
npm install
npm test              # ~330 verificações, 12 arquivos
npm run test:python   # 7 testes (build + servidor)
npm run build         # gera sw.js e o ZIP
```

Cada módulo é carregado em **jsdom** com `runScripts: 'dangerously'` e stubs de
`matchMedia`, `ResizeObserver`, `canvas` e `print`. Erro de página conta como
falha — é o que pega "carregou mas quebrou no meio".

O IndexedDB é simulado por `tests/_fake_idb.js`, que dispara os callbacks em
`setTimeout` como o IndexedDB de verdade. É isso que permite testar o caminho
assíncrono de salvar/abrir/excluir sem navegador.

Há testes que **travam decisões desta versão**: `/principal_dashboard/` tem que
dar 404; não pode existir `script[src*="pdf"]`; não pode haver `ficha-popup`; o
seletor de tema tem que ter exatamente 2 opções. Se alguém reintroduzir uma
dessas coisas, a suíte falha.

## 8.1 Estúdio do mockup (V9.1)

A área onde as artes entram é a `#canvasOuter` dentro de `.col-dir` (canto
inferior direito da folha 1, e o mesmo bloco nas páginas extras). O motor de
camadas é o mesmo desde a V7 (`layers[]` + `posEl`/`posElExtra` + `z`), e a V9.1
**não trocou esse motor** — acrescentou ferramenta em volta dele.

```
#canvasOuter
  .canvas-inner        camadas + .canvas-tb/.text-tb/.arr-tb/.shape-tb
    #mkeGuias          linhas de centro/terços/margem (não imprimem)
    #mkeSmartV/H       linha ciano do ímã durante o arraste
  .mke-rail            + imagem · ⤢ · 📐 · 🗂 · 🧲 · 🎛
  .mke-panel           4 abas: Ajustes / Alinhar / Organizar / Precisão
  .mke-studio-bar      só no modo ampliado
  .mke-badge           medida (%) e mm durante o arraste
```

Decisões que precisam ser mantidas por quem continuar:

1. **Nada disso pode imprimir.** Régua, painel, guias, menu e selo estão na
   lista `@media print` e na lista de `body.v4-preview-clean`. O modo ampliado
   (`#canvasOuter.mke-studio`, `position:fixed`) também é desfeito em
   `prepPrint`, `v7BaixarPDF` e na própria `@media print` — sem isso a arte
   sairia fora do papel.
2. **Atributos novos de camada são opcionais**: `name`, `hidden`, `locked`,
   `op`, `flipH`, `flipV`, `fit`. `serLayer()` só grava quando fogem do padrão,
   para o `.json` de quem não usa os recursos não engordar.
3. **Transformação em um lugar só**: `mkeTransform(l)` monta
   `rotate + scaleX + scaleY` e é chamada por `posEl`/`posElExtra`. O mesmo vale
   para `mkeAplicarVisual` (opacidade, oculto, cadeado e `object-fit`). Se
   alguém escrever `style.transform` direto num render, o espelhamento some na
   impressão.
4. **Cadeado × proporção**: `l.prop` = manter proporção ao redimensionar
   (`🔒` da barra, Shift inverte); `l.locked` = não mover (cadeado da lista de
   camadas). Os dois existem e significam coisas diferentes — era a confusão da
   V8.
5. **`mkeCtx()`** decide em qual página a ação cai: página extra ativa com
   seleção > seleção da folha 1 > primeira página com seleção > nada. Sem essa
   ordem, uma seleção antiga numa página extra fazia o painel mexer na camada
   errada.
6. **Limite de arraste** (`mkeLimite`): a camada nunca sai inteira da área;
   fica sempre ~10% dentro. É o que evita "a imagem desapareceu".
7. **Importação em lote** (`mkeGradeLote` → `mkeLoteImagens`): com 2+ arquivos
   escolhidos de uma vez, a geometria é calculada antes de criar as camadas
   (2 fotos → 2 colunas; 3–4 → 2×2; 5+ → 3 colunas), sempre dentro da área e
   sem sobreposição. `mkeGradeLote` não toca no DOM: é a parte testável.
   Os dois caminhos de importação (`onCanvasFiles` da folha 1 e o
   `onCanvasFilesPatched` que substitui o `onchange`, mais o das páginas
   extras) precisam usar o mesmo encaixe — foi assim que a 2ª foto deixou de
   cair em cima da 1ª.
8. **Feramentas por página** (`mkePaginaFoco` + `mkeMoverUI`): a régua, o
   painel, o selo, a barra do estúdio, as guias e os ímãs são **movidos** para a
   área da página em foco. São os mesmos elementos (um id só para cada),
   então não existe estado duplicado. Qualquer código novo que crie elementos
   do estúdio precisa entrar na lista do `mkeMoverUI`, senão fica preso na
   folha 1.
9. **Nada de novo no papel**: toda ferramenta do estúdio mora fora de `.folha`.
   As páginas extras usam `.canvas-inner` como área; o modo ampliado vale para
   `#canvasOuter.mke-studio` (folha 1) e `.canvas-inner.mke-studio` (extras).
10. **Resolução**: `mkeQualidade()` compara os pixels reais da foto com os que
   ela precisaria para 300 dpi no tamanho impresso (a folha tem 210 mm de
   largura em 794 px → `MKE_MM_PX = 210/794`). O `⚠` da lista de camadas e a
   linha “Resolução da foto” da aba Precisão usam essa conta. O tamanho natural
   fica em `l._nw/_nh` e em `MKE_PX[src]`, nunca em `serLayer`.

## 9. Caminhos possíveis a partir daqui

Não estão feitos — são os pontos onde a próxima mudança encaixa com menos atrito.

1. **Estado do pedido na ficha.** Se fizer falta saber "em produção / entregue",
   o lugar é um campo em `capturarFichaParaJSON()` + uma coluna na lista Minhas
   fichas. Não precisa de módulo novo.
2. **Busca em Minhas fichas.** O índice já tem nome, data e número; filtrar é
   local. Só vale a pena acima de ~20 fichas.
3. **Vários `.json` de uma vez** (backup em `.zip`). O export já passa por
   `salvarArquivoJSON()`, que é o único ponto de saída.
4. **Reaproveitar dados entre os módulos.** Hoje Ficha e Orçamento não se falam.
   Se um dia o orçamento precisar dos modelos da ficha, o caminho é uma
   mensagem `postMessage` nova (seção 3) — e não um armazenamento compartilhado,
   para os módulos continuarem independentes.

## 10. O que deliberadamente NÃO fazer

- **Não reintroduzir uma etapa entre criar e usar a ficha.** Foi o que a
  Catalogação era, e é o motivo do corte.
- **Não guardar imagem em `localStorage`.** Estoura a cota e trava a interface
  (é por isso que existe o `v7DownscaleDataURL` e o IndexedDB).
- **Não adicionar um terceiro tema.** O pedido é claro/escuro; o código de
  conversão das paletas antigas é compatibilidade, não um convite.
- **Não mover o `sw.js` para fora do build.** O hash de conteúdo é o que faz a
  atualização chegar sozinha no navegador de quem já usa.

## 11. Nomes herdados da V8 (de propósito)

A V9 renomeia tudo o que o usuário vê — pasta, título, PWA, `.bat`, ZIP, rodapé
da ficha, manual, mensagens do servidor. **Não** renomeia o que guardaria ou
quebraria dado:

| Nome | Onde | Por que fica |
|---|---|---|
| `vooalto_v7_ficha_ativa`, `vooalto_v8_rascunho_*`, `vooalto_ultimo_backup_v8`, `va3_*`, `va4_*` | `localStorage` | renomear = perder a ficha/rascunho de quem atualiza |
| `vooalto_ficha_rascunhos_db_v4`, store `drafts` | IndexedDB | idem — é onde estão as fichas salvas |
| `vooalto_backup_v9` (**lê** `_v8` e `_v7`) | formato de backup | backup antigo continua abrindo; a V9 grava o formato novo |
| `vooalto_orcamento_v9` (**lê** `_v8` e `_v7`) | `.json` do orçamento | idem |
| `v8TemaValido`, `v8SalvarFicha`, `v8FichaAtualId`, `v8MedSync`, `#v8FichasList`, `#tourV8`, `vooalto_tour_v8` | JS/DOM interno | ~450 referências cruzadas entre shell e módulos; renomear não muda nada para o usuário e é risco puro |

Regra para quem continuar daqui: **nome interno congela, nome de produto
avança**. Se algum dia precisar migrar uma chave de dados, faça leitura dupla
(lê antiga, grava nova) por pelo menos uma versão inteira.

## 12. Diferenças da V9 em relação à V8 (resumo técnico)

1. Repositório com uma versão só (`VERSAO_9_0`); nada de V5/V6/V7/V8.
2. Identidade: `app: 'vooalto-v9'`, `version: '9.0.0'` (o `server.js` da V8
   ainda respondia `7.6.1`; agora os dois servidores concordam), PWA
   "Vooalto V9", cache `vooalto-v9-<hash>`.
3. **Mesmo endereço local** (`http://localhost:4800/`), para a atualização não
   perder dados nem o atalho instalado.
4. `activate` do service worker recolhe também o cache da V8.
5. Tema: arquivo `assets/tema-v9.css` e variáveis `--v9-*` (as `--v8-*` não
   existem mais; nada disso sai do navegador nem entra em dado salvo).
6. Porta ocupada por outra versão do Vooalto agora tem mensagem própria.
