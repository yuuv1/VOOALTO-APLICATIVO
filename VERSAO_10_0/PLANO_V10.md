# VOOALTO V10 — Plano do sistema

Documento de arquitetura da V10. Descreve o sistema **como ele é agora**, para
que a próxima mudança comece daqui em vez de reconstruir o entendimento.

A V10 é a **única versão do app**: as pastas `VERSAO_5_0` … `VERSAO_9_0` foram
removidas do repositório. O que as versões anteriores faziam e a V10 herdou está
no `CHANGELOG_V10.md`.

O motor de contratos continua vivendo como **projeto próprio** em
`documento-contratual/` (React + TypeScript + Vite, com `npm test` e
`npm run build` dele). A V10 embarca uma **cópia do artefato autônomo** gerado
por aquele projeto — a cópia é feita por `tools/atualizar_contrato.py`, nunca à
mão (ver §13).

---

## 1. O que o sistema é

Quatro ferramentas de produção de documento, rodando **inteiramente no
navegador**:

| Módulo | Pasta | Produz |
|---|---|---|
| 📋 Ficha Técnica | `criador_ficha_tecnica/` | folha(s) A4 de produção, em PDF/PNG |
| 💰 Orçamento | `criador_orcamento/` | proposta de venda A4, em PDF/PNG |
| 🧾 Recibo **(teste)** | `criador_recibo/` | recibo de pagamento A4 (total/parcial), em PDF/PNG |
| 📄 Contrato | `criador_contrato/` | documento contratual em .docx e .pdf (A4) |

Nada é enviado para a internet. O servidor local serve arquivos estáticos e
mais nada — não há API, não há banco no servidor. O módulo de contrato faz
leitura de PDF/OCR **no próprio navegador** (Web Workers + WebAssembly).

## 2. Estrutura

```
VERSAO_10_0/
  build_v10_pwa.py             gera sw.js + VOOALTO_V10_PWA.zip
  tests/                      suíte automatizada (jsdom + unittest)
  tools/servir_preview.py     servidor de preview (0.0.0.0)
  tools/atualizar_contrato.py copia o motor de contratos e corrige o cache

ATUALIZACAO_V10/               ← é esta pasta que recebe o serviço
  index.html                  shell: barra do topo + 4 iframes em tela cheia
  criador_ficha_tecnica/      módulo 1
  criador_orcamento/          módulo 2
  criador_recibo/             módulo 3 — recibo de pagamento (versão de teste)
  criador_contrato/           módulo 4 (artefato autônomo do projeto
                              documento-contratual/, copiado e corrigido)
  manual.html                 manual completo (abre pelo ? Ajuda)
  limpar_cache.html           apaga só o cache do service worker
  zerar_dados.html            apaga os dados (duas confirmações)
  manifest.webmanifest        identidade PWA
  sw.js                       GERADO por build_v10_pwa.py
  server.js / server.py       servidor local (Node ou Python), 127.0.0.1:4800
  instalar_e_abrir_V10.bat     inicializador Windows
  assets/  icons/             bibliotecas locais, fontes, logos, ícones
```

O shell é fino de propósito: navegação, tema, instalação e nada de regra de
negócio. Cada módulo é um documento HTML autossuficiente e funciona aberto
direto, sem o shell.

### Por que iframe e não uma SPA

A Ficha e o Orçamento têm ~5.000 linhas de JS próprio cada, com
`document.getElementById` direto, `contenteditable` e um motor de camadas. O
Contrato já é um app React/TypeScript compilado por outro projeto: transformá-lo
em componente do shell significaria acoplar duas bases com builds diferentes.
Unificar tudo num só documento significaria reescrever os três. O iframe isola CSS/JS, permite recarregar um
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
| `vooalto-abrir-backup` | módulo → shell | abre a Central de Backup |
| `vooalto-abrir-recibo` | Ficha → shell | abre a aba Recibo e guarda a ficha na fila |
| `vooalto-recibo-pronto` | Recibo → shell | o módulo carregou; o shell entrega a ficha que estava na fila |
| `vooalto-carregar-ficha` | shell → Recibo | aplica a ficha (cliente, itens, valores) no recibo |

