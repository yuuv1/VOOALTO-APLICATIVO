# VOOALTO V7 — Sugestões de melhoria de experiência (sem alterar o sistema)

> **Princípio deste documento:** nenhuma sugestão abaixo mexe em lógica, dados, fluxo de trabalho
> ou regra de negócio. Todas são **camadas de orientação e feedback** (textos, dicas, rótulos,
> indicadores visuais) para tornar o dia a dia de quem opera o sistema mais fácil e didático.

---

## O que a V7 já faz bem hoje (manter)

- Barra única com os 3 módulos sempre visíveis (Catalogação · Ficha Técnica · Orçamento).
- Botão **"? Ajuda"** no shell com resumo do fluxo 1→2→3.
- Botões do shell e do Orçamento já têm `title` (dica ao passar o mouse).
- Prioridade sobe sozinha com os dias; badge vermelho na aba Catalogação.
- Página `zerar_dados.html` com confirmação dupla e `limpar_cache.html` separada — ótima decisão.
- Autosave silencioso do Orçamento + rascunhos no Ficha Técnica.
- README.txt do instalador claro e organizado.

As sugestões abaixo são **complementares** a isso.

---

## GRUPO A — Primeiro contato e orientação (maior impacto)

### A1. Tour de boas-vindas na primeira abertura ⭐ recomendado
**Hoje:** quem abre o V7 pela primeira vê 3 abas e nenhum rumo; a ajuda existe, mas é o usuário
quem precisa procurar o "?".
**Sugestão:** overlay de boas-vindas (só na 1ª vez, marcado em `localStorage`) com 3 cartões
curtos: *"1. Crie a Ficha Técnica → 2. Envie para Catalogação → 3. Faça o Orçamento"*, botão
"Começar" e opção "Não mostrar novamente". Reaproveita o texto que já existe no modal de Ajuda.
**Impacto:** alto · **Esforço:** baixo (HTML+CSS puro no shell).

### A2. Numerar as abas para reforçar o fluxo
**Hoje:** a Ajuda explica "1·Ficha, 2·Catalogação, 3·Orçamento", mas as abas não têm números.
**Sugestão:** incluir o número no rótulo da aba (ex.: `1 📋 Ficha Técnica`) ou um chip
"comece aqui" na aba Ficha Técnica na primeira semana de uso.
**Impacto:** médio · **Esforço:** mínimo.

### A3. Padronizar os nomes entre aba e tela
**Hoje:** a aba chama **"Catalogação"**, mas a tela interna abre com título **"Fichas Técnicas /
Prioridade, catálogo e produção"** — e existe outro módulo que também se chama "Ficha Técnica".
Para quem está chegando, os dois nomes se confundem.
**Sugestão:** alinhar o cabeçalho interno para **"Catalogação — fichas em produção"** e manter
"Ficha Técnica" apenas para o criador da ficha. Troca só de texto.
**Impacto:** médio · **Esforço:** mínimo.

### A4. Manual do usuário dentro do app
**Hoje:** o README.txt fica na pasta, fora do aplicativo.
**Sugestão:** página `manual.html` (offline, no mesmo estilo do app) com o passo a passo dos 3
módulos, incluindo os "como fazer" que mais geram dúvida: anexar PDF, arrastar ficha entre
colunas, exportar/importar backup, salvar `.json`, instalar como aplicativo. Link no modal de
Ajuda: *"Ver manual completo"*.
**Impacto:** alto · **Esforço:** médio (redação). Pode evoluir depois com GIFs curtos.

---

## GRUPO B — Ajuda contextual dentro de cada módulo

### B1. Botão "?" próprio em cada módulo
**Hoje:** a Ajuda é única e genérica, no shell.
**Sugestão:** cada módulo ganha um "?" no próprio cabeçalho com conteúdo específico:
- **Catalogação:** o que significam as colunas, como a prioridade sobe sozinha (M/A dias),
  como anexar PDF, arrastar-e-soltar, concluir, modificar ficha.
- **Ficha Técnica:** o que faz cada ferramenta da barra (texto, seta, retângulo, círculo,
  camadas, preenchimento rápido, rascunho, enviar para catalogação).
- **Orçamento:** itens e Enter, páginas, duplicar, total geral, rascunhos vs `.json`,
  assinatura, imprimir/PDF.
**Impacto:** alto · **Esforço:** médio.

