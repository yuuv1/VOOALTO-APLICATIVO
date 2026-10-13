# VOOALTO V7 — Análise técnica e plano de melhorias

> **Status:** análise concluída, **Onda 1 (V7.2.0)** e **redução de temas (V7.3.0)** implementadas
> (`VERSAO_7_0/`, suíte de testes verde: JS 11 arquivos + 5 testes Python).
> **Base analisada:** `VERSAO_7_0/ATUALIZACAO_V7` (a versão que está publicada na `main`).
> **Foco principal do pedido:** conseguir **ver os PDFs dentro do próprio sistema**, sem quebrar nada.
> **Regra que segui:** nenhuma ferramenta atual (Ficha Técnica, Catalogação, Orçamento) mudou de
> comportamento. Tudo aqui é **polimento por cima** do que já funcionava.
>
> **Entregue na Onda 1 (V7.2.0):** leitor de PDF interno (§5) · lixo do HTML removido (A1) ·
> teste bomba-relógio corrigido (A3) · código morto removido (A5) · `storage.persist()` + aviso de
> uso (A7) · plano B do iframe com `blob:` (A6) · confirmação de exclusão com nome da ficha e selo
> "💾 Salvo HH:MM" (A10) · versão alinhada em 7.2.0 (A11). Detalhes em `CHANGELOG_V7.md`.
> **Pendente (Ondas 2 a 4):** consolidação do CSS do modo expandido (A2), teto do cache de
> miniaturas (A4), debounce da busca (A8), PDF como Blob no IndexedDB (A9) e os itens de UX.
>
> **Entregue fora das ondas, a pedido (V7.3.0 — 13/10):** o sistema saiu de **24 paletas de tema**
> para **2 (Claro padrão + Escuro)**. As 24 paletas do shell, 23 da Catalogação, 23 × 11 dos
> componentes da Ficha e 23 do Orçamento viraram **1 bloco de escuro por arquivo**, com conversão
> automática de quem tinha tema antigo salvo. Corrigido de passagem o cabeçalho claro no escuro da
> Catalogação, o brilho branco do fundo no escuro e — o mais importante — o escuro que **escurecia
> campos dentro da folha A4** da Ficha (a folha agora fica sempre branca). Ganho: **−72 KB** de CSS
> e muito menos conflito de `!important`, o que também ajuda a Onda 2 (A2). Detalhes em
> `CHANGELOG_V7.md`; garantias cobertas por `tests/test_temas_v7.js`.

---

## 1. Como esta análise foi feita

Não é opinião: cada item abaixo foi medido ou reproduzido.

| O que foi feito | Resultado |
|---|---|
| Leitura integral dos 4 HTML (shell, Catalogação, Ficha, Orçamento), `server.js`, `server.py`, `sw.js`, `build_v7_pwa.py` | mapa completo do sistema |
| `npm install` + `npm test` em `VERSAO_7_0` | **45 OK, 1 FAIL** (detalhes no achado A3) |
| Contagem de regras CSS duplicadas, `!important`, tamanho dos arquivos | achado A2 |
| Simulação do HTML no jsdom para ver o que o navegador faz com o fim do arquivo | achado A1 confirmado |
| Reprodução do teste que falha, com os valores reais impressos | causa exata do A3 confirmada |
| Conferência da versão do pdf.js embutido | `apiVersion 3.11.174` (biblioteca já serve para leitor interno) |

---

## 2. Mapa do sistema (como ele funciona hoje)

**Navegação.** `index.html` é um *shell* com barra fixa e 3 módulos em `<iframe>`:
Catalogação (`principal_dashboard/`), Orçamento (`criador_orcamento/`) e Ficha Técnica
(`criador_ficha_tecnica/`), esta última aberta como **popup** sobre o sistema (Esc fecha).
O tema é aplicado no shell por variáveis CSS e repassado aos módulos por `postMessage`
(contrato `vooalto-theme`, `vooalto-ficha-to-catalog`, `vooalto-ficha-edit`,
`vooalto-ficha-updated`, `vooalto-switch-tab`, `vooalto-counts`).

**Onde os dados moram.**
- `localStorage` → metadados do catálogo (`vooalto_main_catalog_v2`), rascunhos da Ficha,
  autosave do Orçamento (`vooalto_orcamento_autosave_v7`), tema, preferências.