O **Contrato não participa** desse contrato: é um app fechado, embarcado por
`<iframe>` e carregado sob demanda. Ele recebe `vooalto-theme` e simplesmente
ignora (tem paleta própria); não manda mensagem nenhuma. Isso é intencional —
não existe estado de negócio compartilhado entre ele e os outros dois módulos.

Não há mais nenhuma mensagem de negócio entre módulos: a V7 tinha quatro
(`ficha-to-catalog`, `ficha-edit`, `ficha-updated`, `counts`) e todas serviam à
Catalogação.

## 4. Onde os dados ficam

Três camadas, do mais frágil ao mais durável:

As chaves **não mudaram de nome na V10** (inclusive as que carregam `v8`/`v7`).
Renomear chave é perder dado: quem atualiza da V8/V9 abre a V10 no mesmo
endereço (`http://localhost:4800/`) e encontra tudo como deixou.

| Camada | Meio | Chave | Conteúdo |
|---|---|---|---|
| Rascunho vivo | `localStorage` | `vooalto_v7_ficha_ativa` | a ficha em edição (a chave **não** foi renomeada: é o que faz a ficha da V7 continuar abrindo) |
| Rascunho vivo | `localStorage` | `vooalto_orcamento_autosave` | o orçamento em edição |
| Minhas fichas | **IndexedDB** `vooalto_ficha_rascunhos_db_v4` / store `drafts` | id → dados completos | fichas salvas pelo usuário |
| Índice de Minhas fichas | `localStorage` | `vooalto_ficha_rascunhos_v4_meta` | `[{id,name,date,num}]` — só o que a lista mostra |
| Preferências | `localStorage` | `vooalto_tema`, `vooalto_tour_v8`, `va3_*`, `va4_*` | tema, tour, nº da próxima ficha, cores, posição das barras |
| Rascunhos da Ficha | `localStorage` | `vooalto_v8_rascunho_meta`, `vooalto_v8_rascunho_anterior` | o "anterior" para restaurar e o índice do cartão de rascunho |
| Último backup | `localStorage` | `vooalto_ultimo_backup_v8` | data do último backup exportado (a V10 lê a mesma) |
| Estado do Contrato | `localStorage` | `vooalto_contrato_state_v2` | dados do último contrato montado (chave do **próprio** motor; entra no backup e na mesclagem) |
| Credencial (não exportada) | `localStorage` | `vooalto_gemini_api_key_v1` | chave opcional da leitura por IA do Contrato — fica em `SKIP_KEYS`: **nunca** entra no `.json` de backup |
| Recibos salvos | `localStorage` | `vooalto_recibos_v1` | lista de recibos (cliente, ficha, itens, valores, saldo) — é o que alimenta o “já recebido” |
| Recibo: numeração | `localStorage` | `vooalto_recibo_numero_v1` | último número emitido (avança ao salvar) |
| Recibo: rascunho | `localStorage` | `vooalto_recibo_autosave_v1` | o recibo em edição |
| Recibo: cabeçalho | `localStorage` | `vooalto_recibo_empresa_v1` | telefone, CNPJ e endereço que saem na folha |

**Por que os dados no IndexedDB e o índice no localStorage:** os dados têm
imagens em base64 e estouram a cota do `localStorage` (≈5 MB) com poucas
fichas. O índice cabe em alguns KB e pode ser lido de forma síncrona para
desenhar a lista na hora.

**Regra que isso impõe:** se o índice falhar, a ficha existe mas não aparece.
Por isso o salvamento trata esse caso separadamente e avisa (item 4 das
correções no `CHANGELOG_V10.md`).

A **única cópia que sai do navegador** é o `.json` exportado.

## 5. Temas

Dois, e só dois: **Escuro** (padrão desde a V9.3) e **Claro**.

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

