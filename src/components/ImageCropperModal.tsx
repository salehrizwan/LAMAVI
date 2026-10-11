import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, Move, Check, X, RotateCcw } from 'lucide-react';

interface ImageCropperModalProps {
  imageSrc: string;
  onCancel: () => void;
  onSave: (croppedDataUrl: string) => void;
}

export const ImageCropperModal: React.FC<ImageCropperModalProps> = ({ imageSrc, onCancel, onSave }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const CANVAS_SIZE = 320;

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImageObj(img);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    img.src = imageSrc;
  }, [imageSrc]);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageObj) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.fillStyle = '#F2F2F7';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const scale = Math.max(CANVAS_SIZE / imageObj.width, CANVAS_SIZE / imageObj.height) * zoom;
    const drawW = imageObj.width * scale;
    const drawH = imageObj.height * scale;
    const drawX = (CANVAS_SIZE - drawW) / 2 + offset.x;
    const drawY = (CANVAS_SIZE - drawH) / 2 + offset.y;

    ctx.drawImage(imageObj, drawX, drawY, drawW, drawH);
  }, [imageObj, zoom, offset]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const handleConfirm = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    onSave(dataUrl);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-3xl bg-white border border-[#E5E5EA] shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E5EA]">
          <button
            onClick={onCancel}
            className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center text-[#636366] hover:text-[#1C1C1E]"
          >
            <X className="w-5 h-5" />
          </button>
          <h3 className="text-base font-semibold text-[#1C1C1E]">Crop & Position Photo</h3>
          <button
            onClick={() => {
              setZoom(1);
              setOffset({ x: 0, y: 0 });
            }}
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center text-[#636366] hover:text-[#1C1C1E]"
            title="Reset position"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center bg-[#F8F9FA]">
          <div className="relative w-[280px] h-[280px] rounded-full overflow-hidden border-2 border-[#D1D1D6] shadow-inner bg-[#F2F2F7] touch-none">
            <canvas
              ref={canvasRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="w-full h-full cursor-move"
            />
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-[#636366]">
            <Move className="w-3.5 h-3.5" />
            <span>Drag photo to reposition</span>
          </div>

          <div className="w-full mt-5 flex items-center gap-3 px-2">
            <ZoomOut className="w-4 h-4 text-[#636366] shrink-0" />
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-full accent-[#2C2C2E] cursor-pointer"
            />
            <ZoomIn className="w-4 h-4 text-[#636366] shrink-0" />
          </div>
        </div>

        <div className="px-5 py-4 bg-white border-t border-[#E5E5EA] flex items-center gap-3">
          <button
            onClick={onCancel}
            className="flex-1 h-11 rounded-xl bg-[#F2F2F7] hover:bg-[#E5E5EA] text-sm font-medium text-[#1C1C1E] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 h-11 rounded-xl bg-[#2C2C2E] hover:bg-[#3A3A3C] text-sm font-medium text-white flex items-center justify-center gap-2 transition-colors"
          >
            <Check className="w-4 h-4" />
            <span>Save Photo</span>
          </button>
        </div>
      </div>
    </div>
  );
};
