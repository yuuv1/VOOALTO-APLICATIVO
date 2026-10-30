# Integração do motor VOOALTO em outra aplicação, sem CMD

## Opção 1: Qualquer sistema Web existente (HTML/JS, PHP, Python, Laravel, etc.)

Copie **`Abrir_Sistema_Vooalto.html`** para um local estático do seu site (por exemplo, `/ferramentas/Abrir_Sistema_Vooalto.html`). Copie o botão/modal de `Exemplo_Abrir_No_Seu_Sistema.html` para sua tela. Altere **somente** o `src` do `<iframe>` para o caminho estático do arquivo autônomo. Seu site precisa servir esse arquivo sem uma política CSP que proíba scripts inline, blob workers ou iframe; se já houver CSP restrita, ajuste-a explicitamente para esta rota ou use a opção 2. A execução é toda local no navegador, em segundo plano, sem prompts CMD. O navegador do usuário precisa suportar WebAssembly, Canvas e Blob Workers modernos (Edge/Chrome atualizados).

Para validar sem criar servidor local: deixe `Exemplo_Abrir_No_Seu_Sistema.html` ao lado de `Abrir_Sistema_Vooalto.html`, dê dois cliques no **exemplo**, clique **Abrir motor de contratos** e arraste uma ficha. No Windows, `file://` + iframe pode depender da política de arquivos locais do navegador; hospedar os dois HTMLs na mesma origem do sistema é a maneira de integração recomendada.

## Opção 2: Aplicação React/TypeScript (motor dentro do DOM do host)

Copie `web/src/`, `web/public/ocr/` para sua aplicação e instale as dependências de `web/package.json`; inclua `web/src/index.css` no bundle Tailwind do host. Monte o componente:

```tsx
import { VooaltoLauncher } from "./src/sdk";

export function TelaDoMeuSistema() {
  return <VooaltoLauncher label="Abrir motor de contratos" />;
}
```

O botão abre um **modal dentro da aplicação**, Escape ou Fechar o encerra. Nenhum processo separado. Para ter total controle da interface, importações headless:

```ts
import {
  analyzeUploadedFile,
  applyAnalysisToState,
  createDefaultState,
  generateContractFiles,
} from "./src/sdk";

const analise = await analyzeUploadedFile(arquivoPdf, false, "");
if (analise.avisos?.length) {
  // Mostrar ao usuário para conferir quantidades, croquis, cores e preços antes de exportar.
  throw new Error(analise.avisos.join("\n"));
}
const estado = applyAnalysisToState(createDefaultState(), analise);
const { pdfBlob, docxBlob, zipBlob } = await generateContractFiles(estado, false, false);
```

**Importante:** não marque `backendOnline = true` para usar o modo autônomo. Os PDFs de referência são PDFs Print-to-PDF sem camada de texto; não desative o OCR WASM. Antes de liberar uma nova versão em produção, rode `cd web && npm ci && npm test && npm run build`. Os testes end-to-end cobrem ANA (1 página), MPTO (5 páginas), imagens completas e geração com 12 itens/12 croquis em múltiplas páginas.

## Extração e limites de confiança

O importador lê todas as páginas, tenta recuperar diretamente o XObject de alta resolução de cada croqui (sem cortes no topo/rodapé), e quando isso não existe recorta a área completa do desenho abaixo de “DETALHES DO MODELO”. Linhas de produção e grades são reconciliadas com o resumo. Divergências de preço, quantidade, cor ou croqui não devem ser aceitas silenciosamente: o retorno inclui `avisos`, e a interface exibe alerta/confirmará revisão antes da exportação. Um novo template muito diferente ou imagem ilegível ainda exige conferência humana, não há garantia matemática de leitura perfeita de todo PDF futuro.

O código Python e os arquivos `.bat` antigos são opcionais e **não participam** desta integração sem CMD. O arquivo original `PROPOSTA DE VENDA ANA.pdf` e a pasta `contratos/MPTO_Ministerio_Publico_do_Tocantins/` permanecem intocados.
