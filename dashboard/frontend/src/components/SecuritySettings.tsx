import React, { useState, useEffect } from 'react';

interface SecuritySettingsProps {
  token: string;
  backendUrl: string;
}

interface UserProfile {
  id: number;
  email: string;
  role: string;
  mfa_enabled: boolean;
}

export const SecuritySettings: React.FC<SecuritySettingsProps> = ({ token, backendUrl }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // MFA setup states
  const [setupMode, setSetupMode] = useState<boolean>(false);
  const [mfaSecret, setMfaSecret] = useState<string>('');
  const [provisioningUri, setProvisioningUri] = useState<string>('');
  const [verifyCode, setVerifyCode] = useState<string>('');

  const fetchProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${backendUrl}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        throw new Error('Failed to fetch security profile.');
      }
      const data = await res.json();
      setProfile(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [token, backendUrl]);

  const handleStartSetup = async () => {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${backendUrl}/api/auth/mfa/setup`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to initiate MFA setup.');
      }
      setMfaSecret(data.secret);
      setProvisioningUri(data.provisioning_uri);
      setSetupMode(true);
    } catch (err: any) {
      setError(err.message || 'Error setting up MFA.');
    }
  };

  const handleVerifySetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${backendUrl}/api/auth/mfa/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ code: verifyCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'MFA validation failed.');
      }
      setSuccess('Two-factor authentication (MFA) enabled successfully.');
      setSetupMode(false);
      setVerifyCode('');
      fetchProfile();
    } catch (err: any) {
      setError(err.message || 'Verification failed.');
    }
  };

  const handleDisableMFA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.confirm('Are you sure you want to disable 2FA security on your account? This reduces your account security.')) {
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${backendUrl}/api/auth/mfa/disable`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ code: verifyCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to disable MFA.');
      }
      setSuccess('Two-factor authentication (MFA) has been disabled.');
      setVerifyCode('');
      fetchProfile();
    } catch (err: any) {
      setError(err.message || 'Error disabling MFA.');
    }
  };

  if (loading && !profile) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(provisioningUri)}&color=0-224-255&bgcolor=11-15-25`;

  return (
    <div className="panel" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div className="panel-header">
        <h2 className="panel-title">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          Security Profile Settings
        </h2>
      </div>

      {error && (
        <div className="error-banner" style={{ marginBottom: '1.5rem' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          {error}
        </div>
      )}

      {success && (
        <div style={{ background: 'rgba(0, 230, 118, 0.15)', border: '1px solid var(--accent-green)', padding: '1rem', borderRadius: '4px', color: '#b9f6ca', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          {success}
        </div>
      )}

      {profile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Operator Account:</span>
              <strong className="text-mono">{profile.email}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Access Permission:</span>
              <span className={`badge ${profile.role === 'admin' ? 'badge-danger' : profile.role === 'operator' ? 'badge-primary' : 'badge-secondary'}`}>
                {profile.role.toUpperCase()}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Two-Factor Security (MFA):</span>
              <span className={`badge ${profile.mfa_enabled ? 'badge-success' : 'badge-secondary'}`} style={{ textTransform: 'uppercase' }}>
                {profile.mfa_enabled ? 'Enforced' : 'Disabled'}
              </span>
            </div>
          </div>

          {!profile.mfa_enabled && !setupMode && (
            <div style={{ background: '#0b0f19', border: '1px solid var(--border-color)', padding: '1.5rem', borderRadius: '4px' }}>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', color: 'var(--text-primary)' }}>Protect your Operator Console</h3>
              <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                Require an authenticator code (TOTP) from your mobile device whenever you access this dashboard. Prevents unauthorized remote control sessions even if your password is leaked.
              </p>
              <button className="connect-btn" style={{ width: 'auto', padding: '0.5rem 1.5rem' }} onClick={handleStartSetup}>
                Set Up Two-Factor Authentication
              </button>
            </div>
          )}

          {setupMode && (
            <div style={{ background: '#0b0f19', border: '1px solid var(--border-color)', padding: '1.5rem', borderRadius: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', color: 'var(--accent-cyan)' }}>Scan QR Code</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Scan the QR code below using Google Authenticator, Authy, or your password manager.
                </p>
              </div>

              <div style={{ padding: '8px', background: '#070a13', borderRadius: '8px', border: '1px solid var(--border-color)', width: '180px', height: '180px' }}>
                <img src={qrCodeUrl} alt="MFA QR Code" style={{ width: '100%', height: '100%' }} />
              </div>

              <div style={{ width: '100%', textAlign: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Or enter secret key manually:</span>
                <div style={{ marginTop: '0.25rem', fontFamily: 'monospace', background: 'var(--bg-secondary)', padding: '0.5rem', borderRadius: '4px', fontSize: '0.90rem', letterSpacing: '1px', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                  {mfaSecret}
                </div>
              </div>

              <form onSubmit={handleVerifySetup} style={{ width: '100%', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                <div className="form-group">
                  <label className="form-label" style={{ textAlign: 'left' }}>6-Digit Verification Code</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="000 000"
                    required
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').substring(0, 6))}
                    style={{ letterSpacing: '4px', textAlign: 'center', fontSize: '1.25rem', fontWeight: 'bold' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button type="submit" className="connect-btn" style={{ flex: 1 }}>
                    Verify and Enable
                  </button>
                  <button type="button" className="nav-btn" style={{ border: '1px solid var(--border-color)', borderRadius: '4px', background: 'transparent', color: 'var(--text-secondary)', padding: '0 1rem' }} onClick={() => setSetupMode(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {profile.mfa_enabled && (
            <div style={{ background: 'rgba(255, 138, 128, 0.05)', border: '1px solid rgba(255, 138, 128, 0.2)', padding: '1.5rem', borderRadius: '4px' }}>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', color: '#ff8a80' }}>Disable Two-Factor Security</h3>
              <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                Enter your current authenticator OTP code below to remove 2FA restriction from your account.
              </p>
              <form onSubmit={handleDisableMFA}>
                <div className="form-group" style={{ maxWidth: '300px' }}>
                  <label className="form-label">Authenticator Code</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="000 000"
                    required
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').substring(0, 6))}
                    style={{ letterSpacing: '4px', textAlign: 'center', fontSize: '1.25rem', fontWeight: 'bold' }}
                  />
                </div>
                <button type="submit" style={{ background: 'var(--accent-red)', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', fontWeight: 'semibold', cursor: 'pointer', marginTop: '0.5rem' }}>
                  Disable 2FA Security
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
