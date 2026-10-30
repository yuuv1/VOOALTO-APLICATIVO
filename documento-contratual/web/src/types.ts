export interface EmpresaData {
  nome_comercial: string;
  razao_social: string;
  cnpj: string;
  telefone: string;
  email: string;
  endereco: string;
  responsavel: string;
  cargo: string;
}

export interface ClienteData {
  nome_razao_social: string;
  cpf_cnpj: string;
  telefone: string;
  email: string;
  endereco: string;
  cidade_uf_cep: string;
}

export interface ItemProducao {
  id: string;
  numero: string;
  modelo: string;
  tecido: string;
  cor: string;
  personalizacao: string;
  grade: string;
  quantidade: number;
  valor_unitario: string;
}

export interface ImagemReferencia {
  id: string;
  titulo: string;
  data_url: string;
  arquivo?: string;
}

export interface PagamentoData {
  entrada_percentual: number | null;
  entrada_valor: string;
  saldo_percentual: number | null;
  saldo_valor: string;
  forma_pagamento: string;
}

export interface ContratoState {
  empresa: EmpresaData;
  cliente: ClienteData;
  producao: {
    linhas_em_branco: number;
    itens: ItemProducao[];
    quantidade_total: string;
    valor_total: string;
    prazo_entrega: string;
    observacoes: string;
    imagens_referencia: ImagemReferencia[];
  };
  pagamento: PagamentoData;
  execucao: {
    local_data: string;
  };
}

export interface PaginaDocumento {
  id: string;
  origem: string;
  pagina: number;
  largura: number;
  altura: number;
  data_url: string;
}

export function createEmptyItem(idx = 1): ItemProducao {
  return {
    id: `item-${Math.random().toString(36).slice(2, 10)}`,
    numero: String(idx).padStart(2, "0"),
    modelo: "",
    tecido: "",
    cor: "",
    personalizacao: "",
    grade: "",
    quantidade: 0,
    valor_unitario: "",
  };
}

export function createDefaultState(): ContratoState {
  return {
    empresa: {
      nome_comercial: "VOOALTO UNIFORMES",
      razao_social: "",
      cnpj: "51.919.138/0001-20",
      telefone: "(62) 98135-6948",
      email: "",
      endereco: "Av. Jacinto Alves de Abreu, 212 — Res. Vereda dos Buritis, Goiânia – GO, CEP 74370-661",
      responsavel: "Esio Andrade",
      cargo: "Proprietário",
    },
    cliente: {
      nome_razao_social: "",
      cpf_cnpj: "",
      telefone: "",
      email: "",
      endereco: "",
      cidade_uf_cep: "",
    },
    producao: {
      linhas_em_branco: 4,
      itens: [createEmptyItem(1)],
      quantidade_total: "",
      valor_total: "",
      prazo_entrega: "",
      observacoes: "",
      imagens_referencia: [],
    },
    pagamento: {
      entrada_percentual: 50,
      entrada_valor: "",
      saldo_percentual: 50,
      saldo_valor: "",
      forma_pagamento: "Depósito bancário, Pix ou cartão de crédito",
    },
    execucao: {
      local_data: "",
    },
  };
}