`build_v10_pwa.py` calcula um hash do conteúdo dos arquivos do app e grava
`sw.js` com `CACHE = 'vooalto-v10-<hash>'`. Mudou qualquer arquivo do app → muda
o hash → o service worker novo substitui o cache antigo no `activate`.

Detalhes que não podem ser perdidos:

- `sw.js` **não entra** no próprio hash (senão cada build geraria um hash novo
  mesmo sem mudança nenhuma).
- `server.js`, `server.py`, `.bat` e `README.txt` também ficam fora: são
  distribuição, não app instalado.
- O `activate` apaga caches com o prefixo `vooalto-v10-` **e** os da V9/V8
  (`LEGACY_CACHE_PREFIXES = ['vooalto-v9-', 'vooalto-v8-']`): todas usam o mesmo
  endereço, então a troca precisa recolher o cache antigo. Nunca toca em cache
  de outro aplicativo na mesma origem.
- **Precache em duas fases.** O bundle do Contrato tem ~10 MB. `cache.addAll()`
  é atômico: se ele estivesse no precache obrigatório e falhasse, a instalação
  inteira do service worker cairia e o app ficaria sem offline. Arquivos acima
  de `LIMITE_PESADO` (2 MB) vão para `PRECACHE_PESADOS` e entram no cache um a
  um, depois do precache obrigatório (`cache.add().catch()`). Se falharem, o
  `fetch` do próprio service worker cacheia na primeira visita.
- O cache é `cache-first` só para a **mesma origem**; dados do usuário nunca
  passam pelo service worker.

## 7. Servidor local

- `server.js` (preferido) e `server.py` (reserva) servem a pasta em
  **`127.0.0.1:4800`** — de propósito só aceita conexão do próprio computador.
- Recusa `Host` que não seja `localhost`/`127.0.0.1`/`::1` (DNS rebinding).
- Resolve o caminho **dentro** da pasta: `..` e `%00` dão 404/400.
- Só `GET`/`HEAD`; o resto dá 405.
- `/__vooalto_health` responde `{app: 'vooalto-v10', version: '9.1.2'}` (lido de
  `version.json`, a fonte única do número) — é o
  que permite ao `.bat` saber se já existe um Vooalto rodando naquela porta em
  vez de abrir uma página errada. Se quem estiver na porta for **outra versão**
  (`app` começando com `vooalto-v`), o servidor diz isso e manda fechar a janela
  antiga, em vez de acusar "porta ocupada por outro processo".

`tools/servir_preview.py` é **outra coisa**: serve em `0.0.0.0` para preview em
navegador, com `Cache-Control: no-store`. Não é o servidor do app.

## 8. Testes

```
npm install
npm test              # 23 suítes jsdom (shell, módulos, recibo, mockup, peça,
                      # contrato, espelho da folha 1, melhorias)
npm run test:python   # 15 testes (build + contrato + identidade + servidor)
npm run build         # gera sw.js e o ZIP
```

No CI (`.github/workflows/ci.yml`, Ubuntu + Windows) cada suíte roda **isolada**
e, quando falha, publica uma anotação com o nome do arquivo — o log cru do
runner fica num blob assinado que nem sempre dá para baixar. O mesmo job
regenera o `sw.js` e compara com o commitado; para isso o arquivo é
**reproduzível** (sem carimbo de data/hora no cabeçalho) e o repositório fixa
LF em todo o texto via `.gitattributes` — com CRLF no checkout do Windows o
hash mudaria sem nenhuma alteração real.

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

## 11. Nomes herdados das versões anteriores (de propósito)

A V10 renomeia tudo o que o usuário vê — pasta, título, PWA, `.bat`, ZIP, rodapé
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

## 12. Diferenças da V10 em relação à V8/V9 (resumo técnico)

1. Repositório com uma versão só (`VERSAO_10_0`); nada de V5/V6/V7/V8.
2. Identidade: `app: 'vooalto-v10'` e a versão em **`version.json`**, lida
   pelos dois servidores (antes o número estava copiado em `server.js`,
   `server.py` e `package.json`; como o health check compara a versão exata,
   divergir fazia o `.bat` acusar "outra versão do Vooalto" na porta).
   PWA "Vooalto V10", cache `vooalto-v10-<hash>`.
