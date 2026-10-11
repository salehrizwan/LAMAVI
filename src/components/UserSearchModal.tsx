import React, { useState } from 'react';
import { Search, X, MessageSquare, UserPlus, Check, AlertCircle, WifiOff } from 'lucide-react';
import { UserProfile } from '../types';
import { Avatar } from './Avatar';
import { FullScreenImageViewer } from './SecureImage';
import { formatRelativeTime } from '../utils/media';

interface UserSearchModalProps {
  token: string;
  isOnline: boolean;
  onClose: () => void;
  onStartConversation: (targetUser: UserProfile) => void;
  onAddContact?: (targetUser: UserProfile) => Promise<void> | void;
}

export const UserSearchModal: React.FC<UserSearchModalProps> = ({
  token,
  isOnline,
  onClose,
  onStartConversation,
  onAddContact,
}) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [result, setResult] = useState<UserProfile | null>(null);
  const [results, setResults] = useState<UserProfile[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [addedContactIds, setAddedContactIds] = useState<Record<string, boolean>>({});
  const [confirmConnectUser, setConfirmConnectUser] = useState<UserProfile | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [fullScreenDp, setFullScreenDp] = useState<{ src: string; caption?: string } | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetQuery = query.trim();
    if (!targetQuery) return;

    if (!isOnline) {
      setErrorMsg('You are currently offline. Please connect to the internet to search and connect with users.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSearched(false);
    setResult(null);
    setResults([]);

    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(targetQuery)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Could not complete search.');
      } else {
        setResult(data.result || null);
        setResults(Array.isArray(data.results) ? data.results : data.result ? [data.result] : []);
        setSearched(true);
      }
    } catch {
      setErrorMsg('Offline or network error. User search requires an active internet connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmConnect = async () => {
    if (!confirmConnectUser || !onAddContact) return;
    setConnecting(true);
    try {
      await onAddContact(confirmConnectUser);
      setAddedContactIds((prev) => ({ ...prev, [confirmConnectUser.id]: true }));
      setConfirmConnectUser(null);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-md max-h-[90vh] flex flex-col rounded-3xl bg-white border border-[#E5E5EA] shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E5EA] shrink-0">
          <h3 className="font-display text-base font-semibold text-[#1C1C1E]">Find User on LAMAVI</h3>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center text-[#636366] hover:text-[#1C1C1E]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          <p className="text-xs text-[#636366] mb-3 leading-relaxed">
            Enter a <strong className="text-[#1C1C1E]">username</strong>,{' '}
            <strong className="text-[#1C1C1E]">Gmail address</strong>, or{' '}
            <strong className="text-[#1C1C1E]">name</strong> to view their profile and start chatting.
          </p>

          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#8E8E93] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Username, Gmail, or name..."
                autoFocus
                className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] focus:border-[#8E8E93] focus:bg-white text-sm text-[#1C1C1E] outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !query.trim() || !isOnline}
              className="h-11 px-4 rounded-xl bg-[#2C2C2E] hover:bg-[#3A3A3C] disabled:opacity-50 text-white text-xs font-semibold transition-colors shrink-0"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </form>

          {!isOnline && (
            <div className="mt-4 p-3 rounded-2xl bg-[#FEF3C7] border border-[#FDE68A] flex items-center gap-2 text-xs text-[#B45309]">
              <WifiOff className="w-4 h-4 shrink-0" />
              <span>You are offline. Connecting and chatting requires an active internet connection.</span>
            </div>
          )}

          {errorMsg && (
            <div className="mt-4 p-3.5 rounded-2xl bg-[#FEF2F2] border border-[#FECACA] flex items-center gap-2.5 text-xs text-[#B91C1C]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {searched && !result && results.length === 0 && !errorMsg && (
            <div className="mt-5 py-8 px-4 rounded-2xl bg-[#F8F9FA] border border-[#E5E5EA] text-center">
              <p className="text-sm font-medium text-[#1C1C1E]">No user found</p>
              <p className="text-xs text-[#636366] mt-1">
                No registered LAMAVI account matches that username or Gmail address.
              </p>
            </div>
          )}

          {result && (
            <div className="mt-6 pt-5 pb-5 px-4 rounded-3xl bg-[#F8F9FA] border border-[#D1D1D6] flex flex-col items-center text-center">
              {/* iOS Notes-style thought bubble for Bio above Avatar */}
              <div className="relative mb-3 max-w-[240px]">
                <div className="px-3.5 py-2 rounded-2xl bg-white border border-[#E5E5EA] shadow-2xs text-xs text-[#1C1C1E] leading-snug">
                  {result.bio ? result.bio : 'No bio added yet'}
                </div>
                <div className="w-3 h-3 rounded-full bg-white border-r border-b border-[#E5E5EA] mx-auto -mt-1.5 rotate-45" />
                <div className="w-1.5 h-1.5 rounded-full bg-white border border-[#E5E5EA] mx-auto mt-0.5" />
              </div>

              <button
                type="button"
                onClick={() => {
                  if (result.avatarUrl) {
                    setFullScreenDp({
                      src: result.avatarUrl,
                      caption: `${result.fullName} (@${result.username})`,
                    });
                  }
                }}
                className={`rounded-full focus:outline-none ${
                  result.avatarUrl ? 'cursor-pointer hover:opacity-90' : ''
                }`}
                title={result.avatarUrl ? 'Tap to view DP' : undefined}
              >
                <Avatar
                  src={result.avatarUrl}
                  name={result.fullName}
                  size="xl"
                  isOnline={result.isOnline}
                  showPresence
                />
              </button>

              <h4 className="font-display text-base font-bold text-[#1C1C1E] mt-3">
                {result.fullName}
              </h4>
              <p className="text-xs text-[#636366] mt-0.5">@{result.username}</p>

              <p className="text-[11px] text-[#8E8E93] mt-1">
                {result.isOnline
                  ? 'Online now'
                  : result.lastSeen
                  ? `Last seen ${formatRelativeTime(result.lastSeen)}`
                  : 'Offline'}
              </p>

              <div className="mt-5 w-full flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={!isOnline}
                  onClick={() => onStartConversation(result)}
                  className="flex-1 h-11 rounded-xl bg-[#2C2C2E] hover:bg-[#3A3A3C] disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Message</span>
                </button>
                {onAddContact && !result.isContact && !addedContactIds[result.id] && (
                  <button
                    type="button"
                    disabled={!isOnline}
                    onClick={() => setConfirmConnectUser(result)}
                    className="h-11 px-4 rounded-xl bg-white hover:bg-[#F2F2F7] disabled:opacity-40 border border-[#D1D1D6] text-xs font-semibold text-[#1C1C1E] flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Connect</span>
                  </button>
                )}
                {(result.isContact || addedContactIds[result.id]) && (
                  <div className="h-11 px-3.5 rounded-xl bg-white border border-[#E5E5EA] text-xs font-medium text-[#15803D] flex items-center gap-1.5">
                    <Check className="w-4 h-4" />
                    <span>Connected</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {results.length > 1 && (
            <div className="mt-4 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8E8E93] px-1">
                Other Matching Accounts ({results.length - 1})
              </p>
              {results
                .filter((u) => u.id !== result?.id)
                .map((u) => {
                  const isConnected = u.isContact || addedContactIds[u.id];
                  return (
                    <div
                      key={u.id}
                      className="p-3 rounded-2xl bg-[#F8F9FA] border border-[#E5E5EA] flex items-center justify-between gap-3"
                    >
                      <div
                        onClick={() => setResult(u)}
                        className="flex items-center gap-2.5 min-w-0 cursor-pointer"
                      >
                        <Avatar
                          src={u.avatarUrl}
                          name={u.fullName}
                          size="sm"
                          isOnline={u.isOnline}
                          showPresence
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[#1C1C1E] truncate">
                            {u.fullName}
                          </p>
                          <p className="text-[11px] text-[#636366] truncate">@{u.username}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!isConnected && onAddContact && (
                          <button
                            type="button"
                            onClick={() => setConfirmConnectUser(u)}
                            className="h-8 px-2.5 rounded-xl bg-white border border-[#D1D1D6] text-[#1C1C1E] text-[11px] font-semibold hover:bg-[#F2F2F7]"
                          >
                            Connect
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onStartConversation(u)}
                          className="h-8 px-3 rounded-xl bg-[#2C2C2E] text-white text-[11px] font-semibold hover:bg-[#3A3A3C]"
                        >
                          Message
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Connection Confirmation Dialog */}
      {confirmConnectUser && (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white border border-[#E5E5EA] p-6 shadow-xl">
            <h3 className="font-display text-base font-semibold text-[#1C1C1E]">
              Connect with {confirmConnectUser.fullName}
            </h3>
            <p className="text-xs text-[#636366] mt-2 leading-relaxed">
              Do you want to add this person to your contacts?
            </p>
            <div className="mt-5 flex items-center gap-2.5">
              <button
                type="button"
                disabled={connecting}
                onClick={() => setConfirmConnectUser(null)}
                className="flex-1 h-11 rounded-xl bg-[#F2F2F7] text-xs font-semibold text-[#1C1C1E]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={connecting}
                onClick={handleConfirmConnect}
                className="flex-1 h-11 rounded-xl bg-[#2C2C2E] hover:bg-[#3A3A3C] text-xs font-semibold text-white"
              >
                {connecting ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )}

      {fullScreenDp && (
        <FullScreenImageViewer
          src={fullScreenDp.src}
          caption={fullScreenDp.caption}
          onClose={() => setFullScreenDp(null)}
        />
      )}
    </div>
  );
};