- `IndexedDB` (`vooalto_pdf_store_v2`, versão 2) → **os PDFs** (store `pdfs`) e **a ficha com fotos**
  (store `fichaData`). Foi a correção da V7.1.1 contra travamento/perda de dados.
- Nada é enviado para a internet. O servidor local (`server.js`/`server.py`, porta 4700) é
  **somente leitura** (GET/HEAD) e só aceita requisições de `localhost` — decisão de segurança boa.

**Como o PDF aparece hoje.**
1. Anexo: `saveOrder()`/`readPdfFile()` guarda o arquivo como **dataURL base64** no IndexedDB.
2. No card: botão **📄 Visualizar PDF** e **👁 Ver PDF** → `viewPdf(id)` → converte o dataURL em
   `Blob`, cria um `blob:` URL e **clica num link `target="_blank"`** → o PDF abre **fora do
   sistema**, em nova aba, no visualizador do navegador.
3. No modo **coluna expandida**: o sistema desenha só a **página 1** num `<canvas>` com pdf.js
   (miniaturas em cache), e clicar no card também chama `viewPdf()` (aba nova).
4. Se o pdf.js falhar, existe um plano B: `<iframe src="data:application/pdf;base64,...">`.

**Empacotamento.** `build_v7_pwa.py` gera `sw.js` (cache *cache-first* com nome derivado de um
hash do conteúdo) e o ZIP de distribuição. Regra de ouro do projeto: **depois de editar qualquer
arquivo do app é preciso rodar `python build_v7_pwa.py`**, senão a PWA continua servindo o cache
antigo.

---

## 3. O que já está bom (e não deve ser tocado)

- Fluxo 1→2→3 com barra única e ajuda; prioridade que sobe sozinha com o passar dos dias.
- Anti-travamento da V7.1.1: redução de fotos na importação, `fichaData` fora do localStorage,
  renderização de no máximo 2 PDFs por vez, caches com teto, `save()` que não lança exceção.
- Servidor local seguro (loopback + validação de `Host`), PWA instalável com cache offline,
  `zerar_dados.html` com confirmação dupla e `limpar_cache.html` que não toca em dados.
- Build reprodutível (hash de conteúdo) e uma suíte de testes jsdom que realmente roda o app.

---

## 4. Achados (com evidência)

### A1 · Resto de edição corrompido no fim do HTML da Catalogação — *bug de verdade*
`principal_dashboard/index.html` termina assim (há **3** `</html>` no arquivo):

```
window.addEventListener('focus',v7DayTick);
</script></body></html>.addEventListener('visibilitychange',()=>{if(!document.hidden)v7DayTick()});
window.addEventListener('focus',v7DayTick);
</script></body></html>stener('focus',v7DayTick);
</script></body></html>
```

Um patch antigo duplicou o rabinho do arquivo. O navegador transforma isso em **texto dentro do
`<body>`** (confirmei no jsdom: `"...v7DayTick); stener('focus',v7DayTick);"`). Hoje o
`overflow:hidden` do `body` esconde, então ninguém vê — mas é sujeira no DOM, aparece na
impressão/cópia e pode virar bug se alguém mexer no layout. **Correção: apagar o resto depois do
primeiro `</html>`.** Risco: praticamente zero.

### A2 · Guerra de `!important` no modo coluna expandida
Existem **18 regras** `.columns.expanded .expanded-pdf-card{...}` — várias dentro de media queries,
com alturas conflitantes (560px, 620px, 470px, 720px, 800px, 580px, 465px, 430px, 360px…) e **611
`!important`** no arquivo inteiro. São camadas de patches empilhados: a última vence, e qualquer
ajuste novo tem que "ganhar" de todas as anteriores. Isso é o que faz o modo expandido parecer
imprevisível em telas diferentes. **Correção: consolidar em 1 bloco por faixa de tela** (mesmo
visual final, sem `!important` brigando). Risco: médio — exige conferência visual por tema.
Por isso proponho isso como **Onda 2**, depois do leitor de PDF.

### A3 · A suíte de testes está vermelha por um teste "bomba-relógio"
`npm test` → **45 OK, 1 FAIL**. O que falha é `tests/test_ux_v7.js`:

```
[FAIL] chip Alta count=1
```

