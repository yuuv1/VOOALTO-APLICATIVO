VOOALTO V7 — GUIA RÁPIDO (Windows)
==================================
Sistema local para Ficha Técnica, Catalogação e Orçamentos.

INICIAR
-------
1. Extraia a pasta completa do ZIP para um local fixo (por exemplo,
   Documentos\VooaltoV7). Não execute o BAT de dentro do ZIP.
2. Dê dois cliques em instalar_e_abrir_V7.bat.
3. O BAT inicia o servidor local e só então abre http://localhost:4700/ no
   navegador padrão. Minimize a janela preta; não a feche enquanto estiver
   usando o aplicativo.

O BAT funciona com Node.js ou Python 3.10 ou superior. Se os dois estiverem
instalados, usa Node.js. Se a porta 4700 já estiver servindo o Vooalto V7, abre a instância que
já existe. Se outro programa estiver usando a porta, mostra um erro em vez de
abrir uma página errada.

FIXAR NA BARRA DE TAREFAS — IMPORTANTE
-------------------------------------
Para o atalho não sumir, instale a PWA de verdade; não fixe uma aba comum nem
uma janela temporária aberta por um comando do navegador:

  • Edge/Chrome: clique em “⬇ Instalar” no Vooalto; ou use o menu do navegador
    → Aplicativos → Instalar este site como aplicativo.
  • Depois, abra “Vooalto V7” pelo atalho instalado no Windows e fixe ESSE app
    na barra de tarefas.

A identidade do app e o endereço local foram estabilizados nesta versão. Use
sempre o mesmo navegador/perfil e http://localhost:4700/. Não mude a porta e
não execute cópias diferentes do V7 na mesma porta. A janela preta do BAT é o
servidor local, não o atalho do aplicativo. Fechá-la encerra o servidor; com o
cache já instalado, o V7 continua abrindo offline. Para instalar ou atualizar,
inicie o BAT novamente.

Se o atalho antigo já desapareceu, execute o BAT, abra o Vooalto no Edge/Chrome,
instale novamente pelo menu Aplicativos e fixe o novo atalho instalado. O BAT
não consegue restaurar um pin removido pelo próprio Windows.

PARAR / REINICIAR
-----------------
Feche a janela preta do BAT para parar o servidor. Se outra instância do V7 já
estiver rodando, o BAT informa que a porta está ocupada/ativa. Não finalize
processos aleatórios do Windows; feche a janela do servidor Vooalto.

ATUALIZAR O V7
--------------
1. Feche as janelas do Vooalto e a janela do servidor.
2. Faça backup do catálogo e do orçamento antes de substituir arquivos.
3. Extraia a versão nova por cima da pasta fixa (mantenha os mesmos arquivos e
   endereço local).
4. Abra limpar_cache.html na mesma origem http://localhost:4700/ e clique em
   “Limpar cache agora”. Isso não apaga fichas, PDFs ou orçamentos.
5. Execute instalar_e_abrir_V7.bat novamente.

PÁGINAS UTILITÁRIAS
-------------------
http://localhost:4700/limpar_cache.html  Limpa somente o cache do Vooalto.
http://localhost:4700/zerar_dados.html   Apaga os dados do Vooalto neste perfil;
                                         exige duas confirmações e não tem volta.

ONDE OS DADOS FICAM
-------------------
Os dados ficam neste computador, no perfil do navegador utilizado:
  • Catálogo, prioridades e PDFs: Catalogação → Exportar backup.
  • Fichas em andamento: autosave local; também é possível exportar a ficha.
  • Rascunhos da Ficha Técnica: lista de rascunhos dentro do módulo.
  • Orçamento: autosave local; use “Salvar .json” ou “Salvar Rascunho” para
    arquivar uma cópia.

Para trocar de computador ou navegador, exporte e importe os backups. Limpar o
cache é seguro para os dados; “Zerar dados” é uma ação diferente e destrutiva.

MÓDULOS
-------
• Ficha Técnica: abre como janela sobre o sistema. Use “✕ Fechar” ou Esc; a
  ficha em andamento continua salva. “Enviar para Catalogação” cria a ficha no
  catálogo.
• Catalogação: organiza fichas por prioridade e permite anexar/visualizar PDFs,
  concluir pedidos e exportar/importar backup.
• Orçamento: salva automaticamente neste navegador. Salve um .json ou rascunho
  antes de iniciar outro orçamento se quiser manter uma cópia independente.

ARQUIVOS PRINCIPAIS
-------------------
index.html                    Aplicativo principal
principal_dashboard/          Catalogação
criador_ficha_tecnica/        Ficha Técnica
criador_orcamento/            Orçamento
assets/ e icons/              Bibliotecas, imagens, fontes e ícones locais
manifest.webmanifest          Identidade PWA estável
sw.js                         Cache offline e atualização do app
server.js / server.py          Servidor local (Node.js / alternativa Python)
instalar_e_abrir_V7.bat        Inicializador Windows
build_v7_pwa.py                Geração do cache e do ZIP de distribuição

TESTES (para desenvolvimento)
-----------------------------
Na pasta VERSAO_7_0, execute “npm install” e “npm test”. Para gerar o pacote,
execute “python build_v7_pwa.py”. O usuário final não precisa rodar esses testes.
