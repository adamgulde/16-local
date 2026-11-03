import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error) {
    // Log sanitized error indicator without dumping raw traces to UI
    if (import.meta.env.DEV) {
      console.warn('ErrorBoundary caught an error:', error.message);
    }
  }

  private handleReload = () => {
    if (this.props.onReset) {
      this.props.onReset();
      this.setState({ hasError: false });
    } else {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '260px',
            height: '100%',
            width: '100%',
            padding: '24px',
            boxSizing: 'border-box',
            background: '#121214',
            color: '#f0f0f0',
            textAlign: 'center',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <div
            style={{
              maxWidth: '420px',
              padding: '24px 20px',
              background: '#1c1c1e',
              borderRadius: '12px',
              border: '1px solid #3a3a40',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ fontSize: '28px', marginBottom: '12px' }}>⚠️</div>
            <h2 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 600, color: '#ffffff' }}>
              Something went wrong
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: '14px', color: '#9a9a9a', lineHeight: 1.5 }}>
              An unexpected display error occurred. You can reload the view to continue.
            </p>
            <button
              onClick={this.handleReload}
              style={{
                padding: '8px 20px',
                background: '#1e3a5f',
                border: '1px solid #2b5278',
                borderRadius: '6px',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#254a77')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#1e3a5f')}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
