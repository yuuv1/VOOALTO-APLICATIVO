# VOOALTO V8 — Registro de alterações

## V8.0.0 — simplificação: dois módulos, dois temas (2026-10-19)

Versão de **corte**. O sistema tinha três módulos e a Catalogação carregava junto
um leitor de PDF, um dashboard, um banco IndexedDB próprio e a maior parte do
peso do pacote. Ela saiu. Ficaram as duas ferramentas que produzem documento:
**Ficha Técnica** e **Orçamento**.

### O que saiu

| Removido | Por quê |
|---|---|
| **Catalogação** (`principal_dashboard/`, 100 KB) | Era uma etapa intermediária entre criar a ficha e usá-la. Sem ela, o fluxo é direto. |
| **Leitor de PDF interno** (`assets/pdf.min.js` + `pdf.worker.min.js`, **1,4 MB**) | Só existia para abrir o PDF anexado à ficha na Catalogação. Nenhum outro módulo usava. |
| **Banco `vooalto_pdf_store_v2`** (leitura) | Guardava os PDFs do catálogo. A V8 não o abre — os arquivos continuam no navegador de quem usava a V7, e `zerar_dados.html` ainda sabe apagá-los. |
| **Popup da Ficha Técnica** | A ficha abria numa janela sobre o sistema, com cabeça própria, botão ✕, `Esc` concorrendo com os `Esc` do editor e um `z-index` de 9000. Agora é uma aba em tela cheia, igual ao Orçamento. |
| **Lista "Recentes"** | Guardava só o **nome** da ficha no `localStorage`. Clicar num item **não fazia nada** — não havia como reabrir. Era uma lista decorativa (bug). |
| **`finalizarESalvar()`** | Função de 25 linhas que nada chamava (código morto). |
| **Selos de prioridade, contagem de fichas e relay de mensagens** do shell | Só faziam sentido com o catálogo. |

**Pacote:** 968 KB → **562 KB** (-42%). Precache offline: 27 → **23 itens**.

### O que entrou

**Ficha Técnica em tela cheia.** Aba normal no topo, sem janela sobreposta. O
`iframe` do Orçamento passou a ser **carregado sob demanda** (a primeira
abertura do sistema só baixa a Ficha) — antes os três módulos baixavam juntos.

**"Minhas fichas" — uma lista em vez de duas.** `Rascunhos` e `Recentes` viraram
uma lista só, dentro da Ficha Técnica, com **Abrir · ✎ renomear · ✕ excluir**.
Salvar de novo **atualiza a mesma ficha** em vez de criar outra.

Usa o **mesmo banco das versões anteriores** (`vooalto_ficha_rascunhos_db_v4`,
store `drafts`) com o mesmo índice no `localStorage`. Nada é migrado nem
copiado: os rascunhos da V4–V7 **já aparecem** na lista como fichas normais.
Rascunhos mais antigos ainda, que ficavam todos juntos dentro do
`localStorage`, são movidos para o banco na primeira abertura.

**No lugar de "Enviar para Catalogação":**
- **💾 Salvar ficha** — grava em Minhas fichas (é também o botão flutuante que
  aparece com o menu recolhido; antes ele "enviava").
- **⬇ Baixar (escolher páginas)** — continua igual.
- **✨ Nova ficha** — salva a atual (se tiver conteúdo), limpa a tela e avança o
  número.

**Dois temas, e só dois.** Claro e Escuro — já era assim desde a V7.3; na V8 o
código de conversão das 24 paletas antigas foi mantido apenas como reserva para
quem vier de uma versão anterior. O tema passou a ser gravado em
`vooalto_tema` (a chave antiga `vooalto_theme_v5` continua sendo lida).

**Porta 4800** (a V7 usa 4700), então as duas versões podem coexistir no mesmo
computador sem brigar pelo mesmo `localStorage`.

### Correções de bug

1. **"Recentes" não abria nada.** A lista mostrava fichas que não podiam ser
   reabertas. Removida e substituída por Minhas fichas, que guarda os dados.
