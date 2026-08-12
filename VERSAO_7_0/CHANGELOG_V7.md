# Vooalto V7 — Changelog de correções

Versões 5 e 6 permanecem **intocadas**. Toda a V7 está em `VERSAO_7_0/`:

```
VERSAO_7_0/
├── ATUALIZACAO_V7/
│   ├── fontes/                        ← FONTE DA VERDADE (editar aqui nas próximas atualizações)
│   │   ├── projeto_principal_dashboard_catalogo.html
│   │   ├── criador_ficha_tecnica.html
│   │   └── orcamento_proposta.html
│   ├── assets/                        ← libs locais (pdf.js, html2canvas, cropperjs)
│   ├── criador_ficha_tecnica/index.html   (cópia do fonte)
│   ├── criador_orcamento/index.html        (cópia do fonte)
│   ├── principal_dashboard/index.html      (cópia do fonte)
│   └── vooalto_sistema_unificado_V7.html   (arquivo único gerado)
├── ATUALIZACAO_V7_PWA/                ← PWA completo (abrir com instalar_e_abrir_V7.bat)
│   ├── index.html  (módulos embutidos em base64 — regenerado pelo build)
│   ├── sw.js  server.js  manifest.webmanifest  limpar_cache.html
│   └── assets/  icons/
├── build_v7_pwa.py                    ← script de build
├── VOOALTO_V7_PWA.zip                 ← pacote PWA pronto
└── CHANGELOG_V7.md
```

---

## Correções aplicadas (V7)

| # | Correção | Onde |
|---|---|---|
| 1 | **Editar ficha agora atualiza o catálogo.** O Criador guarda o `fichaId` recebido via `vooalto-ficha-edit` e, ao clicar em Catalogação, envia `vooalto-ficha-updated` (com `fichaId`) em vez de criar ficha nova. Fallback por localStorage também trata `fichaId`. | `criador_ficha_tecnica.html`, `projeto_principal_dashboard_catalogo.html` |
| 2 | **PDF não é mais perdido se o IndexedDB falhar.** Novo flag `pdfInIDB`: só remove o `pdfData` do JSON quando ele foi de fato gravado no IndexedDB; senão o anexo permanece no backup JSON. | catálogo |
| 3 | **`fichaData` (imagens) migrada para o IndexedDB** (store `fichaData` no mesmo banco, versão 2) — o localStorage não estoura mais a quota com imagens base64. Migração automática ao abrir; export/import incluem a ficha. | catálogo |
| 4 | **Rascunhos unificados:** backups de catalogação/edição agora usam a mesma base (IndexedDB + painel V4.10) via `window.v7AddDraftBackup`. | criador |
| 5 | **Botão "Instalar app" funcional** no PWA: elemento `#installAppBtn` adicionado à topbar; `beforeinstallprompt` o exibe (com override do CSS `!important`) e `installPWA()` o esconde após instalar. | `index.html` (wrapper) |
| 6 | **`esc()` do catálogo agora escapa aspas simples** e ids importados são validados (`[A-Za-z0-9_-]`), evitando quebra de atributo/XSS via JSON com `id` malicioso. | catálogo |
| 7 | **Script injetado do Cloudflare removido** (challenge `cdn-cgi/...` + beacon `static.cloudflareinsights.com`) do `criador_ficha_tecnica.html`. | criador |
| 8 | **`toggleLogoProp()` com guarda de null** (`logoPropBtn` pode não existir). | criador |
| 9 | **html2canvas e cropperjs agora são locais** (`assets/`) com fallback para CDN via `onerror` — exportação PNG/PDF funciona offline no PWA instalado. | criador + orçamento + PWA assets + `sw.js` |
| 10 | **`sw.js`:** só cacheia respostas `ok` e o fallback para `index.html` vale apenas para navegação (`mode==='navigate'`); instalação tolera arquivo ausente. | PWA |
| 11 | **`server.js`:** bind em `0.0.0.0` (acessível na rede local), log corrigido para V7, `decodeURIComponent` protegido com try/catch, suporte a `.wasm`. | PWA |
| 12 | **Exportar backup:** `revokeObjectURL` adiado (3000ms) e backup inclui `fichaData` vinda do IndexedDB; marcador de versão `vooalto_catalog_v7`. | catálogo |
| 13 | **Importar backup:** try/catch por anexo (falha de IDB não aborta a importação) e aviso de erro com mensagem. | catálogo |
| 14 | **`v4AplicarPreenchimentoRapido` duplicado removido** (fica apenas a versão completa com grades). | criador |
| 15 | **deleteOrder também remove `fichaData` do IndexedDB.** | catálogo |

