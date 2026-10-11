import React, { useState, useRef } from 'react';
import {
  Plus,
  Type,
  Image as ImageIcon,
  Eye,
  Trash2,
  X,
  Clock,
  Lock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { StatusItem, UserProfile } from '../types';
import { Avatar } from './Avatar';
import { SecureImage } from './SecureImage';
import { compressImageFile, formatRelativeTime } from '../utils/media';

interface StatusViewProps {
  currentUser: UserProfile;
  statuses: StatusItem[];
  token: string;
  onRefreshStatuses: () => Promise<void>;
  onMarkViewed: (statusId: string) => Promise<void>;
  onDeleteStatus: (statusId: string) => Promise<void>;
}

const STATUS_THEMES = [
  { name: 'Pearl', bg: '#F2F2F7', text: '#1C1C1E' },
  { name: 'Pure White', bg: '#FFFFFF', text: '#1C1C1E' },
  { name: 'Silver Mist', bg: '#E5E5EA', text: '#1C1C1E' },
  { name: 'Brushed Graphite', bg: '#3A3A3C', text: '#F8F9FA' },
  { name: 'Obsidian Slate', bg: '#1C1C1E', text: '#F8F9FA' },
];

export const StatusView: React.FC<StatusViewProps> = ({
  currentUser,
  statuses,
  token,
  onRefreshStatuses,
  onMarkViewed,
  onDeleteStatus,
}) => {
  const [composerType, setComposerType] = useState<'text' | 'image' | null>(null);
  const [statusText, setStatusText] = useState('');
  const [themeIndex, setThemeIndex] = useState(0);
  const [privacy, setPrivacy] = useState<'everyone' | 'contacts'>(
    currentUser.privacy?.statusPrivacy || 'everyone'
  );
  const [imagePreview, setImagePreview] = useState<{ dataUrl: string; mimeType: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Active full-screen status viewer group
  const [viewerGroup, setViewerGroup] = useState<{
    items: StatusItem[];
    index: number;
  } | null>(null);
  const [showViewersSheet, setShowViewersSheet] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const myStatuses = statuses
    .filter((s) => s.userId === currentUser.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Group other users' statuses by userId
  const otherGroupsMap = new Map<string, StatusItem[]>();
  for (const s of statuses) {
    if (s.userId === currentUser.id) continue;
    if (!otherGroupsMap.has(s.userId)) {
      otherGroupsMap.set(s.userId, []);
    }
    otherGroupsMap.get(s.userId)!.push(s);
  }
  const otherGroups = Array.from(otherGroupsMap.values());

  const openViewer = (items: StatusItem[], startIndex = 0) => {
    if (items.length === 0) return;
    setViewerGroup({ items, index: startIndex });
    setShowViewersSheet(false);
    const current = items[startIndex];
    if (current && current.userId !== currentUser.id && !current.viewedByMe) {
      onMarkViewed(current.id);
    }
  };

  const stepViewer = (delta: number) => {
    if (!viewerGroup) return;
    const nextIdx = viewerGroup.index + delta;
    if (nextIdx < 0 || nextIdx >= viewerGroup.items.length) {
      setViewerGroup(null);
      return;
    }
    setViewerGroup({ ...viewerGroup, index: nextIdx });
    const nextItem = viewerGroup.items[nextIdx];
    if (nextItem && nextItem.userId !== currentUser.id && !nextItem.viewedByMe) {
      onMarkViewed(nextItem.id);
    }
  };

  const handleSelectImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setErrorMsg(null);
    try {
      const compressed = await compressImageFile(file, 1280, 0.82);
      setImagePreview({ dataUrl: compressed.dataUrl, mimeType: compressed.mimeType });
      setComposerType('image');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not load image.');
    }
  };

  const handlePublishStatus = async () => {
    if (!composerType) return;
    setSubmitting(true);
    setErrorMsg(null);

    try {
      let uploadedMediaId: string | undefined;
      if (composerType === 'image' && imagePreview) {
        const mediaRes = await fetch('/api/media', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            dataBase64: imagePreview.dataUrl,
            mimeType: imagePreview.mimeType,
          }),
        });
        const mediaData = await mediaRes.json();
        if (!mediaRes.ok) {
          throw new Error(mediaData.error || 'Failed to upload status image.');
        }
        uploadedMediaId = mediaData.mediaId;
      }

      const selectedTheme = STATUS_THEMES[themeIndex];
      const res = await fetch('/api/statuses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: composerType,
          text: statusText.trim(),
          backgroundColor: selectedTheme.bg,
          textColor: selectedTheme.text,
          imageId: uploadedMediaId,
          privacy,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not publish status.');
      }

      setComposerType(null);
      setStatusText('');
      setImagePreview(null);
      await onRefreshStatuses();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to post status.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-3xl mx-auto w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-[#1C1C1E]">Status Updates</h1>
          <p className="text-xs text-[#636366] mt-0.5">
            Ephemeral moments that automatically expire after 24 hours
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleSelectImage}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] px-3.5 rounded-xl bg-white hover:bg-[#F2F2F7] border border-[#D1D1D6] text-xs font-semibold text-[#1C1C1E] flex items-center gap-1.5 transition-colors"
          >
            <ImageIcon className="w-4 h-4" />
            <span>Photo Status</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusText('');
              setComposerType('text');
            }}
            className="min-h-[44px] px-3.5 rounded-xl bg-[#2C2C2E] hover:bg-[#3A3A3C] text-xs font-semibold text-white flex items-center gap-1.5 transition-colors"
          >
            <Type className="w-4 h-4" />
            <span>Text Status</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-2xl bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#B91C1C]">
          {errorMsg}
        </div>
      )}

      {/* My Status Card */}
      <section className="bg-white rounded-2xl border border-[#E5E5EA] p-4 shadow-2xs">
        <div className="flex items-center justify-between">
          <div
            onClick={() => (myStatuses.length > 0 ? openViewer(myStatuses, 0) : setComposerType('text'))}
            className="flex items-center gap-3.5 cursor-pointer flex-1 min-w-0"
          >
            <div className="relative">
              <Avatar
                src={currentUser.avatarUrl}
                name={currentUser.fullName}
                size="lg"
                hasStatusRing={myStatuses.length > 0}
                statusViewed={false}
              />
              {myStatuses.length === 0 && (
                <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#2C2C2E] text-white flex items-center justify-center ring-2 ring-white">
                  <Plus className="w-3.5 h-3.5" />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-sm font-semibold text-[#1C1C1E]">My Status</h2>
              <p className="text-xs text-[#636366] truncate mt-0.5">
                {myStatuses.length > 0
                  ? `${myStatuses.length} active update${myStatuses.length > 1 ? 's' : ''} · Last updated ${formatRelativeTime(
                      myStatuses[myStatuses.length - 1].createdAt
                    )}`
                  : 'Tap to add a text or photo status update'}
              </p>
            </div>
          </div>

          {myStatuses.length > 0 && (
            <button
              type="button"
              onClick={() => openViewer(myStatuses, 0)}
              className="min-h-[40px] px-3 rounded-xl bg-[#F8F9FA] hover:bg-[#F2F2F7] border border-[#E5E5EA] text-xs font-medium text-[#1C1C1E] flex items-center gap-1.5"
            >
              <Eye className="w-3.5 h-3.5 text-[#636366]" />
              <span>
                {myStatuses.reduce((sum, s) => sum + (s.viewCount || 0), 0)} views
              </span>
            </button>
          )}
        </div>

        {/* Individual list of my active statuses with quick delete */}
        {myStatuses.length > 0 && (
          <div className="mt-4 pt-3 border-t border-[#E5E5EA] space-y-2">
            {myStatuses.map((st, idx) => (
              <div
                key={st.id}
                className="flex items-center justify-between py-1.5 px-2.5 rounded-xl hover:bg-[#F8F9FA]"
              >
                <div
                  onClick={() => openViewer(myStatuses, idx)}
                  className="flex items-center gap-2.5 text-xs text-[#3A3A3C] cursor-pointer truncate flex-1"
                >
                  <Clock className="w-3.5 h-3.5 text-[#8E8E93] shrink-0" />
                  <span className="truncate font-medium">
                    {st.type === 'image' ? `Photo${st.text ? `: ${st.text}` : ''}` : st.text}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#8E8E93] shrink-0">{formatRelativeTime(st.createdAt)}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] text-[#636366]">{st.viewCount || 0} views</span>
                  <button
                    type="button"
                    onClick={() => onDeleteStatus(st.id)}
                    className="p-1.5 text-[#8E8E93] hover:text-[#B91C1C] transition-colors"
                    title="Delete status"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Connected Users' Recent Updates */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-[#636366] tracking-tight px-1">
          Recent Updates from Connections
        </h3>

        {otherGroups.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E5E5EA] p-8 text-center">
            <p className="text-sm font-medium text-[#1C1C1E]">No status updates right now</p>
            <p className="text-xs text-[#636366] mt-1">
              Status updates shared by your connections in the last 24 hours will appear here.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-[#E5E5EA] divide-y divide-[#E5E5EA] overflow-hidden">
            {otherGroups.map((group) => {
              const latest = group[group.length - 1];
              const owner = latest.user;
              const allViewed = group.every((g) => g.viewedByMe);
              if (!owner) return null;

              return (
                <button
                  key={owner.id}
                  type="button"
                  onClick={() => openViewer(group, 0)}
                  className="w-full p-4 flex items-center justify-between hover:bg-[#F8F9FA] transition-colors text-left"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <Avatar
                      src={owner.avatarUrl}
                      name={owner.fullName}
                      size="lg"
                      hasStatusRing
                      statusViewed={allViewed}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-display text-sm font-semibold text-[#1C1C1E] truncate">
                          {owner.fullName}
                        </span>
                        <span className="text-xs text-[#8E8E93]">@{owner.username}</span>
                      </div>
                      <p className="text-xs text-[#636366] truncate mt-0.5">
                        {latest.type === 'image' ? 'Shared a photo' : latest.text}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <span className="text-xs text-[#636366]">{formatRelativeTime(latest.createdAt)}</span>
                    <div className="text-[11px] text-[#8E8E93] mt-0.5">
                      {allViewed ? 'Viewed' : 'New'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Status Composer Modal */}
      {composerType && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white border border-[#E5E5EA] shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E5EA]">
              <h3 className="font-display text-base font-semibold text-[#1C1C1E]">
                {composerType === 'text' ? 'New Text Status' : 'New Photo Status'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setComposerType(null);
                  setImagePreview(null);
                }}
                className="w-9 h-9 rounded-full hover:bg-[#F2F2F7] flex items-center justify-center text-[#636366]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {composerType === 'text' ? (
                <>
                  <div
                    style={{
                      backgroundColor: STATUS_THEMES[themeIndex].bg,
                      color: STATUS_THEMES[themeIndex].text,
                    }}
                    className="w-full h-56 rounded-2xl border border-[#D1D1D6] p-6 flex items-center justify-center transition-colors"
                  >
                    <textarea
                      value={statusText}
                      onChange={(e) => setStatusText(e.target.value)}
                      placeholder="Type a 24-hour status update..."
                      maxLength={300}
                      style={{ color: STATUS_THEMES[themeIndex].text }}
                      className="w-full h-full bg-transparent text-center font-display text-lg font-semibold outline-none resize-none placeholder:opacity-50"
                    />
                  </div>

                  {/* Theme Selector */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#636366]">Surface Style</span>
                    <div className="flex items-center gap-2">
                      {STATUS_THEMES.map((t, i) => (
                        <button
                          key={t.name}
                          type="button"
                          onClick={() => setThemeIndex(i)}
                          style={{ backgroundColor: t.bg }}
                          className={`w-7 h-7 rounded-full border ${
                            themeIndex === i ? 'ring-2 ring-[#1C1C1E] ring-offset-2' : 'border-[#D1D1D6]'
                          }`}
                          title={t.name}
                        />
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  {imagePreview && (
                    <div className="w-full flex justify-center bg-[#F8F9FA] rounded-2xl p-3 border border-[#E5E5EA]">
                      <img
                        src={imagePreview.dataUrl}
                        alt="Status upload preview"
                        className="max-h-60 rounded-xl object-contain"
                      />
                    </div>
                  )}
                  <input
                    type="text"
                    value={statusText}
                    onChange={(e) => setStatusText(e.target.value)}
                    placeholder="Add a caption..."
                    className="w-full h-11 px-4 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] text-sm text-[#1C1C1E] outline-none"
                  />
                </div>
              )}

              {/* Status Privacy Selector */}
              <div className="flex items-center justify-between pt-2 border-t border-[#E5E5EA]">
                <div className="flex items-center gap-1.5 text-xs text-[#636366]">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Who can view this status</span>
                </div>
                <div className="flex items-center gap-1 p-1 bg-[#F2F2F7] rounded-xl">
                  <button
                    type="button"
                    onClick={() => setPrivacy('everyone')}
                    className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                      privacy === 'everyone' ? 'bg-white text-[#1C1C1E] shadow-2xs' : 'text-[#636366]'
                    }`}
                  >
                    Everyone
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrivacy('contacts')}
                    className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                      privacy === 'contacts' ? 'bg-white text-[#1C1C1E] shadow-2xs' : 'text-[#636366]'
                    }`}
                  >
                    Contacts Only
                  </button>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 bg-[#F8F9FA] border-t border-[#E5E5EA] flex items-center gap-3">
              <button
                type="button"
                onClick={() => setComposerType(null)}
                className="flex-1 h-11 rounded-xl bg-white border border-[#D1D1D6] text-xs font-semibold text-[#1C1C1E]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting || (composerType === 'text' && !statusText.trim())}
                onClick={handlePublishStatus}
                className="flex-1 h-11 rounded-xl bg-[#2C2C2E] hover:bg-[#3A3A3C] disabled:opacity-50 text-xs font-semibold text-white"
              >
                {submitting ? 'Sharing...' : 'Share Status (24h)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen Status Viewer Modal */}
      {viewerGroup && (
        <div className="fixed inset-0 z-50 bg-[#1C1C1E] text-white flex flex-col justify-between p-4 sm:p-6">
          {/* Progress segments */}
          <div className="w-full max-w-lg mx-auto space-y-3">
            <div className="flex items-center gap-1.5">
              {viewerGroup.items.map((item, idx) => (
                <div
                  key={item.id}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    idx <= viewerGroup.index ? 'bg-white' : 'bg-white/30'
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar
                  src={viewerGroup.items[viewerGroup.index].user?.avatarUrl}
                  name={viewerGroup.items[viewerGroup.index].user?.fullName || currentUser.fullName}
                  size="sm"
                />
                <div>
                  <div className="text-sm font-semibold">
                    {viewerGroup.items[viewerGroup.index].userId === currentUser.id
                      ? 'My Status'
                      : viewerGroup.items[viewerGroup.index].user?.fullName}
                  </div>
                  <div className="text-[11px] text-white/70">
                    {formatRelativeTime(viewerGroup.items[viewerGroup.index].createdAt)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {viewerGroup.items[viewerGroup.index].userId === currentUser.id && (
                  <button
                    type="button"
                    onClick={async () => {
                      const idToDel = viewerGroup.items[viewerGroup.index].id;
                      await onDeleteStatus(idToDel);
                      setViewerGroup(null);
                    }}
                    className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
                    title="Delete this status"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewerGroup(null)}
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Center Status Canvas */}
          <div className="flex-1 flex items-center justify-center relative my-4 max-w-lg w-full mx-auto">
            {viewerGroup.index > 0 && (
              <button
                type="button"
                onClick={() => stepViewer(-1)}
                className="absolute left-2 z-10 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}

            {viewerGroup.items[viewerGroup.index].type === 'text' ? (
              <div
                style={{
                  backgroundColor: viewerGroup.items[viewerGroup.index].backgroundColor,
                  color: viewerGroup.items[viewerGroup.index].textColor,
                }}
                className="w-full h-full max-h-[480px] rounded-3xl p-8 flex items-center justify-center text-center shadow-2xl border border-white/15"
              >
                <p className="font-display text-xl sm:text-2xl font-semibold leading-relaxed whitespace-pre-wrap">
                  {viewerGroup.items[viewerGroup.index].text}
                </p>
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center">
                <SecureImage
                  mediaId={viewerGroup.items[viewerGroup.index].imageId}
                  token={token}
                  className="max-h-[440px] w-auto object-contain rounded-2xl"
                />
                {viewerGroup.items[viewerGroup.index].text && (
                  <p className="mt-4 px-4 py-2 rounded-xl bg-black/50 text-sm text-white text-center">
                    {viewerGroup.items[viewerGroup.index].text}
                  </p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => stepViewer(1)}
              className="absolute right-2 z-10 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Bottom Viewers Bar (Only visible to status owner) */}
          <div className="w-full max-w-lg mx-auto flex flex-col items-center">
            {viewerGroup.items[viewerGroup.index].userId === currentUser.id && (
              <>
                <button
                  type="button"
                  onClick={() => setShowViewersSheet(!showViewersSheet)}
                  className="px-4 py-2 rounded-full bg-white/15 hover:bg-white/25 text-xs font-medium flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  <span>
                    Viewed by {viewerGroup.items[viewerGroup.index].viewers?.length || 0}
                  </span>
                </button>

                {showViewersSheet && (
                  <div className="mt-3 w-full rounded-2xl bg-white text-[#1C1C1E] p-4 max-h-48 overflow-y-auto">
                    <h4 className="text-xs font-semibold text-[#636366] mb-2">
                      Status Viewers (Private to you)
                    </h4>
                    {(viewerGroup.items[viewerGroup.index].viewers || []).length === 0 ? (
                      <p className="text-xs text-[#8E8E93]">No views yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {viewerGroup.items[viewerGroup.index].viewers?.map((v) => (
                          <div key={v.viewerId} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <Avatar src={v.avatarUrl} name={v.fullName} size="xs" />
                              <span className="font-medium">{v.fullName}</span>
                              <span className="text-[#8E8E93]">@{v.username}</span>
                            </div>
                            <span className="text-[#636366]">{formatRelativeTime(v.viewedAt)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
