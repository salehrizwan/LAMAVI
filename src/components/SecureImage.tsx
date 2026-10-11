import React, { useEffect, useState } from 'react';
import { X, Download, ImageOff } from 'lucide-react';

interface SecureImageProps {
  mediaId?: string;
  localDataUrl?: string;
  token: string;
  alt?: string;
  className?: string;
  onClickFullScreen?: (src: string) => void;
  autoDownload?: boolean;
}

const mediaMemoryCache = new Map<string, string>();

export const SecureImage: React.FC<SecureImageProps> = ({
  mediaId,
  localDataUrl,
  token,
  alt = 'Shared image',
  className = '',
  onClickFullScreen,
  autoDownload = true,
}) => {
  const [dataUrl, setDataUrl] = useState<string | null>(
    localDataUrl || (mediaId && mediaMemoryCache.get(mediaId)) || null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [manualTriggered, setManualTriggered] = useState(autoDownload);

  useEffect(() => {
    if (localDataUrl) {
      setDataUrl(localDataUrl);
      return;
    }
    if (!mediaId) return;

    const cached = mediaMemoryCache.get(mediaId);
    if (cached) {
      setDataUrl(cached);
      return;
    }

    try {
      const localCached = localStorage.getItem(`nacre_media_${mediaId}`);
      if (localCached) {
        mediaMemoryCache.set(mediaId, localCached);
        setDataUrl(localCached);
        return;
      }
    } catch {
      // Ignore storage quota errors
    }

    if (!manualTriggered) return;

    let cancelled = false;
    setLoading(true);
    setError(false);

    fetch(`/api/media/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load media');
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data.dataBase64) {
          mediaMemoryCache.set(mediaId, data.dataBase64);
          try {
            if (data.dataBase64.length < 350000) {
              localStorage.setItem(`nacre_media_${mediaId}`, data.dataBase64);
            }
          } catch {
            // Ignore localStorage quota limits
          }
          setDataUrl(data.dataBase64);
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mediaId, localDataUrl, token, manualTriggered]);

  if (!manualTriggered && !dataUrl) {
    return (
      <button
        type="button"
        onClick={() => setManualTriggered(true)}
        className={`flex flex-col items-center justify-center p-6 rounded-2xl bg-[#F2F2F7] border border-[#E5E5EA] text-xs text-[#3A3A3C] gap-2 ${className}`}
      >
        <Download className="w-5 h-5 text-[#636366]" />
        <span>Tap to download image</span>
      </button>
    );
  }

  if (loading) {
    return (
      <div
        className={`flex items-center justify-center bg-[#F2F2F7] border border-[#E5E5EA] rounded-2xl animate-pulse min-h-[160px] min-w-[200px] ${className}`}
      >
        <span className="text-xs text-[#8E8E93]">Loading photo...</span>
      </div>
    );
  }

  if (error || !dataUrl) {
    return (
      <div
        className={`flex flex-col items-center justify-center p-5 bg-[#F2F2F7] border border-[#E5E5EA] rounded-2xl text-xs text-[#636366] gap-1.5 ${className}`}
      >
        <ImageOff className="w-5 h-5 text-[#8E8E93]" />
        <span>Image unavailable</span>
        {mediaId && (
          <button
            type="button"
            onClick={() => setManualTriggered(true)}
            className="mt-1 underline text-[11px] text-[#1C1C1E]"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt={alt}
      referrerPolicy="no-referrer"
      onClick={() => onClickFullScreen && onClickFullScreen(dataUrl)}
      className={`rounded-2xl object-cover ${onClickFullScreen ? 'cursor-zoom-in' : ''} ${className}`}
    />
  );
};

interface FullScreenImageViewerProps {
  src: string;
  caption?: string;
  onClose: () => void;
}

export const FullScreenImageViewer: React.FC<FullScreenImageViewerProps> = ({ src, caption, onClose }) => {
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = src;
    link.download = `nacre-photo-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col justify-between p-4">
      <div className="flex items-center justify-between">
        <button
          onClick={onClose}
          className="min-h-[44px] min-w-[44px] rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
          aria-label="Close full-screen viewer"
        >
          <X className="w-5 h-5" />
        </button>
        <button
          onClick={handleDownload}
          className="min-h-[44px] px-4 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-medium flex items-center gap-2 transition-colors"
        >
          <Download className="w-4 h-4" />
          <span>Save Image</span>
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center overflow-hidden my-4">
        <img
          src={src}
          alt={caption || 'Full-screen preview'}
          referrerPolicy="no-referrer"
          className="max-h-full max-w-full object-contain rounded-xl shadow-2xl"
        />
      </div>

      {caption && (
        <div className="text-center pb-4">
          <p className="inline-block max-w-xl px-4 py-2 rounded-2xl bg-black/50 text-white text-sm">
            {caption}
          </p>
        </div>
      )}
    </div>
  );
};