## Ajustes menores
- Títulos/marcas atualizados para V7: `index.html`, `manifest.webmanifest`, `limpar_cache.html`, `instalar_e_abrir_V7.bat`.
- `save()` com try/catch + toast quando a quota do localStorage estoura (em vez de exceção silenciosa).

---

## Atualização 2 — porta configurável + preview no hover corrigido

### Porta configurável no .bat
`instalar_e_abrir_V7.bat` agora aceita a porta de duas formas:
- **Editar o valor** na linha `set "PORTA=4085"` no topo do arquivo; ou
- **Passar como argumento:** `instalar_e_abrir_V7.bat 5000`.

O servidor usa `PORT` do ambiente (o `server.js` já lia `process.env.PORT`). O script **não limpa cache automaticamente** — para limpar, abra `http://localhost:PORTA/limpar_cache.html` manualmente (conforme preferência).

### Preview no hover (mouse por cima da ficha) — corrigido
**Diagnóstico:** o preview depende do `pdf.js`. O código carregava `./assets/pdf.min.js` com caminho **fixo**:
- No PWA embutido o caminho funciona (os assets ficam na pasta do PWA);
- **Nas cópias standalone** (`principal_dashboard/index.html`, `fontes/*.html`) a pasta `assets/` fica um nível acima, então o `pdf.js` **não carregava** e o preview **congelava em "Carregando..."** — sem try/catch, o erro era silencioso. Esse é o sintoma de "não mostra o preview da ficha técnica" em versões anteriores.

**Correção aplicada na V7:**
1. `ensurePdfJs()` tenta vários caminhos (`./assets/`, `../assets/`, `assets/`) — funciona no PWA, nos módulos standalone e servido por qualquer pasta; o `workerSrc` é resolvido do mesmo diretório que carregou o `pdf.min.js`.
2. `show()` do hover agora tem try/catch: se a renderização falhar, mostra "Sem preview disponível" em vez de congelar.
3. Checagens do hover/pré-cache incluem o novo flag `pdfInIDB` (PDF no IndexedDB).

> Observação: sem PDF anexado à ficha, o preview **não** aparece (comportamento esperado — só há o que exibir quando a ficha tem PDF).

---

## Atualização 3 — aba inicial trocada + rolagem fantasma corrigida + bug dos rascunhos

### Aba inicial do Principal agora é a Catalogação
Na visão Principal (módulo `projeto_principal_dashboard_catalogo.html`), a **Catalogação virou a aba inicial/principal** e o **Dashboard virou a secundária** — tanto na ordem dos botões quanto na view que abre por padrão.

### Rolagem fantasma na Catalogação eliminada
**Diagnóstico (medido com Chromium headless):** a view Catálogo usava `height:calc(100vh - 132px)` nas colunas, mas a toolbar + paddings do `.main` somavam mais que a altura disponível, deixando o `.main` com ~47px de rolagem "fantasma". No modo expandido (fichas juntas) o dropzone não tinha scroll e o giro do mouse vazava para o `.main` — a "rolagem leve que não deveria existir".

**Correção:** a view Catálogo agora é `flex` e as colunas usam `flex:1; min-height:0` — ocupam exatamente a altura disponível, em qualquer tamanho de janela. A única rolagem que existe agora é a interna das colunas/dropzone, e só quando há mais fichas do que cabe na tela (comportamento desejado). Testado: `mainScroll == mainClient` (sem scroll) nos modos normal e expandido.

### Bug do painel de rascunhos no primeiro uso (corrigido)
`getDrafts()` retornava a **string** `'[]'` quando a chave de rascunhos ainda não existia (primeiro uso / após limpar cache) → `'[]'.map is not a function` quebrava o painel "Rascunhos e fluxo rápido" no console. Agora retorna sempre um array real (`Array.isArray` + fallback `[]`). Esse bug existia desde o V4 do painel (pré-existente) e foi corrigido na V7.

