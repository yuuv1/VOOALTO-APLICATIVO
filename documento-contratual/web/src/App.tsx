import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardPaste,
  Crop,
  Download,
  FileArchive,
  FileSpreadsheet,
  FileText,
  FileType2,
  FolderCheck,
  ImagePlus,
  Loader2,
  Plus,
  Printer,
  RotateCcw,
  Settings,
  Sparkles,
  Trash2,
  UploadCloud,
  Wifi,
} from "lucide-react";
import { EMBEDDED_LOGO_DATA_URL, EMBEDDED_SIGNATURE_DATA_URL } from "./generatedAssets";
import { EMBEDDED_MPTO_SAMPLE, EMBEDDED_PROPOSTA_ANA_REFS } from "./sampleMptoData";
import {
  ContratoState,
  createDefaultState,
  createEmptyItem,
  ImagemReferencia,
  ItemProducao,
  PaginaDocumento,
} from "./types";
import {
  computeContractSummary,
  formatBRLFromCents,
  parseCents,
  uid,
} from "./utils/calculations";
import { AnaliseResultado, analyzeUploadedFile } from "./utils/browserExtractor";
import { generateContractFiles, triggerDownload } from "./utils/browserGenerator";
import { ContractPreviewA4 } from "./components/ContractPreviewA4";
import { ImageCropModal } from "./components/ImageCropModal";
import { SettingsModal } from "./components/SettingsModal";

const STORAGE_STATE_KEY = "vooalto_contrato_state_v2";
const STORAGE_GEMINI_KEY = "vooalto_gemini_api_key_v1";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao ler imagem."));
    reader.readAsDataURL(file);
  });
}