Causa exata (reproduzi): o teste cria fichas com **datas fixas** no código
(`15/09/2026` = "Ficha Nova") e espera que ela continue na prioridade Baixa. Só que hoje
(13/10/2026) essa data já tem **28 dias** e passou do limite de 22 → virou Alta. O contador real é
**2**, o teste espera **1**. **Não é bug do sistema: é bug do teste** (ele "vence" com o tempo).
Somente no fim de setembro ele passaria de novo. **Correção: calcular as datas relativas a hoje**
dentro do teste. Risco: zero para o app (só mexe em teste).

### A4 · Cache de miniaturas pode comer centenas de MB de memória
`_thumbCacheHQ` guarda até **30** canvases em escala 2.0. Uma folha A4 nessa escala dá
≈1190×1684 px ≈ **8 MB** por canvas em memória → até **~240 MB** só de miniaturas (mais 8 documentos
no `_pdfDocCache` e 30 miniaturas em escala 1.0). Em máquina modesta (o público do sistema) isso é
convite a travamento/recarregar aba. **Correção:** teto menor para o HQ (ex.: 6–8) e/ou guardar a
miniatura como **imagem JPEG compactada** (~200 KB) em vez do canvas cru. Risco: baixo.

### A5 · Código morto
`getThumbLo()` e `renderPdfFirstPageCanvas()` continuam no arquivo mas **não são chamados por
ninguém** (o *hover preview* foi desativado a pedido do usuário, conforme comentário no próprio
código). Limpeza simples, sem efeito visual.

### A6 · Plano B do PDF usa `data:` URL gigante
No modo expandido, quando não há miniatura, o card monta
`<iframe src="data:application/pdf;base64,...">`. Além de pesado para o navegador ler (o mesmo
arquivo já está em memória como dataURL), alguns navegadores limitam URLs longas. **Correção: usar
`blob:` (URL curto) ou simplesmente cair no leitor interno.**

### A7 · Sem `navigator.storage.persist()` nem indicador de uso
Os PDFs e as fichas ficam no IndexedDB. O navegador pode **despejar** dados "best-effort" quando o
disco aperta — e o usuário só descobre quando a ficha perde o PDF. Não há pedido de armazenamento
persistente nem tela dizendo "você tem X fichas · Y MB em PDFs". **Correção:** pedir
`storage.persist()` na primeira vez e mostrar o consumo junto do botão de backup. Risco: baixo.

### A8 · Re-render completo a cada tecla / a cada clique
A busca chama `renderCatalog()` **a cada letra digitada**, e `renderCatalog()` faz
`wrap.innerHTML=''` e recria todos os cards. Com muitas fichas isso é trabalho jogado fora (e é o
que mais "pisca" a tela). **Correção:** atraso curto (debounce ~150 ms) na busca e recriar somente a
coluna afetada ao expandir/recolher. Risco: baixo.

### A9 · PDF em base64 ocupa ~33% mais espaço
O arquivo é guardado como dataURL (`data:application/pdf;base64,...`). Um PDF de 3 MB ocupa ~4 MB no
disco e vira uma string gigante na memória. Trocar por `Blob`/`ArrayBuffer` no IndexedDB economiza
espaço e memória — mas exige **migração de banco (v2 → v3)** e mexer no backup. Por isso classifico
como **Onda 3 (opcional)**, não como primeiro passo.

### A10 · Feedback e confirmações (itens já previstos no `SUGESTOES_UX_V7.md`)
`confirm('Excluir ficha?')` não diz **qual** ficha; o autosave da Ficha e do Orçamento é silencioso
(o usuário não sabe se salvou); botões destrutivos não se destacam. São mudanças de texto/cor, sem
lógica nova.

### A11 · Número de versão divergente
`CHANGELOG_V7.md` diz **V7.1.1**, mas `server.js`/`server.py` (`APP_VERSION`) e `package.json`
seguem em **7.1.0**. O servidor usa essa versão no `health check` para decidir se "o Vooalto já está
ativo" — vale alinhar na próxima entrega (ex.: 7.2.0) para não confundir o BAT.

---

## 5. O pedido principal — **ver o PDF dentro do sistema**

