import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ variant?: 'compact' | 'row' }> = ({ variant = 'compact' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    if (variant === 'row') {
      return (
        <button
          onClick={install}
          className="w-full flex items-center justify-between px-4 py-3.5 bg-white hover:bg-[#F8F9FA] active:bg-[#F2F2F7] transition-colors text-left border-b border-[#E5E5EA]"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#F2F2F7] border border-[#E5E5EA] flex items-center justify-center text-[#1C1C1E]">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-medium text-[#1C1C1E]">Install LAMAVI App</div>
              <div className="text-xs text-[#636366]">Add to home screen for instant access</div>
            </div>
          </div>
          <span className="text-xs font-medium text-[#1C1C1E] px-3 py-1.5 rounded-lg bg-[#F2F2F7] border border-[#D1D1D6]">
            Install
          </span>
        </button>
      );
    }

    return (
      <button
        onClick={install}
        className="min-h-[44px] px-3 py-1.5 rounded-xl bg-[#F2F2F7] hover:bg-[#E5E5EA] border border-[#D1D1D6] text-xs font-medium text-[#1C1C1E] flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        title="Install App"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        {variant === 'row' ? (
          <button
            onClick={() => setShowIOSGuide(true)}
            className="w-full flex items-center justify-between px-4 py-3.5 bg-white hover:bg-[#F8F9FA] active:bg-[#F2F2F7] transition-colors text-left border-b border-[#E5E5EA]"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#F2F2F7] border border-[#E5E5EA] flex items-center justify-center text-[#1C1C1E]">
                <Share className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-medium text-[#1C1C1E]">Install on iPhone / iPad</div>
                <div className="text-xs text-[#636366]">Add LAMAVI to your iOS Home Screen</div>
              </div>
            </div>
            <span className="text-xs font-medium text-[#636366]">How to</span>
          </button>
        ) : (
          <button
            onClick={() => setShowIOSGuide(true)}
            className="min-h-[44px] px-3 py-1.5 rounded-xl bg-[#F2F2F7] hover:bg-[#E5E5EA] border border-[#D1D1D6] text-xs font-medium text-[#1C1C1E] flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Share className="w-3.5 h-3.5" />
            <span>Install</span>
          </button>
        )}

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-3xl bg-white border border-[#E5E5EA] p-6 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-[#1C1C1E]">Install on iOS</h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="w-9 h-9 rounded-full bg-[#F2F2F7] flex items-center justify-center text-[#636366]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-[#636366] leading-relaxed">
                1. Tap the <strong className="text-[#1C1C1E]">Share</strong> icon in your Safari toolbar.<br />
                2. Scroll down and select <strong className="text-[#1C1C1E]">Add to Home Screen</strong>.
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full h-11 rounded-xl bg-[#2C2C2E] text-white text-sm font-medium hover:bg-[#3A3A3C] transition-colors"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
