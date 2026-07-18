import React, { useState, useEffect, useRef } from 'react';
import { api } from './services/api';
import './SuperAdmin.css';
import { 
  Users, Building2, ListTodo, ShieldAlert, ShieldCheck, 
  Search, RefreshCw, CheckCircle, XCircle, Loader2, UserMinus, UserCheck, 
  ArrowLeft, Calendar, HelpCircle, Activity, Globe, Mail, LogIn, MessageSquare, Bot, Shield, Send,
  Trash2
} from 'lucide-react';

export default function SuperAdmin() {
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [tasks, setTasks] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [selectedItemDetail, setSelectedItemDetail] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);

  const fetchStats = async () => {
    try {
      const res = await api('/api/v1/superadmin/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const fetchUsers = async (page = 1) => {
    setLoading(true);
    try {
      const res = await api(`/api/v1/superadmin/users?page=${page}&page_size=20`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.items || []);
        setTotalItems(data.total || 0);
        setCurrentPage(data.page || 1);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrganizations = async (page = 1) => {
    setLoading(true);
    try {
      const res = await api(`/api/v1/superadmin/organizations?page=${page}&page_size=20`);
      if (res.ok) {
        const data = await res.json();
        setOrgs(data.items || []);
        setTotalItems(data.total || 0);
        setCurrentPage(data.page || 1);
      }
    } catch (err) {
      console.error('Error fetching organizations:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTasks = async (page = 1) => {
    setLoading(true);
    try {
      const res = await api(`/api/v1/superadmin/tasks?page=${page}&page_size=20`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.items || []);
        setTotalItems(data.total || 0);
        setCurrentPage(data.page || 1);
      }
    } catch (err) {
      console.error('Error fetching tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleUserActive = async (userId) => {
    if (!window.confirm('Are you sure you want to toggle this user\'s active status?')) return;
    setActionLoading(true);
    try {
      const res = await api(`/api/v1/superadmin/users/${userId}/toggle-active`, {
        method: 'PUT'
      });
      if (res.ok) {
        // Refresh users and stats
        await fetchUsers(currentPage);
        await fetchStats();
      } else {
        const err = await res.json();
        alert(err.detail || 'Failed to toggle user status');
      }
    } catch (err) {
      console.error('Error toggling user status:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async (userId, userEmail) => {
    if (!window.confirm(`WARNING: Are you sure you want to permanently delete user ${userEmail}? This will delete all of their tasks, metadata, and support messages, and cannot be undone.`)) return;
    setActionLoading(true);
    try {
      const res = await api(`/api/v1/superadmin/users/${userId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        alert('User deleted successfully.');
        await fetchUsers(currentPage);
        await fetchStats();
      } else {
        const err = await res.json();
        alert(err.detail || 'Failed to delete user');
      }
    } catch (err) {
      console.error('Error deleting user:', err);
      alert('An error occurred while deleting the user.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteOrganization = async (orgId, orgName) => {
    if (!window.confirm(`WARNING: Are you sure you want to permanently delete organization "${orgName}"? This will delete all tasks and workspaces associated with it, and cannot be undone.`)) return;
    setActionLoading(true);
    try {
      const res = await api(`/api/v1/superadmin/organizations/${orgId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        alert('Organization deleted successfully.');
        await fetchOrganizations(currentPage);
        await fetchStats();
      } else {
        const err = await res.json();
        alert(err.detail || 'Failed to delete organization');
      }
    } catch (err) {
      console.error('Error deleting organization:', err);
      alert('An error occurred while deleting the organization.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteTask = async (taskId, taskName) => {
    if (!window.confirm(`WARNING: Are you sure you want to permanently delete task "${taskName || 'Untitled Task'}"? This will delete all associated transcripts and files, and cannot be undone.`)) return;
    setActionLoading(true);
    try {
      const res = await api(`/api/v1/superadmin/tasks/${taskId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        alert('Task deleted successfully.');
        await fetchTasks(currentPage);
        await fetchStats();
      } else {
        const err = await res.json();
        alert(err.detail || 'Failed to delete task');
      }
    } catch (err) {
      console.error('Error deleting task:', err);
      alert('An error occurred while deleting the task.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkDeleteUsers = async () => {
    const toDelete = selectedIds.filter(id => {
      const user = users.find(u => u.id === id);
      return user && user.email !== 'mirzamailbox0@gmail.com';
    });
    if (toDelete.length === 0) {
      alert("No valid users selected (superadmin cannot be deleted).");
      return;
    }
    if (!window.confirm(`WARNING: Are you sure you want to permanently delete these ${toDelete.length} users? This will delete all of their tasks, metadata, and support messages, and cannot be undone.`)) return;
    setActionLoading(true);
    try {
      const res = await api('/api/v1/superadmin/users/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: toDelete })
      });
      if (res.ok) {
        alert('Users deleted successfully.');
        setSelectedIds([]);
        await fetchUsers(currentPage);
        await fetchStats();
      } else {
        const err = await res.json();
        alert(err.detail || 'Failed to delete users');
      }
    } catch (err) {
      console.error('Error bulk deleting users:', err);
      alert('An error occurred while deleting the users.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkDeleteOrganizations = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`WARNING: Are you sure you want to permanently delete these ${selectedIds.length} organizations? This will delete all tasks and workspaces associated with them, and cannot be undone.`)) return;
    setActionLoading(true);
    try {
      const res = await api('/api/v1/superadmin/organizations/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds })
      });
      if (res.ok) {
        alert('Organizations deleted successfully.');
        setSelectedIds([]);
        await fetchOrganizations(currentPage);
        await fetchStats();
      } else {
        const err = await res.json();
        alert(err.detail || 'Failed to delete organizations');
      }
    } catch (err) {
      console.error('Error bulk deleting organizations:', err);
      alert('An error occurred while deleting the organizations.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkDeleteTasks = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`WARNING: Are you sure you want to permanently delete these ${selectedIds.length} tasks? This will delete all associated transcripts and files, and cannot be undone.`)) return;
    setActionLoading(true);
    try {
      const res = await api('/api/v1/superadmin/tasks/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds })
      });
      if (res.ok) {
        alert('Tasks deleted successfully.');
        setSelectedIds([]);
        await fetchTasks(currentPage);
        await fetchStats();
      } else {
        const err = await res.json();
        alert(err.detail || 'Failed to delete tasks');
      }
    } catch (err) {
      console.error('Error bulk deleting tasks:', err);
      alert('An error occurred while deleting the tasks.');
    } finally {
      setActionLoading(false);
    }
  };


  const handleImpersonate = async (user) => {
    if (!window.confirm(`Are you sure you want to login as ${user.first_name} ${user.last_name}?`)) return;
    setActionLoading(true);
    try {
      const res = await api(`/api/v1/superadmin/users/${user.id}/impersonate`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        
        // Save target user credentials in local storage
        localStorage.setItem('bearer_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        
        // Select their first organization if available
        if (user.organizations && user.organizations.length > 0) {
          localStorage.setItem('organization_id', user.organizations[0].org_id);
        } else {
          localStorage.removeItem('organization_id');
        }
        
        // Redirect to main page and reload the context
        window.location.href = '/';
      } else {
        const err = await res.json();
        alert(err.detail || 'Impersonation login failed.');
      }
    } catch (err) {
      console.error('Impersonation error:', err);
      alert('An error occurred during impersonation login.');
    } finally {
      setActionLoading(false);
    }
  };

  // Support help desk states
  const [threads, setThreads] = useState([]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const chatEndRef = useRef(null);

  const fetchThreads = async () => {
    setLoading(true);
    try {
      const res = await api('/api/v1/superadmin/help/threads');
      if (res.ok) {
        const data = await res.json();
        setThreads(data || []);
      }
    } catch (err) {
      console.error('Error fetching help threads:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchThreadMessages = async (orgId) => {
    setLoadingMessages(true);
    try {
      const res = await api(`/api/v1/superadmin/help/threads/${orgId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setThreadMessages(data || []);
      }
    } catch (err) {
      console.error('Error fetching thread messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSelectThread = (thread) => {
    setSelectedThread(thread);
    fetchThreadMessages(thread.organization_id);
  };

  const handleSendReply = async (e) => {
    if (e) e.preventDefault();
    if (!replyText.trim() || sendingReply || !selectedThread) return;
    
    const textToSend = replyText.trim();
    setReplyText('');
    setSendingReply(true);
    
    try {
      const res = await api(`/api/v1/superadmin/help/threads/${selectedThread.organization_id}/reply`, {
        method: 'POST',
        body: JSON.stringify({
          content: textToSend,
          user_id: selectedThread.user_id
        })
      });
      if (res.ok) {
        const newMsg = await res.json();
        setThreadMessages(prev => [...prev, newMsg]);
        
        // Refresh the threads list to update snippet
        const resThreads = await api('/api/v1/superadmin/help/threads');
        if (resThreads.ok) {
          const dataThreads = await resThreads.json();
          setThreads(dataThreads || []);
          const updatedThread = dataThreads.find(t => t.organization_id === selectedThread.organization_id);
          if (updatedThread) {
            setSelectedThread(updatedThread);
          }
        }
      } else {
        const err = await res.json();
        alert(err.detail || 'Failed to send reply.');
        setReplyText(textToSend);
      }
    } catch (err) {
      console.error('Error sending reply:', err);
      setReplyText(textToSend);
    } finally {
      setSendingReply(false);
    }
  };

  // Scroll to bottom of chat when new message is added or thread is loaded
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages]);

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    setSearchQuery('');
    setSelectedItemDetail(null);
    setSelectedThread(null);
    setThreadMessages([]);
    setSelectedIds([]);
    if (activeTab === 'overview') {
      fetchStats();
    } else if (activeTab === 'users') {
      fetchUsers(1);
    } else if (activeTab === 'orgs') {
      fetchOrganizations(1);
    } else if (activeTab === 'tasks') {
      fetchTasks(1);
    } else if (activeTab === 'support') {
      fetchThreads();
    }
  }, [activeTab]);

  const handlePageChange = (newPage) => {
    setSelectedIds([]);
    if (activeTab === 'users') {
      fetchUsers(newPage);
    } else if (activeTab === 'orgs') {
      fetchOrganizations(newPage);
    } else if (activeTab === 'tasks') {
      fetchTasks(newPage);
    }
  };

  // Local filtering logic for instant UI responsiveness
  const getFilteredData = () => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) {
      if (activeTab === 'users') return users;
      if (activeTab === 'orgs') return orgs;
      if (activeTab === 'tasks') return tasks;
      return [];
    }

    if (activeTab === 'users') {
      return users.filter(u => 
        (u.first_name || '').toLowerCase().includes(query) ||
        (u.last_name || '').toLowerCase().includes(query) ||
        (u.email || '').toLowerCase().includes(query) ||
        (u.id || '').toLowerCase().includes(query)
      );
    }

    if (activeTab === 'orgs') {
      return orgs.filter(o => 
        (o.name || '').toLowerCase().includes(query) ||
        (o.id || '').toLowerCase().includes(query) ||
        (o.website || '').toLowerCase().includes(query)
      );
    }

    if (activeTab === 'tasks') {
      return tasks.filter(t => 
        (t.name || '').toLowerCase().includes(query) ||
        (t.creator_email || '').toLowerCase().includes(query) ||
        (t.organization_name || '').toLowerCase().includes(query) ||
        (t.id || '').toLowerCase().includes(query)
      );
    }

    return [];
  };

  const filteredItems = getFilteredData();
  const totalPages = Math.ceil(totalItems / 20) || 1;

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="superadmin-wrapper">
      {/* Title Header */}
      <div className="superadmin-header-block">
        <div className="title-left">
          <div className="superadmin-shield">
            <ShieldCheck size={28} />
          </div>
          <div>
            <h1>Super Admin Operations</h1>
            <p>System-wide diagnostics, organizations audit, user deactivation and pipeline metrics.</p>
          </div>
        </div>
        <button onClick={() => {
          if (activeTab === 'overview') fetchStats();
          else if (activeTab === 'users') fetchUsers(currentPage);
          else if (activeTab === 'orgs') fetchOrganizations(currentPage);
          else if (activeTab === 'tasks') fetchTasks(currentPage);
          else if (activeTab === 'support') fetchThreads();
        }} className="diag-refresh-btn" title="Refresh Current View">
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {/* Tabs list */}
      <div className="superadmin-tabs-nav">
        <button 
          className={`sa-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <Activity size={16} />
          Overview & Stats
        </button>
        <button 
          className={`sa-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <Users size={16} />
          Users Directory
        </button>
        <button 
          className={`sa-tab-btn ${activeTab === 'orgs' ? 'active' : ''}`}
          onClick={() => setActiveTab('orgs')}
        >
          <Building2 size={16} />
          Organizations Audit
        </button>
        <button 
          className={`sa-tab-btn ${activeTab === 'support' ? 'active' : ''}`}
          onClick={() => setActiveTab('support')}
        >
          <MessageSquare size={16} />
          Support Help Desk
        </button>
        <button 
          className={`sa-tab-btn ${activeTab === 'tasks' ? 'active' : ''}`}
          onClick={() => setActiveTab('tasks')}
        >
          <ListTodo size={16} />
          System Pipeline Logs
        </button>
      </div>

      {/* SEARCH BAR (if not overview or support tab) */}
      {activeTab !== 'overview' && activeTab !== 'support' && !selectedItemDetail && (
        <div className="sa-search-bar-wrap">
          <Search size={18} className="sa-search-icon" />
          <input 
            type="text" 
            placeholder={`Search ${activeTab === 'users' ? 'users by email, name or ID...' : activeTab === 'orgs' ? 'organizations by name or ID...' : 'tasks by name, user or org...'}`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="sa-search-field"
          />
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="sa-bulk-actions-banner" style={{
          backgroundColor: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '12px',
          padding: '12px 20px',
          margin: '0 0 16px 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 600, color: 'var(--red)' }}>
              {selectedIds.length} item{selectedIds.length > 1 ? 's' : ''} selected
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => {
                if (activeTab === 'users') handleBulkDeleteUsers();
                else if (activeTab === 'orgs') handleBulkDeleteOrganizations();
                else if (activeTab === 'tasks') handleBulkDeleteTasks();
              }}
              className="sa-action-btn delete-btn"
              disabled={actionLoading}
            >
              <Trash2 size={16} />
              Delete Selected
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="sa-action-btn"
              style={{ backgroundColor: 'var(--sidebar-hover)', color: 'var(--text-gray)' }}
              disabled={actionLoading}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* TAB CONTENT: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="sa-overview-grid">
          {stats ? (
            <>
              {/* Stat Cards */}
              <div className="sa-stats-row">
                <div className="sa-stat-card card-purple">
                  <div className="sa-card-inner">
                    <div className="sa-card-header">
                      <span>Total Active Users</span>
                      <Users size={20} />
                    </div>
                    <h2>{stats.users?.total}</h2>
                    <p>Subscribed platform members</p>
                  </div>
                </div>

                <div className="sa-stat-card card-blue">
                  <div className="sa-card-inner">
                    <div className="sa-card-header">
                      <span>Total Organizations</span>
                      <Building2 size={20} />
                    </div>
                    <h2>{stats.organizations?.total}</h2>
                    <p>Registered workspaces</p>
                  </div>
                </div>

                <div className="sa-stat-card card-green">
                  <div className="sa-card-inner">
                    <div className="sa-card-header">
                      <span>Pipeline Runs</span>
                      <ListTodo size={20} />
                    </div>
                    <h2>{stats.tasks?.total}</h2>
                    <p>Total processed tasks</p>
                  </div>
                </div>
              </div>

              {/* Pipeline Tasks Status Breakdown */}
              <div className="sa-detailed-stats">
                <div className="sa-data-card">
                  <h3>Pipeline Execution Diagnostics</h3>
                  <div className="sa-progress-breakdown">
                    <div className="sa-progress-stat">
                      <div className="stat-label">
                        <CheckCircle size={16} color="var(--green)" />
                        <span>Completed Successfully</span>
                      </div>
                      <span className="stat-value">{stats.tasks?.completed} ({stats.tasks?.total > 0 ? Math.round((stats.tasks?.completed / stats.tasks?.total) * 100) : 0}%)</span>
                    </div>
                    <div className="sa-progress-bar-bg">
                      <div 
                        className="sa-progress-bar-fill completed" 
                        style={{ width: `${stats.tasks?.total > 0 ? (stats.tasks?.completed / stats.tasks?.total) * 100 : 0}%` }}
                      ></div>
                    </div>

                    <div className="sa-progress-stat">
                      <div className="stat-label">
                        <XCircle size={16} color="var(--red)" />
                        <span>Failed / Aborted</span>
                      </div>
                      <span className="stat-value">{stats.tasks?.failed} ({stats.tasks?.total > 0 ? Math.round((stats.tasks?.failed / stats.tasks?.total) * 100) : 0}%)</span>
                    </div>
                    <div className="sa-progress-bar-bg">
                      <div 
                        className="sa-progress-bar-fill failed" 
                        style={{ width: `${stats.tasks?.total > 0 ? (stats.tasks?.failed / stats.tasks?.total) * 100 : 0}%` }}
                      ></div>
                    </div>

                    <div className="sa-progress-stat">
                      <div className="stat-label">
                        <Activity size={16} color="#3B82F6" />
                        <span>In Progress / Transcribing</span>
                      </div>
                      <span className="stat-value">{stats.tasks?.in_progress}</span>
                    </div>
                    
                    <div className="sa-progress-stat">
                      <div className="stat-label">
                        <HelpCircle size={16} color="#F59E0B" />
                        <span>Queued / Waiting</span>
                      </div>
                      <span className="stat-value">{stats.tasks?.queued}</span>
                    </div>
                  </div>
                </div>

                <div className="sa-data-card sa-system-info">
                  <h3>System Status</h3>
                  <div className="sa-info-grid">
                    <div className="info-item">
                      <span className="info-key">Super Admin Role</span>
                      <span className="info-val secure-val">Enabled</span>
                    </div>
                    <div className="info-item">
                      <span className="info-key">Environment</span>
                      <span className="info-val font-mono">Production (Beta)</span>
                    </div>
                    <div className="info-item">
                      <span className="info-key">Database State</span>
                      <span className="info-val green-text">Connected</span>
                    </div>
                    <div className="info-item">
                      <span className="info-key">Active Superadmin</span>
                      <span className="info-val font-mono">mirzamailbox0@gmail.com</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="sa-loader-block">
              <Loader2 className="animate-spin" size={32} />
              <span>Gathering telemetry diagnostics...</span>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: USERS DIRECTORY */}
      {activeTab === 'users' && !loading && (
        <div className="sa-table-card">
          <div className="sa-table-responsive">
            <table className="sa-data-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>
                    <input 
                      type="checkbox"
                      checked={filteredItems.length > 0 && filteredItems.every(u => selectedIds.includes(u.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const newSelect = [...selectedIds];
                          filteredItems.forEach(u => {
                            if (!newSelect.includes(u.id)) newSelect.push(u.id);
                          });
                          setSelectedIds(newSelect);
                        } else {
                          const idsToRemove = filteredItems.map(u => u.id);
                          setSelectedIds(selectedIds.filter(id => !idsToRemove.includes(id)));
                        }
                      }}
                    />
                  </th>
                  <th>User Profile</th>
                  <th>ID</th>
                  <th>Organizations Joined</th>
                  <th>Auth Type</th>
                  <th>Joined Date</th>
                  <th>Last Login</th>
                  <th>Access Control</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="sa-table-empty">No users found.</td>
                  </tr>
                ) : (
                  filteredItems.map(u => (
                    <tr key={u.id}>
                      <td>
                        <input 
                          type="checkbox"
                          checked={selectedIds.includes(u.id)}
                          disabled={u.email === 'mirzamailbox0@gmail.com'}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds([...selectedIds, u.id]);
                            } else {
                              setSelectedIds(selectedIds.filter(id => id !== u.id));
                            }
                          }}
                        />
                      </td>
                      <td>
                        <div className="sa-user-cell">
                          <img 
                            src={`https://ui-avatars.com/api/?name=${encodeURIComponent(u.first_name || 'User')}+${encodeURIComponent(u.last_name || '')}&background=random&color=ffffff`} 
                            alt={u.first_name} 
                            className="sa-user-avatar"
                          />
                          <div className="sa-user-meta">
                            <span className="sa-user-name">{u.first_name} {u.last_name}</span>
                            <span className="sa-user-email">{u.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="font-mono text-xs">{u.id.substring(0, 8)}...</td>
                      <td>
                        <div className="sa-orgs-tags">
                          {u.organizations?.length > 0 ? (
                            u.organizations.map((o, idx) => (
                              <span key={idx} className={`sa-org-tag role-${o.role}`}>
                                {o.org_name} ({o.role})
                              </span>
                            ))
                          ) : (
                            <span className="no-org-tag">No Organization</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`sa-badge auth-${u.auth_provider}`}>
                          {u.auth_provider}
                        </span>
                      </td>
                      <td>{formatDate(u.created_at)}</td>
                      <td>{formatDate(u.last_login)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            disabled={actionLoading || u.email === 'mirzamailbox0@gmail.com'}
                            onClick={() => handleToggleUserActive(u.id)}
                            className={`sa-action-btn ${u.is_active ? 'deactivate-btn' : 'activate-btn'}`}
                            title={u.email === 'mirzamailbox0@gmail.com' ? 'Superadmin cannot be deactivated' : u.is_active ? 'Suspend Account' : 'Reactivate Account'}
                          >
                            {u.is_active ? <UserMinus size={16} /> : <UserCheck size={16} />}
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          {u.is_active && u.email !== 'mirzamailbox0@gmail.com' && (
                            <button
                              disabled={actionLoading}
                              onClick={() => handleImpersonate(u)}
                              className="sa-action-btn impersonate-btn"
                              style={{
                                backgroundColor: 'rgba(249, 115, 22, 0.1)',
                                color: 'var(--primary)',
                              }}
                              title="Login as this user"
                            >
                              <LogIn size={16} />
                              Login As
                            </button>
                          )}
                          {u.email !== 'mirzamailbox0@gmail.com' && (
                            <button
                              disabled={actionLoading}
                              onClick={() => handleDeleteUser(u.id, u.email)}
                              className="sa-action-btn delete-btn"
                              title="Permanently delete user"
                            >
                              <Trash2 size={16} />
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="sa-pagination-row">
              <button 
                disabled={currentPage === 1}
                onClick={() => handlePageChange(currentPage - 1)}
                className="sa-page-btn"
              >
                Previous
              </button>
              <span className="sa-page-info">Page {currentPage} of {totalPages}</span>
              <button 
                disabled={currentPage === totalPages}
                onClick={() => handlePageChange(currentPage + 1)}
                className="sa-page-btn"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: ORGANIZATIONS AUDIT */}
      {activeTab === 'orgs' && !loading && (
        <div className="sa-table-card">
          <div className="sa-table-responsive">
            <table className="sa-data-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>
                    <input 
                      type="checkbox"
                      checked={filteredItems.length > 0 && filteredItems.every(o => selectedIds.includes(o.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const newSelect = [...selectedIds];
                          filteredItems.forEach(o => {
                            if (!newSelect.includes(o.id)) newSelect.push(o.id);
                          });
                          setSelectedIds(newSelect);
                        } else {
                          const idsToRemove = filteredItems.map(o => o.id);
                          setSelectedIds(selectedIds.filter(id => !idsToRemove.includes(id)));
                        }
                      }}
                    />
                  </th>
                  <th>Organization Workspace</th>
                  <th>ID</th>
                  <th>Website</th>
                  <th>Team Members</th>
                  <th>Processed Tasks</th>
                  <th>Created Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="sa-table-empty">No organizations found.</td>
                  </tr>
                ) : (
                  filteredItems.map(o => (
                    <tr key={o.id}>
                      <td>
                        <input 
                          type="checkbox"
                          checked={selectedIds.includes(o.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds([...selectedIds, o.id]);
                            } else {
                              setSelectedIds(selectedIds.filter(id => id !== o.id));
                            }
                          }}
                        />
                      </td>
                      <td className="sa-org-name-cell">
                        <Building2 size={16} className="org-icon" />
                        <span>{o.name}</span>
                      </td>
                      <td className="font-mono text-xs">{o.id.substring(0, 8)}...</td>
                      <td>
                        {o.website ? (
                          <a href={o.website.startsWith('http') ? o.website : `https://${o.website}`} target="_blank" rel="noopener noreferrer" className="sa-link">
                            <Globe size={14} />
                            {o.website}
                          </a>
                        ) : (
                          <span className="text-gray-400 text-xs">No Site</span>
                        )}
                      </td>
                      <td className="font-semibold text-center">{o.member_count}</td>
                      <td className="font-semibold text-center">{o.task_count}</td>
                      <td>{formatDate(o.created_at)}</td>
                      <td>
                        <button
                          disabled={actionLoading}
                          onClick={() => handleDeleteOrganization(o.id, o.name)}
                          className="sa-action-btn delete-btn"
                          title="Permanently delete organization"
                        >
                          <Trash2 size={16} />
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="sa-pagination-row">
              <button 
                disabled={currentPage === 1}
                onClick={() => handlePageChange(currentPage - 1)}
                className="sa-page-btn"
              >
                Previous
              </button>
              <span className="sa-page-info">Page {currentPage} of {totalPages}</span>
              <button 
                disabled={currentPage === totalPages}
                onClick={() => handlePageChange(currentPage + 1)}
                className="sa-page-btn"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: PIPELINE TASKS LOG */}
      {activeTab === 'tasks' && !loading && (
        <div className="sa-table-card">
          <div className="sa-table-responsive">
            <table className="sa-data-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>
                    <input 
                      type="checkbox"
                      checked={filteredItems.length > 0 && filteredItems.every(t => selectedIds.includes(t.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const newSelect = [...selectedIds];
                          filteredItems.forEach(t => {
                            if (!newSelect.includes(t.id)) newSelect.push(t.id);
                          });
                          setSelectedIds(newSelect);
                        } else {
                          const idsToRemove = filteredItems.map(t => t.id);
                          setSelectedIds(selectedIds.filter(id => !idsToRemove.includes(id)));
                        }
                      }}
                    />
                  </th>
                  <th>Task Name</th>
                  <th>ID</th>
                  <th>Workspace Org</th>
                  <th>Created By</th>
                  <th>Created Date</th>
                  <th>Execution State</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="sa-table-empty">No tasks found.</td>
                  </tr>
                ) : (
                  filteredItems.map(t => (
                    <tr key={t.id}>
                      <td>
                        <input 
                          type="checkbox"
                          checked={selectedIds.includes(t.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds([...selectedIds, t.id]);
                            } else {
                              setSelectedIds(selectedIds.filter(id => id !== t.id));
                            }
                          }}
                        />
                      </td>
                      <td className="font-medium text-slate-800">{t.name || 'Untitled Task'}</td>
                      <td className="font-mono text-xs">{t.id.substring(0, 8)}...</td>
                      <td>{t.organization_name}</td>
                      <td>
                        <div className="sa-creator-cell">
                          <Mail size={12} />
                          <span>{t.creator_email}</span>
                        </div>
                      </td>
                      <td>{formatDate(t.created_at)}</td>
                      <td>
                        <span className={`sa-status-pill sa-status-${t.status?.toLowerCase() || 'queued'}`}>
                          {t.status}
                        </span>
                      </td>
                      <td>
                        <button
                          disabled={actionLoading}
                          onClick={() => handleDeleteTask(t.id, t.name)}
                          className="sa-action-btn delete-btn"
                          title="Permanently delete task"
                        >
                          <Trash2 size={16} />
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="sa-pagination-row">
              <button 
                disabled={currentPage === 1}
                onClick={() => handlePageChange(currentPage - 1)}
                className="sa-page-btn"
              >
                Previous
              </button>
              <span className="sa-page-info">Page {currentPage} of {totalPages}</span>
              <button 
                disabled={currentPage === totalPages}
                onClick={() => handlePageChange(currentPage + 1)}
                className="sa-page-btn"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: SUPPORT TICKETS DESK */}
      {activeTab === 'support' && !loading && (
        <div className="sa-helpdesk-container">
          {/* Left panel - threads */}
          <div className="sa-helpdesk-sidebar">
            <div className="sa-sidebar-header">
              <h3>Incoming Tickets</h3>
              <span className="sa-sidebar-badge">{threads.length} active</span>
            </div>
            
            <div className="sa-threads-list">
              {threads.length === 0 ? (
                <div className="sa-threads-empty">
                  No active support requests.
                </div>
              ) : (
                threads.map(t => {
                  const isSelected = selectedThread && selectedThread.organization_id === t.organization_id;
                  const needsReply = t.last_sender_type === 'user';
                  
                  return (
                    <div 
                      key={`${t.organization_id}-${t.user_id}`}
                      className={`sa-thread-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectThread(t)}
                    >
                      <div className="sa-thread-meta-row">
                        <span className="sa-thread-org-name">{t.organization_name}</span>
                        {t.latest_message_at && (
                          <span className="sa-thread-time">
                            {new Date(t.latest_message_at).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})}
                          </span>
                        )}
                      </div>
                      
                      <div className="sa-thread-user-row">
                        <span className="sa-thread-user-name">{t.user_name}</span>
                        <span className="sa-thread-email">({t.user_email})</span>
                      </div>
                      
                      <div className="sa-thread-snippet-row">
                        <p className="sa-thread-snippet">{t.last_message_content || 'No message content'}</p>
                        {needsReply && (
                          <span className="sa-badge-needs-reply">Needs Reply</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right panel - chat log */}
          <div className="sa-helpdesk-chatview">
            {selectedThread ? (
              <div className="sa-chat-wrapper">
                {/* Header */}
                <div className="sa-chat-header">
                  <div className="sa-chat-header-info">
                    <h4>{selectedThread.organization_name}</h4>
                    <div className="sa-chat-header-meta">
                      <span><strong>Sender:</strong> {selectedThread.user_name}</span>
                      <span className="separator">•</span>
                      <span>{selectedThread.user_email}</span>
                    </div>
                  </div>
                </div>

                {/* Messages Log */}
                <div className="sa-chat-messages-flow">
                  {loadingMessages ? (
                    <div className="sa-chat-loading">
                      <Loader2 className="animate-spin" size={24} />
                      <span>Loading conversation history...</span>
                    </div>
                  ) : (
                    <div className="sa-chat-messages-list">
                      {threadMessages.length === 0 ? (
                        <p className="sa-chat-messages-empty">No messages in this conversation.</p>
                      ) : (
                        threadMessages.map((msg, idx) => {
                          const isSupport = msg.sender_type === 'support';
                          const isUser = msg.sender_type === 'user';
                          
                          const showDateSeparator = idx === 0 || 
                            new Date(threadMessages[idx - 1].created_at).toDateString() !== new Date(msg.created_at).toDateString();

                          const formatMsgTime = (dtStr) => {
                            if (!dtStr) return '';
                            return new Date(dtStr).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                          };

                          const formatMsgDate = (dtStr) => {
                            if (!dtStr) return '';
                            return new Date(dtStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                          };

                          return (
                            <React.Fragment key={msg.id}>
                              {showDateSeparator && (
                                <div className="sa-chat-date-separator">
                                  <span>{formatMsgDate(msg.created_at)}</span>
                                </div>
                              )}
                              
                              <div className={`sa-chat-message-row ${isSupport ? 'support-row' : msg.sender_type === 'ai' ? 'ai-row' : 'user-row'}`}>
                                <div className="sa-chat-avatar">
                                  {isSupport ? <Shield size={14} /> : msg.sender_type === 'ai' ? <Bot size={14} /> : <Users size={14} />}
                                </div>
                                
                                <div className="sa-chat-bubble-container">
                                  <div className="sa-chat-bubble-header">
                                    <span className="sa-chat-sender-name">{msg.user_name}</span>
                                    <span className="sa-chat-msg-time">{formatMsgTime(msg.created_at)}</span>
                                  </div>
                                  <div className="sa-chat-bubble-content">
                                    {msg.content}
                                  </div>
                                </div>
                              </div>
                            </React.Fragment>
                          );
                        })
                      )}
                      <div ref={chatEndRef} />
                    </div>
                  )}
                </div>

                {/* Footer Form */}
                <form onSubmit={handleSendReply} className="sa-chat-input-form">
                  <input
                    type="text"
                    placeholder={`Reply to ${selectedThread.user_name} (Shows as Support Technician)...`}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    disabled={sendingReply || loadingMessages}
                    required
                  />
                  <button type="submit" disabled={sendingReply || !replyText.trim() || loadingMessages}>
                    {sendingReply ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                    Send Reply
                  </button>
                </form>
              </div>
            ) : (
              <div className="sa-chat-empty-state">
                <div className="sa-empty-icon-wrap">
                  <MessageSquare size={48} />
                </div>
                <h3>Technical Support Desk</h3>
                <p>Select a ticket thread from the sidebar to view user messages and reply as a Support Technician.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Spinner for tab transitions */}
      {loading && activeTab !== 'overview' && activeTab !== 'support' && (
        <div className="sa-tab-spinner">
          <Loader2 className="animate-spin" size={32} />
          <span>Synchronizing records database...</span>
        </div>
      )}
    </div>
  );
}