export const App: React.FC = () => {
  const [state, setState] = useState<ContratoState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_STATE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...createDefaultState(), ...parsed };
      }
    } catch {
      /* ignore corrupt storage */
    }
    return createDefaultState();
  });

  const [geminiKey, setGeminiKey] = useState<string>(
    () => localStorage.getItem(STORAGE_GEMINI_KEY) || ""
  );
  const [localBackendOnline, setLocalBackendOnline] = useState<boolean>(false);
  const [saveToEntregas, setSaveToEntregas] = useState<boolean>(false);
  const [docPages, setDocPages] = useState<PaginaDocumento[]>([]);
  const [suggestedImages, setSuggestedImages] = useState<ImagemReferencia[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisStatus, setAnalysisStatus] = useState<string>("");
  const [analysisWarnings, setAnalysisWarnings] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState<"zip" | "docx" | "pdf" | null>(null);
  const [banner, setBanner] = useState<{
    type: "info" | "success" | "warn";
    text: string;
  } | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [showCropModal, setShowCropModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<"form" | "preview">("form");
  const [previewScale, setPreviewScale] = useState<number>(0.82);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  const proposalInputRef = useRef<HTMLInputElement>(null);
  const shirtImgInputRef = useRef<HTMLInputElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_STATE_KEY, JSON.stringify(state));
    } catch {
      /* ignore quota if large images */
    }
  }, [state]);

  useEffect(() => {
    localStorage.setItem(STORAGE_GEMINI_KEY, geminiKey);
  }, [geminiKey]);

  // Verifica se há API opcional ativa (ignorando protocolo file:// local para evitar aviso CORS)
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.protocol === "file:") {
      setLocalBackendOnline(false);
      return;
    }
    let active = true;
    fetch("./api/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        // Evita acionar acidentalmente /api/* de outra aplicação hospedeira.
        if (active && data?.ok === true && data?.versao === "2.1.0") setLocalBackendOnline(true);
      })
      .catch(() => {
        if (active) setLocalBackendOnline(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Captura prompt de instalação nativa PWA (Chrome / Edge / Android)
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Escala automática da folha A4 sem barra de rolagem horizontal
  useEffect(() => {
    const updateScale = () => {
      const el = previewContainerRef.current;
      if (!el) return;
      const available = el.clientWidth - 40;
      if (available > 260) {
        setPreviewScale(Math.min(1, Math.max(0.4, Number((available / 794).toFixed(3)))));
      }
    };
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [mobileTab]);

  const addReferenceImage = useCallback((titulo: string, dataUrl: string) => {
    setState((prev) => {
      const nextNum = prev.producao.imagens_referencia.length + 1;
      const finalTitle =
        titulo.trim() || `Ref. ${String(nextNum).padStart(2, "0")} — Camiseta`;
      return {
        ...prev,
        producao: {
          ...prev.producao,
          imagens_referencia: [
            ...prev.producao.imagens_referencia,
            {
              id: `ref-${uid()}`,
              titulo: finalTitle,
              data_url: dataUrl,
            },
          ],
        },
      };
    });
  }, []);

  // Suporte a Ctrl+V direto do CorelDRAW / Canva / WhatsApp Web
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            const dataUrl = await readFileAsDataUrl(file);
            addReferenceImage("", dataUrl);
            setBanner({
              type: "success",
              text: "Imagem da camiseta colada (Ctrl+V) e adicionada ao contrato!",
            });
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addReferenceImage]);

  const applyExtractionResult = useCallback(
    (res: AnaliseResultado, sourceLabel: string) => {
      setDocPages(res.paginas || []);
      setSuggestedImages(res.imagens_sugeridas || []);
      setAnalysisWarnings(res.avisos || []);

      setState((prev) => {
        const freshBase = createDefaultState();
        const hasExtracted = res.itens.length > 0;
        const mappedItems: ItemProducao[] = hasExtracted
          ? res.itens.map((it, idx) => ({
              id: it.id || uid(),
              numero: String(idx + 1).padStart(2, "0"),
              modelo: it.modelo || "",
              tecido: it.tecido || "",
              cor: it.cor || "",
              personalizacao: it.personalizacao || "",
              grade: it.grade || "",
              quantidade: Number(it.quantidade) || 0,
              valor_unitario: it.valor_unitario || "",
            }))
          : prev.producao.itens;

        const autoRefs =
          (res.imagens_sugeridas || []).length > 0
            ? res.imagens_sugeridas || []
            : hasExtracted
            ? []
            : prev.producao.imagens_referencia;

        const ep =
          res.pagamento?.entrada_percentual !== undefined
            ? res.pagamento.entrada_percentual
            : freshBase.pagamento.entrada_percentual;
        const sp =
          res.pagamento?.saldo_percentual !== undefined
            ? res.pagamento.saldo_percentual
            : freshBase.pagamento.saldo_percentual;

        return {
          ...prev,
          cliente: {
            nome_razao_social: res.cliente?.nome_razao_social || "",
            cpf_cnpj: res.cliente?.cpf_cnpj || "",
            telefone: res.cliente?.telefone || "",
            email: res.cliente?.email || "",
            endereco: res.cliente?.endereco || "",
            cidade_uf_cep: res.cliente?.cidade_uf_cep || "",
          },
          producao: {
            ...freshBase.producao,
            itens: mappedItems,
            prazo_entrega:
              res.producao?.prazo_entrega || freshBase.producao.prazo_entrega,
            observacoes: res.producao?.observacoes || "",
            imagens_referencia: autoRefs,
          },
          pagamento: {
            ...freshBase.pagamento,
            entrada_percentual: ep,
            saldo_percentual: sp,
            forma_pagamento:
              res.pagamento?.forma_pagamento || freshBase.pagamento.forma_pagamento,
          },
          execucao: {
            ...freshBase.execucao,
            local_data: res.execucao?.local_data || freshBase.execucao.local_data,
          },
        };
      });

      if (res.itens.length > 0) {
        const totalCents = res.itens.reduce(
          (acc, it) => acc + (Number(it.quantidade) || 0) * parseCents(it.valor_unitario),
          0
        );
        const engineLabel =
          res.metodo === "python_ocr"
            ? "OCR Neural Local"
            : res.metodo === "ocr_navegador"
            ? "OCR Neural no Navegador"
            : res.metodo === "gemini_ia"
            ? "IA Gemini Vision"
            : "Leitura Direta";
        setBanner({
          type: (res.avisos || []).length > 0 ? "warn" : "success",
          text: (res.avisos || []).length > 0
            ? `LEITURA PARCIAL de "${sourceLabel}": ${(res.avisos || []).join(" | ")} Revise os campos e as imagens antes de gerar o contrato.`
            : `"${sourceLabel}" lido com sucesso (${engineLabel}): ${res.itens.length} ${
            res.itens.length === 1 ? "item extraído" : "itens extraídos"
          }${totalCents > 0 ? ` · Total ${formatBRLFromCents(totalCents)}` : ""}${
            res.paginas.length > 0
              ? " · Use 'Recortar Camiseta da Ficha' se quiser destacar outro detalhe."
              : ""
          }`,
        });
      } else {
        setBanner({
          type: "warn",
          text: `"${sourceLabel}" carregado. Confira/complete os itens abaixo ou clique em 'Recortar Camiseta da Ficha' para inserir o desenho no contrato.`,
        });
      }
    },
    []
  );

  const handleFilesSelected = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;

    const initialMsg = `Lendo "${list[0].name}" e extraindo itens, valores e imagens...`;
    setIsAnalyzing(true);
    setAnalysisStatus(initialMsg);
    setBanner({
      type: "info",
      text: initialMsg,
    });

    try {
      const mainFile = list[0];
      const res = await analyzeUploadedFile(
        mainFile,
        localBackendOnline,
        geminiKey,
        (progressMsg) => {
          setAnalysisStatus(progressMsg);
          setBanner({ type: "info", text: progressMsg });
        }
      );
      applyExtractionResult(res, mainFile.name);

      for (const extra of list.slice(1)) {
        if (extra.type.startsWith("image/")) {
          const dataUrl = await readFileAsDataUrl(extra);
          addReferenceImage(extra.name.replace(/\.[^.]+$/, ""), dataUrl);
        }
      }
    } catch (err) {
      setBanner({
        type: "warn",
        text: err instanceof Error ? err.message : "Erro ao processar o arquivo anexado.",
      });
    } finally {
      setIsAnalyzing(false);
      setAnalysisStatus("");
    }
  };

  const handleLoadSampleProposal = async () => {
    setIsAnalyzing(true);
    setBanner({
      type: "info",
      text: "Carregando dados extraídos de 'PROPOSTA DE VENDA ANA.pdf'...",
    });
    try {
      if (localBackendOnline) {
        const resp = await fetch("./api/exemplo-proposta");
        if (resp.ok) {
          const data = await resp.json();
          const pages: PaginaDocumento[] = (data.paginas || []).map(
            (p: Record<string, unknown>) => ({
              id: uid(),
              origem: "PROPOSTA DE VENDA ANA.pdf",
              pagina: Number(p.pagina || 1),
              largura: Number(p.largura || 1000),
              altura: Number(p.altura || 1400),
              data_url: String(p.data_url || ""),
            })
          );
          applyExtractionResult(
            {
              arquivo: "PROPOSTA DE VENDA ANA.pdf",
              itens: (data.itens || []).map((it: Record<string, unknown>, idx: number) => ({
                id: uid(),
                numero: String(idx + 1).padStart(2, "0"),
                modelo: String(it.modelo || ""),
                tecido: String(it.tecido || ""),
                cor: String(it.cor || ""),
                personalizacao: String(it.personalizacao || ""),
                grade: String(it.grade || ""),
                quantidade: Number(it.quantidade || 1),
                valor_unitario: String(it.valor_unitario || "0.00"),
              })),
              cliente: data.cliente || {},
              pagamento: data.pagamento || {},
              producao: data.producao || {},
              paginas: pages,
              imagens_sugeridas: (data.imagens_sugeridas || []).map(
                (im: Record<string, string>) => ({
                  id: uid(),
                  titulo: im.titulo,
                  data_url: im.data_url,
                })
              ),
              metodo: "python_ocr",
            },
            "PROPOSTA DE VENDA ANA.pdf"
          );
          return;
        }
      }

      // Modo 100% navegador (.html direto / offline) com imagens reais das camisetas recortadas
      applyExtractionResult(
        {
          arquivo: "PROPOSTA DE VENDA ANA.pdf",
          itens: [
            {
              id: uid(),
              numero: "01",
              modelo: "Camiseta gola polo faixa lateral e vivo",
              tecido: "Malha fria PV antipilling",
              cor: "",
              personalizacao: "Silk digital: frente (peito) e costas",
              grade: "",
              quantidade: 9,
              valor_unitario: "69.90",
            },
            {
              id: uid(),
              numero: "02",
              modelo: "Camiseta gola polo m/curta tradicional",
              tecido: "Malha fria PV antipilling",
              cor: "",
              personalizacao: "Silk digital: frente (peito) e costas",
              grade: "",
              quantidade: 45,
              valor_unitario: "59.90",
            },
            {
              id: uid(),
              numero: "03",
              modelo: "Camiseta gola redonda manga bicolor",
              tecido: "Malha fria PV antipilling",
              cor: "",
              personalizacao: "Silk digital: frente (peito), costas e mangas",
              grade: "",
              quantidade: 18,
              valor_unitario: "54.90",
            },
          ],
          cliente: {},
          pagamento: {
            entrada_percentual: 50,
            saldo_percentual: 50,
            forma_pagamento: "Depósito bancário, Pix ou cartão de crédito",
          },
          producao: {
            prazo_entrega: "Conforme combinação na aprovação do pedido",
            observacoes: "Proposta comercial com validade de 10 dias · Consultor Gabriel",
          },
          paginas: [],
          imagens_sugeridas: EMBEDDED_PROPOSTA_ANA_REFS.map((im) => ({
            id: uid(),
            titulo: im.titulo,
            data_url: im.data_url,
          })),
          metodo: "ocr_navegador",
        },
        "PROPOSTA DE VENDA ANA.pdf"
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleLoadSampleFichaMPTO = async () => {
    setIsAnalyzing(true);
    setBanner({
      type: "info",
      text: "Carregando Ficha Técnica de Produção Nº 3374 — MPTO...",
    });
    try {
      if (localBackendOnline) {
        const resp = await fetch("./api/exemplo-ficha-mpto");
        if (resp.ok) {
          const data = await resp.json();
          const pages: PaginaDocumento[] = (data.paginas || []).map(
            (p: Record<string, unknown>) => ({
              id: uid(),
              origem: "FICHA_TECNICA_3374_MPTO_Original.pdf",
              pagina: Number(p.pagina || 1),
              largura: Number(p.largura || 1000),
              altura: Number(p.altura || 1400),
              data_url: String(p.data_url || ""),
            })
          );
          applyExtractionResult(
            {
              arquivo: "FICHA_TECNICA_3374_MPTO_Original.pdf",
              itens: (data.itens || []).map((it: Record<string, unknown>, idx: number) => ({
                id: uid(),
                numero: String(idx + 1).padStart(2, "0"),
                modelo: String(it.modelo || ""),
                tecido: String(it.tecido || ""),
                cor: String(it.cor || ""),
                personalizacao: String(it.personalizacao || ""),
                grade: String(it.grade || ""),
                quantidade: Number(it.quantidade || 1),
                valor_unitario: String(it.valor_unitario || "0.00"),
              })),
              cliente: data.cliente || {},
              pagamento: data.pagamento || {},
              producao: data.producao || {},
              execucao: data.execucao || {},
              paginas: pages,
              imagens_sugeridas: (data.imagens_sugeridas || []).map(
                (im: Record<string, string>) => ({
                  id: uid(),
                  titulo: im.titulo,
                  data_url: im.data_url,
                })
              ),
              metodo: "python_ocr",
            },
            "FICHA TÉCNICA DE PRODUÇÃO - MPTO.pdf"
          );
          return;
        }
      }

      // Modo 100% navegador (.html direto / offline) com os 5 itens, grades exatas e 5 camisetas recortadas
      applyExtractionResult(
        {
          arquivo: "FICHA_TECNICA_3374_MPTO_Original.pdf",
          itens: EMBEDDED_MPTO_SAMPLE.producao.itens.map((it, idx) => ({
            id: uid(),
            numero: String(idx + 1).padStart(2, "0"),
            modelo: it.modelo,
            tecido: it.tecido,
            cor: it.cor,
            personalizacao: it.personalizacao,
            grade: it.grade,
            quantidade: it.quantidade,
            valor_unitario: it.valor_unitario,
          })),
          cliente: { ...EMBEDDED_MPTO_SAMPLE.cliente },
          pagamento: { ...EMBEDDED_MPTO_SAMPLE.pagamento },
          producao: {
            prazo_entrega: EMBEDDED_MPTO_SAMPLE.producao.prazo_entrega,
            observacoes: EMBEDDED_MPTO_SAMPLE.producao.observacoes,
          },
          execucao: { ...EMBEDDED_MPTO_SAMPLE.execucao },
          paginas: [],
          imagens_sugeridas: EMBEDDED_MPTO_SAMPLE.producao.imagens_referencia.map((im) => ({
            id: uid(),
            titulo: im.titulo,
            data_url: im.data_url,
          })),
          metodo: "ocr_navegador",
        },
        "FICHA TÉCNICA DE PRODUÇÃO Nº 3374 - MPTO.pdf"
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleShirtImagesUpload = async (files: FileList | null) => {
    if (!files || !files.length) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const url = await readFileAsDataUrl(file);
      addReferenceImage(file.name.replace(/\.[^.]+$/, ""), url);
    }
    setBanner({
      type: "success",
      text: "Imagem(ns) de referência das camisetas adicionada(s) ao contrato!",
    });
  };

  const handleDownload = async (kind: "zip" | "docx" | "pdf") => {
    if (analysisWarnings.length > 0) {
      const confirmed = window.confirm(
        `A leitura automática apresentou ${analysisWarnings.length} ponto(s) que precisam de revisão:\n\n` +
        analysisWarnings.join("\n") +
        "\n\nConferiu e corrigiu manualmente TODOS esses dados no contrato? Clique OK somente se estiverem certos."
      );
      if (!confirmed) return;
    }
    setIsGenerating(kind);
    try {
      const bundle = await generateContractFiles(
        state,
        localBackendOnline,
        saveToEntregas,
        EMBEDDED_LOGO_DATA_URL,
        EMBEDDED_SIGNATURE_DATA_URL
      );
      if (kind === "zip") {
        triggerDownload(bundle.zipBlob, `${bundle.nomeBase}_Word_e_PDF.zip`);
      } else if (kind === "docx") {
        triggerDownload(bundle.docxBlob, `${bundle.nomeBase}.docx`);
      } else {
        triggerDownload(bundle.pdfBlob, `${bundle.nomeBase}.pdf`);
      }

      const viaLabel =
        bundle.geradoPor === "python"
          ? "Motor Local VOOALTO"
          : "Motor PWA Autônomo";
      const savedExtra =
        saveToEntregas && localBackendOnline
          ? " (também salvo na pasta entregas/)"
          : "";
      setBanner({
        type: "success",
        text:
          kind === "zip"
            ? `Pacote completo gerado (${bundle.nomeBase}.docx + .pdf) via ${viaLabel}${savedExtra}!`
            : `Arquivo ${bundle.nomeBase}.${kind} gerado com sucesso via ${viaLabel}${savedExtra}!`,
      });
    } catch (err) {
      setBanner({
        type: "warn",
        text: err instanceof Error ? err.message : "Falha ao gerar arquivo do contrato.",
      });
    } finally {
      setIsGenerating(null);
    }
  };

  const handleResetBlankTemplate = () => {
    setState((prev) => ({
      ...createDefaultState(),
      empresa: prev.empresa,
    }));
    setDocPages([]);
    setSuggestedImages([]);
    setBanner({
      type: "info",
      text: "Formulário limpo: pronto para gerar um modelo de contrato em branco ou anexar nova proposta.",
    });
  };

  const updateItem = (id: string, patch: Partial<ItemProducao>) => {
    setState((prev) => ({
      ...prev,
      producao: {
        ...prev.producao,
        itens: prev.producao.itens.map((it) => (it.id === id ? { ...it, ...patch } : it)),
      },
    }));
  };

  const removeItem = (id: string) => {
    setState((prev) => {
      const remaining = prev.producao.itens.filter((it) => it.id !== id);
      return {
        ...prev,
        producao: {
          ...prev.producao,
          itens: remaining.length > 0 ? remaining : [createEmptyItem(1)],
        },
      };
    });
  };

  const summary = computeContractSummary(state);

  return (
    <div className="min-h-screen flex flex-col bg-[#EDF1F5] text-[#19232D]">
      {/* Top Navbar */}
      <header className="no-print sticky top-0 z-30 border-b border-[#2A3948] bg-[#19232D] text-white shadow-md">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3.5">
            <div className="rounded-lg bg-white px-2.5 py-1 shadow-xs">
              <img
                src={EMBEDDED_LOGO_DATA_URL}
                alt="VOOALTO Uniformes"
                className="h-7 w-auto object-contain"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-tight sm:text-base">
                  Gerador Automático de Contratos
                </h1>
                <span className="hidden rounded-full bg-[#C5635C]/25 border border-[#C5635C]/50 px-2.5 py-0.5 text-[11px] font-semibold text-[#F6D5D2] sm:inline-flex items-center gap-1">
                  <Wifi className="h-3 w-3" />
                  {localBackendOnline ? "Motor Local Python Ativo" : "100% Autônomo (.HTML / Web)"}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 hidden md:block">
                Arraste qualquer Ficha Técnica de Produção ou Proposta de Venda para preencher e
                gerar o Word (.docx) e o PDF preenchível idênticos.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {installPrompt && (
              <button
                type="button"
                onClick={async () => {
                  await installPrompt.prompt();
                  setInstallPrompt(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/30"
              >
                <Download className="h-3.5 w-3.5" />
                Instalar Aplicativo
              </button>
            )}

            <button
              type="button"
              onClick={handleResetBlankTemplate}
              title="Limpar todos os campos para gerar um contrato em branco"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Limpar / Em Branco</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10"
            >
              <Settings className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Configurações</span>
            </button>

            <div className="h-5 w-[1px] bg-white/15 hidden sm:block" />

            <button
              type="button"
              disabled={isGenerating !== null}
              onClick={() => handleDownload("docx")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/12 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20 disabled:opacity-50"
            >
              {isGenerating === "docx" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileType2 className="h-3.5 w-3.5 text-sky-300" />
              )}
              Word (.docx)
            </button>

            <button
              type="button"
              disabled={isGenerating !== null}
              onClick={() => handleDownload("pdf")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/12 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20 disabled:opacity-50"
            >
              {isGenerating === "pdf" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5 text-amber-300" />
              )}
              PDF Preenchível
            </button>

            <button
              type="button"
              disabled={isGenerating !== null}
              onClick={() => handleDownload("zip")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#C5635C] px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#b3534c] disabled:opacity-50"
            >
              {isGenerating === "zip" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileArchive className="h-3.5 w-3.5" />
              )}
              Baixar Ambos (.ZIP)
            </button>
          </div>
        </div>

        {/* Mobile Tab Switcher */}
        <div className="flex border-t border-white/10 bg-[#131B23] xl:hidden">
          <button
            type="button"
            onClick={() => setMobileTab("form")}
            className={`flex-1 py-2.5 text-xs font-semibold transition ${
              mobileTab === "form"
                ? "border-b-2 border-[#C5635C] text-white"
                : "text-slate-400"
            }`}
          >
            1. Ficha Técnica & Dados do Pedido
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("preview")}
            className={`flex-1 py-2.5 text-xs font-semibold transition ${
              mobileTab === "preview"
                ? "border-b-2 border-[#C5635C] text-white"
                : "text-slate-400"
            }`}
          >
            2. Visualizar Contrato A4 ({summary.hasValidItems ? summary.totalDisplay : "Em branco"})
          </button>
        </div>
      </header>

      {/* Feedback Banner */}
      {banner && (
        <div
          className={`no-print border-b px-4 py-2.5 text-xs font-medium ${
            banner.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : banner.type === "warn"
              ? "border-amber-200 bg-amber-50 text-amber-950"
              : "border-sky-200 bg-sky-50 text-sky-950"
          }`}
        >
          <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {banner.type === "success" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : banner.type === "warn" ? (
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
              ) : (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-600" />
              )}
              <span>{banner.text}</span>
            </div>
            <button
              onClick={() => setBanner(null)}
              className="text-[11px] font-semibold opacity-70 hover:opacity-100"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace */}
      <main className="mx-auto w-full max-w-[1680px] flex-1 px-4 py-5 lg:px-6">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          {/* LEFT PANEL: Upload + Structured Editor */}
          <div
            className={`no-print space-y-5 xl:col-span-5 ${
              mobileTab === "preview" ? "hidden xl:block" : "block"
            }`}
          >
            {/* STEP 1: Dropzone Proposta / Ficha Técnica */}
            <section className="rounded-2xl border border-[#DCE3E9] bg-white p-5 shadow-xs">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#C5635C]">
                    Passo 1 · Leitura Automática
                  </span>
                  <h2 className="text-sm font-bold text-[#19232D]">
                    Anexar Proposta de Venda ou Ficha Técnica
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isAnalyzing}
                    onClick={handleLoadSampleFichaMPTO}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#C5635C]/40 bg-[#C5635C]/10 px-2.5 py-1.5 text-xs font-semibold text-[#19232D] transition hover:bg-[#C5635C]/20 disabled:opacity-50"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-[#C5635C]" />
                    Testar Ficha MPTO
                  </button>
                  <button
                    type="button"
                    disabled={isAnalyzing}
                    onClick={handleLoadSampleProposal}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5DACB] bg-[#F8F3EC] px-2.5 py-1.5 text-xs font-semibold text-[#19232D] transition hover:bg-[#efe5d8] disabled:opacity-50"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-[#C5635C]" />
                    Testar Proposta (Ana)
                  </button>
                </div>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  if (e.dataTransfer.files?.length) {
                    handleFilesSelected(e.dataTransfer.files);
                  }
                }}
                onClick={() => proposalInputRef.current?.click()}
                className={`cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition ${
                  isDragOver
                    ? "border-[#C5635C] bg-[#F8F3EC]/70"
                    : "border-[#C9D3DC] bg-[#F4F7F9]/70 hover:border-[#19232D] hover:bg-[#F4F7F9]"
                }`}
              >
                <input
                  ref={proposalInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.txt"
                  onChange={(e) => {
                    if (e.target.files?.length) handleFilesSelected(e.target.files);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
                {isAnalyzing ? (
                  <div className="flex flex-col items-center py-2">
                    <Loader2 className="h-8 w-8 animate-spin text-[#C5635C]" />
                    <p className="mt-2 text-xs font-semibold text-[#19232D]">
                      {analysisStatus || "Analisando documento e extraindo especificações e valores..."}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="rounded-full bg-white p-2.5 shadow-2xs border border-[#DCE3E9]">
                      <UploadCloud className="h-6 w-6 text-[#C5635C]" />
                    </div>
                    <p className="mt-2.5 text-xs font-semibold text-[#19232D]">
                      Arraste aqui a Ficha Técnica de Produção ou a Proposta de Venda
                    </p>
                    <p className="mt-1 text-[11px] text-[#626E78]">
                      100% no navegador (PDF Print-to-PDF, Canva, JPG, PNG ou DOCX) · Extrai
                      cliente, cores, grades, valores e recorta as camisetas automaticamente
                    </p>
                  </div>
                )}
              </div>

              {localBackendOnline && (
                <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg border border-[#DCE3E9] bg-[#FAFBFD] px-3 py-2 text-xs text-[#37434E]">
                  <input
                    type="checkbox"
                    checked={saveToEntregas}
                    onChange={(e) => setSaveToEntregas(e.target.checked)}
                    className="rounded border-[#C9D3DC] text-[#C5635C] focus:ring-0"
                  />
                  <FolderCheck className="h-3.5 w-3.5 text-[#C5635C]" />
                  <span>
                    Ao gerar, atualizar também os arquivos na pasta <strong>entregas/</strong> do
                    projeto
                  </span>
                </label>
              )}
            </section>

            {/* STEP 2: Croquis / Imagens das Camisetas */}
            <section className="rounded-2xl border border-[#DCE3E9] bg-white p-5 shadow-xs space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#C5635C]">
                    Croquis & Mockups
                  </span>
                  <h2 className="text-sm font-bold text-[#19232D]">
                    Imagens das Camisetas no Contrato ({state.producao.imagens_referencia.length})
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {docPages.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowCropModal(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#19232D] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#273645]"
                    >
                      <Crop className="h-3.5 w-3.5 text-[#C5635C]" />
                      Recortar Camiseta da Ficha
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => shirtImgInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#C9D3DC] bg-[#F4F7F9] px-3 py-1.5 text-xs font-semibold text-[#19232D] transition hover:bg-slate-200/70"
                  >
                    <ImagePlus className="h-3.5 w-3.5 text-[#C5635C]" />
                    Anexar Imagem
                  </button>
                  <input
                    ref={shirtImgInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => {
                      handleShirtImagesUpload(e.target.files);
                      e.target.value = "";
                    }}
                    className="hidden"
                  />
                </div>
              </div>

              <p className="flex items-center gap-1.5 text-[11px] text-[#626E78]">
                <ClipboardPaste className="h-3.5 w-3.5 shrink-0 text-[#626E78]" />
                <span>
                  Dica rápida: copie o desenho no CorelDRAW / Canva / WhatsApp e pressione{" "}
                  <strong>Ctrl + V</strong> direto nesta tela! Se deixar vazio, o contrato reserva
                  os 3 quadros tracejados padrão.
                </span>
              </p>

              {suggestedImages.length > 0 && (
                <div className="rounded-xl border border-[#DCE3E9] bg-[#F4F7F9] p-3">
                  <div className="mb-2 text-[11px] font-bold text-[#37434E]">
                    Imagens encontradas no arquivo anexado (clique para adicionar ao contrato):
                  </div>
                  <div className="flex gap-2.5 overflow-x-auto pb-1">
                    {suggestedImages.map((img) => (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() => addReferenceImage(img.titulo, img.data_url)}
                        className="group shrink-0 rounded-lg border border-[#C9D3DC] bg-white p-1.5 text-left transition hover:border-[#C5635C]"
                      >
                        <img
                          src={img.data_url}
                          alt={img.titulo}
                          className="h-14 w-20 object-contain"
                        />
                        <div className="mt-1 max-w-[80px] truncate text-[10px] font-semibold text-[#19232D] group-hover:text-[#C5635C]">
                          + Usar croqui
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {state.producao.imagens_referencia.length > 0 && (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {state.producao.imagens_referencia.map((ref, idx) => (
                    <div
                      key={ref.id}
                      className="rounded-xl border border-[#C9D3DC] bg-[#FAFBFD] p-2.5 space-y-2"
                    >
                      <div className="relative flex h-24 items-center justify-center rounded-lg bg-white border border-[#DCE3E9] p-1.5">
                        <img
                          src={ref.data_url}
                          alt={ref.titulo}
                          className="max-h-full max-w-full object-contain"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setState((prev) => ({
                              ...prev,
                              producao: {
                                ...prev.producao,
                                imagens_referencia: prev.producao.imagens_referencia.filter(
                                  (r) => r.id !== ref.id
                                ),
                              },
                            }))
                          }
                          title="Remover imagem"
                          className="absolute top-1 right-1 rounded-md bg-white/90 p-1 text-rose-600 shadow-2xs hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={ref.titulo}
                        onChange={(e) =>
                          setState((prev) => ({
                            ...prev,
                            producao: {
                              ...prev.producao,
                              imagens_referencia: prev.producao.imagens_referencia.map((r, i) =>
                                i === idx ? { ...r, titulo: e.target.value } : r
                              ),
                            },
                          }))
                        }
                        className="w-full rounded-md border border-[#C9D3DC] bg-white px-2 py-1 text-[11px] font-semibold text-[#19232D]"
                        placeholder="Legenda da camiseta"
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* STEP 3: Dados do Cliente */}
            <section className="rounded-2xl border border-[#DCE3E9] bg-white p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#19232D]">
                  1. Dados do(a) Contratante (Cliente)
                </h2>
                <span className="text-[11px] text-[#626E78]">
                  Opcional — pode deixar em branco p/ cliente preencher
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                <div className="sm:col-span-12">
                  <label className="mb-1 block text-[11px] font-semibold text-[#626E78]">
                    Nome completo ou razão social
                  </label>
                  <input
                    type="text"
                    value={state.cliente.nome_razao_social}
                    onChange={(e) =>
                      setState((p) => ({
                        ...p,
                        cliente: { ...p.cliente, nome_razao_social: e.target.value },
                      }))
                    }
                    placeholder="Em branco = campo editável para o cliente preencher"
                    className="w-full rounded-lg border border-[#C9D3DC] bg-[#F4F7F9] px-3 py-2 text-xs text-[#19232D] focus:border-[#19232D] focus:bg-white focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className="mb-1 block text-[11px] font-semibold text-[#626E78]">
                    CPF / CNPJ
                  </label>
                  <input
                    type="text"
                    value={state.cliente.cpf_cnpj}
                    onChange={(e) =>
                      setState((p) => ({
                        ...p,
                        cliente: { ...p.cliente, cpf_cnpj: e.target.value },
                      }))
                    }
                    placeholder="000.000.000-00"
                    className="w-full rounded-lg border border-[#C9D3DC] bg-[#F4F7F9] px-3 py-2 text-xs text-[#19232D] focus:border-[#19232D] focus:bg-white focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className="mb-1 block text-[11px] font-semibold text-[#626E78]">
                    Telefone / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={state.cliente.telefone}
                    onChange={(e) =>
                      setState((p) => ({
                        ...p,
                        cliente: { ...p.cliente, telefone: e.target.value },
                      }))
                    }
                    placeholder="(62) 90000-0000"
                    className="w-full rounded-lg border border-[#C9D3DC] bg-[#F4F7F9] px-3 py-2 text-xs text-[#19232D] focus:border-[#19232D] focus:bg-white focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className="mb-1 block text-[11px] font-semibold text-[#626E78]">
                    E-mail
                  </label>
                  <input
                    type="email"
                    value={state.cliente.email}
                    onChange={(e) =>
                      setState((p) => ({
                        ...p,
                        cliente: { ...p.cliente, email: e.target.value },
                      }))
                    }
                    placeholder="cliente@empresa.com.br"
                    className="w-full rounded-lg border border-[#C9D3DC] bg-[#F4F7F9] px-3 py-2 text-xs text-[#19232D] focus:border-[#19232D] focus:bg-white focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-8">
                  <label className="mb-1 block text-[11px] font-semibold text-[#626E78]">
                    Endereço completo
                  </label>
                  <input
                    type="text"
                    value={state.cliente.endereco}
                    onChange={(e) =>
                      setState((p) => ({
                        ...p,
                        cliente: { ...p.cliente, endereco: e.target.value },
                      }))
                    }
                    placeholder="Rua/Av., nº, bairro, complemento"
                    className="w-full rounded-lg border border-[#C9D3DC] bg-[#F4F7F9] px-3 py-2 text-xs text-[#19232D] focus:border-[#19232D] focus:bg-white focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className="mb-1 block text-[11px] font-semibold text-[#626E78]">
                    Cidade / UF · CEP
                  </label>
                  <input
                    type="text"
                    value={state.cliente.cidade_uf_cep}
                    onChange={(e) =>
                      setState((p) => ({
                        ...p,
                        cliente: { ...p.cliente, cidade_uf_cep: e.target.value },
                      }))
                    }
                    placeholder="Goiânia / GO"
                    className="w-full rounded-lg border border-[#C9D3DC] bg-[#F4F7F9] px-3 py-2 text-xs text-[#19232D] focus:border-[#19232D] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
            </section>

            {/* STEP 4: Itens da Produção */}
            <section className="rounded-2xl border border-[#DCE3E9] bg-white p-5 shadow-xs space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-[#19232D]">
                    2. Dados da Produção e Especificações
                  </h2>
                  <p className="text-[11px] text-[#626E78]">
                    Subtotais, total de peças e parcelas são calculados automaticamente.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setState((prev) => ({
                      ...prev,
                      producao: {
                        ...prev.producao,
                        itens: [
                          ...prev.producao.itens,
                          createEmptyItem(prev.producao.itens.length + 1),
                        ],
                      },
                    }))
                  }
                  className="inline-flex items-center gap-1 rounded-lg bg-[#19232D] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#273645]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar Item
                </button>
              </div>

              <div className="space-y-3">
                {state.producao.itens.map((item, idx) => {
                  const unitCents = parseCents(item.valor_unitario);
                  const autoSub =
                    item.quantidade > 0 && unitCents > 0
                      ? formatBRLFromCents(item.quantidade * unitCents)
                      : "—";

                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-[#DCE3E9] bg-[#FAFBFD] p-3.5 space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#19232D]">
                          <FileSpreadsheet className="h-3.5 w-3.5 text-[#C5635C]" />
                          Item {String(idx + 1).padStart(2, "0")}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-[#19232D]">
                            Subtotal: {autoSub}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            title="Remover item"
                            className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
                        <div className="sm:col-span-7">
                          <label className="mb-0.5 block text-[10.5px] font-semibold text-[#626E78]">
                            Modelo da Camiseta / Uniforme
                          </label>
                          <input
                            type="text"
                            value={item.modelo}
                            onChange={(e) => updateItem(item.id, { modelo: e.target.value })}
                            placeholder="Ex.: Camiseta gola polo faixa lateral e vivo"
                            className="w-full rounded-lg border border-[#C9D3DC] bg-white px-2.5 py-1.5 text-xs font-medium text-[#19232D]"
                          />
                        </div>

                        <div className="sm:col-span-5">
                          <label className="mb-0.5 block text-[10.5px] font-semibold text-[#626E78]">
                            Tecido / Malha
                          </label>
                          <input
                            type="text"
                            value={item.tecido}
                            onChange={(e) => updateItem(item.id, { tecido: e.target.value })}
                            placeholder="Ex.: Malha fria PV antipilling"
                            className="w-full rounded-lg border border-[#C9D3DC] bg-white px-2.5 py-1.5 text-xs text-[#19232D]"
                          />
                        </div>

                        <div className="sm:col-span-4">
                          <label className="mb-0.5 block text-[10.5px] font-semibold text-[#626E78]">
                            Cor(es)
                          </label>
                          <input
                            type="text"
                            value={item.cor}
                            onChange={(e) => updateItem(item.id, { cor: e.target.value })}
                            placeholder="Ex.: Azul marinho / Branco"
                            className="w-full rounded-lg border border-[#C9D3DC] bg-white px-2.5 py-1.5 text-xs text-[#19232D]"
                          />
                        </div>

                        <div className="sm:col-span-8">
                          <label className="mb-0.5 block text-[10.5px] font-semibold text-[#626E78]">
                            Personalização (Silk / Bordado / Sublimação)
                          </label>
                          <input
                            type="text"
                            value={item.personalizacao}
                            onChange={(e) =>
                              updateItem(item.id, { personalizacao: e.target.value })
                            }
                            placeholder="Ex.: Silk digital: frente (peito) e costas"
                            className="w-full rounded-lg border border-[#C9D3DC] bg-white px-2.5 py-1.5 text-xs text-[#19232D]"
                          />
                        </div>

                        <div className="sm:col-span-6">
                          <label className="mb-0.5 block text-[10.5px] font-semibold text-[#626E78]">
                            Quantidade
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={item.quantidade > 0 ? item.quantidade : ""}
                            onChange={(e) =>
                              updateItem(item.id, {
                                quantidade: Math.max(0, Math.round(Number(e.target.value) || 0)),
                              })
                            }
                            placeholder="0"
                            className="w-full rounded-lg border border-[#C9D3DC] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#19232D]"
                          />
                        </div>

                        <div className="sm:col-span-6">
                          <label className="mb-0.5 block text-[10.5px] font-semibold text-[#626E78]">
                            Valor Unitário (R$)
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={item.valor_unitario}
                            onChange={(e) =>
                              updateItem(item.id, { valor_unitario: e.target.value })
                            }
                            placeholder="59,90"
                            className="w-full rounded-lg border border-[#C9D3DC] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#19232D]"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[#626E78]">
                    Prazo de produção / previsão de entrega
                  </label>
                  <input
                    type="text"
                    value={state.producao.prazo_entrega}
                    onChange={(e) =>
                      setState((p) => ({
                        ...p,
                        producao: { ...p.producao, prazo_entrega: e.target.value },
                      }))
                    }
                    placeholder="Ex.: 15 dias úteis após aprovação"
                    className="w-full rounded-lg border border-[#C9D3DC] bg-[#F4F7F9] px-3 py-2 text-xs text-[#19232D]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-[#626E78]">
                    Observações da produção / arte
                  </label>
                  <input
                    type="text"
                    value={state.producao.observacoes}
                    onChange={(e) =>
                      setState((p) => ({
                        ...p,
                        producao: { ...p.producao, observacoes: e.target.value },
                      }))
                    }
                    placeholder="Detalhes adicionais de gola, punho, estampa..."
                    className="w-full rounded-lg border border-[#C9D3DC] bg-[#F4F7F9] px-3 py-2 text-xs text-[#19232D]"
                  />
                </div>
              </div>
            </section>

            {/* Grade em painel próprio, vinculada ao mesmo item do resumo e dos croquis. */}
            <section className="rounded-2xl border border-[#DCE3E9] bg-white p-5 shadow-xs space-y-3">
              <h2 className="text-sm font-bold text-[#19232D]">2A. Grade de tamanhos por modelo</h2>
              <p className="text-[11px] text-[#626E78]">
                Uma grade para cada item. Separe masculino, baby look e infantil em linhas diferentes;
                confira se a soma corresponde à quantidade do modelo.
              </p>
              <div className="space-y-2.5">
                {state.producao.itens.map((item, idx) => (
                  <div key={item.id} className="grid gap-2 rounded-xl border border-[#DCE3E9] bg-[#FAFBFD] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:items-center">
                    <label htmlFor={`grade-${item.id}`} className="text-xs font-semibold text-[#19232D]">
                      Item {String(idx + 1).padStart(2, "0")} · {item.modelo || "Modelo a preencher"}
                      <span className="block text-[11px] font-normal text-[#626E78]">Quantidade: {item.quantidade || "a preencher"} peças</span>
                    </label>
                    <textarea
                      id={`grade-${item.id}`}
                      rows={Math.max(2, Math.min(5, item.grade.split("\n").length + 1))}
                      value={item.grade}
                      onChange={(e) => updateItem(item.id, { grade: e.target.value })}
                      placeholder={"Ex.: Masculino: 2P · 4M · 3G\nBaby look: 2PP · 1P"}
                      className="w-full resize-y rounded-lg border border-[#C9D3DC] bg-white px-3 py-2 text-xs text-[#19232D]"
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* STEP 5: Pagamento & Local/Data */}
            <section className="rounded-2xl border border-[#DCE3E9] bg-white p-5 shadow-xs space-y-3">
              <h2 className="text-sm font-bold text-[#19232D]">
                3. Condições de Pagamento e Data
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                <div className="sm:col-span-3">
                  <label className="mb-1 block text-[11px] font-semibold text-[#626E78]">
                    Sinal / Entrada (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={state.pagamento.entrada_percentual ?? ""}
                    placeholder="A confirmar"
                    onChange={(e) => {
                      const ep = e.target.value === "" ? null : Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0)));
                      setState((p) => ({
                        ...p,
                        pagamento: {
                          ...p.pagamento,
                          entrada_percentual: ep,
                          saldo_percentual: ep === null ? null : 100 - ep,
                        },
                      }));
                    }}
                    className="w-full rounded-lg border border-[#C9D3DC] bg-[#F4F7F9] px-3 py-2 text-xs font-semibold text-[#19232D]"
                  />
                </div>

                <div className="sm:col-span-9">
                  <label className="mb-1 block text-[11px] font-semibold text-[#626E78]">
                    Forma de pagamento aceita
                  </label>
                  <input
                    type="text"
                    value={state.pagamento.forma_pagamento}
                    onChange={(e) =>
                      setState((p) => ({
                        ...p,
                        pagamento: { ...p.pagamento, forma_pagamento: e.target.value },
                      }))
                    }
                    placeholder="Pix, depósito bancário ou cartão de crédito"
                    className="w-full rounded-lg border border-[#C9D3DC] bg-[#F4F7F9] px-3 py-2 text-xs text-[#19232D]"
                  />
                </div>

                <div className="sm:col-span-12">
                  <label className="mb-1 block text-[11px] font-semibold text-[#626E78]">
                    Local e data de assinatura
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={state.execucao.local_data}
                      onChange={(e) =>
                        setState((p) => ({
                          ...p,
                          execucao: { local_data: e.target.value },
                        }))
                      }
                      placeholder="Ex.: Goiânia/GO, 22 de outubro de 2026"
                      className="flex-1 rounded-lg border border-[#C9D3DC] bg-[#F4F7F9] px-3 py-2 text-xs text-[#19232D]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const hoje = new Intl.DateTimeFormat("pt-BR", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        }).format(new Date());
                        setState((p) => ({
                          ...p,
                          execucao: { local_data: `Goiânia/GO, ${hoje}` },
                        }));
                      }}
                      className="rounded-lg border border-[#C9D3DC] bg-[#F4F7F9] px-3 py-2 text-xs font-semibold text-[#19232D] hover:bg-slate-200/70 whitespace-nowrap"
                    >
                      Data de hoje
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* RIGHT PANEL: Live A4 Sheet Preview */}
          <div
            ref={previewContainerRef}
            className={`xl:col-span-7 ${
              mobileTab === "form" ? "hidden xl:block" : "block"
            }`}
          >
            <div className="sticky top-[74px] space-y-3">
              <div className="no-print flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#DCE3E9] bg-white px-4 py-2.5 shadow-2xs">
                <div>
                  <span className="text-xs font-bold text-[#19232D]">
                    Pré-visualização em Tempo Real (Folha A4)
                  </span>
                  <span className="ml-2 text-[11px] text-[#626E78]">
                    Espelho fiel do Word (.docx) e do PDF preenchível
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#C9D3DC] bg-[#F4F7F9] px-3 py-1.5 text-xs font-semibold text-[#19232D] hover:bg-slate-200/70"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Imprimir A4
                  </button>
                </div>
              </div>

              <div
                style={{ height: `${Math.round(1150 * previewScale)}px` }}
                className="overflow-hidden rounded-2xl border border-[#DCE3E9] bg-[#DDE3EA]/70 pt-3"
              >
                <ContractPreviewA4
                  state={state}
                  logoUrl={EMBEDDED_LOGO_DATA_URL}
                  sigUrl={EMBEDDED_SIGNATURE_DATA_URL}
                  scale={previewScale}
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      {showCropModal && docPages.length > 0 && (
        <ImageCropModal
          pages={docPages}
          nextRefNumber={state.producao.imagens_referencia.length + 1}
          onAddCrop={addReferenceImage}
          onClose={() => setShowCropModal(false)}
        />
      )}

      {showSettingsModal && (
        <SettingsModal
          state={state}
          empresa={state.empresa}
          geminiKey={geminiKey}
          onUpdateEmpresa={(patch) =>
            setState((prev) => ({
              ...prev,
              empresa: { ...prev.empresa, ...patch },
            }))
          }
          onUpdateGeminiKey={setGeminiKey}
          onClose={() => setShowSettingsModal(false)}
        />
      )}
    </div>
  );
};
