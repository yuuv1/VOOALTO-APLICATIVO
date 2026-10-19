VOOALTO V8 — GUIA RÁPIDO (Windows)
==================================
Sistema local para Ficha Técnica e Orçamentos. Duas ferramentas, sem etapas
intermediárias. A Catalogação foi removida nesta versão.

INICIAR
-------
1. Extraia a pasta completa do ZIP para um local fixo (por exemplo,
   Documentos\VooaltoV8). Não execute o BAT de dentro do ZIP.
2. Dê dois cliques em instalar_e_abrir_V8.bat.
3. O BAT inicia o servidor local e só então abre http://localhost:4800/ no
   navegador padrão. Minimize a janela preta; não a feche enquanto estiver
   usando o aplicativo.

O BAT funciona com Node.js ou Python 3.10 ou superior. Se os dois estiverem
instalados, usa Node.js. Se a porta 4800 já estiver servindo o Vooalto V8, abre
a instância que já existe. Se outro programa estiver usando a porta, mostra um
erro em vez de abrir uma página errada.

FIXAR NA BARRA DE TAREFAS — IMPORTANTE
-------------------------------------
Para o atalho não sumir, instale a PWA de verdade; não fixe uma aba comum nem
uma janela temporária aberta por um comando do navegador:

  • Edge/Chrome: clique em “⬇ Instalar” no Vooalto; ou use o menu do navegador
    → Aplicativos → Instalar este site como aplicativo.
  • Depois, abra “Vooalto V8” pelo atalho instalado no Windows e fixe ESSE app
    na barra de tarefas.

A identidade do app e o endereço local foram estabilizados nesta versão. Use
sempre o mesmo navegador/perfil e http://localhost:4800/. Não mude a porta e
não execute cópias diferentes do Vooalto na mesma porta. A janela preta do BAT
é o servidor local, não o atalho do aplicativo. Fechá-la encerra o servidor; com
o cache já instalado, o V8 continua abrindo offline. Para instalar ou
atualizar, inicie o BAT novamente.

Se o atalho antigo já desapareceu, execute o BAT, abra o Vooalto no Edge/Chrome,
instale novamente pelo menu Aplicativos e fixe o novo atalho instalado. O BAT
não consegue restaurar um pin removido pelo próprio Windows.

PARAR / REINICIAR
-----------------
Feche a janela preta do BAT para parar o servidor. Se outra instância do V8 já
estiver rodando, o BAT informa que a porta está ocupada/ativa. Não finalize
processos aleatórios do Windows; feche a janela do servidor Vooalto.

VINDO DA V7
-----------
• A Catalogação (kanban de produção, prioridades e leitor de PDF) foi removida.
• As fichas que você SALVOU continuam disponíveis: os antigos “Rascunhos” da
  Ficha Técnica agora aparecem na lista “Minhas fichas”, dentro do próprio
  criador. Os dados ficam no mesmo banco do navegador, nada é migrado nem
  copiado.
• O Orçamento continua igual. Um arquivo .json de orçamento da V7 abre na V8.
• O endereço mudou para a porta 4800 (a V7 usa 4700), então as duas versões
  podem coexistir sem brigar pelo mesmo espaço.
• Se você dependia do catálogo para guardar os PDFs das fichas, exporte esses
  arquivos antes de abandonar a V7: eles ficavam num banco próprio do
  navegador, que a V8 não lê mais.

ATUALIZAR O V8
--------------
1. Feche as janelas do Vooalto e a janela do servidor.
2. Faça backup das fichas e do orçamento antes de substituir arquivos.
3. Extraia a versão nova por cima da pasta fixa (mantenha os mesmos arquivos e
   endereço local).
4. Abra limpar_cache.html na mesma origem http://localhost:4800/ e clique em
   “Limpar cache agora”. Isso não apaga fichas nem orçamentos.
5. Execute instalar_e_abrir_V8.bat novamente.

PÁGINAS UTILITÁRIAS
-------------------
http://localhost:4800/limpar_cache.html  Limpa somente o cache do Vooalto.
http://localhost:4800/zerar_dados.html   Apaga os dados do Vooalto neste perfil;
                                         exige duas confirmações e não tem volta.
http://localhost:4800/manual.html        Manual completo (também abre pelo
                                         botão “📖 Ver manual completo”).

ONDE OS DADOS FICAM
-------------------
Os dados ficam neste computador, no perfil do navegador utilizado:
  • Ficha em edição: salvamento automático (selo “💾 Salvo HH:MM”).
  • Fichas salvas: lista “Minhas fichas” dentro da Ficha Técnica.
  • Orçamento em edição: salvamento automático; rascunhos nomeados no módulo.
  • Cópia em arquivo: “Exportar backup (.json)” na Ficha e “Salvar .json” no
    Orçamento. Essa é a única cópia que sobrevive a navegador limpo ou troca
    de computador.

Para trocar de computador ou navegador, exporte e importe os backups. Limpar o
cache é seguro para os dados; “Zerar dados” é uma ação diferente e destrutiva.

MÓDULOS
-------
• Ficha Técnica: abre em tela cheia (não é mais uma janela sobre o sistema).
  “💾 Salvar ficha” guarda na lista; “⬇ Baixar (escolher páginas)” gera o PDF;
  “✨ Nova ficha” salva a atual, limpa a tela e avança o número.
• Orçamento: salva automaticamente neste navegador. Salve um .json ou rascunho
  antes de iniciar outro orçamento se quiser manter uma cópia independente.

TEMA
----
O seletor no topo do sistema tem dois temas: Claro (padrão) e Escuro. A escolha
vale para o sistema inteiro e fica salva neste navegador. Se você usava um dos
temas antigos (Neon, Tech, Butter...), o V8 abre no mais próximo e passa a usar
só claro/escuro a partir de então.

ARQUIVOS PRINCIPAIS
-------------------
index.html                    Aplicativo principal
criador_ficha_tecnica/        Ficha Técnica
criador_orcamento/            Orçamento
assets/ e icons/              Bibliotecas, imagens, fontes e ícones locais
manifest.webmanifest          Identidade PWA estável
sw.js                         Cache offline e atualização do app
server.js / server.py         Servidor local (Node.js / alternativa Python)
instalar_e_abrir_V8.bat       Inicializador Windows
build_v8_pwa.py               Geração do cache e do ZIP de distribuição

TESTES (para desenvolvimento)
-----------------------------
Na pasta VERSAO_8_0, execute “npm install” e “npm test”. Para gerar o pacote,
execute “python build_v8_pwa.py”. O usuário final não precisa rodar esses testes.
