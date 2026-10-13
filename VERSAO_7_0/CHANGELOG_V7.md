# VOOALTO V7 — Registro de alterações

## V7.4.0 — Onda 2: desempenho e estrutura (2026-10-13)

Segunda onda da análise técnica (`ANALISE_TECNICA_V7.md`), focada em **peso, memória e
previsibilidade** — sem mudar nenhuma ferramenta nem o visual.

### A2 — fim da "guerra de `!important`" no modo coluna expandida
O modo expandido (⛶) tinha **56 regras** empilhadas em 6 rodadas de patch, com alturas
conflitantes (360/430/465/470/560/580/620/720/800 px) e **457 `!important`** no arquivo.
Qual rodada "ganhava" dependia da largura da tela — resultado imprevisível e qualquer ajuste
novo precisava vencer todas as anteriores.

Agora: **14 regras**, sem nenhuma rodada duplicada e **sem `!important`** (0 no bloco).

*Como foi feito sem risco:* escrevi um **simulador de cascata** (novo arquivo
`tests/css_cascata.py`) que resolve o que o navegador resolveria — especificidade, ordem,
`!important`, `@media min/max-width` — para **17 elementos × 16 larguras de tela**
(2560 → 360 px). Ele foi usado para provar que cada regra removida perdia em todos os casos
e que cada `!important` retirado não fazia diferença. Conferência final:
**7.120 propriedades comparadas, 0 diferenças** (inclusive dentro de `@media print`).
Mesma técnica para juntar regras repetidas de mesmo seletor.

*Resultado:* o card continua **260×430** em telas normais, **285×465** em telas grandes
(≥1500 px) e **210×360** em telas pequenas (≤900 px) — exatamente como antes.

### A4 — miniatura do card expandido gastava até ~240 MB
Cada miniatura era um canvas em escala **2.0** (≈1190×1684 ≈ **8 MB**), guardado até **30**
vezes, e ainda era feita uma **cópia dos pixels** para cada card na tela — o dobro de memória
por ficha visível. Em máquina modesta, travamento na certa.

Agora: escala **1.5** (≈893×1263 ≈ 4,5 MB), teto de **8** miniaturas, **sem cópia de pixels**
(o card mostra o próprio canvas guardado) e o cache é **limpo ao recolher a coluna**.
De ~240 MB para ~36 MB no pior caso — e sem perda visual (a miniatura continua nítida no
tamanho em que é exibida).

### A8 — buscar ficou leve
Cada **letra digitada** na busca re-renderizava a tela inteira (todos os cards recriados do
zero — daí o "piscar"). Agora a busca espera **150 ms** de pausa e faz **um** render.
20 fichas digitando "ficha" = 5 renders em vez de 5 × 20 cards.

### Testes novos
* `tests/css_cascata.py` + `tests/test_css_expandido_v7.py` (+ fixture em
  `tests/fixtures/css_expandido_v7.json`): **travam os valores atuais** do modo expandido e
  impedem que a pilha de patches volte (1 regra por seletor/faixa, sem `!important`).
* `tests/test_onda2_v7.js`: miniatura reaproveitada, cache limitado e limpo ao recolher,
  busca com debounce (jsdom: 0 renders imediatos, 1 depois de parar de digitar).
* Para mudar o visual do modo expandido de propósito: confira no preview e rode
  `python tests/_gerar_fixture_css_v7.py` para regravar os valores esperados.

### Peso
Catalogação: **−8,5 KB** (−457 → 184 `!important` no arquivo todo). Somado às ondas 1 e 3 de
limpeza (temas), o app está **~80 KB** mais leve que a versão publicada antes da V7.2.0.

> Detalhe preservado de propósito: na faixa ≤900 px o card tem `width:210px` mas
> `flex-basis:190px`, como no original. Não é incoerência visível (na grade expandida o
> `flex-basis` não é usado) e a regra desta onda era **não mudar o visual** — ficou registrado
> para quem quiser arrumar depois.

## V7.3.0 — Só dois temas: Claro e Escuro (2026-10-13)

Pedido: **retirar os temas e deixar só claro e escuro, bem adaptados**. Antes existiam
**24 paletas** (Neo Glass, Dark, Oxford, Butter, Givry, Neon, Tech, Coral…) espalhadas
em 24 blocos de CSS no shell, 23 na Catalogação, **23 × 11 na Ficha Técnica** e 23 no
Orçamento — muitos deles com regras conflitantes.

### O que mudou

1. **Um seletor, dois temas.** O seletor no topo do sistema agora tem só
   **☀️ Claro** (padrão) e **🌙 Escuro**. O seletor duplicado que existia dentro da
   Catalogação foi removido (menos uma fonte de confusão).
2. **Conversão automática.** Quem já usava um tema antigo cai no mais parecido na
   primeira abertura (Oxford/Neon/Tech… → **Escuro**; Butter/Pastel/Cherry…
   → **Claro**), inclusive o anti-flash, que agora já pinta a cor certa antes do
   primeiro quadro. O valor salvo é normalizado.
