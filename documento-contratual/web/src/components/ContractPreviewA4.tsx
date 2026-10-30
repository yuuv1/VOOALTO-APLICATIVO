import React from "react";
import { ContratoState } from "../types";
import { computeContractSummary } from "../utils/calculations";

interface Props {
  state: ContratoState;
  logoUrl: string;
  sigUrl: string;
  scale?: number;
}

export const ContractPreviewA4: React.FC<Props> = ({
  state,
  logoUrl,
  sigUrl,
  scale = 1,
}) => {
  const summary = computeContractSummary(state);
  const co = state.empresa;
  const cl = state.cliente;
  const prod = state.producao;

  const refs = prod.imagens_referencia;
  const colsPerRow =
    refs.length <= 3 ? 3 : refs.length <= 5 ? refs.length : 4;
  const refBatches: Array<typeof refs> = [];
  for (let i = 0; i < Math.max(colsPerRow, refs.length); i += colsPerRow) {
    refBatches.push(refs.slice(i, i + colsPerRow));
  }

  return (
    <div
      style={{
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: "top center",
      }}
      className="a4-print-target mx-auto w-[794px] min-h-[1123px] bg-white px-[56px] pt-[34px] pb-[42px] text-[#19232D] shadow-[0_14px_40px_rgba(25,35,45,0.16)] border border-[#DCE3E9] flex flex-col justify-between font-sans"
    >
      <div>
        {/* 1. Cabeçalho da empresa */}
        <div className="flex items-center justify-between gap-4 pb-2.5">
          <img
            src={logoUrl}
            alt="VOOALTO Uniformes"
            className="h-[46px] w-auto object-contain"
          />
          <div className="text-right text-[10px] leading-[13.5px] text-[#626E78]">
            <div className="font-bold text-[10.8px] text-[#19232D]">{co.nome_comercial}</div>
            <div>
              CNPJ {co.cnpj} · Tel./WhatsApp {co.telefone}
              {co.email ? ` · ${co.email}` : ""}
            </div>
            <div>{co.endereco}</div>
          </div>
        </div>

        {/* Linha divisória bicolor */}
        <div className="flex w-full items-center mb-3">
          <div className="h-[3px] w-[62px] bg-[#C5635C]" />
          <div className="h-[1px] flex-1 bg-[#DCE3E9]" />
        </div>

        {/* 2. Título e abertura */}
        <h1 className="text-[18.4px] font-bold tracking-tight text-[#19232D] leading-tight">
          CONTRATO DE CONFECÇÃO E FORNECIMENTO DE UNIFORMES
        </h1>
        <p className="mt-1 mb-3 text-[10.6px] leading-[14px] text-[#37434E]">
          Pelo presente instrumento, a VOOALTO UNIFORMES (CONTRATADA) e o(a) cliente identificado(a)
          abaixo (CONTRATANTE) contratam o fornecimento nas condições a seguir:
        </p>

        {/* 3. Seção 1 — Dados do Contratante */}
        <div className="mb-3">
          <h2 className="text-[11.2px] font-bold uppercase tracking-wide text-[#19232D] mb-1.5">
            1. Identificação do(a) Contratante (Dados do Cliente)
          </h2>

          <div className="space-y-2">
            <div>
              <div className="text-[8.8px] font-bold uppercase text-[#626E78] mb-0.5">
                Nome completo ou razão social
              </div>
              <div className="min-h-[24px] rounded-[2px] border border-[#C9D3DC] bg-[#F4F7F9] px-2.5 py-1 text-[11.5px] text-[#19232D]">
                {cl.nome_razao_social}
              </div>
            </div>

            <div className="grid grid-cols-12 gap-2.5">
              <div className="col-span-3">
                <div className="text-[8.8px] font-bold uppercase text-[#626E78] mb-0.5">
                  CPF / CNPJ
                </div>
                <div className="min-h-[24px] rounded-[2px] border border-[#C9D3DC] bg-[#F4F7F9] px-2.5 py-1 text-[11.5px] text-[#19232D]">
                  {cl.cpf_cnpj}
                </div>
              </div>
              <div className="col-span-4">
                <div className="text-[8.8px] font-bold uppercase text-[#626E78] mb-0.5">
                  Telefone / WhatsApp
                </div>
                <div className="min-h-[24px] rounded-[2px] border border-[#C9D3DC] bg-[#F4F7F9] px-2.5 py-1 text-[11.5px] text-[#19232D]">
                  {cl.telefone}
                </div>
              </div>
              <div className="col-span-5">
                <div className="text-[8.8px] font-bold uppercase text-[#626E78] mb-0.5">
                  E-mail
                </div>
                <div className="min-h-[24px] rounded-[2px] border border-[#C9D3DC] bg-[#F4F7F9] px-2.5 py-1 text-[11.5px] text-[#19232D] truncate">
                  {cl.email}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-2.5">
              <div className="col-span-8">
                <div className="text-[8.8px] font-bold uppercase text-[#626E78] mb-0.5">
                  Endereço completo (rua/av., nº, bairro, complemento)
                </div>
                <div className="min-h-[24px] rounded-[2px] border border-[#C9D3DC] bg-[#F4F7F9] px-2.5 py-1 text-[11.5px] text-[#19232D]">
                  {cl.endereco}
                </div>
              </div>
              <div className="col-span-4">
                <div className="text-[8.8px] font-bold uppercase text-[#626E78] mb-0.5">
                  Cidade / UF · CEP
                </div>
                <div className="min-h-[24px] rounded-[2px] border border-[#C9D3DC] bg-[#F4F7F9] px-2.5 py-1 text-[11.5px] text-[#19232D]">
                  {cl.cidade_uf_cep}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Seção 2 — Dados da Produção */}
        <div className="mb-3">
          <h2 className="text-[11.2px] font-bold uppercase tracking-wide text-[#19232D] mb-0.5">
            2. Dados da Produção e Especificações do Pedido
          </h2>
          <p className="text-[10.4px] leading-[13.5px] text-[#37434E] mb-2">
            Confecção, personalização e fornecimento dos uniformes descritos abaixo, conforme ficha
            técnica, modelos, tecidos, cores, artes e grade de tamanhos acordados entre as partes:
          </p>

          <table className="w-full border-collapse text-[10.6px] border border-[#C9D3DC]">
            <thead>
              <tr className="bg-[#19232D] text-white text-[9.2px] uppercase tracking-wider">
                <th className="py-1.5 px-2 text-center w-[42px]">Item</th>
                <th className="py-1.5 px-2.5 text-left">Modelo / Tecido / Cor / Personalização</th>
                <th className="py-1.5 px-2 text-center w-[102px]">Grade / Tam.</th>
                <th className="py-1.5 px-2 text-center w-[52px]">Qtd.</th>
                <th className="py-1.5 px-2.5 text-right w-[88px]">Unitário</th>
                <th className="py-1.5 px-2.5 text-right w-[94px]">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((r, i) => (
                <tr
                  key={r.numero}
                  className={`border-t border-[#C9D3DC] ${
                    i % 2 === 0 ? "bg-white" : "bg-[#F4F7F9]"
                  }`}
                >
                  <td className="py-1.5 px-2 text-center font-bold border-r border-[#C9D3DC]">
                    {r.numero}
                  </td>
                  <td className="py-1.5 px-2.5 border-r border-[#C9D3DC] min-h-[26px]">
                    {r.modelo ? (
                      <>
                        <div className="font-bold text-[#19232D] leading-snug">{r.modelo}</div>
                        {r.detalhes && (
                          <div className="text-[9.8px] text-[#37434E] leading-snug">{r.detalhes}</div>
                        )}
                      </>
                    ) : (
                      <div className="h-[15px]" />
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-center border-r border-[#C9D3DC] text-[9.5px] whitespace-pre-line leading-tight">
                    {r.grade}
                  </td>
                  <td className="py-1.5 px-2 text-center border-r border-[#C9D3DC]">
                    {r.quantidade}
                  </td>
                  <td className="py-1.5 px-2.5 text-right border-r border-[#C9D3DC]">
                    {r.unitario}
                  </td>
                  <td className="py-1.5 px-2.5 text-right font-bold">{r.subtotal}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Barra escura de totais */}
          <div className="flex items-center justify-between bg-[#19232D] px-3 py-1.5 text-white">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wide">
                Total de peças:
              </span>
              {summary.hasValidItems ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] font-bold">{summary.countDisplay}</span>
                  {summary.wordsDisplay && (
                    <span className="text-[9.2px] text-[#DCE3E9]">({summary.wordsDisplay})</span>
                  )}
                </div>
              ) : (
                <span className="inline-block min-w-[96px] min-h-[21px] rounded-[2px] bg-white px-2 py-0.5 text-[11px] font-bold text-[#19232D]">
                  {summary.countDisplay}
                </span>
              )}
            </div>

            {summary.hasValidItems ? (
              <div className="text-[15.5px] font-bold">VALOR TOTAL: {summary.totalDisplay}</div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wide">
                  Valor total do pedido (R$):
                </span>
                <span className="inline-block min-w-[116px] min-h-[21px] rounded-[2px] bg-white px-2 py-0.5 text-right text-[11px] font-bold text-[#19232D]">
                  {summary.totalDisplay}
                </span>
              </div>
            )}
          </div>

          {/* Prazo e Observações */}
          <div className="mt-2 grid grid-cols-2 gap-2.5">
            <div>
              <div className="text-[8.8px] font-bold uppercase text-[#626E78] mb-0.5">
                Prazo de produção / previsão de entrega
              </div>
              <div className="min-h-[23px] rounded-[2px] border border-[#C9D3DC] bg-[#F4F7F9] px-2.5 py-0.5 text-[11px]">
                {prod.prazo_entrega}
              </div>
            </div>
            <div>
              <div className="text-[8.8px] font-bold uppercase text-[#626E78] mb-0.5">
                Observações da produção / detalhes de arte
              </div>
              <div className="min-h-[23px] rounded-[2px] border border-[#C9D3DC] bg-[#F4F7F9] px-2.5 py-0.5 text-[11px]">
                {prod.observacoes}
              </div>
            </div>
          </div>

          {/* Croquis / Imagens de Referência */}
          <div className="mt-2.5">
            <div className="text-[8.8px] font-bold uppercase text-[#626E78] mb-1">
              Croquis / Imagens de Referência das Camisetas (Ficha Técnica)
            </div>
            <div className="space-y-2">
              {refBatches.map((batch, bIdx) => (
                <div
                  key={bIdx}
                  style={{ gridTemplateColumns: `repeat(${colsPerRow}, minmax(0, 1fr))` }}
                  className="grid gap-2"
                >
                  {Array.from({ length: colsPerRow }, (_, slot) => {
                    const ref = batch[slot];
                    const idxGlobal = bIdx * colsPerRow + slot + 1;
                    return ref ? (
                      <div
                        key={ref.id}
                        className="flex h-[96px] flex-col items-center justify-between rounded-[3px] border border-[#C9D3DC] bg-[#FAFBFD] p-1.5"
                      >
                        <img
                          src={ref.data_url}
                          alt={ref.titulo}
                          className="h-[72px] w-full object-contain"
                        />
                        <div className="w-full truncate text-center text-[8.2px] font-bold text-[#626E78]">
                          {ref.titulo}
                        </div>
                      </div>
                    ) : (
                      <div
                        key={slot}
                        className="flex h-[74px] flex-col items-center justify-center rounded-[3px] border border-dashed border-[#C9D3DC] bg-[#FAFBFD] px-2 text-center"
                      >
                        <div className="text-[9.3px] font-bold text-[#626E78]">
                          Referência {String(idxGlobal).padStart(2, "0")} — Camiseta
                        </div>
                        <div className="text-[8.4px] text-[#626E78]/85">
                          Espaço reservado para imagem / ficha técnica
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 5. Seção 3 — Condições de Pagamento */}
        <div className="mb-3">
          <h2 className="text-[11.2px] font-bold uppercase tracking-wide text-[#19232D] mb-1.5">
            3. Condições de Pagamento
          </h2>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { label: summary.advanceLabel, val: summary.advanceDisplay },
              { label: summary.balanceLabel, val: summary.balanceDisplay },
            ].map((card, i) => (
              <div
                key={i}
                className="rounded-[3px] border border-[#E5DACB] bg-[#F8F3EC] px-3 py-1.5"
              >
                <div className="text-[9px] font-bold uppercase text-[#626E78]">{card.label}</div>
                {summary.hasValidItems && card.val ? (
                  <div className="mt-0.5 text-[14.5px] font-bold text-[#19232D]">{card.val}</div>
                ) : (
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-[11.5px] font-bold text-[#19232D]">R$</span>
                    <span className="flex-1 min-h-[19px] rounded-[2px] border border-[#E5DACB] bg-white px-2 text-[11.5px] font-bold text-[#19232D]">
                      {card.val}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-12 gap-2.5">
            <div className="col-span-7">
              <div className="text-[8.8px] font-bold uppercase text-[#626E78] mb-0.5">
                Forma de pagamento (Pix, depósito bancário ou cartão)
              </div>
              <div className="min-h-[23px] rounded-[2px] border border-[#C9D3DC] bg-[#F4F7F9] px-2.5 py-0.5 text-[11px]">
                {state.pagamento.forma_pagamento}
              </div>
            </div>
            <div className="col-span-5">
              <div className="text-[8.8px] font-bold uppercase text-[#626E78] mb-0.5">
                Local e data
              </div>
              <div className="min-h-[23px] rounded-[2px] border border-[#C9D3DC] bg-[#F4F7F9] px-2.5 py-0.5 text-[11px]">
                {state.execucao.local_data}
              </div>
            </div>
          </div>
        </div>

        {/* 6. Concordância e Assinaturas lado a lado */}
        <div>
          <p className="mb-2 text-[10.3px] text-[#37434E]">
            As partes declaram estar de acordo com os dados da produção, especificações, valores,
            prazos e condições estabelecidos neste contrato.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[9.2px] font-bold uppercase text-[#626E78] mb-1">
                Contratada (Empresa)
              </div>
              <div className="flex h-[56px] items-end justify-center rounded-[3px] border border-[#C9D3DC] bg-white px-4 pb-1.5">
                <img
                  src={sigUrl}
                  alt="Assinatura Contratada"
                  className="max-h-[42px] w-auto object-contain"
                />
              </div>
              <div className="mt-1 text-[11px] font-bold text-[#19232D]">
                {co.responsavel} — {co.cargo}
              </div>
              <div className="text-[9.3px] text-[#626E78]">
                {co.nome_comercial} · CNPJ {co.cnpj}
              </div>
            </div>

            <div>
              <div className="text-[9.2px] font-bold uppercase text-[#626E78] mb-1">
                Contratante (Cliente)
              </div>
              <div className="flex h-[56px] items-end justify-center rounded-[3px] border border-[#C9D3DC] bg-white px-9 pb-2">
                <div className="w-full border-b border-[#19232D]" />
              </div>
              <div className="mt-1 text-[11px] font-bold text-[#19232D]">
                Assinatura do(a) Contratante / Representante
              </div>
              <div className="text-[9.3px] text-[#626E78]">Contratante do serviço (cliente)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Rodapé da folha */}
      <div className="mt-4 flex items-center justify-between border-t border-[#DCE3E9] pt-1.5 text-[9.2px] text-[#626E78]">
        <span>VOOALTO UNIFORMES · Contrato de confecção e fornecimento de uniformes</span>
        <span>1 / 1</span>
      </div>
    </div>
  );
};
