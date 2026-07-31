import React, { useState, useEffect } from 'react';

interface User {
  id: number;
  email: string;
  role: string;
  mfa_enabled: boolean;
}

interface UserManagementProps {
  token: string;
  backendUrl: string;
}

export const UserManagement: React.FC<UserManagementProps> = ({ token, backendUrl }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${backendUrl}/api/admin/users`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        throw new Error('Failed to fetch user accounts.');
      }
      const data = await res.json();
      setUsers(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [token, backendUrl]);

  const handleRoleChange = async (userId: number, newRole: string) => {
    setError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(`${backendUrl}/api/admin/users/role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ user_id: userId, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to update user role.');
      }
      setActionSuccess(`User role updated successfully.`);
      // Update local state
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err: any) {
      setError(err.message || 'Error updating role.');
    }
  };

  const handleClearLogs = async () => {
    if (!window.confirm('WARNING: Are you sure you want to permanently clear all audit compliance logs? This action cannot be undone.')) {
      return;
    }
    setError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(`${backendUrl}/api/admin/audit-logs/clear`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to clear audit logs.');
      }
      setActionSuccess('All compliance audit logs cleared successfully.');
    } catch (err: any) {
      setError(err.message || 'Error clearing logs.');
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          User Account Management
        </h2>
        <button className="connect-btn" style={{ width: 'auto', padding: '0.5rem 1rem' }} onClick={fetchUsers} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh Users'}
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

      {actionSuccess && (
        <div style={{ background: 'rgba(0, 230, 118, 0.15)', border: '1px solid var(--accent-green)', padding: '1rem', borderRadius: '4px', color: '#b9f6ca', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          {actionSuccess}
        </div>
      )}

      {loading && users.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div className="spinner"></div>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="logs-table">
            <thead>
              <tr>
                <th>User ID</th>
                <th>Operator Email</th>
                <th>Access Role</th>
                <th>Two-Factor Security</th>
                <th>Modify Access</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.id}</td>
                  <td style={{ fontWeight: 500 }}>{user.email}</td>
                  <td>
                    <span className={`badge ${user.role === 'admin' ? 'badge-danger' : user.role === 'operator' ? 'badge-primary' : 'badge-secondary'}`}>
                      {user.role.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    {user.mfa_enabled ? (
                      <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>Active</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>Inactive</span>
                    )}
                  </td>
                  <td>
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                    >
                      <option value="admin">Administrator</option>
                      <option value="operator">Operator (Full Control)</option>
                      <option value="auditor">Auditor (View Only)</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(255, 138, 128, 0.05)', border: '1px solid rgba(255, 138, 128, 0.2)', borderRadius: '4px' }}>
        <h3 style={{ margin: '0 0 0.5rem 0', color: '#ff8a80', fontSize: '1.1rem' }}>Danger Zone</h3>
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Permanently erase all historical session records and operation audit logs. This action satisfies data retention compliance rules but is irreversible.
        </p>
        <button
          onClick={handleClearLogs}
          style={{ background: 'var(--accent-red)', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', fontWeight: 'semibold', cursor: 'pointer' }}
        >
          Purge Compliance Logs
        </button>
      </div>
    </div>
  );
};