3. **Bugs de tema corrigidos de verdade:**
   - Catalogação: no escuro o **cabeçalho ficava claro** (o `--header-bg` não era
     redefinido) e o fundo mantinha um brilho branco — agora ambos acompanham o tema.
   - Ficha Técnica: os temas escureciam textos e células **dentro da folha A4**
     (o documento que vai para a impressão). Agora o escuro vale só para o painel e
     para as barras de ferramentas que a própria impressão já esconde — **a folha
     continua sempre branca**.
   - Orçamento: os 23 blocos de tema não mudavam nada na interface (que é escura por
     natureza) e podiam desalinhar o shell — removidos.
4. **Menos código para manter:** ~**72 KB a menos** no app (Ficha −44 KB,
   Orçamento −12 KB, Catalogação −11 KB, shell −5 KB), menos regras conflitantes e
   menos `!important` brigando. Isso também ajuda a diagnosticar o CSS do modo
   coluna expandida na próxima onda.
5. **Documentação:** `README.txt` e a Ajuda do sistema continuam válidos (o tema
   continua mudando o sistema inteiro); `tests/test_temas_v7.js` entra no `npm test`,
   garantindo que nenhuma paleta antiga volte e que a folha A4 siga branca.

### O que **não** mudou

Ficha Técnica, Orçamento, Catalogação, servidor local, PWA, portas, chaves de dados e o
IndexedDB seguem iguais. Nenhum dado é apagado: só a aparência (e a lista de temas).

## V7.2.0 — PDF dentro do sistema + polimento (2026-10-13)

Pedido: **ver os PDFs pelo próprio sistema**, sem quebrar nada. Nenhuma ferramenta
atual mudou de comportamento; tudo abaixo é aditivo.

### Leitor de PDF interno (`principal_dashboard/index.html`)

1. **"Ver PDF" não sai mais do sistema.** O clique no card, no botão "👁 Ver PDF" e no
   modo coluna expandida abre um **leitor dentro da Catalogação** (pdf.js que já vinha
   embarcado — nenhum arquivo novo, continua 100% offline). Antes o arquivo era jogado
   numa aba nova do navegador, o que no PWA instalado abre fora do app ou é bloqueado.
2. **Recursos do leitor:** trocar de página (‹ ›, campo de página, ←/→, Home/End),
   zoom (− / +, Ajustar largura, Ajustar página), girar 90°, **baixar**, **imprimir a
   página** e **⧉ Nova aba** (o visualizador do navegador virou opção explícita).
   Esc fecha; clicar fora fecha.
3. **Nunca deixa o usuário sem o PDF:** se o pdf.js não conseguir abrir (arquivo
   protegido por senha, corrompido ou muito pesado), aparece uma explicação clara com
   botão para abrir na aba do navegador — e a aba é aberta automaticamente como plano B.
4. **Proteções:** uma página por vez, cancelamento da renderização anterior ao trocar de
   página (sem imagem "pulando"), teto de ~12 megapixels por página, liberação do
   canvas ao fechar (memória) e reaproveitamento do mesmo cache de documentos que as
   miniaturas já usavam.
5. **Impressão segura:** a troca de tela para impressão só vale quando a impressão veio
   do leitor (classe `pdfv-printing` no `<html>`) — um Ctrl+P normal do módulo não é
   afetado.

### Correções e polimento

6. **Lixo de edição no fim do HTML** — o arquivo da Catalogação terminava com um
   `</script></body></html>` duplicado e restos de código (`...stener('focus',v7DayTick);`)
   que o navegador transformava em **texto dentro do `<body>`**. Removido.
7. **Código morto removido** — `getThumbLo()` e `renderPdfFirstPageCanvas()` não eram
   chamados por ninguém desde a desativação do hover preview.
8. **Plano B do card expandido com `blob:`** em vez de `src="data:application/pdf;base64,..."`
   (URL de megabytes, lenta de montar).
9. **Teste que falhava sozinho com o tempo** — `tests/test_ux_v7.js` usava datas fixas
   ("15/09/2026"), que passaram de 22 dias e viraram prioridade Alta de verdade; agora as
   datas são calculadas a partir de hoje. A suíte voltou a ficar verde.
10. **Armazenamento protegido e visível** — o app pede armazenamento persistente
    (`navigator.storage.persist()`) para o navegador não descartar PDFs/fichas do
    IndexedDB e mostra um selo "🗄 N fichas · X MB" junto do botão de backup.
11. **Selo "💾 Salvo HH:MM"** na barra da Catalogação (fica **⚠️ Não salvou** quando o
    espaço acaba) e **confirmação de exclusão com o nome da ficha** avisando que o PDF e a
    ficha anexada também serão apagados.
12. **Versão alinhada em 7.2.0** (`package.json`, `server.js`, `server.py`) e
    `tests/test_pdf_viewer_v7.js` acrescentado ao `npm test`.

### Arquivos que **não** mudaram de comportamento

Ficha Técnica, Orçamento, shell, servidor local, identidade da PWA, chaves de dados e o
banco IndexedDB (v2, sem migração). O pacote continua sendo gerado por
`python build_v7_pwa.py`.