3. **Mesmo endereço local** (`http://localhost:4800/`), para a atualização não
   perder dados nem o atalho instalado.
4. `activate` do service worker recolhe também o cache da V8.
5. Tema: arquivo `assets/tema-v10.css` e variáveis `--v10-*` (as `--v8-*` não
   existem mais; nada disso sai do navegador nem entra em dado salvo).
6. Porta ocupada por outra versão do Vooalto agora tem mensagem própria.

## 13. O módulo Contrato (V10)

`criador_contrato/` **não é escrito aqui**: é uma cópia do artefato autônomo
`documento-contratual/Abrir_Sistema_Vooalto.html` (10,2 MB, JavaScript, PDF.js,
Tesseract OCR e geradores .docx/.pdf embutidos). O projeto-fonte continua em
`documento-contratual/` (`web/`, testes próprios, `npm run build`).

A cópia é feita **sempre** por:

```bash
python3 tools/atualizar_contrato.py
```

### Por que um script (e não copiar o arquivo na mão)

O artefato original, no `<head>`, apaga **todos** os caches da origem menos o
dele:

```js
caches.keys().then(names => names.forEach(n => {
  if (n !== "vooalto-contratos-v3") caches.delete(n);   // <— apaga o Vooalto
}));
```

Isso é razoável quando ele é o único app da origem. Dentro do Vooalto (mesma
origem, mesma porta) ele apagaria o precache da V10 na primeira vez que a aba
Contrato abrisse — e o sistema perderia o modo offline. O script troca a linha
por uma versão que só mexe em `vooalto-contratos-*` e **falha** se o texto
original mudar (melhor falhar do que embarcar sem corrigir).

Decisões que precisam ser mantidas:

1. **Não embarcar o `sw.js` do motor de contratos.** Ele registraria um service
   worker com escopo `/criador_contrato/`, que passaria a controlar aquela
   página e deixaria de usar o precache da V10 (o app de contrato ficaria sem
   offline). Sem o arquivo, o `register("./sw.js")` do bundle falha e é
   ignorado — quem serve a aba é o service worker da V10, com escopo `/`.
2. **Carregar sob demanda.** A aba só recebe `src` quando o usuário clica, e
   não volta a recarregar depois (o iframe fica vivo). São 10 MB: carregar
   junto com a Ficha dobraria o tempo de abertura.
3. **O Contrato não fala `postMessage`.** Ignora o tema e não manda mensagem.
   Qualquer integração de negócio futura (ex.: receber a ficha do módulo 1)
   teria de ser feita pelo `sdk.ts` do projeto dele, não por armazenamento
   compartilhado.
4. **Credencial não entra no backup.** `vooalto_gemini_api_key_v1` está em
   `SKIP_KEYS`: o `.json` de backup é enviado por e-mail/WhatsApp.
5. **Zerar dados inclui o contrato.** `vooalto_contrato_state_v2` cai no
   prefixo `vooalto_`, e o cache `vooalto-contratos-*` entra na lista de caches
   do Vooalto nos dois utilitários de limpeza.

Para atualizar o motor: rode o build no projeto dele, depois
`python3 tools/atualizar_contrato.py`, `npm run build` (regera `sw.js`/ZIP) e
`npm test` — o teste `tests/test_contrato_v10.js` confirma que a cópia está
corrigida.

## 13.1 O módulo Recibo (V10.6 — versão de teste)

Módulo novo e **somente leitura em relação aos outros**: ele lê a ficha e não
grava nada nas chaves da Ficha nem do Orçamento. Se aberto sozinho, funciona
igual (a lista de fichas aparece vazia sem IndexedDB e o usuário pode digitar
tudo à mão).

