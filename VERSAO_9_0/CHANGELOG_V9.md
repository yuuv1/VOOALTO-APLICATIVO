# VOOALTO V9 — Registro de alterações

## V9.1.2 — Auditoria de código: dinheiro, backup e injeção (2026-10-30)

Rodada de revisão do repositório inteiro. Nenhuma estrutura de ficha ou de
orçamento mudou; o que mudou é o que estava errado em silêncio. Tudo com teste
automatizado novo (`tests/test_melhorias_v9.js`, 39 verificações, mais 5 testes
Python).

### 1. Dinheiro (o único item que podia imprimir número errado)

| O que acontecia | O que ficou |
|---|---|
| `parseBRL` apagava **todo** ponto antes de converter: `"10.50"` virava **1050** (100×). Quem digitava com ponto decimal, colava de planilha ou usava teclado numérico vendia por 100 vezes o preço | leitor único e tolerante: `1234.56`, `1.234,56`, `1,234.56`, `10,50`, `1.234` e `0.5` todos corretos; entrada inválida = 0 (nunca `NaN`) |
| A **mesma** célula de valor unitário do orçamento tinha dois leitores: a barra lateral lia `10.50` como 10,5 e a edição na folha A4 como 1050 | `orcParseMoney` é a regra única dos dois caminhos |
| Total da linha do orçamento saía com 3 casas quando o valor tinha centavos fracionados (`1.234,568`) | sempre 2 casas |

### 2. Backup e restauração

| O que acontecia | O que ficou |
|---|---|
| `gravarFichasIDB`, ao não abrir o IndexedDB (ou falhar no meio), jogava **todas** as fichas — fotos em base64 incluídas — no `localStorage`, e gravava o índice de qualquer jeito. A lista mostrava ficha que não existia | o dado nunca vai para o `localStorage`; a falha vira `{ok:false}` com motivo, e o índice só é gravado depois do dado |
| `restaurar()` devolvia `{ok:true}` sempre: a tela dizia "Backup importado com sucesso" mesmo sem gravar nada | devolve `ok:false` com a explicação; a UI mostra "O backup NÃO foi importado" e garante que os dados atuais continuam intactos |
| No modo "substituir", o `localStorage` era apagado **antes** de gravar as fichas: uma falha deixava o usuário sem os rascunhos e sem o backup | grava as fichas primeiro; só depois substitui o `localStorage` |
| O selo "último backup" era gravado antes de o arquivo sair (e o seletor de pasta pode ser cancelado) | só é gravado depois que o arquivo foi gerado |
| Leitura do banco abria **uma transação por ficha** (N+1) — segundos de interface travada com muitas fichas | uma transação, dois pedidos (`getAllKeys` + `getAll`); gravação do lote em uma transação só |

### 3. Segurança

| O que acontecia | O que ficou |
|---|---|
| Nome de cor vinha de digitação **e de `.json` importado** e entrava cru no `innerHTML`: `"><img src=x onerror=...>` executava script na página (e podia reescrever todas as fichas) | hex validado e texto escapado nos dois construtores de chip (folha 1 e páginas extras) |
| Ouvintes de `postMessage` aceitavam mensagem de **qualquer origem** e todo envio usava `'*'`: uma página que obtivesse um handle da janela trocava aba, tema ou disparava recarga | só a própria origem é aceita (`e.origin`), e os envios usam `targetOrigin` explícito |

### 4. Interface e PWA

| O que acontecia | O que ficou |
|---|---|
| O `<style>` anti-flash era criado sem nunca ser anexado e escrito sem `id`: a remoção em `setShellTheme` não achava nada e as regras `!important` ficavam **para sempre** — quem trocava para o claro continuava com o shell escuro | o estilo é escrito com `id="__theme_boot"` e removido quando o tema é aplicado |
| Lista "Minhas fichas" cortava em **200** em silêncio: a ficha continuava no IndexedDB mas sumia da tela | teto de 1000 e aviso explícito quando estourar (com dica de exportar backup) |
| A Ficha Técnica oferecia "Poppins" e "Montserrat" na ferramenta de texto, mas só o Orçamento declarava `@font-face` — o mesmo `.json` imprimia com fonte diferente em outra máquina | `assets/fonts.css` compartilhado pelos quatro documentos; Montserrat (não embarcada) saiu do seletor |
| O precache do service worker era uma lista manual: arquivo novo fora de `assets/`/`icons/` ficava fora do cache **e** do hash, então quem já tinha o app nunca recebia a atualização e tomava 404 offline | o build percorre a pasta; teste garante que todo `src`/`href` publicado existe e está no precache |
| Versão copiada em `server.js`, `server.py` e `package.json`; o health check compara a versão exata, então divergir fazia o `.bat` acusar "outra versão do Vooalto" na porta | `version.json` é a fonte única, lida pelos dois servidores |
| `OPTIONS` dava **501** no `server.py` e **405** no `server.js` (e o `.bat` usa o Python quando não há Node) | os dois respondem 405 com `Allow: GET, HEAD` |

### 5. Repositório

- CI em `.github/workflows/ci.yml`: `npm test`, `npm run test:python` e a
  conferência de que o `sw.js` commitado corresponde ao conteúdo do app
  (Ubuntu e Windows). Antes não havia automação nenhuma.
- `uploads/` (5,2 MB de uma cópia da **V5**, com README falando da porta 4280 e
  de um `.bat` que não existe) saiu do repositório — era o arquivo que alguém
  editaria por engano no lugar do app.
- `VOOALTO_V9_PWA.zip` deixou de ser versionado (vai como artefato de release).
- `PLANO_V9.md`, `manual.html` e `README.md` corrigidos onde diziam que o tema
  padrão era o claro (é escuro desde a V9.3), que a suíte tinha "330
  verificações em 12 arquivos" e que a versão era 9.0.0.

## V9.1.1 — Pente fino: o que estava perdendo trabalho (2026-10-28)

Segunda rodada de auditoria sobre a V9.1.0, com a mesma regra: **nem a ficha
técnica nem o orçamento mudam de estrutura**. Tudo aqui é correção de
comportamento, provada por teste automatizado.

### 1. Correções que salvavam dado errado

