import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] lg:bottom-5 left-4 z-50 flex items-center gap-2 rounded-xl border border-[#FF9F43]/45 bg-[#1B1333]/95 backdrop-blur-md px-3.5 py-2 text-xs font-semibold text-[#FFE0B5] shadow-xl shadow-black/40"
    >
      <WifiOff className="h-3.5 w-3.5 text-[#FF9F43] shrink-0" aria-hidden="true" />
      <span>Offline Mode — Cached squad data is active</span>
    </div>
  );
}
