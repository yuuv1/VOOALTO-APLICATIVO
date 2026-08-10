# Revisão de código — Vooalto (V6)

Revisão estática feita em 2026-08-10, focando bugs aparentes nos módulos:
Catálogo/Dashboard (`projeto_principal_dashboard_catalogo.html`), Criador de Ficha Técnica (`criador_ficha_tecnica.html`), Orçamento (`orcamento_proposta.html`), wrapper PWA (`index.html`) e infra (`server.js`, `sw.js`).

Todos os blocos `<script>` passam em `node --check` (sem erro de sintaxe). Os problemas abaixo são de lógica/consistência.

---

## 🔴 Bugs funcionais (afetam o uso real)

### 1. “Modificar Ficha” nunca atualiza a ficha na catalogação (fluxo quebrado)
- **Onde:** `criador_ficha_tecnica.html` (envio) ↔ `projeto_principal_dashboard_catalogo.html:783` e `index.html` (recepção/retransmissão).
- **Problema:** o catálogo escuta `vooalto-ficha-updated` para aplicar a edição de uma ficha, e o wrapper retransmite essa mensagem — **mas nenhum lugar envia `vooalto-ficha-updated`**. O Criador só posta `vooalto-ficha-to-catalog` (`criador_ficha_tecnica.html:2855`). O botão “✏️ Modificar Ficha” abre o Criador com `vooalto-ficha-edit`, mas ao finalizar não há retorno dos dados com o `fichaId`, então a ficha original nunca é atualizada no catálogo.
- **Correção:** no Criador, ao salvar/envidar uma ficha carregada via `vooalto-ficha-edit`, postar `{ type:'vooalto-ficha-updated', fichaId, fichaData, fichaNome }`.

### 2. Perda de PDF quando o IndexedDB falha (fallback apaga o anexo)
- **Onde:** `projeto_principal_dashboard_catalogo.html` — `saveOrder()` e `handleDroppedFiles()`.
- **Problema:** se `storePdfData()` rejeitar (quota, modo privado etc.), o código faz `o.pdfData = data` (fallback em memória). Mas `save()` serializa o estado e, **porque `o.pdfData` existe**, marca `pdfStored=true` e **remove o `pdfData` do objeto gravado no localStorage**. Como o PDF nunca chegou ao IndexedDB, ao recarregar a página o anexo **sumiu para sempre**.
- **Correção:** no fallback, não marcar `pdfStored` nem deletar `o.pdfData` do que é persistido — ou gravar o `pdfData` direto no JSON em vez de depender do IDB.

### 3. Botão de instalar PWA é código morto (`installAppBtn` não existe)
- **Onde:** `ATUALIZACAO_V6_PWA/index.html` — `beforeinstallprompt` e `installPWA()` fazem `document.getElementById('installAppBtn')`, mas **nenhum elemento com esse id existe no HTML** (a div `.actions` ainda é escondida com `display:none!important`).
- **Resultado:** o usuário nunca vê o botão de instalar o app; `installPWA()` cai sempre no `alert()`.

### 4. Rascunhos salvos em dois lugares que não conversam
- **Onde:** `criador_ficha_tecnica.html` — `enviarParaCatalogacao()` (linha ~2840) grava o backup em localStorage `vooalto_ficha_rascunhos_v4`; o painel V4.10 (`v4-draft-fix-indexeddb-js`, linha 3695) migra **uma única vez** para IndexedDB + meta `vooalto_ficha_rascunhos_v4_meta`.
- **Problema:** após a migração, os backups de catalogação continuam sendo escritos na chave antiga do localStorage e **nunca aparecem** na lista de rascunhos.

### 5. Catálogo grava `fichaData` (com imagens base64) no localStorage
- **Onde:** `projeto_principal_dashboard_catalogo.html` — `save()`.
- **Problema:** os PDFs foram migrados para IndexedDB, mas a `fichaData` vinda do Criador (`_layers[].src` = dataURL de imagens) vai inteira para o `state` e é serializada no localStorage a cada `save()`. Algumas fichas com imagens estouram a quota de ~5 MB; `localStorage.setItem` não tem try/catch ali, então a exceção interrompe o salvamento (e a UI).
- **Correção:** armazenar `fichaData` em IndexedDB (como os PDFs) e manter só metadados no estado.

---

## 🟠 Latentes / segurança / robustez

