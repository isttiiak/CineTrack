import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Last line of defence: a render error shows a calm recovery screen instead of a blank page.
 * The list lives in localStorage and the cloud, so reloading never loses data.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('CineTrack crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center" style={{ background: 'var(--bg-base, #0f1319)', color: 'var(--text-primary, #fff)' }}>
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="max-w-sm text-sm" style={{ color: 'var(--text-secondary, #aab)' }}>
          Your list is safe: it is saved on this device and, if you are signed in, in the cloud. Reloading usually fixes this.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg px-4 py-2 text-sm font-semibold"
          style={{ background: 'var(--accent-gradient)', color: 'var(--accent-fg)' }}
        >
          Reload CineTrack
        </button>
      </div>
    );
  }
}
