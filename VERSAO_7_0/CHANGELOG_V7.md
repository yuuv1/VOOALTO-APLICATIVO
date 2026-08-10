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