### 5.1 Por que hoje não dá
`viewPdf()` foi escrito justamente **para não abrir dentro do app**: ele joga o PDF numa aba nova do
navegador (comentário no código: *"NUNCA substitui a página do app"*). No PWA instalado isso é
especialmente ruim: a nova aba abre **fora** da janela do Vooalto (ou o navegador bloqueia popup e o
usuário recebe um erro). E o único preview interno é o do modo expandido, que mostra **só a página
1**, sem zoom, sem trocar de página e sem imprimir.

### 5.2 Proposta: leitor de PDF interno (pdf.js), em camadas

**Onde:** dentro do módulo **Catalogação** (`principal_dashboard/index.html`), porque é lá que os
PDFs vivem (IndexedDB) e é lá que estão os botões que hoje abrem a aba nova. Nada de mexer no shell,
na Ficha Técnica ou no Orçamento.

**Por que dentro do módulo e não na janela do sistema:** o shell precisaria repassar o PDF por
`postMessage` (string enorme, risco de travar) e o iframe já é a "tela" do módulo. Menos peças
móveis = menos chance de quebrar.

**Desenho técnico (curto):**
- Modal novo `#pdfViewer` com cabeçalho (nome da ficha, nome do arquivo, ✕ Fechar) e barra de
  ferramentas: **‹ / ›** (página), **N de M**, **− / +** (zoom), **Ajustar largura / página**,
  **↻ girar**, **⤓ baixar**, **🖨 imprimir**, **⧉ abrir em nova aba** (o comportamento antigo, agora
  como opção explícita), **✕ fechar**.
- Renderização com o **pdf.js que já está embutido** (`assets/pdf.min.js` + worker, versão 3.11.174,
  já em pré-cache offline) — **nenhum arquivo novo** entra no pacote.
- Reaproveita o `_pdfDocCache` que já existe (com `destroy()` no descarte), renderiza **uma página
  por vez**, cancela a renderização anterior antes de desenhar a próxima (evita corrida quando o
  usuário aperta ‹ › rápido) e limpa a tela ao fechar (libera memória).
- Atalhos: **←/→** página, **+/-** zoom, **Esc** fecha. Clicar fora fecha.
- **Fallback em 3 camadas**, para nunca deixar o usuário sem o PDF:
  1. leitor interno (pdf.js);
  2. se o pdf.js não carregar ou der erro → o plano B atual (blob/aba nova) continua existindo;
  3. botão explícito **⧉ Abrir em nova aba** para quem preferir o visualizador do navegador.
- Casos tratados com mensagem clara em vez de tela branca: PDF protegido por senha
  (`PasswordException`), PDF corrompido (`InvalidPDFException`), PDF muito grande (limite de pixels
  da página, com aviso e atalho para a aba nova).
- O clique no card do **modo coluna expandida** passa a abrir o leitor em vez da aba nova (é o
  comportamento que o usuário pediu); a "abranger tudo" continua no botão.

**O que NÃO muda (garantias):**
- Formato dos dados, chaves de `localStorage` e o banco IndexedDB v2 → **sem migração**.
- `viewPdf(id)` continua existindo com o mesmo nome (agora abrindo o leitor) para não quebrar quem
  chama; a função de aba nova vira `abrirPdfEmNovaAba(id)`.
- Funcionamento offline, identidade da PWA, porta 4700, servidor somente-leitura.
- Nenhuma ferramenta de edição/catalogação muda de lógica — só o *destino* do clique no PDF.

**Riscos e mitigação:**

| Risco | Mitigação |
|---|---|
| PDF de planta gigante (100+ MB) travar a renderização | renderiza 1 página, cancela a anterior, limita área máxima do canvas e oferece a aba nova |
| Memória (A4) | HQ com teto menor + limpeza do canvas ao fechar |
| PDF com senha/corrompido | mensagem clara + fallback para a aba nova |
| Regressão no modo expandido | CSS do card expandido **não** é tocado nesta etapa (fica na Onda 2) |
| Cache da PWA servir versão antiga | rodar `python build_v7_pwa.py` (gera `sw.js` novo) e usar `limpar_cache.html` no teste |

**Arquivos afetados nesta etapa:** `principal_dashboard/index.html` (leitor + ligação dos botões),
`tests/` (testes novos do leitor), `sw.js` + `VOOALTO_V7_PWA.zip` (regerados pelo build),
`CHANGELOG_V7.md`. A Ficha Técnica e o Orçamento **não são tocados**.