## Não aplicado nesta versão (decisões conscientes)
- **CSS acumulado/`!important` no modo expandido do dashboard** (item de manutenção grande, risco de regressão visual — deixado como está).
- **Undo/redo não restaura páginas adicionadas/removidas** no Criador (`capState`/`restState` não serializam páginas extras). Requer mudança estrutural.
- **`postMessage` sem checagem de `e.origin`** — mantido igual às versões anteriores para não quebrar o uso local em `file://`/LAN.
- **`fix2.py`/`reapply_clean.py` do V6 não foram copiados** (usavam caminhos absolutos); o build V7 é `build_v7_pwa.py` (caminhos relativos).

---

## Como aplicar as próximas atualizações

1. Edite os arquivos em `VERSAO_7_0/ATUALIZACAO_V7/fontes/` (fonte da verdade).
2. Rode `python3 build_v7_pwa.py` — regenera `index.html` do PWA, as cópias nas subpastas, o unificado e o ZIP.
3. O `sw.js` tem `CACHE_NAME` com data/versão — **incremente** (ex.: `vooalto-v7-4085-20260810-v2`) para forçar atualização do cache nos dispositivos instalados.
4. Teste: `cd ATUALIZACAO_V7_PWA && node server.js` e abra http://localhost:4085 (ou use `instalar_e_abrir_V7.bat`).
---

## Atualização 4 — Páginas estilo Canva + download com seleção (rascunhos antigos eliminados)

### O que mudou no Criador de Ficha Técnica (V7)
1. **Faixa de páginas estilo Canva** na parte inferior do editor: miniaturas de todas as páginas, clique para navegar até a página (com destaque automático conforme rola), botão **＋** para adicionar página e **🗋** para página em branco, e ✕ para remover na própria miniatura. O menu lateral continua funcionando para as ferramentas de cada página.
2. **Páginas ficam como rascunho vivo**: o editor salva automaticamente a ficha inteira (incluindo as páginas extras, com camadas, produção, grade, medidas e cabeçalho) no `localStorage` (`vooalto_v7_ficha_ativa`). Ao reabrir o app, a ficha em andamento volta com todas as páginas. O botão "Nova ficha (limpar)" zera tudo.
3. **Padrão de rascunhos anterior eliminado**: o painel "Rascunhos e fluxo rápido" não tem mais salvar/carregar/excluir rascunhos nem backups de catalogação — virou só "Fluxo rápido" (Preenchimento rápido + Nova ficha). A função `v7AddDraftBackup` deixou de ser usada.
4. **Download com escolha de páginas (Canva)**: o rodapé agora tem **⬇ Baixar (escolher páginas)**. Abre um modal com miniatura + checkbox de cada página (todas marcadas por padrão) e formato:
   - **📸 PNG** → baixa 1 imagem por página selecionada;
   - **🖨 PDF (imprimir)** → imprime/salva em PDF somente as páginas selecionadas (as demais ficam ocultas na impressão).
5. **Fichas com múltiplas páginas no catálogo**: `capturarFichaParaJSON` agora serializa as páginas extras (`_paginas`) — ao enviar para a catalogação e depois clicar em "Modificar Ficha", todas as páginas voltam intactas (antes as páginas extras se perdiam).

### Verificações (Chromium headless)
- Faixa renderiza 1 miniatura (página 1) e passa a 3 ao adicionar página normal + branca.
- Modal de download lista as 3 páginas com checkboxes marcados.
- `capturarFichaParaJSON` retorna `_paginas` (normal + branca) com as camadas.
- "Nova ficha (limpar)" remove as páginas extras.
- Autosave: alterar o nº da ficha salva e restaura após recarregar.
- **Páginas + conteúdo sobrevivem ao reload**: página extra com texto "TESTE PAGINA 2" restaurada com a camada intacta.
- Sem erros no console.
---

## Atualização 5 — Páginas arrastáveis na faixa + toolbar de elementos ao clicar na página

