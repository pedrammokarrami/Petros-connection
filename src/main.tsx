import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Register PWA service worker for offline caching & seamless auto-updates
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onRegisterError() {
      // Gracefully ignore registration errors in restricted preview sandboxes
    },
  });
}

createRoot(document.getElementById('root')!).render(<App />);
