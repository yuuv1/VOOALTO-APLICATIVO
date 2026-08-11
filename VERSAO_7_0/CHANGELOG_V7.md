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