2. **"Nova ficha" podia apagar trabalho.** Pedia *"as alterações não salvas
   serão perdidas"* e limpava a tela. Agora ela **salva antes** de limpar — e
   Cancelar não faz nada.
3. **Salvar duas vezes criava duas fichas.** Cada "Salvar rascunho" gerava um
   registro novo. Agora a tela sabe a qual registro pertence e atualiza.
4. **Falha ao gravar passava por sucesso.** Se o `localStorage` estivesse cheio,
   a gravação do índice falhava em silêncio: a ficha existia no banco mas
   **sumia da lista**. Agora o aviso diz exatamente isso e manda exportar backup.
5. **`build_*_pwa.py` não rodava num checkout limpo.** O script exigia que o
   `sw.js` já existisse para conferi-lo como faltante — mas é ele que gera o
   `sw.js`. O primeiro build numa pasta nova falhava.
6. **`data-theme` no `<body>` nunca era removido.** O shell aplicava o atributo
   no `<html>` **e** no `<body>`, mas só o CSS do `<html>` existia na V8; voltar
   para o Claro deixava um atributo órfão. Removido.
7. **Spinner podia ficar para sempre.** O carregamento dependia do evento
   `load` do primeiro `iframe`; se ele não disparasse, a tela ficava girando.
   Há um limite de 4 s.
8. **Importar orçamento da V7 dava erro.** A validação exigia
   `version === 'vooalto_orcamento_v7'`. Agora aceita **V7 e V8**; os arquivos
   novos saem como V8.
9. **Texto desatualizado.** O chip de prontidão dizia *"✓ pronta p/ envio"* —
   não existe mais envio. Passou a *"✓ completa"*. Manual, README, ajuda dos
   módulos, `manifest`, `zerar_dados` e `limpar_cache` revisados: nenhum fala em
   Catalogação, PDF interno ou três módulos.

### Verificação

* **229 verificações** em 11 arquivos de teste (`npm test`) + **7 testes**
  Python (`npm run test:python`).
* Teste novo `tests/test_minhas_fichas_v8.js` (24 verificações) roda contra um
  IndexedDB de mentira e prova: rascunho antigo aparece e **os dados continuam
  no mesmo lugar**; salvar de novo **não duplica**; abrir/renomear/excluir
  funcionam; índice cheio **avisa** em vez de fingir; banco cheio **devolve
  false** (o "Nova ficha" depende disso para não limpar a tela).
* `tests/test_shell_v8.js` (34 verificações): 2 abas, ficha em tela cheia, sem
  popup, sem Catalogação, orçamento carregado sob demanda, tema nos dois
  sentidos **sem eco** para quem enviou, `Esc` fecha ajuda e tour.
* `tests/test_server_v8.js` e `test_server_v8.py` agora exigem **404** em
  `/principal_dashboard/` — se o módulo voltar, o teste falha.

### Decisões que precisam do seu OK

1. **Os PDFs anexados na Catalogação não são lidos pela V8.** Eles continuam no
   navegador de quem usava a V7, mas a V8 não tem onde mostrá-los. Se precisar
   deles, exporte pela V7 antes de migrar. (Posso escrever uma página que só
   despeja esses PDFs em arquivos, se valer a pena.)
2. **"Minhas fichas" é uma lista, não um catálogo** — sem prioridade, sem
   colunas, sem data de produção. Se você sentia falta de *alguma* informação
   do catálogo (ex.: "entregue / em produção"), me diga qual e eu acrescento só
   isso.
3. **O Orçamento não mudou de comportamento.** Só o endereço do manual, a chave
   de tema e a versão do `.json`.

## V8.0.1 — menu lateral da Ficha Técnica refeito (2026-10-19)

Pedido: *"acho esse menu lateral muito feio, reformule ele para ficar bacana."*

### O que fazia o menu parecer feio

O painel não era ruim por falta de elementos — era **barulhento**. Cinco
motivos, todos no mesmo bloco de CSS:

