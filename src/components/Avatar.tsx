import { useState } from 'react';

interface AvatarProps {
  src?: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  ring?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'h-7 w-7 text-[11px]',
  sm: 'h-9 w-9 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-xl',
};

function getInitials(name: string): string {
  const parts = name.replace(/_/g, ' ').trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function Avatar({ src, name, size = 'md', ring = false }: AvatarProps) {
  const [failed, setFailed] = useState(false);

  const ringClass = ring
    ? 'ring-2 ring-[#FF6B35]/80 ring-offset-2 ring-offset-[#140E27]'
    : 'border border-white/15';

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={`${name} avatar`}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${SIZE_CLASSES[size]} ${ringClass} rounded-xl object-cover shrink-0 bg-[#1B1333]`}
      />
    );
  }

  return (
    <div
      aria-label={`${name} avatar`}
      className={`${SIZE_CLASSES[size]} ${ringClass} rounded-xl shrink-0 flex items-center justify-center font-semibold text-white bg-gradient-to-br from-[#FF6B35]/85 via-[#FF3E8A]/80 to-[#22D3EE]/75 select-none`}
    >
      {getInitials(name)}
    </div>
  );
}