### O que mudou
1. **Arraste para organizar as páginas**: na faixa inferior (estilo Canva), as miniaturas agora são arrastáveis — segure e solte sobre outra miniatura para reordenar. A ordem vale para a visualização, para a numeração das páginas, para a impressão/exportação e é salva no rascunho vivo (sobrevive a reload e à catalogação). A página 1 também pode ser movida (a numeração acompanha).
2. **Menu lateral sem "Páginas"**: a seção "Páginas" do menu lateral (grupos de páginas e botões "Adicionar Página"/"Adicionar Página Branca") foi removida. Tudo de página agora é feito pela faixa inferior (＋ / 🗋 / ✕ / arrastar).
3. **Ferramentas ao clicar na página (Canva)**: ao clicar numa miniatura da faixa, aparece uma **barra de ferramentas flutuante logo acima da página** com: 🖼 Adicionar imagem, ✍ Adicionar texto, ➜ Desenhar seta, ▭ Retângulo, ● Círculo, 🎨 Adicionar cor (nas páginas normais) e ☰ Painel de camadas (na página 1). A barra acompanha a página ao rolar, esconde ao clicar fora ou pressionar ESC, e some na impressão.
4. Robustez: `v7Reordenar` aceita id de página ou de folha; a numeração é derivada da ordem visual real do documento.

### Verificações (Chromium headless)
- Faixa: 3 miniaturas arrastáveis; reordenar folha1 para o meio → DOM, rótulos, numeração e faixa corretos ("Pág. 2, Pág. 1, Pág. 3").
- Ordem persiste após reload (página 1 no meio continua no meio, numerada corretamente).
- Sidebar sem seção Páginas e sem botões de adicionar; toolbar aparece ao clicar na miniatura com os botões certos e esconde ao clicar fora.
- Modal de download continua listando as páginas na nova ordem; sem erros no console.
---

## Atualização 6 — Correções no arrastar páginas, numeração e cache (atualização forçada)

### 1. Arrastar páginas — agora vai para QUALQUER posição
Antes só era possível soltar uma página **antes** da miniatura alvo, então era impossível colocar algo **depois da última** página. Agora:
- Soltar na **metade esquerda** da miniatura → a página entra **antes** dela;
- Soltar na **metade direita** → entra **depois** dela;
- Soltar no **espaço vazio** no fim da faixa (ou no fim) → a página vai para o **último lugar**.
- Indicadores visuais verdes mostram onde a página vai cair (linha antes/depois, "⇤ soltar aqui (fim)").

### 2. Numeração respeita a ordem das páginas
A faixa inferior, os rótulos "— PÁGINA X —" dentro do documento, os rodapés "Página X de Y" e o modal de download agora usam a **ordem visual real** (a página 1 pode ser movida e passa a ser numerada conforme a posição). Antes a faixa sempre mostrava a página 1 primeiro, mesmo movida para o fim.

### 3. Toolbar de elementos (imagem/texto/seta/formas/cor)
Confirmado e testado: ao clicar numa miniatura da faixa, a barra de ferramentas aparece acima da página e os botões realmente adicionam os objetos (teste automatizado: texto e círculo criados com sucesso nas páginas extras e na página 1).

### 4. Atualização forçada do app instalado (importante)
O problema de "não funcionou" que você viu era o **cache do service worker**: o `sw.js` era servido com `Cache-Control: max-age=3600`, então o navegador podia continuar usando a versão antiga por até 1 hora. Corrigido:
- `server.js` agora serve `sw.js` e `manifest.webmanifest` com `no-cache`;
- o registro do service worker usa `updateViaCache:'none'`;
- `CACHE_NAME` incrementado para `v5`.

> Dica: se o app instalado ainda mostrar versão antiga, abra `http://localhost:PORTA/limpar_cache.html` uma vez (ou feche e reabra o app) — a partir daqui as atualizações chegam na hora.
---

## Atualização 7 — Ctrl+Z de página excluída, menu lateral por página e exportação corrigida

### 1. Ctrl+Z (e Ctrl+Y) funcionam para páginas
- **Excluiu uma página sem querer? Ctrl+Z traz de volta** — com todo o conteúdo (camadas, textos, cores, produção, grade, medidas e cabeçalho). Ctrl+Y refaz a exclusão.
- O undo de páginas cobre também **adicionar** página e **reordenar** páginas, integrado ao Ctrl+Z/Ctrl+Y existente (undo de texto/camadas continua funcionando).
- A pilha de undo de páginas é limpa ao "Nova ficha (limpar)" e ao carregar uma ficha salva.