## V7.1.1 — Anti-travamento, anti-perda e previews de PDF (2026-10-06)

Sintoma: com fichas que têm fotos (especialmente fotos de celular) e com
muitas fichas na Catalogação, o app congelava por segundos a cada digitação,
ao abrir a Ficha Técnica, ao expandir colunas com PDF e ao salvar.

Causas encontradas e correções:

### Ficha Técnica (`criador_ficha_tecnica/index.html`)

1. **Fotos gigantes na importação** — uma foto de 12 MP (~5–15 MB em base64)
   ia inteira para a memória, para cada snapshot do Ctrl+Z (até 40×), para o
   autosave (a cada edição) e para a catalogação.
   Correção: `v7DownscaleDataURL()` reduz o lado maior para 1600 px na
   importação (JPEG q85; PNG preservado com transparência). Imagens pequenas
   (<150 KB, ex. logos) passam intactas. Vale para página 1, páginas extras e
   upload com nome (`lerArq`, `lerArqExtra`, `lerArqComNome`). Falha =
   usa o original.
2. **Miniaturas da faixa de páginas** — cada `renderPageStrip()` clonava a
   página INTEIRA com as fotos em tamanho real (`clone.outerHTML` de MBs por
   página, a cada edição). Correção: o clone agora sai sem `src` das imagens
   (vira caixinha cinza na miniatura), sem `<canvas>`/`<video>` e com trava
   de segurança (página pesada vira miniatura só com o rótulo).
3. **Autosave silencioso** — quando o armazenamento enchia, o autosave
   falhava sem avisar (parecia “travou e perdeu”). Agora mostra um aviso
   (no máximo 1×/min) pedindo para exportar a ficha como backup.

### Catalogação (`principal_dashboard/index.html`)

4. **`fichaData` saiu do localStorage** — a ficha completa (com fotos) era
   regravada no localStorage a cada `save()` (clique em Concluído, limpeza
   de thresholds, etc.): serializações de MBs travavam a tela e estouravam
   a cota (~5 MB), e o `save()` antigo **lançava exceção**, abortando o
   clique no meio (botão “não respondia”). Agora a ficha vai para o
   IndexedDB (store `fichaData`, banco v2, escrita assíncrona); no
   localStorage ficam só metadados. Migração automática no boot; backup
   exportado continua completo (re-anexa do IndexedDB); importação grava
   no IndexedDB (com fallback inline se ele indisponível); excluir ficha
   limpa o IndexedDB.
5. **`save()` nunca mais quebra a tela** — reescrito sem dupla
   serialização (cópia rasa + 1 `stringify`), com `try/catch` e aviso de
   “espaço cheio” em vez de exceção.
6. **Perda de dados ao recarregar (regressão)** — `normalizeImportedData`
   descartava `fichaData`/`fichaNum` ao carregar: depois de um F5, o botão
   “✏️ Modificar Ficha” sumia e o próximo `save()` apagava as fichas do
   armazenamento permanentemente. Agora preserva os campos (e o merge de
   backup não apaga ficha existente quando o backup não a tem).
7. **Coluna expandida travava com muitos PDFs** — todos os cards
   renderizavam o PDF em paralelo (`Promise.all` irrestrito). Agora são no
   máximo 2 por vez (`loadOneExpandedPdfCard`).
8. **Preview expandido em branco** — `thumb.cloneNode(true)` não copia o
   desenho de um `<canvas>` (saía folha branca). Agora copia os pixels com
   `drawImage` para um canvas novo.
9. **Memória sem teto** — `_pdfDataCache`, `_pdfDocCache` (com `destroy()`
   dos documentos descartados) e os caches de miniaturas agora têm limite
   (`_capMap`).
10. **IDs importados validados** — ids fora do padrão `[A-Za-z0-9_-]`
    ganham um novo `uid()` (evita quebra do `onclick` com backup adulterado).

### Orçamento (`criador_orcamento/index.html`)

11. **Assinatura gigante** — upload de foto em resolução total virava PNG
    de MBs no autosave/estado. Agora limita a 800 px antes de processar.
12. **Preview reprocessava a assinatura a cada tecla** — `src` do carimbo
    só é reatribuído quando o conteúdo mudou.

### Testes e pacote

- Novo `tests/test_perf_v7.js` (16 verificações estáticas + jsdom da ficha
  e da catalogação) incluído no `npm test`.
- `sw.js` e `VOOALTO_V7_PWA.zip` regenerados via `python build_v7_pwa.py`.

## V7.1 — base (main em 2026-10-05)

Versão consolidada publicada na `main` (PRs #5, #8 e #9): Ficha Técnica em
popup sobre o sistema, páginas estilo Canva com faixa de miniaturas,
undo/redo de páginas e objetos, Catalogação com prioridades automáticas e
PDFs em IndexedDB, Orçamento com autosave/rascunhos/duplicação, PWA
instalável com cache offline e identidade estável, testes jsdom +
`build_v7_pwa.py`.