| O que acontecia | O que ficou |
|---|---|
| **Duplicar página** inseria a cópia **antes** da original (`v7DuplicarPagina` usava a posição no array, mas `v7CriarPaginaRestaurada` conta as folhas na tela, onde a folha 1 entra na conta) | a cópia fica logo depois da original e a numeração sai certa (1, 2, 3, 4) |
| Ao duplicar, o **array `paginas` ficava fora da ordem da tela** — e é esse array que o `.json`, o autosave e a impressão percorrem | `v7Renumerar` reordena o array pela ordem real das folhas |
| Girar a camada em 90° numa folha A4 (794 × 1123) girava de verdade ~36°, porque a conta usava % puro | `mkeRotPonto` virou **consciente da proporção** da área: 90° é 90°, `Alt+←/→` e o campo de graus batem com o que se vê |
| Girar uma **seta** não fazia nada (seta não usa `rot`, e o código só mexia nele) | a seta gira movendo as duas pontas, presas dentro da área |
| Espelhar uma **seta** não fazia nada | as duas pontas são refletidas (`x = 1 − x`, `y = 1 − y`) |
| O `.json` gravava as camadas da folha 1 sem `name/hidden/locked/op/flip/fit` → reabrir **ressuscitava camada oculta** e perdia o cadeado | `capturarFichaParaJSON` usa `serLayer` (a mesma serialização do autosave) |
| Reabrir um `.json` perdia o **nome do arquivo** da foto (“frente polo” voltava a “Imagem 2”) e o tamanho real em px (aviso de foto em baixa) | `serLayer` grava `_fileName`, `_nw` e `_nh` |
| **Imagem que não carrega** (arquivo apagado, base64 corrompido) fazia a camada **desaparecer sem aviso** — posição, tamanho e nome iam junto | a moldura continua na ficha, marcada com `_semImagem` e tracejado na tela (não sai na impressão), e a foto volta por “Revincular imagens” |
| **Cota do `localStorage` estourada** derrubava o autosave inteiro: o trabalho do dia sumia | 1ª tentativa completa; se estourar, o rascunho é gravado **sem o base64 das fotos** (páginas, textos, grade, produção e molduras preservados) e o selo avisa “Salvo sem as fotos” |
| `savLayers` (`va3_layers`) guardava **base64 de imagem no `localStorage`** — justamente o que o PLANO §10 proíbe (cota e travamento) | a cópia de emergência guarda geometria e atributos, nunca a foto |
| Excluir várias camadas com Delete dizia **“0 camadas removidas”** (a conta era feita depois de limpar a lista) | o toast mostra a quantidade certa |
| **“Nova ficha”** apagava o autosave, mas deixava a cópia de emergência (`va3_layers`) com as camadas antigas — no próximo carregamento o mockup da ficha anterior **voltava** | `clearAllLayers` também atualiza a cópia de emergência: ficha nova começa limpa de verdade |
| **Abrir outra ficha e apertar Ctrl+Z** desfazia uma operação de **página** da ficha anterior (a pilha de páginas não era limpa) — dava para apagar uma página da ficha recém-aberta | `restaurarDeJSON` zera as pilhas de páginas e de camadas: documento novo, histórico novo |
| **“Ocultar camada”** no menu de contexto não fazia nada nas **páginas extras** (a ação procurava a camada só na folha 1) | a ação recebe o id da página em foco e esconde/mostra de verdade |

### 2. Orçamento

| O que acontecia | O que ficou |
|---|---|
| **Salvar assinatura sem desenhar nada** trocava a assinatura padrão por um PNG transparente — a proposta saía sem assinatura | avisa “Desenhe sua assinatura antes de salvar” e mantém a que existia; se o navegador não entregar os pixels, também avisa em vez de quebrar |
| **Exportar PNG** sem a `html2canvas` (CDN fora do ar/offline) escondia a barra lateral e as abas e **não devolvia mais** — a tela ficava sem interface | a checagem vem antes de esconder qualquer coisa, com aviso “use Imprimir”; a interface é restaurada mesmo se algo falhar no meio |
| **Autosave do orçamento** com a cota cheia não gravava nada (só o selo “não salvou”) | tenta de novo **sem a assinatura** (que é o que pesa) e avisa “Salvo sem a assinatura” |
| **Salvar rascunho de orçamento** falhava em silêncio e ainda dizia “salvo com sucesso!” | grava sem a assinatura; se ainda não couber, descarta os mais antigos; se nada couber, **avisa que NÃO foi salvo** (nada de elogio falso) |
| **Excluir rascunho** dizia “excluído” mesmo quando a gravação falhava | avisa “não foi possível excluir agora” |
| **Adicionar ou duplicar página** não agendava o autosave | a página nova é gravada na hora (antes, fechar a aba em seguida perdia a página) |

### 3. Testes

`tests/test_mockup_v9.js` — **290 verificações** (eram 258 na V9.1.0):
além de tudo o que já existia, agora cobre desfazer/refazer na folha 1 e nas
páginas extras, remover a página em foco sem levar a régua junto, preencher em
`cover`, girar/espelhar seta, recorte sem a biblioteca, **ida e volta do `.json`
com camada de imagem em página extra**, **imagem quebrada mantendo a moldura**,
**rascunho de emergência sem fotos** (com cota simulada), `va3_layers` sem
base64, a numeração das páginas depois de remover uma do meio, **“Nova ficha”
apagando o mockup antigo da cópia de emergência**, **ocultar camada na página
extra**, **Ctrl+Z logo depois de abrir uma ficha** e a **moldura sem imagem
voltando do `.json`** (e a foto reaparecendo quando a imagem é substituída).

`tests/test_orc_features_v9.js` — **48 verificações** (eram 34): assinatura em
branco, assinatura desenhada, exportação PNG sem a biblioteca, autosave com a
cota cheia (sem a assinatura), rascunho que não cabe avisando em vez de mentir
e o autosave disparado ao adicionar/duplicar página.

A suíte inteira (`npm test` + `npm run test:python`) continua passando.

---

## V9.1.0 — Estúdio do mockup: o que faltava para trabalhar as artes (2026-10-28)

Pedido: *"melhore todos os aspectos que facilitam o preenchimento e o uso do
aplicativo. ponto principal pra utilidade dos materiais de edição da parte onde
coloco os mockups na ficha técnica"*.

**Regra do pedido respeitada à risca: a estrutura da ficha técnica e do
orçamento não muda.** Nenhum campo, seção, tabela ou medida da folha A4 foi
criado, removido ou deslocado. Tudo o que entrou é **ferramenta**: fica em volta
da área do mockup, é escondido na impressão e na pré-visualização, e usa os
tokens do tema (a folha continua branca no claro e no escuro).

### 1. O que era ruim antes

| Situação | Por que atrapalhava |
|---|---|
| A 2ª imagem entrava **exatamente sobre a 1ª** (todas no centro, com o mesmo tamanho) | depois de soltar duas fotos, uma cobria a outra e não dava para saber o que havia embaixo |
| A barra só aparecia **depois** de selecionar, e era a única porta para as ações | trocar uma arte exigia apagar, procurar o arquivo e reposicionar tudo |
| A área do mockup tem ~500 × 300 px | impossível alinhar detalhe, e uma arte arrastada para fora "sumia" (a área recorta) |
| Lista de camadas só com ícone + nome + ✕ | sem olho, sem cadeado, sem renomear, sem ordem |
| Não havia espelhar, girar 90°, opacidade, alinhar, distribuir nem precisão | tudo era feito a olho, no mouse |
| O botão 🔒 dizia "travar a posição", mas o código travava a **proporção** | a pessoa "travava" e a camada continuava se movendo |
| `toggleProp()` não gravava (`savLayers`/`snap` faltando) | a trava se perdia ao recarregar |
| Colar um print (Ctrl+V) não fazia nada | obrigava a salvar o print em arquivo antes de importar |
| Nome da camada era escrito com `innerHTML` | texto digitado podia injetar marcação na lista |

### 2. Ferramentas novas (todas fora do documento impresso)

**Régua presa na área** (`+ imagem`, `⤢ ampliar`, `📐 guias`, `🗂 camadas`,
`🧲 ímã`, `🎛 ferramentas`) e **painel com 4 abas**:

* **Ajustes** — duplicar, espelhar H/V, girar 90° (⟲/⟳), zerar rotação,
  **substituir a imagem mantendo tamanho e posição**, recortar, opacidade
  (10–100%), travar posição, travar proporção.
* **Alinhar** — encostar à esquerda/direita/topo/base, centralizar em cada eixo,
  centralizar na área, caber na área e **distribuir** com espaçamento igual
  (3+ camadas selecionadas com Shift+clique).
* **Organizar** — **lado a lado** (frente e costas na mesma altura, o caso mais
  comum), empilhado, grade automática, encaixe, **moldura justa** (tira a tarja
  em volta da imagem) e **mesmo tamanho**.
* **Precisão** — X, Y, largura, altura em % da área, rotação em graus, leitura
  do **tamanho impresso em milímetros** (calculado pela largura de 210 mm da
  folha) e **baixar só a área em PNG** (para mandar a arte ao fornecedor).

**Modo ampliado (⤢)** — a área do mockup ocupa a janela, com fundo escurecido e
uma barra própria (lado a lado, guias, fechar). `Esc` volta. Ao imprimir,
exportar PNG/PDF, gerar miniatura ou abrir o modo de pré-visualização o modo é
encerrado automaticamente; além disso, há regra `@media print` que devolve a
área ao papel.

**Ímã com guias** — ao arrastar, a camada encosta nas bordas da área, no centro
e nas bordas/centros das outras camadas, com uma linha ciano mostrando o
encaixe. `Alt` solta o ímã. A camada é limitada a nunca sair inteira da área
(antes ela "desaparecia" e só o Ctrl+Z trazia de volta).

**Guias fixas (📐)** — ciclo desligado → centro → grade de terços → margem 5%.
Não saem na impressão.

**Lista de camadas nova** — miniatura real, nome editável (duplo clique), olho
(mostrar/ocultar — oculto não imprime), cadeado (travar posição), ↑↓ (ordem na
pilha) e ✕. Linhas ocultas ficam esmaecidas.

**Menu de contexto** (botão direito na camada): duplicar, substituir, recortar,
espelhar, girar, **voltar ao original**, travar, ocultar, frente/trás,
centralizar, excluir.

**“↺ Voltar ao original”** — tira giro, espelho, opacidade e devolve a
proporção travada de uma vez, para desfazer uma experiência sem procurar cada
botão.

**Várias fotos de uma vez** — escolher (ou arrastar) **frente e costas juntas**
agora encaixa as duas lado a lado, com a mesma largura de célula, a mesma
altura e o mesmo centro vertical, respeitando a proporção de cada foto. Antes,
cada arquivo entrava no meio da área e a segunda foto caía exatamente em cima
da primeira. A conta é uma função pura (`mkeGradeLote`), testada à parte:
2 fotos → 2 colunas; 3–4 → 2 colunas em 2 linhas; 5+ → 3 colunas, sem
sobreposição e sem sair da área.

**Aviso de resolução** — a lista de camadas marca com **⚠** a foto que não tem
pixels suficientes para o tamanho com que vai ser impressa (conta de 300 dpi a
partir dos 210 mm da folha). A aba **Precisão** mostra `largura × altura em px`
e diz se está “boa para 300 dpi”. Serve para o erro clássico: print de tela de
800 px esticado até a largura da área e impresso serrilhado. A marca **não sai
na impressão** e não é gravada no arquivo.

### 3. Comportamento que mudou (para melhor)

* **Encaixe automático da imagem nova**: procura o primeiro espaço livre
  (2 colunas × 2–3 linhas) olhando as caixas das imagens que já estão na área;
  se não houver espaço, entra deslocada em cascata. A moldura já nasce com a
  proporção da imagem (`hp = wp × (W/H) / ratio`) — antes sobrava tarja por
  causa do `object-fit: contain`.
* **Preencher × Caber**: `lFill` (⤢) agora marca a camada como `cover` (cobre a
  área, cortando o que sobra) e o novo `lCaber` (⤡) como `contain` (aparece
  inteira). O `fit` é salvo por camada.
* **Redimensionar**: `Shift` inverte a trava de proporção durante o arraste.
  Alças de canto passaram de 10 px para 12 px (mais fáceis de acertar numa área
  pequena).
* **Girar**: Shift prende em passos de 15°; a rotação é arredondada a 0,1°.
* **Atalhos**: `Ctrl+D` duplica · setas movem 1 px (`Shift` = 10 px) · `[`/`]`
  mudam a ordem · `Ctrl+V` de imagem cola o print direto na área.
* **Colar texto** continua igual e não é afetado (a imagem tem prioridade só
  quando existe imagem na área de transferência).
* **A exportação em PNG não fotografa mais a ferramenta.** As regras
  `@media print` não valem para o `html2canvas`, então a régua, o painel,
  o botão “+ Imagem” e o painel de camadas saíam dentro do PNG da folha.
  `prepPrint()` agora marca `body.mke-exportando` (que esconde tudo isso) e
  `restAllPx()` desmarca ao terminar — o mesmo caminho que a impressão usa.

### 2.1 Estúdio em todas as páginas

* **A régua, o painel, as guias e o ímã acompanham a página em foco**
  (`mkeMoverUI`). Antes eles existiam só na folha 1: para mexer numa arte da
  página 2 era preciso rolar de volta até a página 1, e a ferramenta de lá
  (por causa do `mkeCtx`) acabava agindo na página 2 — funcionava, mas por
  acidente. Agora clicar numa arte leva a ferramenta para a página dela.
* **⤢ e 🎛 em todas as barras de página**; o modo ampliado passou a valer
  também para `.canvas-inner` das páginas extras (antes só a folha 1 sabia
  entrar em tela cheia).
* **Botão direito (menu de contexto) em qualquer área do mockup** — antes o
  listener estava preso ao `#canvasInner` da folha 1.
* **A barra da imagem das páginas extras ficou igual à da folha 1** (⤢, ⤡
  caber, ⇄ trocar, ⋯ mais ferramentas); novo `lCaberExtra`.
* **Botão 🗂** fora da folha 1 avisa onde ficam as camadas em vez de abrir uma
  lista vazia.

### 2.2 Precisão em milímetros e alinhamento entre camadas

* **Campos em mm** na aba Precisão: digite “100 mm” de largura (ou de altura)
  e a arte assume exatamente aquele tamanho no papel. “Largura da folha” ocupa
  a área toda. Cada campo aplica o seu eixo — antes, se os dois valessem
  sempre juntos, a altura antiga voltaria por cima do valor novo.
* **Alinhar com várias camadas selecionadas** (Shift+clique) agora encosta
  uma na outra (esquerda/direita/topo/base/centro do grupo), não na área.
  Com uma camada só continua alinhando na área. O painel mostra
  “N camadas selecionadas · as ações valem para todas”.

### 2.3 Importar e reaproveitar sem refazer

* **Soltar uma foto em cima de outra troca só aquela arte** (mantendo lugar,
  tamanho e rotação). O caminho de arquivo do “⇄ Substituir” virou
  `mkeTrocarArte`, reaproveitado pelo arraste.
* **Colar uma coluna do Excel** dentro da grade, das medidas ou da produção
  distribui os valores pelas células seguintes (aceita Tab, quebra de linha,
  ponto e vírgula). `Ctrl+Shift+C` copia a tabela inteira de volta para a
  planilha — útil para conferir com o fornecedor.