### 2. Menu lateral vertical ao lado da página
- Ao **clicar na página** (ou na miniatura da faixa), aparece um **menu vertical ao lado da página** com as ferramentas: 🖼 imagem, ✍ texto, ➜ seta, ▭ retângulo, ● círculo, 🎨 cor e ☰ camadas (página 1).
- O menu acompanha a página ao rolar e fecha com clique fora/ESC.
- **NÃO aparece na exportação**: no **PNG** ele é escondido durante a captura (e, por construção, está fora da folha renderizada); no **PDF** o `@media print` o oculta.

### 3. Exportação PNG do orçamento corrigida
- **Guarda para o html2canvas**: se não estiver carregado (ex.: offline), tenta os arquivos locais antes de desistir, com aviso — antes quebrava silenciosamente e a interface ficava escondida.
- **Downloads sequenciais com intervalo** (evita o bloqueio de "múltiplos downloads" do navegador com várias páginas).
- A interface é restaurada **sempre**, com ou sem erro; `logging:false` no console.

### 4. Detalhes técnicos
- Ids de página agora são únicos (evita colisão ao adicionar depois de excluir).
- O exportador do criador também foi reforçado (toolbar escondida dentro do loop de captura).
- `CACHE_NAME` do service worker → v6.

### Verificações (Chromium headless, aba ativa como uso real)
- Excluir página → Ctrl+Z restaura com texto/layers intactos → Ctrl+Y exclui de novo. Sem erros.
- Menu lateral aparece ao clicar na folha com os botões corretos.
- PNG do criador e do orçamento gerados com sucesso (arquivos reais ~390KB / ~660KB), sem a toolbar e sem erros no console.
---

## Atualização 8 — Checagem geral de bugs (2 corrigidos)

### 🔴 Bug 1: "Baixar PDF com páginas selecionadas" imprimia TODAS as páginas
O código de download em PDF adicionava a classe `.print-skip` nas páginas não selecionadas, mas **não existia a regra CSS** `@media print` para escondê-las — ou seja, a seleção de páginas não tinha efeito na impressão. Corrigido adicionando:
```css
@media print{ .folha.print-skip,.folha-branca.print-skip{display:none!important} }
```

### 🔴 Bug 2: Ctrl+Z de página excluída no meio da lista bagunçava os rótulos
Ao desfazer a exclusão de uma página que não era a última, o par "rótulo + folha" era inserido no lugar errado: a folha entrava antes da folha de referência, mas **depois do rótulo dela**, quebrando a estrutura do documento (rótulos apareciam fora de ordem). Corrigido inserindo o par **antes do rótulo** da página de referência, mantendo a estrutura `rótulo → folha` sempre emparelhada.

### Verificações da checagem geral (Chromium headless)
- ✅ Sintaxe JS de todos os scripts (`node --check`)
- ✅ IDs de elementos referenciados existem (criador/catálogo/orçamento)
- ✅ Abas Principal (catálogo ativa), Criador e Orçamento carregam sem erros
- ✅ Fluxo completo de **edição de ficha**: catálogo → Criador (`vooalto-ficha-edit`) → salvar (`vooalto-ficha-updated`) → catálogo atualizado
- ✅ Backup do catálogo: exporta com PDF+fichaData embutidos e importa de volta
- ✅ Exportação PNG multi-página: orçamento (2 páginas → 2 arquivos) e criador (2 páginas → Pag1/Pag2), sem bloqueio de downloads
- ✅ Cálculos: orçamento e produção do criador com valores "25,90" e "R$ 1.234,56" (vírgula/milhar)
- ✅ Undo/redo de páginas sob estresse: adicionar → reordenar (página 1 no fim) → excluir no meio → undo → redo → undo(2x) — ordem, números e rótulos sempre corretos
- ✅ Hover preview do catálogo: pdf.js carrega pelos caminhos locais
- ✅ Modais do orçamento (configurações, abas, assinatura) e preenchimento rápido do criador
- ✅ `sw.js`/`server.js`/`manifest` consistentes (V7, no-cache para sw)

