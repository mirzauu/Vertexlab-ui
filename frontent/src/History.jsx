import React, { useState, useEffect } from 'react';
import './History.css';
import { 
  FileText, Calendar, MoreHorizontal, Users, Plus, Star, 
  ChevronDown, SlidersHorizontal, Search, FileSpreadsheet, 
  Loader2, Home, Edit, RefreshCw, Info, Settings, Bell,
  Share2, ArrowUp, ArrowDown, Filter, List, LayoutGrid,
  Upload, Download, MoreVertical, ArrowUpRight, ArrowDownRight
} from 'lucide-react';

const Sparkline = ({ color, data }) => {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 80;
  const height = 24;
  
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((d - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 -5 ${width} ${height + 10}`}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        points={points}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
import { api } from './services/api';

const activeListSessions = new Map();

const registerListSession = (orgId) => {
  let session = activeListSessions.get(orgId);
  if (session) {
    if (session.timeoutId) {
      clearTimeout(session.timeoutId);
      session.timeoutId = null;
    }
    session.count += 1;
    return session;
  }

  const controller = new AbortController();
  session = {
    controller,
    count: 1,
    fetchPromise: null,
    timeoutId: null
  };
  activeListSessions.set(orgId, session);
  return session;
};

const deregisterListSession = (orgId) => {
  const session = activeListSessions.get(orgId);
  if (!session) return;

  session.count -= 1;
  if (session.count <= 0) {
    session.timeoutId = setTimeout(() => {
      session.controller.abort();
      activeListSessions.delete(orgId);
    }, 100);
  }
};

// Simple module-level cache to avoid re-fetching on re-mount (Flaw #4 fix)
let _cachedTasks = null;
let _cachedOrgId = null;

export default function History({ onViewDetails, onNewTask }) {
  const [tasks, setTasks] = useState(() => {
    const orgId = localStorage.getItem('organization_id');
    // Serve cached data instantly if available for this org
    if (_cachedTasks && _cachedOrgId === orgId) return _cachedTasks;
    return [];
  });
  const [loading, setLoading] = useState(() => {
    const orgId = localStorage.getItem('organization_id');
    return !(_cachedTasks && _cachedOrgId === orgId);
  });
  const [error, setError] = useState(null);

  useEffect(() => {
    const orgId = localStorage.getItem('organization_id');

    if (!orgId) {
      setError('Missing organization ID.');
      setLoading(false);
      return;
    }

    const session = registerListSession(orgId);
    const controller = session.controller;

    const fetchTasks = async () => {
      if (!session.fetchPromise) {
        session.fetchPromise = api(`/api/v1/organizations/${orgId}/tasks/?page=1&page_size=20`, {
          signal: controller.signal
        }).then(res => {
          if (!res.ok) throw new Error('Failed to fetch tasks.');
          return res.json();
        });
      }

      try {
        const data = await session.fetchPromise;
        const items = data.items || [];
        setTasks(items);
        // Update module-level cache
        _cachedTasks = items;
        _cachedOrgId = orgId;
      } catch (err) {
        if (err.name !== 'AbortError') {
          session.fetchPromise = null;
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchTasks();
    return () => {
      deregisterListSession(orgId);
    };
  }, []);

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const getAvatarProps = (name) => {
    const cleanName = name || "Untitled Task";
    const parts = cleanName.trim().split(/\s+/);
    let initials = "";
    if (parts.length > 0) {
      initials += parts[0][0];
      if (parts.length > 1) {
        initials += parts[parts.length - 1][0];
      }
    }
    initials = initials.toUpperCase().slice(0, 2);

    let hash = 0;
    for (let i = 0; i < cleanName.length; i++) {
      hash = cleanName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = [
      { bg: '#E2E8F0', text: '#475569' },
      { bg: '#FEE2E2', text: '#991B1B' },
      { bg: '#FEF3C7', text: '#92400E' },
      { bg: '#D1FAE5', text: '#065F46' },
      { bg: '#DBEAFE', text: '#1E40AF' },
      { bg: '#E0E7FF', text: '#3730A3' },
      { bg: '#F3E8FF', text: '#6B21A8' },
      { bg: '#FCE7F3', text: '#9D174D' },
    ];
    const colorIndex = Math.abs(hash) % colors.length;
    return { initials, ...colors[colorIndex] };
  };

  const handleRowClick = (item) => {
    onViewDetails(item);
  };

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => {
    const s = t.status?.toLowerCase();
    return s === 'completed' || s === 'success';
  }).length;
  const inProgressTasks = tasks.filter(t => {
    const s = t.status?.toLowerCase();
    return s === 'in progress' || s === 'in_progress' || s === 'processing';
  }).length;
  const failedTasks = tasks.filter(t => t.status?.toLowerCase() === 'failed').length;

  return (
    <div className="history-page-container">
      {/* Top Header */}
      <header className="crm-top-header">
        <div className="crm-header-left">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h1>Task History</h1>
              <span className="crm-count-badge">{tasks.length} Tasks</span>
            </div>
            <p className="crm-header-description">Manage document processing tasks and review their status.</p>
          </div>
        </div>
        <div className="crm-header-right">
          <button className="icon-btn-subtle"><Info size={18} /></button>
          <button className="icon-btn-subtle"><Settings size={18} /></button>
          <button className="icon-btn-subtle badge-wrapper">
            <Bell size={18} />
            <span className="notification-badge"></span>
          </button>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="crm-summary-cards">
        <div className="crm-summary-card">
          <div className="crm-card-content">
            <div className="crm-card-title">Total Tasks</div>
            <div className="crm-card-stats">
              <span className="crm-card-value">{totalTasks}</span>
              <span className="crm-card-trend trend-up"><ArrowUpRight size={14} /> 12%</span>
            </div>
          </div>
          <div className="crm-card-chart">
            <Sparkline color="#F97316" data={[5, 10, 5, 20, 15, 30, 25, 42]} />
          </div>
        </div>

        <div className="crm-summary-card">
          <div className="crm-card-content">
            <div className="crm-card-title">Completed Tasks</div>
            <div className="crm-card-stats">
              <span className="crm-card-value">{completedTasks}</span>
              <span className="crm-card-trend trend-up"><ArrowUpRight size={14} /> 4.2%</span>
            </div>
          </div>
          <div className="crm-card-chart">
            <Sparkline color="#F97316" data={[10, 15, 12, 18, 14, 22, 18]} />
          </div>
        </div>

        <div className="crm-summary-card">
          <div className="crm-card-content">
            <div className="crm-card-title">Avg Processing Time</div>
            <div className="crm-card-stats">
              <span className="crm-card-value">1.8h</span>
              <span className="crm-card-trend trend-up"><ArrowUpRight size={14} /> 15%</span>
            </div>
          </div>
          <div className="crm-card-chart">
            <Sparkline color="#F97316" data={[1.2, 1.4, 1.3, 1.8, 1.6, 2.0, 1.8]} />
          </div>
        </div>

        <div className="crm-summary-card">
          <div className="crm-card-content">
            <div className="crm-card-title">Failed Tasks</div>
            <div className="crm-card-stats">
              <span className="crm-card-value">{failedTasks}</span>
              <span className="crm-card-trend trend-down"><ArrowDownRight size={14} /> 2%</span>
            </div>
          </div>
          <div className="crm-card-chart">
            <Sparkline color="#F97316" data={[3, 2, 4, 1, 5, 2, failedTasks]} />
          </div>
        </div>
      </div>



      {/* Action Bar */}
      <div className="crm-action-bar">
        <div className="crm-action-left">
          <div className="crm-search-box">
            <Search className="crm-search-icon" size={16} />
            <input type="text" placeholder="Search" />
          </div>
          <button className="crm-icon-btn"><Filter size={16} /></button>
          <button className="crm-icon-btn" style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
            <ArrowUp size={10} style={{ marginBottom: '-6px' }} />
            <ArrowDown size={10} />
          </button>
          <button className="crm-icon-btn"><SlidersHorizontal size={16} /></button>
        </div>
        
        <div className="crm-action-right">
          <div className="crm-view-toggles">
            <button className="crm-icon-btn active"><List size={16} /></button>
            <button className="crm-icon-btn"><LayoutGrid size={16} /></button>
          </div>
          <div className="crm-action-divider" />
          <button className="crm-btn-primary" onClick={onNewTask}>
            <Plus size={16} />
            <span>Add Task</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="table-card-wrapper">
        <table className="crm-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: '24px' }}>TASK NAME</th>
              <th>TASK ID</th>
              <th>CREATED</th>
              <th>STATUS</th>
              <th style={{ textAlign: 'right', paddingRight: '24px' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="5" className="table-empty-state">
                  <Loader2 className="animate-spin" size={24} style={{ color: '#F97316', margin: '0 auto 12px auto' }} />
                  <span>Loading tasks...</span>
                </td>
              </tr>
            ) : tasks.length === 0 ? (
              <tr>
                <td colSpan="5" className="table-empty-state">
                  <span>No tasks found. Create a new task to get started.</span>
                </td>
              </tr>
            ) : (
              tasks.map((item, index) => {
                let statusClass = "status-queued";
                let statusText = "QUEUED";
                const lowerStatus = item.status?.toLowerCase();
                if (lowerStatus === "completed" || lowerStatus === "success") {
                  statusClass = "status-completed";
                  statusText = "COMPLETED";
                } else if (lowerStatus === "in progress" || lowerStatus === "in_progress" || lowerStatus === "processing") {
                  statusClass = "status-inprogress";
                  statusText = "IN PROGRESS";
                } else if (lowerStatus === "failed") {
                  statusClass = "status-failed";
                  statusText = "FAILED";
                }

                return (
                  <tr key={item.id} style={{ cursor: 'pointer', transition: 'background-color 0.2s' }} onClick={() => handleRowClick(item)} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                    <td className="task-name-cell" style={{ paddingLeft: '24px' }}>
                      <span className="task-name-text">{item.name || "Untitled Task"}</span>
                    </td>
                    <td className="task-id-cell">
                      #{item.id ? item.id.substring(0, 8) : 'N/A'}
                    </td>
                    <td className="task-date-cell">
                      {formatDate(item.created_at)}
                    </td>
                    <td>
                      <span className={`crm-status-pill ${statusClass}`}>{statusText}</span>
                    </td>
                    <td style={{ textAlign: 'right', paddingRight: '24px' }} onClick={(e) => e.stopPropagation()}>
                      <button className="crm-text-btn" style={{ 
                        display: 'inline-flex',
                        padding: '6px 12px', 
                        borderRadius: '6px', 
                        fontSize: '0.8rem', 
                        fontWeight: '600',
                        color: '#F97316',
                        backgroundColor: '#FFF7ED',
                        border: '1px solid #FFEDD5',
                        marginLeft: 'auto'
                      }} onClick={() => handleRowClick(item)}>
                        Details
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
