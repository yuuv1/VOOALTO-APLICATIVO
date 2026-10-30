import React, { useRef, useState } from "react";
import { Check, Crop, RotateCcw, X } from "lucide-react";
import { PaginaDocumento } from "../types";

interface Props {
  pages: PaginaDocumento[];
  initialPageIndex?: number;
  nextRefNumber: number;
  onAddCrop: (titulo: string, dataUrl: string) => void;
  onClose: () => void;
}

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ImageCropModal: React.FC<Props> = ({
  pages,
  initialPageIndex = 0,
  nextRefNumber,
  onAddCrop,
  onClose,
}) => {
  const [pageIdx, setPageIdx] = useState(initialPageIndex);
  const [titulo, setTitulo] = useState(
    `Ref. ${String(nextRefNumber).padStart(2, "0")} — Camiseta`
  );
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [crop, setCrop] = useState<CropRect>({ x: 0.12, y: 0.2, w: 0.76, h: 0.42 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const currentPage = pages[pageIdx];
  if (!currentPage) return null;

  const getRelCoords = (e: React.PointerEvent) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = getRelCoords(e);
    setDragStart(pt);
    setCrop({ x: pt.x, y: pt.y, w: 0.01, h: 0.01 });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStart) return;
    const pt = getRelCoords(e);
    const x = Math.min(dragStart.x, pt.x);
    const y = Math.min(dragStart.y, pt.y);
    const w = Math.max(0.02, Math.abs(pt.x - dragStart.x));
    const h = Math.max(0.02, Math.abs(pt.y - dragStart.y));
    setCrop({ x, y, w, h });
  };

  const handlePointerUp = () => {
    setDragStart(null);
  };

  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img) return;
    const sx = Math.round(crop.x * img.naturalWidth);
    const sy = Math.round(crop.y * img.naturalHeight);
    const sw = Math.max(10, Math.round(crop.w * img.naturalWidth));
    const sh = Math.max(10, Math.round(crop.h * img.naturalHeight));

    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, sw, sh);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const outUrl = canvas.toDataURL("image/png");
    onAddCrop(titulo.trim() || `Ref. ${String(nextRefNumber).padStart(2, "0")}`, outUrl);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#19232D]/70 p-4 backdrop-blur-xs">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#C9D3DC] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#DCE3E9] bg-[#19232D] px-5 py-3.5 text-white">
          <div className="flex items-center gap-2.5">
            <Crop className="h-4 w-4 text-[#C5635C]" />
            <h3 className="text-sm font-semibold">
              Recortar Camiseta / Croqui direto da Ficha ou Proposta
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DCE3E9] bg-[#F4F7F9] px-5 py-2.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#19232D]">Arraste sobre a imagem abaixo</span>
            <span className="text-[#626E78]">para selecionar o desenho da camiseta.</span>
          </div>
          {pages.length > 1 && (
            <div className="flex items-center gap-1.5">
              {pages.map((p, idx) => (
                <button
                  key={p.id}
                  onClick={() => setPageIdx(idx)}
                  className={`rounded-md px-2.5 py-1 font-medium transition ${
                    idx === pageIdx
                      ? "bg-[#19232D] text-white"
                      : "bg-white text-[#37434E] border border-[#C9D3DC] hover:bg-slate-50"
                  }`}
                >
                  Pág. {p.pagina}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto bg-[#E8ECEF] p-5 flex items-center justify-center">
          <div
            ref={containerRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="relative inline-block cursor-crosshair select-none touch-none rounded shadow-md overflow-hidden bg-white"
          >
            <img
              ref={imgRef}
              src={currentPage.data_url}
              alt={`Página ${currentPage.pagina}`}
              draggable={false}
              className="max-h-[56vh] w-auto block pointer-events-none"
            />
            <div
              style={{
                left: `${crop.x * 100}%`,
                top: `${crop.y * 100}%`,
                width: `${crop.w * 100}%`,
                height: `${crop.h * 100}%`,
                boxShadow: "0 0 0 9999px rgba(25, 35, 45, 0.45)",
              }}
              className="pointer-events-none absolute border-2 border-[#C5635C] bg-transparent"
            >
              <span className="absolute -top-6 left-0 rounded bg-[#C5635C] px-2 py-0.5 text-[10px] font-semibold text-white whitespace-nowrap">
                Área selecionada
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#DCE3E9] bg-white px-5 py-3.5">
          <div className="flex flex-1 min-w-[240px] items-center gap-2">
            <label className="text-xs font-semibold text-[#626E78] whitespace-nowrap">
              Legenda no contrato:
            </label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="w-full rounded-lg border border-[#C9D3DC] bg-[#F4F7F9] px-3 py-1.5 text-xs font-medium text-[#19232D] focus:border-[#19232D] focus:bg-white focus:outline-none"
              placeholder="Ex.: Ref. 01 — Polo Frente e Costas"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCrop({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#C9D3DC] px-3 py-2 text-xs font-medium text-[#37434E] hover:bg-[#F4F7F9]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Página inteira
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#C5635C] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#b0524b]"
            >
              <Check className="h-4 w-4" />
              Adicionar ao Contrato
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
