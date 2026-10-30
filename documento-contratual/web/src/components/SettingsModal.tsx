import React from "react";
import { Building2, Code2, Download, KeyRound, MonitorCheck, X } from "lucide-react";
import { ContratoState, EmpresaData } from "../types";
import { buildPythonCompatiblePayload, triggerDownload } from "../utils/browserGenerator";

interface Props {
  state: ContratoState;
  empresa: EmpresaData;
  geminiKey: string;
  onUpdateEmpresa: (patch: Partial<EmpresaData>) => void;
  onUpdateGeminiKey: (key: string) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<Props> = ({
  state,
  empresa,
  geminiKey,
  onUpdateEmpresa,
  onUpdateGeminiKey,
  onClose,
}) => {
  const handleExportJson = () => {
    const payload = buildPythonCompatiblePayload(state);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    triggerDownload(blob, "dados_contrato_vooalto.json");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#19232D]/70 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#C9D3DC] bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-[#19232D] px-6 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <Building2 className="h-4 w-4 text-[#C5635C]" />
            <h3 className="text-sm font-semibold">
              Dados Fixos da Empresa, IA Opcional e Integração Modular
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto p-6 text-xs">
          {/* Dados fixos VOOALTO */}
          <section className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#19232D]">
              Dados Fixos da Contratada (VOOALTO Uniformes)
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block font-semibold text-[#626E78]">Nome Comercial</label>
                <input
                  type="text"
                  value={empresa.nome_comercial}
                  onChange={(e) => onUpdateEmpresa({ nome_comercial: e.target.value })}
                  className="w-full rounded-lg border border-[#C9D3DC] bg-[#F4F7F9] px-3 py-2 text-[#19232D]"
                />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-[#626E78]">CNPJ</label>
                <input
                  type="text"
                  value={empresa.cnpj}
                  onChange={(e) => onUpdateEmpresa({ cnpj: e.target.value })}
                  className="w-full rounded-lg border border-[#C9D3DC] bg-[#F4F7F9] px-3 py-2 text-[#19232D]"
                />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-[#626E78]">
                  Telefone / WhatsApp
                </label>
                <input
                  type="text"
                  value={empresa.telefone}
                  onChange={(e) => onUpdateEmpresa({ telefone: e.target.value })}
                  className="w-full rounded-lg border border-[#C9D3DC] bg-[#F4F7F9] px-3 py-2 text-[#19232D]"
                />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-[#626E78]">
                  E-mail da Empresa (opcional no cabeçalho)
                </label>
                <input
                  type="email"
                  value={empresa.email}
                  onChange={(e) => onUpdateEmpresa({ email: e.target.value })}
                  placeholder="contato@vooaltouniformes.com.br"
                  className="w-full rounded-lg border border-[#C9D3DC] bg-[#F4F7F9] px-3 py-2 text-[#19232D]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block font-semibold text-[#626E78]">Endereço</label>
                <input
                  type="text"
                  value={empresa.endereco}
                  onChange={(e) => onUpdateEmpresa({ endereco: e.target.value })}
                  className="w-full rounded-lg border border-[#C9D3DC] bg-[#F4F7F9] px-3 py-2 text-[#19232D]"
                />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-[#626E78]">
                  Responsável na Assinatura
                </label>
                <input
                  type="text"
                  value={empresa.responsavel}
                  onChange={(e) => onUpdateEmpresa({ responsavel: e.target.value })}
                  className="w-full rounded-lg border border-[#C9D3DC] bg-[#F4F7F9] px-3 py-2 text-[#19232D]"
                />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-[#626E78]">Cargo</label>
                <input
                  type="text"
                  value={empresa.cargo}
                  onChange={(e) => onUpdateEmpresa({ cargo: e.target.value })}
                  className="w-full rounded-lg border border-[#C9D3DC] bg-[#F4F7F9] px-3 py-2 text-[#19232D]"
                />
              </div>
            </div>
          </section>

          {/* Chave Gemini opcional */}
          <section className="rounded-xl border border-[#DCE3E9] bg-[#FAFBFD] p-4 space-y-2">
            <div className="flex items-center gap-2 font-bold text-[#19232D]">
              <KeyRound className="h-4 w-4 text-[#C5635C]" />
              <span>Leitura com IA Google Gemini Vision (Opcional — já funciona 100% sem chave!)</span>
            </div>
            <p className="text-[#626E78] leading-relaxed">
              O sistema já executa renderização PDF, OCR Neural em Português e recorte de camisetas
              diretamente no navegador. Se desejar ler fichas manuscritas/fora de padrão via nuvem,
              cole opcionalmente uma chave Gemini API abaixo:
            </p>
            <input
              type="password"
              value={geminiKey}
              onChange={(e) => onUpdateGeminiKey(e.target.value)}
              placeholder="AIzaSy... (opcional)"
              className="w-full rounded-lg border border-[#C9D3DC] bg-white px-3 py-2 text-[#19232D]"
            />
          </section>

          {/* Uso direto HTML e Integração SDK */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[#DCE3E9] bg-[#F8F3EC]/60 p-4 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-[#19232D]">
                <MonitorCheck className="h-4 w-4 text-[#C5635C]" />
                <span>100% Autônomo via .HTML</span>
              </div>
              <p className="text-[#37434E] leading-relaxed">
                Abra <strong>Abrir_Sistema_Vooalto.html</strong> direto no navegador sem instalar
                nada. Arraste qualquer <strong>Ficha Técnica de Produção</strong> ou{" "}
                <strong>Proposta de Venda</strong> em PDF/imagem.
              </p>
            </div>
            <div className="rounded-xl border border-[#DCE3E9] bg-[#F4F7F9] p-4 space-y-2">
              <div className="flex items-center gap-2 font-bold text-[#19232D]">
                <Code2 className="h-4 w-4 text-[#C5635C]" />
                <span>Pronto para Integrar em Outro App</span>
              </div>
              <p className="text-[#37434E] leading-relaxed">
                Todo o motor está desacoplado em <code>web/src/sdk.ts</code> para importar direto na
                sua aplicação principal.
              </p>
              <button
                type="button"
                onClick={handleExportJson}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#C9D3DC] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#19232D] hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5 text-[#C5635C]" />
                Exportar JSON Estruturado
              </button>
            </div>
          </section>
        </div>

        <div className="flex justify-end border-t border-[#DCE3E9] bg-[#F4F7F9] px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-lg bg-[#19232D] px-5 py-2 text-xs font-semibold text-white hover:bg-[#263544]"
          >
            Salvar e Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