### 5.3 Alternativas que considerei (e por que não)
- **Colocar o leitor no shell** para servir os 3 módulos: mais alcance, porém exige passar o PDF
  entre janelas por `postMessage` (string de MBs) e mexe no shell. Fica como evolução futura, se
  fizer sentido (ex.: abrir o PDF anexado de dentro da Ficha Técnica).
- **Usar o `viewer.html` do pdf.js** (visualizador completo do Mozilla): exigiria trazer dezenas de
  arquivos novos (viewer, locales, imagens) para dentro do pacote offline — muito peso e manutenção.
- **`<iframe>` com o PDF** dentro do sistema: é o plano B, mas o visualizador do navegador dentro do
  iframe é limitado e às vezes bloqueado; o pdf.js dá controle real (zoom, página, girar).
- **Guardar PDF no servidor** (arquivo em disco): tentador, mas o servidor é somente leitura **de
  propósito** (segurança + testes + offline). Não recomendo.
- **Abrir o PDF numa janela nova controlada** (`window.open`): é o que já dá problema em PWA — é
  exatamente o que estamos trocando.

### 5.4 Como vamos validar (antes de dizer "pronto")
1. Suíte existente verde (com o teste A3 corrigido) + testes novos do leitor (abre, troca página,
   fecha com Esc, fallback acionado quando o pdf.js falha — em jsdom com pdf.js simulado).
2. Teste manual roteirizado: PDF de 1 página, de várias páginas, grande, protegido e corrompido;
   em tema claro e escuro; em janela estreita e larga; com o app instalado (PWA) e no navegador.
3. **Preview ao vivo** aqui na conversa (servidor local servindo a pasta) para você clicar e ver o
   leitor funcionando antes de publicar.
4. `python build_v7_pwa.py` + `limpar_cache.html` para conferir que a PWA pega a versão nova.

---

## 6. Demais melhorias propostas (por ondas)

### Onda 1 — Correções rápidas e de baixo risco ✅ **concluída na V7.2.0**

| # | Melhoria | Impacto | Esforço | Risco | Status |
|---|---|---|---|---|---|
| 1 | Leitor de PDF interno (§5) | alto | médio | baixo | ✅ entregue |
| 2 | Remover o lixo depois de `</html>` (A1) | médio | mínimo | zero | ✅ entregue |
| 3 | Corrigir o teste bomba-relógio (A3) → suíte verde | alto (confiança) | mínimo | zero | ✅ entregue |
| 4 | Remover código morto (A5) | baixo | mínimo | zero | ✅ entregue |
| 5 | `storage.persist()` + indicador "X fichas · Y MB" perto do backup (A7) | alto (não perder PDF) | baixo | baixo | ✅ entregue |
| 6 | Plano B do PDF com `blob:` em vez de `data:` (A6) | médio | baixo | baixo | ✅ entregue |
| 7 | Confirmações com nome da ficha + destaque vermelho no que é destrutivo (A10) | médio | baixo | zero | ✅ entregue (texto + selo; cores vermelhas na Onda 3) |
| 8 | Indicador "💾 Salvo automaticamente · HH:MM" (Ficha e Orçamento) | alto (confiança) | baixo | baixo | ✅ entregue na Catalogação (Ficha/Orçamento na Onda 3) |
| 9 | Versão alinhada (7.2.0) em `package.json`, `server.js`, `server.py`, CHANGELOG (A11) | baixo | mínimo | baixo | ✅ entregue |

### V7.3.0 — Temas reduzidos a Claro e Escuro ✅ **concluída a pedido** (13/10/2026)

| # | Melhoria | Impacto | Risco | Status |
|---|---|---|---|---|
| T1 | Um seletor só, com **Claro (padrão) e Escuro**; seletor duplicado da Catalogação removido | alto (clareza) | baixo | ✅ entregue |
| T2 | Conversão automática dos 15 nomes antigos (Oxford, Neon, Tech… → Escuro) inclusive no boot anti-flash | alto (ninguém perde a escolha) | baixo | ✅ entregue |
| T3 | Catalogação: cabeçalho e fundo acompanham o escuro (antes ficavam claros com o tema escuro) | médio (bug visível) | baixo | ✅ entregue |
| T4 | Ficha: escuro restrito ao painel/barras; **folha A4 sempre branca** | alto (impressão) | baixo | ✅ entregue |
| T5 | Orçamento: 23 blocos de tema inúteis removidos (a interface é escura por natureza) | baixo | zero | ✅ entregue |
| T6 | Controles do topo (seletor e botões) legíveis no escuro | médio | baixo | ✅ entregue |
| T7 | Teste de regressão `test_temas_v7.js` na suíte (nenhuma paleta antiga volta; folha A4 branca) | alto (confiança) | zero | ✅ entregue |

