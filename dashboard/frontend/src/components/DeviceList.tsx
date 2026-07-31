import React, { useState, useEffect } from 'react';

interface DeviceListProps {
  token: string;
  backendUrl: string;
  onConnect: (deviceId: string) => void;
}

export const DeviceList: React.FC<DeviceListProps> = ({ token, backendUrl, onConnect }) => {
  const [devices, setDevices] = useState<string[]>([]);
  const [telemetry, setTelemetry] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);

  const formatUptime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs}h ${mins}m ${secs}s`;
  };

  const fetchDevices = async () => {
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

      // Fetch telemetry cache
      const telRes = await fetch(`${backendUrl}/api/devices/telemetry`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (telRes.ok) {
        const telData = await telRes.json();
        setTelemetry(telData);
      }
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
                  <span className="device-type">
                    {telemetry[deviceId] && telemetry[deviceId].os === 'windows' ? 'Windows Workstation' : 'Linux Drone Agent'}
                  </span>
                  <span className="device-id">{deviceId}</span>
                </div>
                <span className="status-badge online">
                  <span className="status-dot pulsing"></span>
                  Active
                </span>
              </div>
              
              <div style={{ margin: '1.25rem 0 1rem 0' }}>
                {telemetry[deviceId] ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      <span>System Architecture:</span>
                      <span className="text-mono">
                        {telemetry[deviceId].os} ({telemetry[deviceId].arch})
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>CPU Profiler:</span>
                        <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>
                          {telemetry[deviceId].cpu_percent.toFixed(1)}%
                        </span>
                      </div>
                      <div style={{ height: '6px', background: '#121926', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${telemetry[deviceId].cpu_percent}%`, height: '100%', background: 'var(--accent-cyan)', transition: 'width 0.5s ease' }}></div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Memory Allocation:</span>
                        <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>
                          {telemetry[deviceId].ram_usage_mb.toFixed(2)} MB
                        </span>
                      </div>
                      <div style={{ height: '6px', background: '#121926', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min((telemetry[deviceId].ram_usage_mb / 10.0) * 100, 100)}%`, height: '100%', background: 'var(--accent-green)', transition: 'width 0.5s ease' }}></div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '0.5rem 0' }}>
                    Synchronizing device resource metrics...
                  </div>
                )}
              </div>

              <div className="device-card-actions" style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="connect-btn" style={{ flex: 1 }} onClick={() => onConnect(deviceId)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                  Connect
                </button>
                <button
                  className="nav-btn"
                  style={{ border: '1px solid var(--border-color)', borderRadius: '4px', background: 'transparent', color: 'var(--text-secondary)', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => setSelectedDevice(deviceId)}
                  title="View Telemetry Diagnostics"
                  disabled={!telemetry[deviceId]}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10"></line>
                    <line x1="12" y1="20" x2="12" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="14"></line>
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedDevice && telemetry[selectedDevice] && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(7, 10, 19, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="panel" style={{ width: '480px', maxWidth: '90%', margin: '1rem', border: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}>
            <div className="panel-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <h3 className="panel-title" style={{ fontSize: '1.2rem', margin: 0 }}>
                Telemetry Diagnostics: {selectedDevice}
              </h3>
              <button
                onClick={() => setSelectedDevice(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>
            
            <div style={{ padding: '1.5rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', borderBottom: '1px solid #16223f', paddingBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Operating System:</span>
                <span className="text-mono" style={{ textTransform: 'capitalize' }}>{telemetry[selectedDevice].os}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', borderBottom: '1px solid #16223f', paddingBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>System Architecture:</span>
                <span className="text-mono">{telemetry[selectedDevice].arch}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', borderBottom: '1px solid #16223f', paddingBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Go Runtime:</span>
                <span className="text-mono">{telemetry[selectedDevice].go_version}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', borderBottom: '1px solid #16223f', paddingBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Goroutines:</span>
                <span className="text-mono" style={{ color: 'var(--accent-cyan)' }}>{telemetry[selectedDevice].goroutines}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', borderBottom: '1px solid #16223f', paddingBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Uptime:</span>
                <span className="text-mono">{formatUptime(telemetry[selectedDevice].uptime_secs)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', borderBottom: '1px solid #16223f', paddingBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Disk Storage Used:</span>
                <span className="text-mono" style={{ color: 'var(--accent-red)' }}>{telemetry[selectedDevice].disk_usage_pct.toFixed(1)}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', borderBottom: '1px solid #16223f', paddingBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Telemetry Pulled (UTC):</span>
                <span className="text-mono" style={{ fontSize: '0.85rem' }}>{new Date(telemetry[selectedDevice].timestamp).toISOString().replace('T', ' ').substring(0, 19)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button className="connect-btn" style={{ width: 'auto', padding: '0.5rem 1.5rem' }} onClick={() => setSelectedDevice(null)}>
                Close Diagnostics
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
