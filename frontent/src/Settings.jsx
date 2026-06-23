import React, { useState, useEffect } from 'react';
import './Settings.css';
import { User, Smartphone, Globe, Save, Camera } from 'lucide-react';
import { api } from './services/api';

export default function Settings() {
  const [activeTab, setActiveTab] = useState('user');
  
  const [user, setUser] = useState({ first_name: '', last_name: '', email: '', avatar_url: '' });
  const [org, setOrg] = useState({ name: '', website: '', timezone: '' });
  
  const [loading, setLoading] = useState(true);
  const [savingUser, setSavingUser] = useState(false);
  const [message, setMessage] = useState('');

  const tabs = [
    { id: 'user', label: 'User', icon: <User size={18} /> },
    { id: 'app', label: 'App Setting', icon: <Smartphone size={18} /> },
    { id: 'organization', label: 'Organization', icon: <Globe size={18} /> }
  ];

  useEffect(() => {
    const token = localStorage.getItem('bearer_token');
    const orgId = localStorage.getItem('organization_id');
    
    if (!token) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        // Fetch user
        const userRes = await api('/api/v1/users/me');
        if (userRes.ok) {
          const userData = await userRes.json();
          setUser({
            first_name: userData.first_name || '',
            last_name: userData.last_name || '',
            email: userData.email || '',
            avatar_url: userData.avatar_url || ''
          });
        }

        // Fetch org
        if (orgId) {
          const orgRes = await api(`/api/v1/organizations/${orgId}`);
          if (orgRes.ok) {
            const orgData = await orgRes.json();
            setOrg({
              name: orgData.name || '',
              website: orgData.website || '',
              timezone: orgData.timezone || 'UTC'
            });
          }
        }
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleUpdateUser = async () => {
    const token = localStorage.getItem('bearer_token');
    if (!token) return;
    
    setSavingUser(true);
    setMessage('');

    try {
      const response = await api('/api/v1/users/me', {
        method: 'PUT',
        body: JSON.stringify({
          first_name: user.first_name,
          last_name: user.last_name,
          avatar_url: user.avatar_url
        })
      });

      if (response.ok) {
        setMessage('Profile updated successfully!');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('Failed to update profile.');
      }
    } catch (err) {
      console.error('Error updating user:', err);
      setMessage('Error updating profile.');
    } finally {
      setSavingUser(false);
    }
  };

  const displayAvatar = user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.first_name || 'User')}+${encodeURIComponent(user.last_name || '')}&background=random`;

  if (loading) {
    return (
      <div className="settings-container skeleton">
        <div className="settings-header">
          <div className="skeleton-title"></div>
          <div className="skeleton-text"></div>
        </div>

        <div className="settings-layout">
          {/* Settings Sidebar */}
          <div className="settings-nav">
            {[1, 2, 3].map(i => (
              <div key={i} className="settings-nav-item skeleton-item">
                <div className="skeleton-icon"></div>
                <div className="skeleton-line"></div>
              </div>
            ))}
          </div>

          {/* Settings Content */}
          <div className="settings-content">
            <div className="settings-card">
              <div className="card-header-settings">
                <div className="skeleton-title small"></div>
                <div className="skeleton-button"></div>
              </div>
              <div className="profile-upload">
                <div className="skeleton-avatar"></div>
                <div className="upload-info">
                  <div className="skeleton-button" style={{ marginBottom: '8px' }}></div>
                  <div className="skeleton-text"></div>
                </div>
              </div>
              <div className="settings-form">
                <div className="form-row-settings">
                  <div className="form-group-settings">
                    <div className="skeleton-label"></div>
                    <div className="skeleton-input"></div>
                  </div>
                  <div className="form-group-settings">
                    <div className="skeleton-label"></div>
                    <div className="skeleton-input"></div>
                  </div>
                </div>
                <div className="form-group-settings">
                  <div className="skeleton-label"></div>
                  <div className="skeleton-input"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1>Settings</h1>
        <p>Manage your account settings and preferences.</p>
      </div>

      <div className="settings-layout">
        {/* Settings Sidebar */}
        <div className="settings-nav">
          {tabs.map(tab => (
            <div 
              key={tab.id} 
              className={`settings-nav-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              {tab.label}
            </div>
          ))}
        </div>

        {/* Settings Content */}
        <div className="settings-content">
          {activeTab === 'user' && (
            <div className="settings-card">
              <div className="card-header-settings">
                <h3>User Profile</h3>
                <button className="save-btn" onClick={handleUpdateUser} disabled={savingUser}>
                  <Save size={16} /> {savingUser ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
              {message && (
                <div style={{
                  padding: '1rem', 
                  backgroundColor: message.includes('success') ? '#e8f5e9' : '#ffebee', 
                  color: message.includes('success') ? '#2e7d32' : '#c62828', 
                  borderRadius: '0.5rem', 
                  marginBottom: '1rem',
                  fontSize: '0.875rem'
                }}>
                  {message}
                </div>
              )}
              <div className="profile-upload">
                <img src={displayAvatar} alt="Avatar" className="large-avatar" />
                <div className="upload-info">
                  <button className="upload-btn"><Camera size={16} /> Change Photo</button>
                  <p>JPG, GIF or PNG. Max size of 800K</p>
                </div>
              </div>
              <div className="settings-form">
                <div className="form-row-settings">
                  <div className="form-group-settings">
                    <label>First Name</label>
                    <input 
                      type="text" 
                      value={user.first_name} 
                      onChange={e => setUser({...user, first_name: e.target.value})} 
                    />
                  </div>
                  <div className="form-group-settings">
                    <label>Last Name</label>
                    <input 
                      type="text" 
                      value={user.last_name} 
                      onChange={e => setUser({...user, last_name: e.target.value})} 
                    />
                  </div>
                </div>
                <div className="form-group-settings">
                  <label>Email Address</label>
                  <input type="email" value={user.email} disabled style={{ backgroundColor: '#f9fafb', cursor: 'not-allowed' }} />
                </div>
                <div className="form-group-settings">
                  <label>Avatar URL</label>
                  <input 
                    type="text" 
                    value={user.avatar_url} 
                    onChange={e => setUser({...user, avatar_url: e.target.value})} 
                    placeholder="https://..." 
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'app' && (
            <div className="settings-card">
              <div className="card-header-settings">
                <h3>App Preferences</h3>
                <button className="save-btn"><Save size={16} /> Save Changes</button>
              </div>
              <div className="settings-list">
                <div className="settings-list-item">
                  <div className="item-info">
                    <span className="item-title">Push Notifications</span>
                    <span className="item-desc">Receive alerts about your task status.</span>
                  </div>
                  <div className="toggle-switch-settings active"></div>
                </div>
                <div className="settings-list-item">
                  <div className="item-info">
                    <span className="item-title">Email Weekly Report</span>
                    <span className="item-desc">Get a summary of your sales activity.</span>
                  </div>
                  <div className="toggle-switch-settings"></div>
                </div>
                <div className="settings-list-item">
                  <div className="item-info">
                    <span className="item-title">Automatic Sync</span>
                    <span className="item-desc">Sync data in real-time across devices.</span>
                  </div>
                  <div className="toggle-switch-settings active"></div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'organization' && (
            <div className="settings-card">
              <div className="card-header-settings">
                <h3>Organization Settings</h3>
                <button className="save-btn" disabled style={{opacity: 0.5, cursor: 'not-allowed'}}>
                  <Save size={16} /> Save Changes
                </button>
              </div>
              <div className="settings-form">
                <div className="form-group-settings">
                  <label>Organization Name</label>
                  <input type="text" value={org.name} disabled style={{ backgroundColor: '#f9fafb' }} />
                </div>
                <div className="form-group-settings">
                  <label>Company Website</label>
                  <input type="url" value={org.website} disabled style={{ backgroundColor: '#f9fafb' }} />
                </div>
                <div className="form-group-settings">
                  <label>Timezone</label>
                  <input type="text" value={org.timezone} disabled style={{ backgroundColor: '#f9fafb' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
