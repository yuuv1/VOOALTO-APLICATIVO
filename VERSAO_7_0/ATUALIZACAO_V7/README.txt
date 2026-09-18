════════════════════════════════════════════════════════════
  VOOALTO V7 — PWA (Progressive Web App)
  Sistema completo: Ficha Técnica · Catalogação · Orçamento
════════════════════════════════════════════════════════════

COMO USAR (computador Windows)
──────────────────────────────
1. Instale o Node.js se ainda não tiver:  https://nodejs.org  (basta o instalador padrão)
2. Dê um duplo clique em:  instalar_e_abrir_V7.bat
3. O app abre em:  http://localhost:4700

PARA PARAR
──────────
Feche a janelinha preta do Node que ficou minimizada (ou use o Gerenciador de
Tarefas > finalizar "node.exe").

INSTALAR COMO APLICATIVO (opcional, recomendado)
────────────────────────────────────────────────
No Edge ou Chrome:
  - Clique no ícone de "instalar" na barra de endereço, OU
  - Menu ⋮ > Aplicativos > Instalar este site como aplicativo, OU
  - Use o botão "⬇ Instalar" que aparece no topo do V7.
Depois, o Vooalto abre em tela cheia e funciona SEM internet.

PÁGINAS UTILITÁRIAS
────────────────────
http://localhost:4700/limpar_cache.html  → limpa SÓ o cache (seguro, não apaga dados).
                                          Use quando uma atualização não aparecer.
http://localhost:4700/zerar_dados.html   → APAGA TUDO (fichas, catálogo, PDFs,
                                          orçamento). Exige confirmação dupla.

ONDE FICAM OS DADOS
───────────────────
Tudo fica salvo NESTE COMPUTADOR, no navegador usado:
  - Catálogo/PDFs  → Catalogação (exporte backups por lá: "Exportar backup")
  - Ficha Técnica  → rascunho/backup no próprio módulo
  - Orçamento      → salvo automaticamente + botão "Salvar .json"
Trocar de computador? Use "Exportar backup" (Catalogação) e o ".json" (Orçamento)
e importe no novo PC.

ARQUIVOS DESTA PASTA
────────────────────
index.html               → o aplicativo (shell fino — não precisa mexer)
principal_dashboard/     → módulo Catalogação
criador_ficha_tecnica/   → módulo Ficha Técnica
criador_orcamento/       → módulo Orçamento
assets/                  → bibliotecas e imagens (offline, sem internet)
icons/                   → ícones do aplicativo
manifest.webmanifest     → dados do app (nome, ícones)
sw.js                    → cache offline (gerado pelo build)
server.js                → servidor local (porta 4700)

OBSERVAÇÕES
───────────
• Para atualizar o V7 com uma versão nova: substitua a pasta, feche o app,
  abra limpar_cache.html e execute "Limpar cache agora", depois rode o bat de novo.
• O app funciona 100% offline após o primeiro carregamento.
