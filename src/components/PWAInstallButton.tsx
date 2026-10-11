import React, { useState } from 'react';
import { Download, Share, X, Smartphone, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ variant?: 'compact' | 'row' }> = ({
  variant = 'compact',
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  // When running inside the installed standalone PWA on iOS, Android, or Desktop, hide the install button
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) return;
    }
    setShowGuideModal(true);
  };

  return (
    <>
      {variant === 'row' ? (
        <div className="bg-white rounded-3xl border border-[#E5E5EA] overflow-hidden shadow-2xs">
          <button
            type="button"
            onClick={handleInstallClick}
            className="w-full flex items-center justify-between px-4 py-4 bg-white hover:bg-[#F8F9FA] active:bg-[#F2F2F7] transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-[#2C2C2E] text-white flex items-center justify-center shrink-0 shadow-2xs">
                {isIOS ? <Share className="w-4 h-4" /> : <Download className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#1C1C1E]">
                  {isIOS
                    ? 'Install LAMAVI App on iPhone / iPad'
                    : isAndroid
                    ? 'Install LAMAVI App on Android'
                    : 'Install LAMAVI App'}
                </div>
                <div className="text-xs text-[#636366] truncate mt-0.5">
                  {isIOS
                    ? 'Install official iOS Home Screen Web App (no APK needed)'
                    : 'Install full standalone app directly to your home screen'}
                </div>
              </div>
            </div>
            <span className="ml-3 text-xs font-semibold text-white px-3.5 py-2 rounded-xl bg-[#2C2C2E] hover:bg-[#3A3A3C] shrink-0 transition-colors">
              Install App
            </span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleInstallClick}
          className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#2C2C2E] hover:bg-[#3A3A3C] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-2xs"
          title="Install LAMAVI App"
        >
          {isIOS ? <Share className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
          <span>Install App</span>
        </button>
      )}

      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white border border-[#E5E5EA] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <img
                  src="/logo.png"
                  alt="LAMAVI"
                  className="w-9 h-9 rounded-xl object-contain border border-[#E5E5EA] bg-[#F8F9FA] p-0.5"
                />
                <div>
                  <h3 className="font-display text-base font-bold text-[#1C1C1E]">
                    Install LAMAVI App
                  </h3>
                  <p className="text-[11px] text-[#636366]">
                    {isIOS
                      ? 'Official iOS Standalone App'
                      : isAndroid
                      ? 'Official Android App'
                      : 'Standalone Desktop & Mobile App'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="w-9 h-9 rounded-full bg-[#F2F2F7] hover:bg-[#E5E5EA] flex items-center justify-center text-[#636366]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <div className="space-y-3 text-xs text-[#3A3A3C] leading-relaxed bg-[#F8F9FA] p-4 rounded-2xl border border-[#E5E5EA]">
                <p className="font-semibold text-[#1C1C1E]">
                  Install the native-style iOS app on your iPhone or iPad:
                </p>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#2C2C2E] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <span>
                    Tap the <strong className="text-[#1C1C1E]">Share</strong> button{' '}
                    <Share className="w-3.5 h-3.5 inline mx-0.5 text-[#1C1C1E]" /> at the bottom of
                    Safari.
                  </span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#2C2C2E] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <span>
                    Scroll down and tap{' '}
                    <strong className="text-[#1C1C1E]">Add to Home Screen</strong>.
                  </span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-[#2C2C2E] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </span>
                  <span>
                    Tap <strong className="text-[#1C1C1E]">Add</strong> in the top corner. LAMAVI
                    will launch as a full-screen iOS app from your Home Screen.
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs text-[#3A3A3C] leading-relaxed bg-[#F8F9FA] p-4 rounded-2xl border border-[#E5E5EA]">
                <div className="flex items-center gap-2 font-semibold text-[#1C1C1E]">
                  <Smartphone className="w-4 h-4" />
                  <span>Install LAMAVI on your device:</span>
                </div>
                {isInstallable ? (
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await install();
                      if (ok) setShowGuideModal(false);
                    }}
                    className="w-full h-11 rounded-xl bg-[#2C2C2E] hover:bg-[#3A3A3C] text-white text-xs font-semibold flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>Install App Now</span>
                  </button>
                ) : (
                  <>
                    <p>
                      1. Tap the browser menu <strong className="text-[#1C1C1E]">(⋮)</strong> in the
                      top-right corner of Chrome.
                    </p>
                    <p>
                      2. Select <strong className="text-[#1C1C1E]">Install app</strong> or{' '}
                      <strong className="text-[#1C1C1E]">Add to Home screen</strong> to install the
                      LAMAVI app package on your phone.
                    </p>
                  </>
                )}
                <div className="pt-1 flex items-center gap-1.5 text-[11px] text-[#15803D] font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Opens in full-screen standalone mode with your LAMAVI icon</span>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="mt-5 w-full h-11 rounded-xl bg-[#2C2C2E] text-white text-xs font-semibold hover:bg-[#3A3A3C] transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
};
