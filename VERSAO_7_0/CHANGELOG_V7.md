# VOOALTO V7 — Registro de alterações

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
