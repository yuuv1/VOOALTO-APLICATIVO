# VOOALTO Uniformes — Motor de Contratos no Navegador (sem CMD)

**Uso recomendado:** abra `Abrir_Sistema_Vooalto.html` diretamente no navegador ou copie `Abrir_Sistema_Vooalto.html` para dentro do seu sistema web e abra em um modal via iframe. Não executa CMD, `.bat`, instalador ou processo local: PDF.js, Tesseract OCR português e geradores Word/PDF rodam em Web Workers no navegador do usuário, mesmo offline.

**Teste de integração pronto:** abra `Exemplo_Abrir_No_Seu_Sistema.html`, mantenha o `.html` autônomo na mesma pasta e clique **Abrir motor de contratos**. Esse exemplo carrega a ferramenta dentro de uma janela da sua aplicação, apenas após o clique e sem abrir terminal. Veja `INTEGRACAO.md` para código React/TypeScript e integração em sistema existente.

Arraste uma **Ficha Técnica de Produção** (1..N páginas) ou **Proposta de Venda** para extrair os dados e croquis inteiros. Em fichas digitais V6 com texto selecionável (ex.: ALTERNATIVE Nº 3371), o motor lê as posições da tabela, reconcilia quantidades/valores/grades por página e usa o OCR local somente para o título rasterizado do croqui. Fichas digitalizadas continuam no fluxo de OCR completo. Quando a leitura tiver divergências, o sistema exibe os avisos antes de gerar arquivos e exige confirmação após revisão manual. A grade agora aparece em um quadro próprio por modelo no editor, PDF e Word. O PDF de MPTO com cinco modelos permanece em **1 página A4**; grades extensas ou pedidos maiores podem ocupar mais páginas A4, sem cortar tamanhos, modelos ou imagens. Quando o resumo traz mais modelos que croquis/grades identificáveis, os itens e preços são preservados e a associação incerta é avisada para conferência manual. O motor nunca precisa de um servidor Python para funcionar.

### Verificações reproduzíveis

```bash
cd web
npm ci
npm test            # ANA, MPTO (5 modelos), ALTERNATIVE, resumo continuado de 5 modelos, grades extensas/atípicas e 12 croquis/12 itens
npm run build       # recria docs/ e Abrir_Sistema_Vooalto.html
```

**Opcional / legado:** `Instalar_Sistema_Vooalto.bat` e `Iniciar_Sistema_Vooalto.bat` pertencem ao modo antigo com Python local e **não são necessários nem recomendados** para a integração sem CMD. Para outras fichas ainda não testadas, confira visualmente a prévia/grade e os avisos do OCR antes de enviar o contrato. Nenhum OCR pode garantir leitura perfeita de arquivos inéditos, ilegíveis ou com alterações radicais de layout.

---

## Como Instalar como PWA no Celular (Android / iPhone) ou Navegador

- **No Computador (Edge / Chrome):** clique no botão **Instalar Aplicativo** no topo da barra do sistema.
- **No Android (Chrome):** abra o link do aplicativo, toque no menu `⋮` e selecione **Instalar aplicativo** / **Adicionar à tela inicial**.
- **No iPhone / iPad (Safari):** abra o link do aplicativo, toque em **Compartilhar** e escolha **Adicionar à Tela de Início**.
- O aplicativo funciona mesmo **offline** (gerando `.docx` e `.pdf` direto no aparelho) e aceita opcionalmente uma chave gratuita do **Google Gemini** em *Empresa / .bat* para leitura por IA no celular.

---

## Estrutura Principal do Projeto

- `Instalar_Sistema_Vooalto.bat` — Instalador automático de 1 clique para Windows (cria `.venv`, instala dependências e cria atalho na Área de Trabalho).
- `Iniciar_Sistema_Vooalto.bat` — Inicializador rápido em janela de aplicativo PWA.
- `entregas/Contrato_Vooalto_Uniformes.docx` e `entregas/Contrato_Vooalto_Uniformes.pdf` — Modelos de contrato em branco sincronizados e prontos para uso imediato.
- `contratos/MPTO_Ministerio_Publico_do_Tocantins/` — Pasta dedicada do contrato preenchido do **Ministério Público do Estado do Tocantins (MPTO — Ficha Técnica Nº 3374)**, contendo `Contrato_MPTO_Ficha_3374.pdf`, `Contrato_MPTO_Ficha_3374.docx`, `dados_contrato_mpto.json`, `referencias/ref_01..ref_05.jpg` e `FICHA_TECNICA_3374_MPTO_Original.pdf` (com todos os dados e croquis preenchidos e apenas a assinatura do Contratante em branco).
- `entregas/Como_preencher_e_assinar.txt` — Guia rápido para envio ao cliente.
- `scripts/servidor_pwa.py` — Servidor local multithread + API REST (`/api/status`, `/api/exemplo-proposta`, `/api/analisar`, `/api/gerar`).
- `scripts/extrair_proposta.py` — Extrator espacial + OCR neural em português (`RapidOCR`) para propostas comerciais e fichas técnicas multipágina + recorte automático de camisetas.
- `scripts/gerar_contrato.py` e `scripts/verificar_contrato.py` — Gerador unificado A4 (`.pdf` + `.docx`) e suíte de 17 verificações automatizadas.
- `web/` e `docs/` — Código-fonte React + TypeScript + Tailwind v4 do PWA e build estático pronto para execução local ou GitHub Pages.