**Fluxo.** O shell abre a aba sob demanda e o módulo avisa `vooalto-recibo-pronto`.
A Ficha Técnica manda `vooalto-abrir-recibo` com a cópia de
`capturarFichaParaJSON()` + `meta {id, num, name}`; o shell troca de aba, guarda
a ficha numa **fila** e só entrega (`vooalto-carregar-ficha`) quando o módulo
avisa que carregou. Sem a fila, a primeira abertura perderia a ficha (o iframe
ainda não tinha `src`). A cópia enviada é **enxuta**: só cliente, `entradaVal`,
itens de `_prod`/`_paginas[].prod` e número — as camadas e imagens em base64 de
`capturarFichaParaJSON()` ficam de fora (seriam vários MB por postMessage).

**Parcelas.** `salvarENovo()` salva o recibo e já monta o próximo da mesma
ficha: mantém cliente/itens/total/desconto/forma, zera observação, avança o
número e sugere `base − jáRecebido` como valor. `novo()` grava na hora um
rascunho vazio, para a aba não reabrir o recibo anterior.

**De onde vêm os dados.**

| Origem | Como é lida |
|---|---|
| Ficha em edição | `localStorage` `vooalto_v7_ficha_ativa` (+ `vooalto_v8_rascunho_meta` para saber se está vazia) |
| Minhas fichas | índice `vooalto_ficha_rascunhos_v4_meta` para a lista; o registro só é lido do IndexedDB **na hora de carregar** (fichas com foto pesam) |
| `.json` | ficha avulsa (`_version` `vooalto_ficha_*`) ou backup completo (usa as `fichas[]` de dentro) |

Da ficha entram: `dc_nome`/`dc_doc`/`dc_tel`/`dc_end`/`dc_cidade`, `_numFicha`,
`entradaVal` e os itens de `_prod` **mais** os de `_paginas[].prod` (páginas
extras). O texto passa por `stripTags` — a ficha guarda HTML no `contenteditable`
e o recibo não pode imprimir tag.

**Conta do pagamento.** `calcular()` devolve
`base = total − desconto`, `saldo = base − jáRecebido − pago` e
`totalPagoFicha = jáRecebido + pago`.

- **Total** cobra `base − jáRecebido` (quitação), não o total cheio: com
  histórico, cobrar o total de novo duplicaria o valor.
- **Parcial** deixa o valor por conta do usuário e mostra o saldo.
- Qualquer valor digitado manda: se o valor do recibo ficar abaixo do total, o
  modo vira **Parcial** sozinho. O total da produção também aceita digitação
  (`totalManual`), com botão para voltar a somar os itens.
- `jáRecebido` é a soma dos recibos salvos com o mesmo `fichaNum`, excluindo o
  próprio recibo quando ele está sendo editado; pode ser corrigido à mão e
  recalculado.

**Numeração.** `proximoNumero()` = maior entre `vooalto_recibo_numero_v1` e os
números da lista, +1. Salvar sem número atribui esse valor. Salvar de novo
**atualiza** o registro aberto (mesmo `id`); número repetido pede confirmação.

**Folha.** Uma página A4 fixa (794×1120), papel branco nos dois temas, com
cabeçalho da empresa, faixa RECIBO/Nº, valor em números e **por extenso**,
parágrafo “Recebemos de…”, referência com a ficha, tabela de itens (limitada
para não invadir a assinatura), resumo financeiro, forma de pagamento, data,
assinatura e carimbo **QUITADO** quando o saldo é zero. Impressão vetorial pelo
navegador; PNG via `html2canvas`; zoom só da folha via `assets/zoom-folha.js`.
O valor por extenso é implementado no próprio módulo (sem dependência), com
teste para centavos, “cem”, milhares, milhões e bilhões.

**Backup.** As quatro chaves têm prefixo `vooalto_` e entram no arquivo do
Backup Completo. Na **mesclagem**, os três módulos que restauram backup (shell,
Ficha e Orçamento) fazem a união dos recibos por `id` e mantêm o maior número —
sem isso, mesclar um backup perderia os recibos locais.

