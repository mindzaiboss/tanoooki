import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { getAccessToken } from '../../util/authTokens';
import css from './AdminPage.module.css';

const STATUS_LABELS = { active: 'Active', suspended: 'Suspended', banned: 'Banned' };
const STATUS_ACTIONS = {
  active: [{ label: 'Suspend', next: 'suspended' }, { label: 'Ban', next: 'banned' }],
  suspended: [{ label: 'Activate', next: 'active' }, { label: 'Ban', next: 'banned' }],
  banned: [{ label: 'Activate', next: 'active' }],
};

const AdminPage = () => {
  const currentUser = useSelector(state => state.user.currentUser);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(null);

  useEffect(() => {
    const token = getAccessToken();
    fetch('/api/auth/admin/list-users', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setUsers(data.users || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const updateStatus = async (userId, newStatus) => {
    setUpdating(userId);
    const token = getAccessToken();
    try {
      const res = await fetch('/api/auth/admin/update-user-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, newStatus }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setUsers(prev => prev.map(u => (u.id === userId ? data.user : u)));
    } catch (e) {
      alert('Update failed: ' + e.message);
    } finally {
      setUpdating(null);
    }
  };

  if (loading) return <div className={css.root}><p>Loading users...</p></div>;
  if (error) return <div className={css.root}><p className={css.error}>Error: {error}</p></div>;

  return (
    <div className={css.root}>
      <h1 className={css.title}>User Management</h1>
      <p className={css.subtitle}>{users.length} users</p>
      <table className={css.table}>
        <thead>
          <tr>
            <th>Email</th>
            <th>Name</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id}>
              <td>{user.email}</td>
              <td>{user.username || '—'}</td>
              <td>
                <span className={css[`status_${user.status}`]}>
                  {STATUS_LABELS[user.status] || user.status}
                </span>
              </td>
              <td>{user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</td>
              <td>
                {(STATUS_ACTIONS[user.status] || []).map(action => (
                  <button
                    key={action.next}
                    className={css.actionButton}
                    disabled={updating === user.id}
                    onClick={() => updateStatus(user.id, action.next)}
                  >
                    {updating === user.id ? '...' : action.label}
                  </button>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AdminPage;