**Peso removido:** shell −5 KB · Catalogação −11 KB · Ficha −44 KB · Orçamento −12 KB ≈ **−72 KB**
de CSS a menos no app (e no ZIP da PWA).

### Onda 2 — Desempenho e estrutura

| # | Melhoria | Impacto | Esforço | Risco |
|---|---|---|---|---|
| 10 | Consolidar as 18 regras do card expandido / reduzir `!important` (A2) — **facilitado na V7.3.0**, que já tirou 24 blocos de tema do arquivo | médio/alto | médio | médio (visual) |
| 11 | Teto do cache de miniaturas + miniatura como JPEG (A4) | alto em máquinas fracas | baixo | baixo |
| 12 | Debounce na busca e re-render só da coluna afetada (A8) | médio | baixo | baixo |
| 13 | Miniatura gerada 1× e guardada (evita re-render ao reabrir) | médio | baixo | baixo |

### Onda 3 — Experiência do usuário (itens já mapeados no `SUGESTOES_UX_V7.md`, que continua válido)

| # | Melhoria |
|---|---|
| 14 | Tour de boas-vindas na primeira abertura (A1 do documento de UX) |
| 15 | Ajuda específica em cada módulo + tooltips que faltam |
| 16 | Legenda fixa das prioridades (🟢 → 🟡 15d → 🔴 22d) |
| 17 | Estados vazios que ensinam ("arraste um PDF para esta coluna") |
| 18 | Lista de atalhos de teclado na Ajuda |
| 19 | Renomear o cabeçalho interno para "Catalogação — fichas em produção" (confunde com "Ficha Técnica") |
| 20 | Manual dentro do app (`manual.html`) em vez de só `README.txt` |

### Onda 4 — Estrutura de dados (fazer só se você quiser)

| # | Melhoria | Observação |
|---|---|---|
| 21 | Guardar PDF como `Blob` no IndexedDB (economiza ~33%) + *garbage collector* de PDFs órfãos | exige migração v2→v3 e ajuste no backup |
| 22 | Backup mais amigável: aviso de tamanho, "backup sem PDFs" e/ou `.zip` com os PDFs de verdade | hoje o JSON embute todos os PDFs em base64 |
| 23 | Vários PDFs por ficha (anexar revisão sem perder o anterior) | mexe no modelo de dados; só com o seu OK |

---

## 7. O que eu **não** recomendo mexer agora

- **Servidor com escrita** (salvar PDF em pasta do Windows): destrói a garantia de "nada sai deste
  computador", exige reescrever `server.js`/`server.py` e os testes de segurança.
- **Reescrever módulos em framework/build moderno**: o projeto é 100% offline, arquivo único, sem
  build de CSS/JS — é uma vantagem aqui, não um problema.
- **Mudar identidade da PWA, porta (4700) ou chaves de dados**: é o que faz o atalho do usuário
  continuar funcionando e os dados antigos serem encontrados.
- **Reativar o *hover preview***: foi desativado a seu pedido; o leitor interno cobre o caso com
  mais controle (clique).
- **Atualizar o pdf.js** para uma versão mais nova: só se aparecer um PDF que a 3.11.174 não abre —
  trocar significa novos arquivos no pré-cache e nova rodada de testes.
- **Multi-PDF por ficha agora**: muda o modelo de dados; melhor depois que o leitor estiver rodando.

---

## 8. Resumo em uma frase por item

1. O sistema está sólido; os problemas são de **acabamento acumulado** (CSS, lixo de arquivo,
   teste frágil) e de **um comportamento pedido pelo usuário** (PDF abrindo fora do sistema).
2. O leitor interno é viável **sem arquivo novo e sem migração**, usando o pdf.js que já está
   embarcado — com fallback para a aba nova em qualquer erro.
3. Nada nas ferramentas atuais precisa mudar para isso; as melhorias são aditivas e reversíveis.