* **⧉ Duplicar página** na barra lateral: copia campos, grade, medidas,
  produção, cores e artes da página com ids novos (sem isso o Ctrl+Z de uma
  página mexeria na cópia da outra).

### 2.4 Lista de camadas em todas as páginas

A lista 🗂 deixou de ser só da folha 1: ela mostra as camadas da **página em
foco** (cabeçalho diz “Camadas P2”), e olho, cadeado, nome, ↑↓ e ✕ agem naquela
página — `mkeListaFoco`, `mkeCamadaPor`, `mkeExcluirCamada`. O `[`/`]` também
respeita a página em foco. A miniatura mostra no `title` o nome do arquivo e o
tamanho em px.

### 2.5 Várias camadas em qualquer página

* **Shift+clique funciona nas páginas extras** (antes só na folha 1) e o
  painel conta “3 camadas selecionadas · as ações valem para todas”.
* **🗑 Delete apaga o grupo inteiro** e o ✕ do painel também.
* **🖼 Selecionar todas as imagens** marca as fotos da página em foco para
  alinhar, girar ou distribuir de uma vez.
* **Distribuir** deixou de ser exclusivo da folha 1 e usa a altura real de
  textos e setas (antes o espaço saía errado e as caixas se amontoavam).

### 2.6 Endireitar e posicionar em mm

* **−15° / −1° / +1°** no painel e **Alt+←/→** (Shift = 15°) para endireitar
  foto torta sem mexer no tamanho.
* **Posição no papel (mm)**: X e Y em milímetros, presos à borda da folha —
  a mesma linguagem da ficha técnica.
* A guia de **margem** agora é 5 mm de papel de verdade (2,4 % na largura e
  1,7 % na altura em A4), não 5 % “no olho”, e o rótulo diz “5 mm”.

### 2.7 Arte na página certa, sem refazer

* **➜ Levar / ⧉ Copiar para outra página** (aba Ajustes): escolhe a página de
  destino na lista e leva a camada com lugar e tamanho. Antes, arte montada na
  página errada era refeita à mão.
* **Ctrl+S** salva a ficha na hora e confirma (“💾 Ficha salva neste
  computador”) em vez de abrir o “salvar página” do navegador.
* **Plaquinha de medida** durante o arraste agora mostra também **X e Y em mm**
  (tamanho + onde a arte começa no papel).
* O **ímã** (🧲) passou a valer nas páginas extras: antes só a folha 1 encostava
  em bordas, centro e outras camadas.
* **🔒 Travar tudo** (aba Organizar) protege as camadas da página de uma vez —
  depois que a arte está pronta, revisar a ficha não arrasta foto sem querer.
* **Colar imagem (Ctrl+V) vai para a página em foco** — antes um print colado
  com a página 3 aberta caía sempre na folha 1, e o toast dizia “na área do
  mockup”, sem avisar onde tinha ido.

### 2.8 Tablet e nome das camadas

* **Segurar o dedo (≈0,5 s) na camada abre o mesmo menu** do botão direito —
  a PWA também é usada em tablet, onde “botão direito” não existe.
* **O nome da camada vem do arquivo** (`frente_polo.jpg` → “frente polo”),
  tanto na lista quanto na barra da imagem. “Imagem 2” não dizia nada.
* **Aviso de resolução também na importação**: foto pequena para o tamanho em
  que vai sair no papel avisa por toast na hora, em vez da surpresa no PDF.

### 3.1 Preenchimento da ficha (o outro lado do pedido)

* **CPF/CNPJ, telefone e CEP se arrumam sozinhos** ao sair do campo:
  `12345678901` vira `123.456.789-01`, `6299990000` vira `(62) 9999-0000`,
  `74000000` vira `74000-000`. Vale também para os campos do **Preenchimento
  rápido**. Só mexe quando o conteúdo é realmente um número — “a definir”
  continua “a definir” e número incompleto não é cortado.
* **Enter e Tab andam de campo em campo**: dados do cliente (nome → CPF →
  telefone → endereço → cidade → CEP), tabela de **medidas**, **grade** de
  tamanhos e **produção**. Antes, Enter no meio da ficha não fazia nada e
  preencher 12 células de medida era 12 cliques de mouse.
* **Enter no último campo da produção abre a linha seguinte**, já com o cursor
  no “Modelo / Descrição”. O total é recalculado na hora.

### 4. Compatibilidade de dados

Os campos novos são **aditivos** e só são gravados quando diferentes do padrão
(`name`, `hidden`, `locked`, `op`, `flipH`, `flipV`, `fit`). Ficha antiga abre
sem conversão; o `.json` só engorda quando a pessoa usa um recurso novo. As
chaves de dado (`vooalto_v7_ficha_ativa`, IndexedDB `vooalto_ficha_rascunhos_db_v4`,
backup `vooalto_backup_v9`) não mudaram.

### 5. Testes

`tests/test_mockup_v9.js` — **258 verificações** em jsdom: interface montada,
ações (alinhar, espelhar, girar com troca de eixos, opacidade, travar,
ocultar, renomear, ordem, menu de contexto, precisão, guias, ímã, limite,
encaixe, organizar em 2 colunas, estúdio, `prepPrint` saindo do estúdio,
persistência em `serLayer` e ausência de campos padrão no arquivo), geometria
do lote de fotos (2/3/4/5 imagens, sem sobreposição, proporção respeitada),
aviso de resolução, navegação por Enter nas tabelas, linha nova na produção,
as máscaras de CPF/CNPJ/telefone/CEP, “voltar ao original”, o botão de ajuda do
estúdio, a sincronização do botão 🗂 com a lista de camadas e as ferramentas
fora do PNG exportado.
A suíte inteira (`npm test`) continua passando, incluindo o teste estático que
proíbe regra de tema escuro dentro da folha.

---

## V9.0.0 — limpeza do repositório, identidade V9 e continuidade de dados (2026-10-27)

Pedido: *"tire todas as versões anteriores a v8, e agora vamos trabalhar na v9"*.

### 1. Uma versão só no repositório

| Antes | Agora |
|---|---|
| `VERSAO_5_0/`, `VERSAO_6_0/`, `VERSAO_7_0/`, `VERSAO_8_0/` | `VERSAO_9_0/` |

As pastas V5, V6 e V7 saíram inteiras (~24 MB, incluindo os ZIPs antigos). A V8
foi promovida a **V9** — o conteúdo dela é a base deste trabalho, nada de
reescrita. O histórico do que foi feito até aqui continua neste arquivo (seção
"Histórico herdado", abaixo) e a arquitetura atualizada está no `PLANO_V9.md`.

### 2. Identidade do produto

* Título, marca, tour, ajuda, manual, `manifest.webmanifest`, `limpar_cache`,
  `zerar_dados`, mensagens do servidor e README dizem **Vooalto V9**.
* `instalar_e_abrir_V8.bat` → `instalar_e_abrir_V9.bat`;
  `build_v8_pwa.py` → `build_v9_pwa.py`;
  `VOOALTO_V8_PWA.zip` → `VOOALTO_V9_PWA.zip` (gerado pelo build).
* Health check e service worker: `app: 'vooalto-v9'`, cache
  `vooalto-v9-<hash>` (antes `vooalto-v8-`).
