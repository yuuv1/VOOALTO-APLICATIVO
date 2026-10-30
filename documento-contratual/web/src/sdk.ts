/**
 * SDK Modular VOOALTO — Pronto para integração direta em outra aplicação React / TypeScript.
 *
 * Modos de integração:
 * 1) Tela completa pronta:
 *    import { VooaltoContratoApp } from "./sdk";
 *    <VooaltoContratoApp />
 *
 * 2) Uso programático (Headless / API no cliente):
 *    import {
 *      analyzeUploadedFile,
 *      applyAnalysisToState,
 *      computeContractSummary,
 *      generateContractFiles,
 *    } from "./sdk";
 */
import type { AnaliseResultado } from "./utils/browserExtractor";
import type { ContratoState } from "./types";

export { App as VooaltoContratoApp } from "./App";
export { VooaltoLauncher } from "./components/VooaltoLauncher";
export { ContractPreviewA4 } from "./components/ContractPreviewA4";
export { ImageCropModal } from "./components/ImageCropModal";
export {
  analyzeUploadedFile,
  type AnaliseResultado,
} from "./utils/browserExtractor";
export {
  generateContractFiles,
  buildPythonCompatiblePayload,
  triggerDownload,
  type GeneratedBundle,
} from "./utils/browserGenerator";
export {
  computeContractSummary,
  formatBRLFromCents,
  parseCents,
} from "./utils/calculations";
export {
  createDefaultState,
  createEmptyItem,
  type ContratoState,
  type ClienteData,
  type EmpresaData,
  type ItemProducao,
  type ImagemReferencia,
  type PaginaDocumento,
} from "./types";

export function applyAnalysisToState(
  prev: ContratoState,
  res: AnaliseResultado
): ContratoState {
  return {
    ...prev,
    cliente: {
      ...prev.cliente,
      nome_razao_social: res.cliente.nome_razao_social || prev.cliente.nome_razao_social,
      cpf_cnpj: res.cliente.cpf_cnpj || prev.cliente.cpf_cnpj,
      telefone: res.cliente.telefone || prev.cliente.telefone,
      email: res.cliente.email || prev.cliente.email,
      endereco: res.cliente.endereco || prev.cliente.endereco,
      cidade_uf_cep: res.cliente.cidade_uf_cep || prev.cliente.cidade_uf_cep,
    },
    producao: {
      ...prev.producao,
      itens: res.itens.length > 0 ? res.itens : prev.producao.itens,
      prazo_entrega: res.producao.prazo_entrega || prev.producao.prazo_entrega,
      observacoes: res.producao.observacoes || prev.producao.observacoes,
      imagens_referencia:
        res.imagens_sugeridas.length > 0
          ? res.imagens_sugeridas
          : prev.producao.imagens_referencia,
    },
    pagamento: {
      ...prev.pagamento,
      entrada_percentual:
        res.pagamento.entrada_percentual !== undefined ? res.pagamento.entrada_percentual : prev.pagamento.entrada_percentual,
      saldo_percentual:
        res.pagamento.saldo_percentual !== undefined ? res.pagamento.saldo_percentual : prev.pagamento.saldo_percentual,
      forma_pagamento: res.pagamento.forma_pagamento || prev.pagamento.forma_pagamento,
    },
    execucao: {
      ...prev.execucao,
      local_data: res.execucao?.local_data || prev.execucao.local_data,
    },
  };
}
