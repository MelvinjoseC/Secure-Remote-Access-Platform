import React, { useState, useEffect } from 'react';

interface DeviceListProps {
  token: string;
  backendUrl: string;
  onConnect: (deviceId: string) => void;
}

export const DeviceList: React.FC<DeviceListProps> = ({ token, backendUrl, onConnect }) => {
  const [devices, setDevices] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDevices = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${backendUrl}/api/devices`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Authentication expired. Please log in again.');
        }
        throw new Error('Failed to fetch online devices from backend.');
      }
      const data = await res.json();
      setDevices(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 5000); // Auto-refresh every 5s
    return () => clearInterval(interval);
  }, [token, backendUrl]);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
            <line x1="8" y1="21" x2="16" y2="21"></line>
            <line x1="12" y1="17" x2="12" y2="21"></line>
          </svg>
          Remote Machine Console
        </h2>
        <button className="connect-btn" style={{ width: 'auto', padding: '0.5rem 1rem' }} onClick={fetchDevices} disabled={loading}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: loading ? 'spin 1s infinite linear' : 'none' }}>
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
          </svg>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

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

      {loading && devices.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div className="spinner"></div>
        </div>
      ) : devices.length === 0 ? (
        <div className="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '1rem' }}>
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
            <line x1="8" y1="21" x2="16" y2="21"></line>
            <line x1="12" y1="17" x2="12" y2="21"></line>
            <path d="m10 10 2-2 2 2"></path>
            <path d="m12 14v-6"></path>
          </svg>
          <p style={{ fontWeight: 500, marginBottom: '0.25rem' }}>No Active Remote Agents Registered</p>
          <p style={{ fontSize: '0.9rem' }}>
            Ensure your Go Agent is running with the correct configuration and is connected outbound to the signaling server.
          </p>
        </div>
      ) : (
        <div className="device-grid">
          {devices.map((deviceId) => (
            <div key={deviceId} className="device-card online">
              <div className="device-card-header">
                <div className="device-info">
                  <span className="device-type">Industrial Device</span>
                  <span className="device-id">{deviceId}</span>
                </div>
                <span className="status-badge online">
                  <span className="status-dot pulsing"></span>
                  Active
                </span>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                Outbound-only connection: Encrypted (DTLS / SRTP)
              </div>
              <div className="device-card-actions">
                <button className="connect-btn" onClick={() => onConnect(deviceId)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                  Establish Remote Session
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