### Observações (sem correção — decisão)
- `postMessage` sem checagem de `e.origin` (risco baixo em app local/LAN; mudar poderia quebrar uso via `file://`).
- CSS com muitos `!important` acumulados no dashboard (manutenção, não quebra).
---

## Atualização 9 — Excluir QUALQUER página (incluindo a página 1) e ficar sem nenhuma

### O que mudou
1. **Toda página agora tem o botão ✕ na faixa inferior**, inclusive a **página 1** (antes ela era fixa e não podia ser removida).
2. **É possível ficar sem nenhuma página**: exclua todas (a faixa fica vazia, apenas com os botões ＋/🗋). Depois é só adicionar páginas novas — a primeira adicionada vira "Página 1".
3. **Ctrl+Z funciona para a página 1 também**: excluir a página 1 e desfazer restaura ela com **todo o conteúdo** (textos, imagens, grade, medidas, produção, cores, cabeçalho).
4. **"Nova ficha (limpar)"** sempre recria a página 1 se ela foi removida (para nunca ficar num estado quebrado).
5. A numeração das páginas é sempre recalculada pela ordem real (mesmo sem a folha1).

### Correções internas
- Guarda o template original da folha1 para restaurar via undo mesmo depois de removida.
- `v7Renumerar` recalculava o total de páginas a partir da ordem real.
- `limparParaNovaFicha` restaura a folha1 antes de limpar (evita erro quando `#prodLinhas`/`#coresList` não existiam).
- Captura/restauração de ficha salva respeitam `_folha1Removida` (uma ficha sem página 1 continua sem página 1 ao recarregar).

### Verificações (Chromium headless)
- Excluir página 1 → 0 folhas, 0 miniaturas, sem erros.
- Ctrl+Z → folha1 restaurada com o texto "TEXTO P1" intacto.
- Excluir folha1 + adicionar normal/branca → numeração correta (Pág. 1, Pág. 2).
- Persistência: ficha com folha1 removida recarrega com 0 páginas.
- "Nova ficha (limpar)" com folha1 removida → recria a folha1 (Nº 0005) sem erro.
- Exportação PNG real da folha1 restaurada → arquivo gerado, sem erros.
---

## Atualização 10 — Expandir texto corrigido (páginas extras), "Vendedor (a)" e máscara de moeda na entrada

### 1. "Expandir texto" (alça "A") corrigido em páginas extras
A alça "A" que aparece ao selecionar um texto (para aumentar/diminuir o tamanho da fonte arrastando) **só funcionava na página 1** — em páginas extras ela não fazia nada (o handler original procurava o texto só no array da página 1). Corrigido com um handler extra que encontra o texto na página certa (P1 ou extra) e expande normalmente, atualizando o campo de tamanho correto. O resize do canto (caixa) continua funcionando.

### 2. "Vendedor" → "Vendedor (a)"
Os rótulos do campo de vendedor no criador (página 1, páginas extras e preenchimento rápido) agora exibem **"Vendedor (a)"**.

### 3. Máscara de moeda na ENTRADA do cliente
O campo de entrada (e os das páginas extras) agora formata o valor digitado em moeda brasileira:
- `1000` → `1.000` enquanto digita → `1.000,00` ao sair do campo;
- `25,90` → `25,90` (vírgula preservada);
- `1234567` → `1.234.567,00`.
- O cálculo do restante foi corrigido para aceitar o ponto de milhar (`1.000,00` agora subtrai 1.000, e não 1).

### Verificações (Chromium headless)
- Alça "A" em página extra: tamanho 22 → 57 ao arrastar.
- Alça "A" na página 1 continua funcionando.
- Labels "Vendedor (a)" nas 4 ocorrências.
- Máscara: 1000 → 1.000,00 · 25,90 → 25,90 · 1500 (extra) → 1.500,00 · restante correto.
- Abas Principal/Criador/Orçamento sem erros no console.
---

## Atualização 11 — Expansão do TAMANHO do texto corrigida de vez (páginas extras)

### O que estava errado
A expansão do tamanho do texto (a **alça "A"** e o **arrastar o canto** da caixa) **só funcionava na página 1**. Em páginas extras:
- Arrastar o **canto** (`.tl-resize`) aumentava a **caixa** mas o **texto continuava do mesmo tamanho** (fonte não crescia);
- Os **presets 14/20/32/48** e o **slider de tamanho** não apareciam na toolbar das páginas extras;
- `v7SetTextSize` não estava acessível globalmente (quebrava o clique nos presets).

