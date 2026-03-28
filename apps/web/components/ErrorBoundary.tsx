'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  children: ReactNode;
  /**
   * Custom fallback UI. Receives the error and a retry callback.
   * If omitted, the built-in BridgeWise-styled fallback is shown.
   */
  fallback?: (error: Error, retry: () => void) => ReactNode;
  /**
   * Called whenever an error is caught. Use for external logging (Sentry etc.)
   */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ErrorBoundary
 *
 * Global React error boundary. Wraps any subtree and catches runtime render
 * errors, preventing a full app crash and showing a graceful fallback.
 *
 * Usage — wrap the app root (or any sub-tree) once:
 *
 *   <ErrorBoundary onError={(err, info) => Sentry.captureException(err, { extra: info })}>
 *     <App />
 *   </ErrorBoundary>
 *
 * Or with a custom fallback:
 *
 *   <ErrorBoundary fallback={(error, retry) => <MyFallback error={error} onRetry={retry} />}>
 *     <RiskyComponent />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.handleRetry = this.handleRetry.bind(this);
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Built-in console logging — always runs
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);

    // Delegate to external logger if provided (e.g. Sentry, Datadog)
    this.props.onError?.(error, errorInfo);
  }

  handleRetry(): void {
    this.setState({ hasError: false, error: null });
  }

  render(): ReactNode {
    if (!this.state.hasError || !this.state.error) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback(this.state.error, this.handleRetry);
    }

    return <DefaultFallback error={this.state.error} onRetry={this.handleRetry} />;
  }
}

// ---------------------------------------------------------------------------
// Default fallback UI
// ---------------------------------------------------------------------------

function DefaultFallback({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: 'var(--bw-background, #020617)',
        fontFamily: 'var(--bw-font-family, system-ui, sans-serif)',
      }}
    >
      <div
        style={{
          maxWidth: '480px',
          width: '100%',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 'var(--bw-border-radius, 16px)',
          background: 'rgba(239,68,68,0.06)',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(239,68,68,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
            fontSize: '1.75rem',
          }}
          aria-hidden="true"
        >
          ⚠
        </div>

        {/* Heading */}
        <h1
          style={{
            margin: '0 0 0.5rem',
            fontSize: '1.25rem',
            fontWeight: 600,
            color: 'var(--bw-text-color, #e5e7eb)',
            letterSpacing: '-0.01em',
          }}
        >
          Something went wrong
        </h1>

        {/* Subtitle */}
        <p
          style={{
            margin: '0 0 1.5rem',
            fontSize: '0.875rem',
            color: 'rgba(229,231,235,0.5)',
            lineHeight: 1.6,
          }}
        >
          An unexpected error occurred. Your funds are safe — please try
          refreshing or contact support if this persists.
        </p>

        {/* Error name pill — no stack trace exposed */}
        <code
          style={{
            display: 'inline-block',
            padding: '0.25rem 0.75rem',
            borderRadius: '6px',
            background: 'rgba(239,68,68,0.12)',
            color: 'rgb(252,165,165)',
            fontSize: '0.75rem',
            marginBottom: '1.75rem',
            wordBreak: 'break-word',
          }}
        >
          {error.name}: {error.message}
        </code>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={onRetry}
            style={{
              padding: '0.6rem 1.4rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500,
              background: 'var(--bw-primary-color, #22c55e)',
              color: '#fff',
              transition: 'opacity 0.15s',
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = '0.85')}
            onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
          >
            Try again
          </button>

          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.6rem 1.4rem',
              borderRadius: '8px',
              border: '1px solid rgba(229,231,235,0.2)',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500,
              background: 'transparent',
              color: 'var(--bw-text-color, #e5e7eb)',
              transition: 'background 0.15s',
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(229,231,235,0.06)')}
            onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            Reload page
          </button>
        </div>
      </div>
    </div>
  );
}

export default ErrorBoundary;