**O que não fazer:** não gravar recibo dentro da ficha, não apagar recibos ao
“Nova ficha” e não usar `localStorage` para fotos (a regra do §10 continua).
Recibo salvo é documento: salvar de novo o mesmo recibo não pode criar outro
número (o teste cobre isso).

## 14. Ficha Técnica: a folha 1 é a configuração

A ficha é **uma** ficha com várias páginas. A `#folha1` guarda tudo o que é da
ficha (número, data, previsão, separador e tamanho, títulos das seções, aviso,
tipo de tecido, paleta de cores, grade de produção, medidas, produção e
entrada); as páginas `p2`, `p3`… são a mesma ficha com outra arte.

Regra para quem mexer aqui: **a página extra é cópia, nunca origem.** Quem lê
um dado compartilhado lê da folha 1; ninguém escreve configuração só na página
extra.

O espelho mora em um bloco só (`ESPELHO DA FOLHA 1`), com:

- `espelharCamposP1` — campos simples, `tipoTecido` (contenteditable) e o par
  `sepFontSize`/`sepFS`. O tamanho do separador vive em dois lugares (valor +
  estilo inline): copiar só um deixa o texto em 7px.
- `espelharCoresP1` — compara antes de reconstruir; reconstruir sempre criaria
  ids novos (`p2c1`…) e jogaria fora o foco de quem edita a cor na página 2.
- `espelharGradeP1`, `espelharMedidasP1`, `espelharProducaoP1` — produção
  atualiza linhas no lugar quando a quantidade não muda.
- `copiarP1paraExtra(p)` (na criação) e `sincronizarPaginasExtra()` (depois),
  ligados por delegação de `input`/`change` na folha 1 com 150 ms de debounce.

Cuidados que já custaram bug:

1. **Id de página não é número de página.** `proximoIdPagina()` pega o primeiro
   id livre: remover a página do meio e adicionar outra criava dois `folha_p3`,
   e todo `$('..._p3')` achava a página antiga (a nova virava fantasma).
2. **Depois de criar/remover, renumere** (`v7Renumerar`): total, rodapé
   "Página 1 de N", plaquinhas e ordem saem do DOM, não do contador.
3. **Todo campo novo é salvo, restaurado e espelhado.** O `sepFontSize` ficou de
   fora de `CAMPOS_INPUT`/`CAMPOS_INPUT_SAVE` e o tamanho do separador voltava
   para 7px a cada reabertura.
4. **Desfazer espelha.** `restState()` restaura a folha 1 e chama
   `sincronizarPaginasExtra()`; sem isso as extras ficavam no estado desfeito.
5. **A paleta é da ficha.** Apagar cor numa cópia apaga na folha 1 (por
   posição); senão o espelho a ressuscita e o botão parece quebrado.


---

## 15. Número da ficha: reserva na nuvem (V10.2)

O número deixou de ser contador local. É uma **reserva única**, guardada no
Supabase, que vale para todas as máquinas da produção.

| Peça | Onde |
|---|---|
| Tabelas e funções SQL | `supabase/migrations/20261103000100_vooalto_nuvem_numeros.sql` |
| Cliente do app | `ATUALIZACAO_V10/assets/nuvem.js` → `window.VooaltoNuvem` |
| Uso na ficha | bloco `numNuvem*` em `criador_ficha_tecnica/index.html` |
| Teste | `tests/test_nuvem_num_v10.js` (entra no `npm test`) |

### Regras

- a numeração **parte de 3388** (`NUVEM_BASE_NUMERO`) e só **anda para cima**;
- número **em uso** ou **em backup** de **outra máquina** é **recusado** — o app
  pede o próximo livre e avisa o usuário (nunca repete, nunca para o trabalho);
- reservar a mesma ficha de novo devolve o **mesmo** número (idempotente por
  `ficha_id`), então salvar/reabrir não queima número;
- sem internet a reserva é **local** e o lote sobe depois
  (`vooalto_registrar_lote`); o app nunca fica sem número;
- cada máquina tem um id próprio (`maq-…`) e um nome amigável, usados no aviso
  "está em uso em *Notebook da produção*".