* `server.js` respondia `version: '7.6.1'` e `server.py` respondia `8.0.0` —
  agora os dois respondem **`9.0.0`**, igual ao `package.json`.
* Tema: `assets/tema-v8.css` → `assets/tema-v9.css`, variáveis `--v8-*` →
  `--v9-*` (só CSS interno; nenhum dado salvo usava esses nomes).

### 3. Continuidade de dados (o ponto crítico desta versão)

A V9 **mantém o endereço `http://localhost:4800/`** e **não renomeia nenhuma
chave de dado**. Consequência prática: quem estava na V8 atualiza a pasta e
continua exatamente de onde parou — fichas salvas, rascunho em edição, rascunho
anterior, orçamentos, clientes, contador de número e o atalho/PWA instalado.

* Formato de arquivo: a V9 **grava** `vooalto_backup_v9` / `vooalto_orcamento_v9`
  e **lê** os dois mais os antigos `_v8` e `_v7`. Backup da V8 importa sem
  conversão manual.
* Service worker: como a origem é a mesma, o `activate` da V9 recolhe também o
  cache deixado pela V8 (`LEGACY_CACHE_PREFIXES = ['vooalto-v8-']`), sem tocar
  em nenhum outro aplicativo.
* Servidor: se a porta 4800 estiver com **outra versão** do Vooalto (a V8
  antiga, por exemplo), a mensagem agora diz isso e manda fechar a janela
  antiga — antes caía no genérico "porta ocupada por outro processo".

### 4. O que continua com nome `v8` (e por quê)

Identificadores internos e chaves de armazenamento seguem como estavam:
`v8TemaValido`, `v8SalvarFicha`, `v8FichaAtualId`, `v8MedSync`, `#v8FichasList`,
`#tourV8`, `vooalto_v8_rascunho_meta`, `vooalto_v8_rascunho_anterior`,
`vooalto_ultimo_backup_v8`, `vooalto_v7_ficha_ativa`, banco
`vooalto_ficha_rascunhos_db_v4`. Motivo: são ~450 referências cruzadas e, no caso
das chaves, é literalmente onde o dado do usuário está guardado. A lista completa
está na seção 11 do `PLANO_V9.md`.

### 5. Testes

* Suíte renomeada (`tests/test_*_v9.js`, `test_build_v9.py`, `test_server_v9.py`)
  e ajustada para a identidade nova (health `9.0.0`, cache `vooalto-v9-`,
  `tema-v9.css`, prefixo legado no `activate`).
* `npm test` e `npm run test:python` passando; `npm run build` gera o `sw.js` e
  o `VOOALTO_V9_PWA.zip`.

---

## Histórico herdado

O que está abaixo é o registro da V8 — as correções descritas continuam valendo
na V9, o código é o mesmo.

## V8.3.0 — visibilidade dos tamanhos na Ficha Técnica e sistema completo de backup com rascunhos (2026-10-22)

### 1. Causa raiz e correção definitiva dos tamanhos "apagados em branco" na Ficha Técnica

Ao ativar `html[data-theme="escuro"] { color-scheme: dark }` em `assets/tema-v8.css`, os demais `<input>` da folha (`.field`, `.fin-inp`, `.sep-inp`) possuíam `color: var(--tx)` explícito, **mas `.med-inp` (as 24 caixas de medidas `PP` a `EXG` de Feminino e Masculino), `.cor-inp` e `.sep-fs-inp` não declaravam `color:`**. No Chrome/Edge, `<input>` usa a cor de sistema `FieldText`/`CanvasText`, que no esquema `dark` vira **`#FFFFFF` (branco puro) sobre o fundo branco `#FFFFFF`/`#FAFCFF` da folha A4** — deixando todos os números de tamanhos invisíveis na tela e na exportação.

* **Blindagem CSS de tinta e papel (`criador_ficha_tecnica/index.html` e `criador_orcamento/index.html`)**:
  * `.folha`, `.folha-branca` e `.page` agora fixam `color` escuro e `color-scheme: light`, além de `color-scheme: light !important` em `@media print`.
  * `.med-inp`, `.cor-inp`, `.sep-fs-inp` e `.gi` declaram explicitamente `color: var(--tx)`, `-webkit-text-fill-color: var(--tx)`, `caret-color: var(--tx)` e `color-scheme: light` (com `.gi.v` preservando branco sobre azul marinho `var(--az)`).
  * Controles flutuantes e modais ajustados para contraste nítido nos dois temas (`.rb-size`, `.arr-tb`, `.text-tb .v4-tb-color`, `.orc-a4-page-actions`, `.formatting-toolbar` e títulos dos modais do Orçamento).
* **Autorrecuperação ao abrir rascunhos (`restaurarDeJSON`)**:
  * Se a ficha anterior removeu `#folha1` (`_folha1Removida: true`), abrir outra ficha recria automaticamente a Página 1 completa.
  * Se um rascunho antigo gravou `_medFem` ou `_medMasc` inteiramente vazios por acidente, os 24 tamanhos padrão de fábrica são restaurados automaticamente.

### 2. Sistema completo de Backup (Importar e Exportar com todos os rascunhos)

* **Central de Backup Completo (`💾 Backup` no topo de `index.html` → `#backupModal`)**:
  * Mostra em tempo real a contagem de fichas salvas em **Minhas fichas**, rascunhos em andamento na Ficha Técnica, rascunhos e proposta ativa no Orçamento e clientes salvos.
  * **Exportar backup completo (`.json`)**: consolida em um único arquivo todas as fichas do IndexedDB (incluindo fotos/artes base64 e resgatando eventuais registros órfãos), o rascunho atual e o rascunho anterior da Ficha Técnica, todos os rascunhos e a proposta ativa do Orçamento, clientes, contadores e preferências.
  * **Importar backup (`.json`)**: inspeciona o arquivo antes de aplicar e permite escolher entre **Mesclar** (padrão seguro: mantém tudo o que já existe no navegador e salva automaticamente rascunhos abertos não salvos como `"Rascunho recuperado — ..."`) ou **Substituir tudo** (restauração 1:1). Compatível com `vooalto_backup_v9`, backups legados do catálogo V7 (`vooalto_catalog_v7`) e arquivos `.json` individuais de Ficha ou Orçamento.
* **Atalhos integrados em todos os módulos**:
  * **Ficha Técnica**: botões **Exportar tudo (com rascunhos)**, **Importar backup (.json)** e **Exportar só esta ficha** em **Minhas fichas**, além do botão **💾 Backup** no cartão **Rascunho**.
  * **Orçamento**: botão **💾 Exportar tudo (com rascunhos)** na barra lateral e botões **📤 Exportar todos (.json)** / **📥 Importar (.json)** dentro de **📁 Rascunhos de Orçamentos**.
  * **Zerar dados (`zerar_dados.html`)**: botão **📤 Baixar backup completo (.json)** antes da confirmação de limpeza.

---

## V8.2.0 — medidas das camisetas: auditoria V5→V8 e sincronização (2026-10-20)

Pedido: *"as medidas das camisetas sumiram da ficha técnica. pesquise como estava
nos últimos branchs e atualize a versão v8."*

### A pesquisa (o que foi conferido)