| O que era | Por que envelhecia mal |
|---|---|
| `backdrop-filter: blur(40px) saturate(1.8)` (vidro fosco) | A folha A4 vazava por trás do menu. O texto caía sobre uma imagem borrada e cada rolagem repintava o desfoque inteiro. |
| Halo rosa: `box-shadow: 0 0 80px…, 0 0 40px rgba(212,24,122,.45)` | O painel inteiro brilhava. Um brilho permanente deixa de chamar atenção no segundo em que aparece. |
| ~4 gradientes concorrentes (azul, rosa, verde, azul→roxo) + brilho animado no "Salvar" | Se tudo brilha, nada se destaca. O botão mais chamativo era o menos usado. |
| Emoji como ícone (🗋 ⚡ 🖼 ✍ ➜ ▭ ● ☰ 🎨 📁 💾 📤 📂) | Cada sistema desenha o emoji com tamanho, cor e peso próprios. No Windows viravam adesivos coloridos ao lado de texto de 10 px. |
| Rodapé com 5 botões em 5 estilos, e **"Nova ficha" e "Salvar ficha" duplicados** (uma cópia na seção, outra no rodapé) | O rodapé ocupava 40% da altura do menu e repetia ações. |

### Como ficou

* **Superfície plana** em três níveis — `#101319` (fundo) → `#171B24` (cartão) →
  `+5% branco` (hover). A profundidade vem do contraste, não do brilho. De
  quebra, sai o `backdrop-filter`, que era o item mais caro de pintar.
* **Um acento só**: o rosa Vooalto (`#D4187A`), reservado para a ação principal
  e para o item ativo. Todo o resto é neutro.
* **Ícones em SVG** (24 símbolos, sprite no topo do `<body>`): traço de 1,7 px,
  `stroke: currentColor` — acompanham hover e estado ativo sozinhos.
* **Ferramentas da página em grade 2×**, com rótulo curto (*Imagem, Texto,
  Seta, Retângulo, Círculo, Camadas, Cor*). O texto completo continua no
  `title` (tooltip). Sete linhas viraram quatro.
* **Rodapé enxuto**: `↶ ↷ · ?` numa linha, **Salvar ficha** (só aqui agora),
  **Baixar**, e **PDF / PNG** lado a lado. Saiu a segunda cópia de "Nova ficha".
* **"Minhas fichas"**: a linha inteira abre a ficha; ✎ e ✕ só aparecem no
  hover. Antes eram três botões de texto por linha, que encolhiam o nome.
* **Menu recolhido** virou uma coluna de ícones de verdade (42 px) — rótulos,
  títulos, rodapé e a lista somem; as ferramentas empilham em 1 coluna.
* **Contraste**: os cinzas do V7 (`#616C7E` a 9 px) davam ~3,5:1, abaixo de
  AA. Agora título `#9AA5B8` (~7,5:1), descrição `#78849A` (~4,8:1).
* **Foco de teclado** visível — não existia nenhum.
* O selo de prontidão (`falta: cliente · telefone · modelo`) **encolhe com
  reticências** em vez de estourar o botão, e o texto completo vai no `title`.

### Correções de bug no caminho

1. **`toggleSidebar()` apagava o ícone da alça.** Fazia
   `tog.textContent = col ? '❯' : '❮'` e `tog.style.left = …` — o primeiro
   destrói qualquer `<svg>` dentro do botão, o segundo vence o CSS. Agora só a
   classe `.collapsed` muda no `<nav>` e o CSS reage.
2. **Regra `.v7-save-chip` duplicada.** Havia uma segunda definição no bloco
   "V7.5 Onda 3", mais abaixo no arquivo; por vir depois, vencia a nova. Removida.
3. **`.sb-pdf` / `.sb-png` sem estilo.** Continuam existindo como gancho (o
   `test_canva_v8` procura `.sb-footer .sb-pdf`), agora documentados no CSS.

### Verificação

`npm test` → **230 verificações, 0 falhas** (11 arquivos) · `test:python` → 7 OK.
O `sw.js` foi regerado (`vooalto-v8-5dbaa07c7e8a`) e o pacote também.
