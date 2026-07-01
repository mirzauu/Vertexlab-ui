import React, { useState, useEffect } from 'react';
import { api } from './services/api';
import './SuperAdmin.css';
import { 
  Users, Building2, ListTodo, ShieldAlert, ShieldCheck, 
  Search, RefreshCw, CheckCircle, XCircle, Loader2, UserMinus, UserCheck, 
  ArrowLeft, Calendar, HelpCircle, Activity, Globe, Mail, LogIn
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

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    setSearchQuery('');
    setSelectedItemDetail(null);
    if (activeTab === 'overview') {
      fetchStats();
    } else if (activeTab === 'users') {
      fetchUsers(1);
    } else if (activeTab === 'orgs') {
      fetchOrganizations(1);
    } else if (activeTab === 'tasks') {
      fetchTasks(1);
    }
  }, [activeTab]);

  const handlePageChange = (newPage) => {
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
          className={`sa-tab-btn ${activeTab === 'tasks' ? 'active' : ''}`}
          onClick={() => setActiveTab('tasks')}
        >
          <ListTodo size={16} />
          System Pipeline Logs
        </button>
      </div>

      {/* SEARCH BAR (if not overview tab) */}
      {activeTab !== 'overview' && !selectedItemDetail && (
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
                  <th>User Profile</th>
                  <th>ID</th>
                  <th>Organizations Joined</th>
                  <th>Auth Type</th>
                  <th>Joined Date</th>
                  <th>Access Control</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="sa-table-empty">No users found.</td>
                  </tr>
                ) : (
                  filteredItems.map(u => (
                    <tr key={u.id}>
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
                                backgroundColor: 'rgba(91, 68, 233, 0.1)',
                                color: 'var(--primary)',
                              }}
                              title="Login as this user"
                            >
                              <LogIn size={16} />
                              Login As
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
                  <th>Organization Workspace</th>
                  <th>ID</th>
                  <th>Website</th>
                  <th>Team Members</th>
                  <th>Processed Tasks</th>
                  <th>Created Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="sa-table-empty">No organizations found.</td>
                  </tr>
                ) : (
                  filteredItems.map(o => (
                    <tr key={o.id}>
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
                  <th>Task Name</th>
                  <th>ID</th>
                  <th>Workspace Org</th>
                  <th>Created By</th>
                  <th>Created Date</th>
                  <th>Execution State</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="sa-table-empty">No tasks found.</td>
                  </tr>
                ) : (
                  filteredItems.map(t => (
                    <tr key={t.id}>
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

      {/* Spinner for tab transitions */}
      {loading && activeTab !== 'overview' && (
        <div className="sa-tab-spinner">
          <Loader2 className="animate-spin" size={32} />
          <span>Synchronizing records database...</span>
        </div>
      )}
    </div>
  );
}