### Funções (todas `SECURITY DEFINER`, `EXECUTE` para `anon`)

| Função | Para quê |
|---|---|
| `vooalto_reservar_numero(p_pedido, p_base, p_ficha, p_dispositivo…)` | reserva (ou sobe para o próximo livre) e devolve `{numero, ajustado, motivo, dono, status}` |
| `vooalto_proximo_livre(p_base)` | só consulta o próximo livre |
| `vooalto_verificar_numero(p_numero)` | diz se está ocupado, status e de quem |
| `vooalto_registrar_lote(p_numeros[], p_status…)` | sincroniza números reservados offline |
| `vooalto_registrar_dispositivo`, `vooalto_estado_nuvem`, … | identidade da máquina e diagnóstico |

As tabelas têm **RLS ligada e nenhuma política**: ninguém lê nem escreve
direto; só as funções. A chave que vai no app é a **publicável** — ela só
executa as funções `vooalto_*`. **Nunca** colocamos a `service_role` no app.

### Página em branco

A branca nasce com o **mesmo** número da folha 1 (`fbNum_<pid>`,
`data-ficha-num="1"`). O espelho contínuo mantém a cópia. Se a pessoa digitar um
número diferente ali, o campo ganha `data-num-proprio="1"` e passa a mandar: o
espelho, `numNuvemAplicarNaPagina` e o espelho da folha 1 não sobrescrevem mais,
o rodapé usa o número próprio e o `.json` guarda `hdr.fbNum`.

## 15.1 "Fichas já saídas": a conta que a pessoa vê (V10.2.1)

O número da ficha é reserva única e crescente desde 3388. Daí sai, de graça, a
**base de quanto se está vendendo**:

```
fichas já abertas = último nº reservado na nuvem − 3388 + 1
```

- aparece na barra lateral da ficha (`#nuvemConta`), com o número grande, a régua
  ("desde a nº 3388") e o último número;
- é conta de **nuvem**: soma as fichas de todas as máquinas, não só deste
  aparelho;
- `numNuvemPintarContagem()` só **lê** (`vooalto_nuvem_ok`) — nunca reserva.
  Abrir o app não pode queimar número: isso é testado;
- sem internet, mostra a última contagem conhecida e avisa;
- a conta assume que os números são usados em sequência. Número pulado (recusa
  por conflito) entra na contagem — é o preço de nunca repetir.

## 16. O app publicado no Supabase (V10.2)

Endereço público (a raiz do app):

```
https://eeurdquvrdmoyjgzgpac.supabase.co/functions/v1/site/
```

- `/site/` → `index.html` (o app);
- `/site/home` → capa de entrada (`entrar.html`), com botão de socorro e as
  instruções de instalação;
- `/site/<arquivo>` → qualquer arquivo do app.

A fonte do servidor está em `supabase/functions/site/` (o mesmo conteúdo está
publicado na Edge Function `site` do projeto `altoprints`). Ela lê o arquivo de
duas fontes: bucket `app` (Storage, hoje vazio — o upload exige uma chave
`service_role`) e **GitHub `main`**, que é o caminho em uso: **`git push` na
`main` publica**.

### As duas armadilhas do gateway (medidas, não supostas)

| Situação | Efeito | Contorno |
|---|---|---|
| `content-type: text/html` minúsculo | o gateway troca por `text/plain` | sai como `Text/HTML; charset=utf-8` |
| URL terminada em `.html` | o gateway força `text/plain` pela extensão do caminho | capa em caminho sem extensão (`/site/home`) |

JS, CSS, JSON e `manifest.webmanifest` passam intactos; o `service-worker-allowed`
sai preso a `/functions/v1/site/` para o service worker não tomar o domínio.

### Como conferir sem navegador

```sql
select net.http_get(url := 'https://eeurdquvrdmoyjgzgpac.supabase.co/functions/v1/site/');
select status_code, headers::jsonb->>'content-type', headers::jsonb->>'x-vooalto-origem'
  from net._http_response order by id desc limit 1;
```