### Correções
1. `initResizeTxtExtra` agora faz o mesmo que a página 1: ao arrastar o canto, **aumenta/diminui a caixa E o tamanho da fonte** juntos, atualizando o campo de tamanho correto (`ttSize_<página>`).
2. Slider + presets agora são aplicados também às **toolbars de páginas extras** (`v7EnhanceTxtTbExtra`), chamados ao adicionar página e em cada clique.
3. `v7SetTextSize` exposto no `window` (funciona nos presets das duas toolbars, P1 e extras).

### Verificações (Chromium headless, mouse real)
- **Página extra**: arrastar o canto → fonte 22 → 36 (antes ficava 22).
- **Página extra**: clicar no preset 48 → fonte 36 → 48; slider presente.
- **Página 1**: alça "A" 22 → 52, preset 48 → 48, exportação PNG sem erros.
- Sem erros no console.
---

## Atualização 12 — Alças/controles do texto colados ao texto (páginas extras)

### O problema
O print mostrou as alças (redimensionar, rotacionar, "A") **muito longe do texto**. Causa medida: na página 1, selecionar um texto **encolhe a caixa ao tamanho do conteúdo** (por isso as alças ficam coladas); nas **páginas extras** esse ajuste não existia — a caixa ficava com a largura antiga (ex.: 403px) enquanto o texto tinha 195px, e as alças (nos cantos da caixa) ficavam **~200px longe do texto**.

### Correção
- Nova função `v7FitTxtExtra(p,l,el)`: encolhe a caixa do texto ao conteúdo ao **selecionar um texto em qualquer página extra** (hook no `selLayerExtra`).
- Medição após a correção: caixa 203px vs texto 195px na página extra (gap das alças ~1-6px) — igual à página 1.

### Verificações (Chromium headless)
- Selecionar texto em página extra → caixa colada ao texto (gap alça 1px).
- Arrastar o canto → expande caixa + fonte (22 → 35).
- Re-selecionar → caixa re-encaixa ao texto.
- Alça "A" (aumentar fonte) funciona (35 → 65).
- Sem erros no console.
---

## Atualização 13 — Revisão de bugs: undo/redo corrigido em páginas extras

### Bugs encontrados e corrigidos na revisão
1. **Undo/redo não funcionava para objetos (texto/imagem) em páginas extras** — `capState()`/`restState()` só serializavam a página 1. Criar, mover ou excluir um texto numa página extra não podia ser desfeito. Agora as camadas de todas as páginas são capturadas e restauradas.
2. **Ctrl+Z desfazia a página antes do texto recém-criado nela** — eram duas pilhas de undo separadas (páginas + snapshot) e a de páginas sempre tinha prioridade, ignorando a ordem real das ações. Agora há um contador de sequência global (`v7OpSeq`) e o undo/redo escolhem a operação mais recente entre as duas pilhas.
3. **Redo perdia operações** — durante undo/redo, funções internas chamavam `snap()` que limpava a pilha de redo. Adicionada supressão (`v7SuppressSnap`) durante undo/redo, e o redo agora restaura na ordem inversa correta (menor sequência primeiro).
4. **Página restaurada no lugar errado** — o índice salvo era o do array `paginas` (sem a folha1), mas a restauração inseria pelo índice no DOM (com a folha1). Agora captura o índice DOM real (`domIndex`).

### Verificações (Chromium headless)
- Criar texto em página extra → Ctrl+Z (2x) remove o texto → Ctrl+Z remove a página → Ctrl+Y (3x) restaura página + texto.
- Reordenar página 1 para o fim → Ctrl+Z volta à ordem original.
- Excluir página no meio → Ctrl+Z restaura na posição correta.
- Texto na página 1 continua com undo funcionando.
- Abas Principal/Criador/Orçamento sem erros no console.

### Observação (não alterado)
- O print de referência dos espaçamentos não está acessível no meu ambiente (a mensagem anterior sobre espaçamentos foi desconsiderada pelo usuário). Os espaçamentos atuais dos controles de texto são consistentes entre P1 e páginas extras.
