import React, { useState, useEffect } from 'react';

interface AuditLog {
  session_id: string;
  initiating_user: string;
  target_device_id: string;
  start_time: string;
  end_time: string | null;
}

interface AuditLogsProps {
  token: string;
  backendUrl: string;
}

export const AuditLogs: React.FC<AuditLogsProps> = ({ token, backendUrl }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${backendUrl}/api/audit-logs`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        throw new Error('Failed to fetch audit log history from database.');
      }
      const data = await res.json();
      setLogs(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [token, backendUrl]);

  const formatDateTime = (dateStr: string) => {
    try {
      // Append 'Z' to treat as UTC since FastAPI returns UTC timestamp
      const date = new Date(dateStr + (dateStr.endsWith('Z') ? '' : 'Z'));
      return date.toLocaleString();
    } catch (e) {
      return dateStr;
    }
  };

  const calculateDuration = (startStr: string, endStr: string | null) => {
    if (!endStr) return <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>Active</span>;
    try {
      const start = new Date(startStr + (startStr.endsWith('Z') ? '' : 'Z'));
      const end = new Date(endStr + (endStr.endsWith('Z') ? '' : 'Z'));
      const diffMs = end.getTime() - start.getTime();
      const diffSecs = Math.floor(diffMs / 1000);
      
      if (diffSecs < 60) return `${diffSecs}s`;
      const diffMins = Math.floor(diffSecs / 60);
      const remainingSecs = diffSecs % 60;
      return `${diffMins}m ${remainingSecs}s`;
    } catch (e) {
      return '-';
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          Security Audit Logs
        </h2>
        <button className="connect-btn" style={{ width: 'auto', padding: '0.5rem 1rem' }} onClick={fetchLogs} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh Logs'}
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

      {loading && logs.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div className="spinner"></div>
        </div>
      ) : logs.length === 0 ? (
        <div className="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '1rem' }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          <p style={{ fontWeight: 500, marginBottom: '0.25rem' }}>No Audit Logs Found</p>
          <p style={{ fontSize: '0.9rem' }}>
            Initiated remote sessions will appear here as they are logged to the compliance database.
          </p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="logs-table">
            <thead>
              <tr>
                <th>Session ID</th>
                <th>Initiator</th>
                <th>Target Device</th>
                <th>Start Time</th>
                <th>End Time</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.session_id}>
                  <td className="text-mono" style={{ fontSize: '0.85rem' }}>
                    {log.session_id.substring(0, 8)}...
                  </td>
                  <td>{log.initiating_user}</td>
                  <td className="text-mono">{log.target_device_id}</td>
                  <td style={{ fontSize: '0.9rem' }}>{formatDateTime(log.start_time)}</td>
                  <td style={{ fontSize: '0.9rem' }}>
                    {log.end_time ? formatDateTime(log.end_time) : <span className="badge badge-success">Active</span>}
                  </td>
                  <td>{calculateDuration(log.start_time, log.end_time)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
