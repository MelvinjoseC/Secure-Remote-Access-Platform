import React, { useState, useEffect } from 'react';
import { DeviceList } from './components/DeviceList';
import { SessionViewer } from './components/SessionViewer';
import { AuditLogs } from './components/AuditLogs';
import { UserManagement } from './components/UserManagement';

type Page = 'devices' | 'session' | 'logs' | 'users';

export default function App() {
  // Auth state
  const [token, setToken] = useState<string | null>(localStorage.getItem('jwt_token'));
  const [email, setEmail] = useState<string | null>(localStorage.getItem('jwt_email'));
  const [role, setRole] = useState<string | null>(localStorage.getItem('jwt_role'));
  
  // Navigation state
  const [currentPage, setCurrentPage] = useState<Page>('devices');
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);

  // Auth form state
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [inputEmail, setInputEmail] = useState('');
  const [inputPassword, setInputPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Dynamic host determination
  const backendUrl = `https://${window.location.hostname}:8000`;
  const signalingUrl = `wss://${window.location.hostname}:8443`;

  // Auto-redirect if token exists
  useEffect(() => {
    if (token) {
      setCurrentPage('devices');
    }
  }, [token]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';

    try {
      const res = await fetch(`${backendUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: inputEmail, password: inputPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        let errorMsg = 'Authentication failed';
        if (data && data.detail) {
          if (typeof data.detail === 'string') {
            errorMsg = data.detail;
          } else if (Array.isArray(data.detail)) {
            errorMsg = data.detail.map((err: any) => err.msg || JSON.stringify(err)).join(', ');
          } else if (typeof data.detail === 'object') {
            errorMsg = data.detail.message || JSON.stringify(data.detail);
          }
        }
        throw new Error(errorMsg);
      }

      localStorage.setItem('jwt_token', data.access_token);
      localStorage.setItem('jwt_email', data.email);
      localStorage.setItem('jwt_role', data.role);
      setToken(data.access_token);
      setEmail(data.email);
      setRole(data.role);
      
      // Reset form
      setInputEmail('');
      setInputPassword('');
      setCurrentPage('devices');
    } catch (err: any) {
      setError(err.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('jwt_email');
    localStorage.removeItem('jwt_role');
    setToken(null);
    setEmail(null);
    setRole(null);
    setActiveDeviceId(null);
    setCurrentPage('devices');
  };

  const handleConnectDevice = (deviceId: string) => {
    setActiveDeviceId(deviceId);
    setCurrentPage('session');
  };

  const handleDisconnectSession = () => {
    setActiveDeviceId(null);
    setCurrentPage('devices');
  };

  // Render Login/Register panel if not authenticated
  if (!token) {
    return (
      <div className="app-container" style={{ justifyContent: 'center' }}>
        <div className="auth-wrapper">
          <div className="auth-card">
            <div className="auth-logo">Ω</div>
            <h1 className="auth-title">Secure Remote Access</h1>
            <p className="auth-subtitle">Industrial Operations Dashboard MVP</p>

            {error && (
              <div className="error-banner">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                {error}
              </div>
            )}

            <form onSubmit={handleAuthSubmit}>
              <div className="form-group">
                <label className="form-label">Operator Email</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="name@company.com"
                  required
                  value={inputEmail}
                  onChange={(e) => setInputEmail(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Security Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="••••••••••••"
                  required
                  value={inputPassword}
                  onChange={(e) => setInputPassword(e.target.value)}
                  disabled={loading}
                />
              </div>

              <button type="submit" className="auth-btn" disabled={loading}>
                {loading ? 'Authenticating...' : authMode === 'login' ? 'Authenticate' : 'Register Operator'}
              </button>
            </form>

            <div className="auth-toggle">
              {authMode === 'login' ? (
                <>
                  Need operator access?{' '}
                  <button className="auth-toggle-link" onClick={() => setAuthMode('register')}>
                    Register here
                  </button>
                </>
              ) : (
                <>
                  Already have access?{' '}
                  <button className="auth-toggle-link" onClick={() => setAuthMode('login')}>
                    Log in here
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-logo">Ω</div>
          <span className="brand-name">Secure Remote Access</span>
          <span className="brand-badge">MVP</span>
        </div>

        <nav className="nav-links">
          <button
            className={`nav-btn ${currentPage === 'devices' || currentPage === 'session' ? 'active' : ''}`}
            onClick={() => {
              if (currentPage === 'session') {
                if (window.confirm('Disconnect current session?')) {
                  handleLogout(); // or just close
                  setCurrentPage('devices');
                }
              } else {
                setCurrentPage('devices');
              }
            }}
            disabled={currentPage === 'session'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
            Console
          </button>
          <button
            className={`nav-btn ${currentPage === 'logs' ? 'active' : ''}`}
            onClick={() => setCurrentPage('logs')}
            disabled={currentPage === 'session'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            Audit Logs
          </button>

          {role === 'admin' && (
            <button
              className={`nav-btn ${currentPage === 'users' ? 'active' : ''}`}
              onClick={() => setCurrentPage('users')}
              disabled={currentPage === 'session'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
              Users
            </button>
          )}

          <div className="user-status">
            <span className="user-email">{email}</span>
            <button className="logout-btn" onClick={handleLogout} disabled={currentPage === 'session'}>
              Logout
            </button>
          </div>
        </nav>
      </header>

      <main className="main-content">
        {currentPage === 'devices' && (
          <DeviceList
            token={token}
            backendUrl={backendUrl}
            onConnect={handleConnectDevice}
          />
        )}

        {currentPage === 'session' && activeDeviceId && (
          <SessionViewer
            token={token}
            deviceId={activeDeviceId}
            backendUrl={backendUrl}
            signalingUrl={signalingUrl}
            onDisconnect={handleDisconnectSession}
          />
        )}

        {currentPage === 'logs' && (
          <AuditLogs
            token={token}
            backendUrl={backendUrl}
          />
        )}

        {currentPage === 'users' && role === 'admin' && (
          <UserManagement
            token={token}
            backendUrl={backendUrl}
          />
        )}
      </main>
    </div>
  );
}
