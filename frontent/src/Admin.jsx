import React, { useState, useEffect } from 'react';
import './Admin.css';
import { UserPlus, Mail, Shield, MoreHorizontal, CheckCircle2, Clock, Trash2 } from 'lucide-react';
import { api } from './services/api';

export default function Admin() {
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [sendingInvite, setSendingInvite] = useState(false);

  const fetchMembers = async () => {
    const orgId = localStorage.getItem('organization_id');
    const token = localStorage.getItem('bearer_token');

    if (!orgId || !token) {
      setError('Missing organization ID or authentication token.');
      setLoading(false);
      return;
    }

    try {
      const response = await api(`/api/v1/organizations/${orgId}/members`);

      if (!response.ok) {
        throw new Error('Failed to fetch members.');
      }

      const data = await response.json();
      setMembers(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchInvitations = async () => {
    const orgId = localStorage.getItem('organization_id');
    const token = localStorage.getItem('bearer_token');

    if (!orgId || !token) return;

    try {
      const response = await api(`/api/v1/organizations/${orgId}/invitations`);

      if (!response.ok) throw new Error('Failed to fetch invitations');
      const data = await response.json();
      setInvitations(data || []);
    } catch (err) {
      console.error('Error fetching invitations:', err);
    }
  };

  useEffect(() => {
    fetchMembers();
    fetchInvitations();
  }, []);

  const handleUpdateRole = async (userId, newRole) => {
    const orgId = localStorage.getItem('organization_id');
    const token = localStorage.getItem('bearer_token');

    try {
      const response = await api(`/api/v1/organizations/${orgId}/members/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole })
      });

      if (!response.ok) {
        throw new Error('Failed to update role.');
      }

      // Refresh list
      fetchMembers();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!window.confirm('Are you sure you want to remove this member?')) return;

    const orgId = localStorage.getItem('organization_id');
    const token = localStorage.getItem('bearer_token');

    try {
      const response = await api(`/api/v1/organizations/${orgId}/members/${userId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to remove member.');
      }

      // Refresh list
      fetchMembers();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSendInvite = async (e) => {
    e.preventDefault();
    const orgId = localStorage.getItem('organization_id');
    const token = localStorage.getItem('bearer_token');

    setSendingInvite(true);
    try {
      const response = await api(`/api/v1/organizations/${orgId}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, role: inviteRole })
      });

      if (!response.ok) {
        throw new Error('Failed to send invitation.');
      }

      alert('Invitation sent successfully!');
      setInviteEmail('');
      setInviteRole('viewer');
      fetchInvitations(); // Refresh invitations list
    } catch (err) {
      alert(err.message);
    } finally {
      setSendingInvite(false);
    }
  };

  return (
    <div className="admin-container">
      <div className="admin-header" style={{ justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="invite-btn-top">
          <UserPlus size={18} />
          Invite Member
        </button>
      </div>

      <div className="admin-grid">
        {/* Staff Table */}
        <div className="admin-card staff-card">
          <div className="card-header-admin">
            <h3>Staff Directory</h3>
            <span className="staff-count">{members.length} Members</span>
          </div>
          
          {loading && (
            <div className="skeleton" style={{ padding: '1.5rem' }}>
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center' }}>
                  <div className="skeleton-avatar" style={{ width: '40px', height: '40px' }}></div>
                  <div style={{ flex: 1 }}>
                    <div className="skeleton-title small" style={{ marginBottom: '4px', height: '16px', width: '120px' }}></div>
                    <div className="skeleton-text" style={{ width: '180px', height: '12px' }}></div>
                  </div>
                  <div className="skeleton-button" style={{ width: '80px', height: '28px' }}></div>
                  <div className="skeleton-button" style={{ width: '60px', height: '28px' }}></div>
                  <div className="skeleton-icon" style={{ width: '24px', height: '24px' }}></div>
                </div>
              ))}
            </div>
          )}
          {error && <div style={{ padding: '1rem', color: '#c62828', backgroundColor: '#ffebee', borderRadius: '4px', margin: '1rem' }}>{error}</div>}
          
          {!loading && !error && (
            <div className="table-wrapper">
              <table className="staff-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map(member => {
                    const fullName = `${member.user_first_name || ''} ${member.user_last_name || ''}`.trim() || 'Unknown User';
                    const avatarUrl = member.user_avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=random`;
                    
                    return (
                      <tr key={member.id}>
                        <td>
                          <div className="member-info">
                            <img src={avatarUrl} alt={fullName} className="member-avatar" />
                            <div>
                              <div className="member-name">{fullName}</div>
                              <div className="member-email">{member.user_email}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <select 
                            value={member.role} 
                            onChange={(e) => handleUpdateRole(member.user_id, e.target.value)}
                            style={{ 
                              padding: '0.25rem 0.5rem', 
                              borderRadius: '0.25rem', 
                              border: '1px solid #e5e7eb',
                              fontSize: '0.875rem',
                              textTransform: 'capitalize'
                            }}
                          >
                            <option value="admin">Admin</option>
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        </td>
                        <td>
                          <div className={`status-badge ${member.status?.toLowerCase() || 'inactive'}`}>
                            {member.status || 'Inactive'}
                          </div>
                        </td>
                        <td>
                          <button 
                            className="action-dot-btn" 
                            onClick={() => handleRemoveMember(member.user_id)}
                            style={{ color: '#ef4444' }}
                            title="Remove Member"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Invite Form Side Card */}
        <div className="admin-card invite-card">
          <h3>Invite New Staff</h3>
          <p className="invite-desc">Send an email invitation to join your organization.</p>
          
          <form className="invite-form" onSubmit={handleSendInvite}>
            <div className="input-group">
              <label>Email Address</label>
              <div className="input-with-icon">
                <Mail size={16} />
                <input 
                  type="email" 
                  placeholder="name@company.com" 
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            
            <div className="input-group">
              <label>Assign Role</label>
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            
            <button type="submit" className="send-invite-btn" disabled={sendingInvite}>
              {sendingInvite ? 'Sending...' : 'Send Invitation'}
            </button>
          </form>

          <div className="pending-invites">
            <h4>Pending Invitations</h4>
            <div className="pending-list">
              {invitations.length === 0 && (
                <p style={{ fontSize: '0.875rem', color: '#6b7280', textAlign: 'center', padding: '1rem' }}>
                  No pending invitations.
                </p>
              )}
              {invitations.map(invite => (
                <div key={invite.id} className="pending-item">
                  <div className="pending-info">
                    <span className="pending-email">{invite.email}</span>
                    <span className="pending-time" style={{ textTransform: 'capitalize' }}>
                      Role: {invite.role}
                    </span>
                  </div>
                  <div className={`pending-status ${invite.status?.toLowerCase()}`}>
                    <Clock size={14} /> {invite.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