6. **`esc()` do catálogo não escapa aspas simples** e os `onclick` embutem `'${o.id}'` sem sanitização. `id` é gerado seguro, mas um JSON importado pode trazer `id` arbitrário → quebra de atributo/XSS (auto-XSS, risco baixo, mas vale validar `o.id` na importação).
7. **HTML cru permitido no orçamento:** `item.modelo.includes('<') ? item.modelo : escapeHtml(...)` — se o texto contiver `<`, o HTML é renderizado como está (parece intencional p/ formatação, mas também permite injetar qualquer markup no documento impresso/exportado; `syncCell` guarda o `innerHTML` cru no estado).
8. **`toggleLogoProp()`** (`criador_ficha_tecnica.html:2242`) faz `$('logoPropBtn').classList...` num id que não existe → `TypeError` se chamado (hoje sem `onclick` apontando para ela — código morto, mas frágil).
9. **Script injetado do Cloudflare** no `criador_ficha_tecnica.html` (linha 3049): bloco de challenge (`cdn-cgi/challenge-platform`) + beacon `static.cloudflareinsights.com` com hash/integrity. É resíduo de cópia de página protegida; carrega JS externo desnecessário, fere offline/privacidade e deve ser removido.
10. **`postMessage` sem checagem de origem** nos três módulos e no wrapper — qualquer iframe/aba pode injetar fichas no catálogo (`vooalto-ficha-to-catalog`). Em app local o risco é baixo; em ambiente compartilhado, validar `e.origin`.

---

## 🟡 PWA / servidor / qualidade

11. **`server.js`:** log de inicialização diz “Vooalto V5” (pacote é V6); porta 4085 no código vs `uploads/README.txt` dizendo “Porta: 4280” (doc V5 desatualizado). Bind em `127.0.0.1` impede acesso de outros dispositivos na rede (se isso for desejado, ok).
12. **`sw.js`:** o fallback `caches.match('./index.html')` vale para **qualquer** falha (inclusive imagem/script) — asset quebrado recebe o index.html como resposta; idealmente restringir o fallback a `event.request.mode === 'navigate'`. Também cacheia respostas sem checar `response.ok` (404 pode virar cache válido).
13. **Dependências CDN para recursos offline:** `html2canvas` (orcamento + criador) e `cropperjs` (criador) vêm de `cdnjs.cloudflare.com`. No PWA instalado, “Exportar PNG/PDF” quebra sem internet se a primeira carga não tiver acontecido. Considerar baixar para `assets/` e incluir no APP_SHELL (os `pdf.min.js`/`pdf.worker.min.js` já são locais).
14. **CSS acumulado com regras conflitantes:** no dashboard, `.columns.expanded .column.expanded .dropzone` é redefinido ~8 vezes com `!important` e valores contraditórios (grid ↔ flex, `height:720px` ↔ `height:auto`), e temas CSS aparecem duplicados em todos os arquivos. Alto risco de regressão visual e difícil manutenção.
15. **`fix2.py`** usa caminho absoluto `/home/user/VERSAO_6_0/...` — quebra fora dessa máquina (scripts de build deveriam usar caminhos relativos como `build_v6_pwa.py` faz).

---

## ⚪ Menores

16. `v4AplicarPreenchimentoRapido` é definido **duas vezes** (a segunda sobrescreve a primeira — em `v4-ficha-upgrade-js` e no quickfill completo); manter apenas a versão completa.
17. `capState()`/`restState()` (undo/redo do Criador) ignoram `_paginas` — desfazer após adicionar/remover página não restaura as páginas extras (nem suas layers).
18. `exportData()` do catálogo chama `URL.revokeObjectURL` imediatamente após `click()` — funciona na maioria dos browsers, mas em alguns o download falha; mover o revoke para `setTimeout`.
19. `importData()` sem try/catch em `storePdfData` — falha de IDB aborta a importação inteira.
20. V6 unificado (`vooalto_sistema_unificado_V6.html`) tem `ficha` e `principal` **idênticos** ao V5 (b64 igual); só o `orcamento` mudou.

---

## Resumo por prioridade

| Prioridade | Ação recomendada |
|---|---|
| Alta | 1 (fluxo editar ficha), 2 (perda de PDF no fallback), 5 (quota localStorage) |
| Média | 3 (botão instalar), 4 (rascunhos), 9 (remover script Cloudflare), 13 (CDN offline) |
| Baixa | 6–8, 10–12, 14–20 (limpeza/higiene) |