### B2. Tooltips nos botões que ainda não têm
**Hoje:** o Orçamento está bem servido de `title`, mas vários botões da Ficha Técnica
(ferramentas de desenho, camadas, ações de página) e alguns da Catalogação não têm.
**Sugestão:** revisar botão a botão e completar `title` com frase curta no estilo
"o que acontece quando eu clicar". Não muda nenhum comportamento.
**Impacto:** médio · **Esforço:** baixo.

### B3. Legenda das prioridades na Catalogação
**Hoje:** o card mostra "Urgência: M 15d · A 22d" — quem não conhece o sistema não sabe o que
isso significa; a explicação está escondida no `title` dos campos de configuração.
**Sugestão:** uma linha de legenda fixa acima das colunas:
"🟢 Baixa → 🟡 Média (15 dias) → 🔴 Alta (22 dias) — sobe sozinho com o tempo".
**Impacto:** médio · **Esforço:** mínimo.

### B4. Estados vazios que ensinam
**Hoje:** "Nenhuma ficha aqui", "Nenhum rascunho salvo ainda".
**Sugestão:** transformar em instrução: *"Nenhuma ficha aqui ainda — clique em ＋ Nova ficha ou
arraste um PDF para esta coluna"*. Estado vazio é o melhor momento para ensinar.
**Impacto:** médio · **Esforço:** baixo.

---

## GRUPO C — Feedback e confiança ("funcionou?")

### C1. Indicador visível de "salvo automaticamente" ⭐ recomendado
**Hoje:** o Orçamento salva sozinho a cada 700 ms, mas em silêncio (`console.warn` em caso de
erro). Quem usa não tem certeza nenhuma de que salvou.
**Sugestão:** chip discreto no cabeçalho do Orçamento: "💾 Salvo automaticamente · 14:32",
atualizado a cada gravação. Mesma ideia no rascunho da Ficha Técnica.
**Impacto:** alto · **Esforço:** baixo.

### C2. Confirmações que mostram o que será afetado
**Hoje:** `confirm('Excluir ficha?')` sem dizer qual ficha; `prompt('Nome da ficha...')` genérico.
**Sugestão:** incluir o nome do item no texto: *"Excluir a ficha 'Camisetas Escolar João'?
O PDF anexado também será apagado."* Só melhoria de texto, mesma confirmação.
**Impacto:** médio · **Esforço:** baixo.

### C3. Diferenciar visualmente botões destrutivos
**Hoje:** "Excluir", "🗑️ Limpar", "❌ Remover" competem com botões comuns.
**Sugestão:** padronizar cor vermelha/tom de atenção + ícone nos destrutivos, em todo o sistema.
**Impacto:** médio · **Esforço:** baixo.

### C4. Lista de atalhos de teclado na Ajuda
**Hoje:** atalhos existem (Enter cria item no Orçamento, desfazer/refazer na Ficha, formatação
Ctrl+B/I/U) mas só aparecem em tooltips espalhados.
**Sugestão:** seção "Atalhos" no modal de Ajuda com a lista completa.
**Impacto:** baixo/médio · **Esforço:** mínimo.

---

## GRUPO D — Acabamento e materiais de apoio

| # | Sugestão | Onde | Esforço |
|---|----------|------|---------|
| D1 | Corrigir typo do instalador: "**Abrendo** o Vooalto" → "**Abrindo** o Vooalto" | `instalar_e_abrir_V7.bat` | mínimo |
| D2 | Revisão geral de textos (maiúsculas, pontuação, consistência de rótulos) | todos os módulos | baixo |
| D3 | GIFs curtos (5–10 s) das 3 operações principais embutidos no manual | `manual.html` | médio |
| D4 | Ficha de referência rápida em PDF para imprimir e deixar ao lado do computador | novo arquivo | médio |
| D5 | Tooltip no badge vermelho da aba Catalogação: "X fichas passaram de N dias" | shell | mínimo |

---

## Priorização sugerida (roadmap didático)

| Ondem | Item | Por quê |
|-------|------|---------|
| 1º | **A1 Tour de boas-vindas** | Resolve o "por onde começo?" de vez |
| 2º | **C1 Indicador de autosave** | Elimina o maior medo: "perdi o que fiz?" |
| 3º | **B1 + B2 Ajuda por módulo + tooltips** | Suporte no momento da dúvida |
| 4º | **A3 + A2 Nomes e números das abas** | Desconfunde os dois "Ficha Técnica" |
| 5º | **B3 + B4 + C2 + C3 Legendas, estados vazios, confirmações** | Refinam o dia a dia |
| 6º | **A4 + D3 Manual completo com GIFs** | Material de treino de novas pessoas |

Todos os itens são aditivos e reversíveis — nada altera como o sistema calcula, salva ou
organiza os dados.