A tabela de medidas (**Feminino (baby look)** e **Masculino**, colunas
`Tam. / Larg. / Comp.`, 6 tamanhos por bloco, 12 valores cada) foi procurada
arquivo por arquivo, branch por branch:

| Onde | Situação |
|---|---|
| `VERSAO_5_0/…/criador_ficha_tecnica/index.html` | presente (24 campos) |
| `VERSAO_6_0/…/criador_ficha_tecnica/index.html` | presente (24 campos) |
| `VERSAO_7_0/…/criador_ficha_tecnica/index.html` | presente (24 campos) |
| branches `arena/…` dos PRs **#1 a #11** (V6.1 → V7.6.1) | presente em todos |
| `VERSAO_8_0/…/criador_ficha_tecnica/index.html` (PR #12, V8.0.0–V8.1.1) | **presente (24 campos)** |

Também foi comparado o *HTML da folha 1* da V7 com o da V8: **é idêntico**
(as únicas diferenças da folha são títulos de botões e o rodapé "V6"). Os
valores de fábrica (42/54 … 60/76) são os mesmos desde a V5.

Verificado no navegador (Chromium headless) sobre a V8 atual:

* a tabela aparece na coluna da esquerda, abaixo de **Tipo de tecido**;
* sai no **PDF** (impressão A4) e no **PNG** exportado, com os valores digitados;
* **"Nova ficha"** devolve a receita de fábrica (V8.0.3);
* o **preenchimento rápido** (etapa 5) abre com as 24 caixas preenchidas e
  aplica o que for digitado;
* salvar → "Nova ficha" → reabrir e recarregar a página **mantém** os valores
  (`_medFem` / `_medMasc` no `.json` e no IndexedDB).

Ou seja: a tabela não foi removida em nenhum momento. O que existia era um
**defeito de sincronização** que fazia a medida digitada "desaparecer" da ficha
impressa — é o que esta versão corrige.

### O bug corrigido — medida digitada valia só para a página 1

`copiarP1paraExtra()` e `v4AplicarMedidas()` já espelhavam as medidas nas
páginas 2, 3…, mas **digitar direto na folha 1 não disparava nada**: as caixas
`.med-inp` não tinham `oninput` e não havia listener delegado. Resultado: com
duas páginas abertas, a página 1 mostrava 43/55 e a página 2 continuava com
42/54 — **duas tabelas de medidas diferentes na mesma ficha**, e a página 2
parecia ter "perdido" a medida. O mesmo acontecia com uma ficha de 3 páginas
impressa em PDF.

**Correção:** `v8MedSync()` (novo, logo depois de `sincTodasPaginas`) copia as
24 caixas da folha 1 para as páginas extras, chamado por um listener delegado
de `input` no documento. Só a folha 1 é origem; a página extra continua cópia.
Vale também para as cópias criadas depois (ficha restaurada, `adicionarPagina`).

### Verificação

* `npm test` → **tudo verde** (as 3 verificações novas estão em
  `tests/test_ficha_v9.js`: página extra criada, medida do feminino espelhada,
  medida do masculino espelhada).
* Conferência no navegador de verdade (Chromium headless): PDF e PNG da folha 1
  com os valores digitados, e a página 2 acompanhando a folha 1 depois da
  correção.

## V8.1.1 — Tab de caixa em caixa no Orçamento (2026-10-19)

Na lista de itens, o <kbd>Tab</kbd> do navegador parava nos botões **⧉** e **✕**
de cada cartão. Para ir do "Valor Unitário" de um item até o "Modelo" do
seguinte eram **duas paradas** nos ícones **⧉** e **✕**. E na folha A4 o Tab
saía da célula em edição: o `onblur` da célula reconstrói a tabela, então o
foco morria junto com a célula antiga. Agora o Tab anda de **caixa em caixa**
na lista **e de célula em célula na folha**, e o <kbd>Shift</kbd>+<kbd>Tab</kbd>
faz o caminho de volta.

### O que mudou

- Novo `<script id="v8-orc-tab-js">` no `criador_orcamento/index.html`. Ele
  monta a lista das **caixas visíveis** do painel e da folha (input, textarea,
  select e `contenteditable`) e, no <kbd>Tab</kbd>, foca a próxima; no
  <kbd>Shift</kbd>+<kbd>Tab</kbd>, a anterior.
- **Só dentro do editor do Orçamento** (painel lateral + folha A4). Fora dele
  (botões, abas, resto do sistema) o Tab continua exatamente o do navegador.
- **Célula da folha** ganhou `data-v8-cell="página-linha-coluna"` e o Tab tira
  o foco **antes** de focar o destino: assim a célula nova não nasce e morre na
  mesma reconstrução. A tabela continua sendo reconstruída como antes — só o
  foco sobrevive a ela.
- **Modais de fora:** ⚙️ Configurações, Rascunhos, Assinatura e Ajuda seguem
  com Tab nativo, então botões e seletores continuam alcançáveis.
- **Datas/horas de fora:** o navegador usa Tab para andar entre dia/mês/ano.
- **Sem prender o foco:** na última caixa o Tab não é bloqueado (vai para
  "➕ Adicionar Item"); na primeira, o Shift+Tab também não — ninguém fica
  preso no painel.
- **Caixas escondidas não entram**, e o Tab que sai de um botão não é
  interceptado.
- **Quantidade** e **Valor Unitário** selecionam o conteúdo ao receber o foco:
  digitar `5` substitui o `1`/`0` em vez de virar `15`.
- Ajuda do módulo (seção **Atalhos**) e `manual.html` §5 documentam o novo Tab.

### Testes

Verificações novas em `test_orc_v9.js` (a suíte foi de **36 para 57**):
sequência Tab dentro do cartão (Modelo → Tecido → Descrição → Qtd → Valor →
Modelo do item seguinte), volta com Shift+Tab, pontas sem `preventDefault`,
botão do painel sem interceptação, Ctrl+Tab intacto, modal sem interceptação,
Tab de célula em célula na folha **sobrevivendo à reconstrução da tabela**
(inclusive na virada de página) e ajuda documentando as teclas.

**Total: 303 verificações JS + 3 grupos de infraestrutura + 7 testes Python,
todos verdes.**

## V8.1.0 — atalhos, tema único e rascunho visível (2026-10-19)

Três pedidos que estavam em aberto desde a V8.0.0: **atalhos de teclado nos dois
módulos**, **temas parecidos de verdade** e um **rascunho de ficha visível**.
No caminho, o tema escuro da Ficha foi auditado regra por regra.

### Tema: uma paleta só para os três lugares

Entrou **`assets/tema-v8.css`**, carregado pelo shell, pela Ficha e pelo
Orçamento: uma base única de tokens (`--v8-*`) com **claro** e **escuro**. Cada
módulo passou a apontar os seus nomes antigos (`--sb-*`, a paleta do Orçamento)
para esses tokens, em vez de ter cores próprias.

| Antes | Agora |
|---|---|
| Barra lateral da Ficha **sempre escura** (`#101319`) | `--v8-surface`: clara no claro, escura no escuro |
| Orçamento com paleta fixa `#0F172A / #1E293B / #38BDF8` que **nunca trocava** | segue o tema, com os mesmos tokens da Ficha |
| Ficha **piscava clara** antes de escurecer (só o shell tinha boot anti-flash) | Ficha e Orçamento também aplicam o tema **antes do primeiro paint** |

**Papel não é tema.** `--v8-paper` é `#fff` nos dois temas: a folha A4 da Ficha
continua branca e a do Orçamento continua creme (`#F3F0E7`), senão a ficha
impressa sairia cinza. Nenhuma regra de tema toca em `.folha`, `.folha-branca`
ou `.page`.

### Bugs do tema escuro corrigidos

A auditoria (todas as regras de `<style>` cruzam fundo claro fixo × ausência de
override) achou 52 seletores, dos quais estes eram bugs reais:

- **barra de texto flutuante ficava branca no escuro** — `background:#fff!important`
  ganhava das regras de tema (o `!important` do CSS vence especificidade);
- ajuda da Ficha, caixa de sugestões de cliente, modal de revincular imagens,
  modal do preenchimento rápido, painel de camadas, barra de ferramentas da
  página, faixa de miniaturas, barra de formatação — todos com fundo branco fixo;
- **linha selecionada no painel de camadas** (`#DBEAFE`) e item "pendente" do
  revincular (`#FFFBEB`) — texto claro em fundo pastel, ilegível;
- toast, selo "Salvo", chips de erro e o rodapé da ajuda;
- sombra da barra lateral (`rgba(0,0,0,.35)`) pesada no tema claro.

### Atalhos de teclado

**Ficha Técnica**

| Atalho | O que faz |
|---|---|
| `Ctrl+Z` / `Ctrl+Y` ou `Ctrl+Shift+Z` | desfaz / refaz |
| `Ctrl+C` / `Ctrl+X` | copia / recorta a camada selecionada (imagem, texto, seta, forma) |
| `Ctrl+V` | cola na página ativa, 3% deslocado e com **id novo** (pode colar várias vezes) |
| `Ctrl+V` (texto de fora) | texto do clipboard vira uma caixa de texto na folha |
| `Delete` | apaga a camada selecionada |

**Correção de comportamento:** antes, `Ctrl+Z` com o cursor dentro de um campo
desfazia a **folha** em vez de desfazer a palavra digitada — dava para apagar
trabalho sem entender por quê. Agora, com o foco num `input`, `textarea` ou
texto editável, os atalhos são os do campo.

**Orçamento** (não tinha nenhum atalho):

| Atalho | O que faz |
|---|---|
| `Ctrl+Z` / `Ctrl+Y` ou `Ctrl+Shift+Z` | desfaz / refaz (histórico de 40 passos, por estado do documento) |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | copia / recorta / cola o **item** selecionado |
| `Delete` | apaga o item selecionado |
| `Esc` | solta a seleção |

O item é selecionado clicando no cartão (no número `#N` ou no espaço vazio entre
os campos) e ganha contorno rosa. Dentro de um campo com trecho selecionado,
`Ctrl+C`/`Ctrl+V` continuam copiando texto.

### Rascunho de ficha visível

O autosave existia desde a V7, mas era invisível: uma linha "Salvo 14:32" no
fundo de "Minhas fichas". A barra lateral da Ficha ganhou uma seção **Rascunho**:

- mostra **se** há rascunho, **quando** foi guardado e **se** tem conteúdo;
- **Restaurar** devolve o rascunho (confirma antes de substituir uma ficha com
  conteúdo);
- **Descartar** apaga o rascunho guardado sem mexer na ficha aberta;
- ao clicar em **Nova ficha**, a ficha que estava na tela é guardada como
  **rascunho anterior** — se limpou por engano, "Restaurar" traz de volta.

Chaves: `vooalto_v7_ficha_ativa` (a mesma da V7, para nada se perder),
`vooalto_v8_rascunho_anterior` e `vooalto_v8_rascunho_meta`.

### Testes

**282 verificações em 9 suítes JS + 2 suítes de infraestrutura + 7 testes
Python, todos verdes.** Suítes rodadas uma a uma:

| Suíte | Antes | Agora |
|---|---|---|
| shell | 34 | 34 |
| ficha | 37 | **54** |
| minhas fichas | 28 | 28 |
| orçamento | 22 | **36** |
| orçamento (features) | 34 | 34 |
| canva | 18 | 18 |
| UX | 33 | 33 |
| temas | 22 | **30** |
| perf | 15 | 15 |
| pwa_infra / server | 26 asserts | 26 asserts |

As duas verificações de `test_temas_v9.js` que **exigiam** o Orçamento fora do
tema (`!data-theme`, "sem regras de tema") foram reescritas: elas codificavam a
decisão antiga e agora o requisito é o contrário.

O histórico do Orçamento pegou um bug de verdade durante os testes: o snapshot
guardava **referência** ao array `tableItems`, então a edição seguinte alterava
o retrato no histórico e o desfazer não tinha o que devolver. Corrigido com
cópia profunda no restore.

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
* Teste novo `tests/test_minhas_fichas_v9.js` (24 verificações) roda contra um
  IndexedDB de mentira e prova: rascunho antigo aparece e **os dados continuam
  no mesmo lugar**; salvar de novo **não duplica**; abrir/renomear/excluir
  funcionam; índice cheio **avisa** em vez de fingir; banco cheio **devolve
  false** (o "Nova ficha" depende disso para não limpar a tela).
* `tests/test_shell_v9.js` (34 verificações): 2 abas, ficha em tela cheia, sem
  popup, sem Catalogação, orçamento carregado sob demanda, tema nos dois
  sentidos **sem eco** para quem enviou, `Esc` fecha ajuda e tour.
* `tests/test_server_v9.js` e `test_server_v9.py` agora exigem **404** em
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
O `sw.js` foi regerado (`vooalto-v9-5dbaa07c7e8a`) e o pacote também.

## V8.0.2 — "Nova ficha" limpava só a página 1 · preenchimento rápido incompleto (2026-10-19)

### 1. "Nova ficha" com várias páginas só limpava a primeira

**Sintoma:** com 3 páginas abertas, clicar em **Nova ficha** deixava as páginas
2 e 3 intactas — com o cliente, os modelos e a grade da ficha anterior.

**Causa:** `limparParaNovaFicha()` tentava fechar as páginas extras chamando
`fecharPaginaExtra()`:

```js
if (typeof fecharPaginaExtra === 'function') {   // sempre falso
  const extras = [...document.querySelectorAll('[id^="folha"]')]...
  extras.forEach(el => fecharPaginaExtra(el.id));
}
```

`fecharPaginaExtra` **nunca foi definida** — nem na V8, nem na V7, nem antes.
A guarda `typeof … === 'function'` era sempre falsa e o bloco inteiro nunca
rodou. O comentário "Limpa páginas extras que possam ter ficado abertas de
ficha anterior" descrevia uma intenção que o código não cumpria.

**Correção:** `v8LimparPaginasExtras()` faz a limpeza de verdade e pelo estado
da aplicação, não só pelo DOM:

* remove `folha_*`, `label_*` e `canvasInput_*` das páginas 2, 3, 4…;
* zera `paginas`, `totalPaginas` e `v7PaginaAtiva`;
* refaz a numeração com `v7Renumerar()` (que recalcula o total a partir da
  ordem real do DOM) e redesenha o menu lateral e a faixa de miniaturas.

**Efeito colateral tratado:** agora que as páginas extras **são apagadas de
verdade**, uma ficha cujo trabalho estava só na página 2 seria considerada
"vazia" por `v8FichaTemConteudo()` e descartada sem oferecer para salvar. A
função passou a considerar **página extra = conteúdo**, então o fluxo salva
antes de limpar, como já fazia com cliente/modelo/imagem.

### 2. Preenchimento rápido com metade das caixas

O painel tinha **9 campos**; a ficha tem **16** mais grade, cores e medidas.
Faltavam justamente os que dão trabalho para digitar:

| Entrou no painel | Onde vai |
|---|---|
| CPF / CNPJ | `dc_doc` |
| Endereço | `dc_end` |
| Cidade | `dc_cidade` |
| CEP | `dc_cep` |
| Data de emissão | `fichaData` |
| Nº da ficha | `fichaNum` (+ espelha nas páginas extras) |
| **Cores do tecido** (cor + nome, quantas quiser) | `coresList` |
| **Medidas** — largura × comprimento de PP a 3G, feminino e masculino (24 campos) | `.med-bloco` da folha 1 |

Cada bloco novo abre **preenchido com o que já está na ficha**, então o painel
serve tanto para começar do zero quanto para corrigir uma ficha pronta.
Regra mantida: **campo em branco não mexe** no que já está lá.

Cores e medidas são espelhadas nas páginas extras, do mesmo jeito que
`copiarP1paraExtra()` faz quando uma página é criada — sem isso, as páginas
2, 3… continuariam com a paleta e as medidas velhas.

Também foram atualizados o **manual** (seções "Ajustes", "Minhas fichas",
rodapé, selo de autosave e o texto do "Nova ficha") e o tooltip do botão.

### Verificação

* `npm test` → **239 verificações, 0 falhas**.
* Testes novos em `tests/test_ficha_v9.js`:
  * cria 2 páginas extras, chama `limparParaNovaFicha()` e exige
    `paginas.length === 0`, `totalPaginas === 1`, **1 folha**, **0 brancas**,
    **0 grupos no menu** e **0 inputs órfãos**;
  * `v8FichaTemConteudo()` verdadeiro só por ter página extra;
  * os 12 campos de cliente/pedido existem no painel;
  * 24 campos de medida e o painel de cores existem;
  * aplicar grava CPF/endereço/cidade/CEP, a cor (hex + nome) e as medidas.
* `tests/test_ux_v9.js`: o teste do `Enter` passou a conferir a **regra**
  ("vai para o campo seguinte") em vez de um id fixo — ele quebrava a cada
  campo novo acrescentado, que é exatamente o que aconteceu aqui.

## V8.0.3 — auditoria: 11 suítes rodadas uma a uma (2026-10-19)

Pedido: *"rode testes um atrás do outro até ter certeza de que está tudo certo."*
Cada suíte foi executada isoladamente, conferindo a saída e o código de saída —
não só o `npm test` final.

| # | Suíte | Resultado |
|---|---|---|
| 1 | `test_shell_v8` | 34 OK · 0 falhas |
| 2 | `test_ficha_v8` | **37 OK** · 0 falhas |
| 3 | `test_minhas_fichas_v8` | 28 OK · 0 falhas |
| 4 | `test_orc_v8` | 22 OK · 0 falhas |
| 5 | `test_orc_features_v8` | 34 OK · 0 falhas |
| 6 | `test_canva_v8` | 18 OK · 0 falhas |
| 7 | `test_ux_v8` | 33 OK · 0 falhas |
| 8 | `test_temas_v8` | 22 OK · 0 falhas |
| 9 | `test_pwa_infra_v8` | 26 asserções · 3 grupos OK |
| 10 | `test_server_v8` | 26 asserções · OK |
| 11 | `test_perf_v8` | 15 OK · 0 falhas |
| — | Python (`test_build_v8`, `test_server_v8`) | **7 testes OK** |

**Total: 243 verificações JS + 7 Python, tudo verde.** `npm test` sai com 0.

### Auditorias que as suítes não fazem

Verificados por script à parte, nos três HTML:

* **IDs duplicados** — nenhum.
* **`onclick`/`oninput` chamando função inexistente** — nenhum.
* **`<use href="#i-…">` sem símbolo correspondente** — nenhum.
* **`src`/`href` apontando para arquivo que não existe** — nenhum.
* **Precache do `sw.js` × disco** — 23 itens, todos existem.
* **Zip do PWA** — 27 arquivos, sem `__pycache__`/`node_modules`.

### Corrigido nesta rodada

1. **`tests/_render_tmp.js`** — script de depuração meu, commitado por engano.
   Removido do repositório.
2. **"Nova ficha" prendia o usuário quando o salvamento falhava.** `v8NovaFicha`
   fazia `if(!ok) return` — e `ok` é `false` quando o IndexedDB recusa (memória
   cheia). Resultado: o botão "Nova ficha" ficava **sem efeito para sempre** e a
   única saída era limpar os dados na mão. Agora, quando o salvamento falha,
   aparece uma segunda pergunta explícita — *"começa a nova MESMO ASSIM, o que
   está na tela será perdido"* — com a recomendação de exportar o backup antes.
3. **As medidas (largura × comprimento) sobreviviam ao "Nova ficha".** A ficha
   nova herdava a tabela de medidas da anterior — numa ficha de outro cliente
   isso é erro de produção. Agora `limparParaNovaFicha` devolve a **receita de
   fábrica**. A receita é capturada por um `<script>` logo depois de a folha 1
   existir e **antes de qualquer script do app rodar**, portanto fica imune a
   restaurações de autosave. Para trocar a tabela padrão da fábrica, basta
   editar os `value=""` dos `<input class="med-inp">` da folha 1.
4. **Textos de ajuda desatualizados** depois da reforma do menu: a ajuda da
   ficha, a ajuda do shell e o tour ainda diziam "💾 Salvar ficha", "✨ Nova
   ficha", "💾 Salvo HH:MM" e "Configurações" (agora **Ajustes**), e mandavam
   usar "✕ Remover" (agora é só o ✕ ao lado do número da página).
5. **`toggleLogoProp()`** — código morto: ninguém chamava, o botão `#logoPropBtn`
   não existe no HTML e `logoSt.prop` não era lido em lugar nenhum. Se alguém a
   chamasse, dava `TypeError`. Removida.
6. **`test_orc_v9.js`** era a única suíte que terminava sem dizer nada (só
   `process.exit`). Agora imprime o resumo como as outras — antes, "sem saída"
   e "passou" eram indistinguíveis na leitura do log.

### Cenários de borda testados à mão (jsdom)

| Cenário | Resultado |
|---|---|
| Ficha com 2 páginas extras → Nova ficha | 0 extras, 1 folha, menu limpo, sem inputs órfãos |
| Página 1 excluída + página extra → Nova ficha | folha 1 volta do template, 0 extras |
| Adicionar página logo depois de Nova ficha | numeração recomeça em 2, `totalPaginas` correto |
| Ctrl+Z depois de Nova ficha | não ressuscita a ficha anterior |
| Orçamento: `novoOrcamento()` com 3 páginas | 1 página no array **e** no DOM |
| Receita das medidas com ficha salva carregada | não é contaminada (42, não 77) |
