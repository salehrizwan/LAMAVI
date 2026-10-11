import React, { useState } from 'react';
import { User } from 'lucide-react';

interface AvatarProps {
  src?: string;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  isOnline?: boolean;
  showPresence?: boolean;
  hasStatusRing?: boolean;
  statusViewed?: boolean;
  onClick?: () => void;
}

const sizeClasses = {
  xs: 'w-7 h-7 text-xs',
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-xl',
  '2xl': 'w-28 h-28 text-2xl',
};

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name = '',
  size = 'md',
  isOnline = false,
  showPresence = false,
  hasStatusRing = false,
  statusViewed = false,
  onClick,
}) => {
  const [imgError, setImgError] = useState(false);

  const ringClass = hasStatusRing
    ? statusViewed
      ? 'ring-2 ring-[#D1D1D6] ring-offset-2 ring-offset-white'
      : 'ring-2 ring-[#2C2C2E] ring-offset-2 ring-offset-white'
    : 'border border-[#D1D1D6] border-dashed';

  const hasValidPhoto = !!(src && !imgError);

  return (
    <div
      onClick={onClick}
      className={`relative inline-flex items-center justify-center shrink-0 select-none rounded-full ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <div
        className={`${sizeClasses[size]} rounded-full overflow-hidden ${
          hasValidPhoto
            ? 'bg-white border border-[#E5E5EA] border-solid'
            : `bg-[#F2F2F7] ${ringClass}`
        } flex items-center justify-center text-[#8E8E93]`}
      >
        {hasValidPhoto ? (
          <img
            src={src}
            alt={name || 'User avatar'}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <User className="w-1/2 h-1/2 text-[#8E8E93] stroke-[1.75]" />
        )}
      </div>

      {showPresence && isOnline && (
        <span
          title="Online"
          className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#15803D] ring-2 ring-white"
        />
      )}
    </div>
  );
};
