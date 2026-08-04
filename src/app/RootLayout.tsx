import { Outlet } from 'react-router-dom';
import { StoreProvider, useStore } from '../state/store';
import { Toast } from '../components/Toast';

function ToastHost() {
  const { toast } = useStore();
  return toast ? <Toast message={toast} /> : null;
}

/**
 * Providers and anything that outlives a route change.
 *
 * The prototype wrapped everything in Chrome > ThemeProvider > PhoneFrame, and
 * the ordering had a real cost: Chrome sat outside ThemeProvider, so it could
 * not use theme tokens and maintained a second parallel palette by hand. That
 * whole layer is gone — the app renders in the page, not inside a fake device.
 */
export function RootLayout() {
  return (
    <StoreProvider>
      <div className="min-h-dvh bg-bg text-fg font-sans">
        <Outlet />
        <ToastHost />
      </div>
    </StoreProvider>
  );
}
