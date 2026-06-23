import React, { useState, useEffect } from 'react';
import Auth from './Auth';
import NewTask from './NewTask';
import History from './History';
import HistoryDetails from './HistoryDetails';
import ReviewEdit from './ReviewEdit';
import './ReviewPage.css';
import Admin from './Admin';
import SettingsView from './Settings';
import Usage from './Usage';
import { api } from './services/api';
import { 
  LayoutDashboard, Users, FileText, HelpCircle, Moon, Settings, LogOut, 
  Search, Bell, MessageSquare, ArrowUpRight, ArrowDownRight, 
  CreditCard, RefreshCw, XCircle, Minus, Plus, Mic, Send, Loader2,
  ChevronDown, ChevronUp, Activity, PieChart, TrendingUp,
  Sidebar, PlusCircle, CheckSquare, Edit,
  Home, Star, SlidersHorizontal, FileSpreadsheet, MoreHorizontal
} from 'lucide-react';





function ReviewPage({ onSelect }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const orgId = localStorage.getItem('organization_id');
    if (!orgId) {
      setLoading(false);
      return;
    }
    
    let isMounted = true;
    const loadTasks = async () => {
      try {
        const res = await api(`/api/v1/organizations/${orgId}/tasks/?page=1&page_size=50`);
        if (!res.ok) throw new Error("Failed to fetch tasks");
        const data = await res.json();
        if (isMounted) {
          setTasks(data.items || []);
        }
      } catch (err) {
        console.error("Error loading tasks for ReviewPage:", err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    loadTasks();
    return () => { isMounted = false; };
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

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = 
      (task.name || "Untitled Task").toLowerCase().includes(searchQuery.toLowerCase()) || 
      (task.id || "").toLowerCase().includes(searchQuery.toLowerCase());
      
    const lowerStatus = task.status?.toLowerCase() || "";
    let isStatusMatch = statusFilter === "all";
    if (statusFilter === "completed") {
      isStatusMatch = lowerStatus === "completed" || lowerStatus === "success";
    } else if (statusFilter === "in_progress") {
      isStatusMatch = lowerStatus === "in progress" || lowerStatus === "in_progress" || lowerStatus === "processing";
    } else if (statusFilter === "failed") {
      isStatusMatch = lowerStatus === "failed";
    } else if (statusFilter === "queued") {
      isStatusMatch = lowerStatus === "queued" || lowerStatus === "in queue" || lowerStatus === "queued";
    }
    
    return matchesSearch && isStatusMatch;
  });

  return (
    <div className="review-page-container">
      {/* Breadcrumb Navigation */}
      <div className="breadcrumb-nav">
        <a href="#" onClick={(e) => e.preventDefault()}>
          <Home size={14} /> Home
        </a>
        <span className="breadcrumb-separator">/</span>
        <a href="#" onClick={(e) => e.preventDefault()}>Tasks</a>
        <span className="breadcrumb-separator">/</span>
        <span className="active-crumb">Review & Edit Tasks</span>
      </div>

      {/* Header Section */}
      <div className="review-page-header" style={{ marginBottom: '16px' }}>
        <div className="header-title-block">
          <div className="header-icon-wrapper" style={{ background: 'linear-gradient(135deg, #5B44E9 0%, #3B2DA1 100%)', boxShadow: '0 4px 12px rgba(91, 68, 233, 0.25)' }}>
            <CheckSquare size={24} />
          </div>
          <div className="header-text-info">
            <h1>Review & Edit Tasks</h1>
            <p>Select a task to review and edit in the human in the loop interface.</p>
          </div>
        </div>
      </div>

      {/* Search and Filters Toolbar */}
      <div className="filters-actions-bar" style={{ display: 'flex', gap: '16px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="search-input-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1, maxWidth: '400px' }}>
          <Search size={18} className="search-icon" style={{ position: 'absolute', left: '12px', color: '#9CA3AF' }} />
          <input 
            type="text" 
            placeholder="Search tasks by name or ID..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input-field"
            style={{
              width: '100%',
              padding: '10px 16px 10px 40px',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              fontSize: '0.88rem',
              outline: 'none',
              backgroundColor: 'white',
              boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
              transition: 'border-color 0.2s'
            }}
            onFocus={(e) => e.target.style.borderColor = '#5B44E9'}
            onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
          />
        </div>

        <div className="filter-dropdown-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-gray)' }}>Status:</span>
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '10px 16px',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              fontSize: '0.88rem',
              fontWeight: '550',
              color: 'var(--text-dark)',
              outline: 'none',
              backgroundColor: 'white',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
              transition: 'border-color 0.2s'
            }}
            onFocus={(e) => e.target.style.borderColor = '#5B44E9'}
            onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
          >
            <option value="all">All Tasks</option>
            <option value="completed">Completed</option>
            <option value="in_progress">In Progress</option>
            <option value="queued">In Queue</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Table Card */}
      <div className="table-card-wrapper" style={{ boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)' }}>
        <table className="redesigned-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: '24px' }}>Task ID</th>
              <th>Task Name</th>
              <th>Created Date</th>
              <th>Status</th>
              <th style={{ width: '120px', textAlign: 'right', paddingRight: '24px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="5" className="table-empty-state">
                  <Loader2 className="animate-spin" size={24} style={{ color: '#5B44E9', margin: '0 auto 12px auto' }} />
                  <span>Loading tasks...</span>
                </td>
              </tr>
            ) : filteredTasks.length === 0 ? (
              <tr>
                <td colSpan="5" className="table-empty-state" style={{ padding: '48px 24px' }}>
                  <span>No tasks found matching your search.</span>
                </td>
              </tr>
            ) : (
              filteredTasks.map((task) => {
                const avatar = getAvatarProps(task.name);
                
                let statusClass = "status-queued";
                let statusText = "In Queue";
                const lowerStatus = task.status?.toLowerCase();
                if (lowerStatus === "completed" || lowerStatus === "success") {
                  statusClass = "status-completed";
                  statusText = "Completed";
                } else if (lowerStatus === "in progress" || lowerStatus === "in_progress" || lowerStatus === "processing") {
                  statusClass = "status-inprogress";
                  statusText = "In Progress";
                } else if (lowerStatus === "failed") {
                  statusClass = "status-failed";
                  statusText = "Failed";
                }

                return (
                  <tr key={task.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(task)}>
                    <td style={{ paddingLeft: '24px' }} className="booking-no-cell">
                      #{task.id ? task.id.substring(0, 6) : 'N/A'}
                    </td>
                    <td>
                      <div className="capsule-user-cell" style={{ border: '1px solid var(--border-color)' }}>
                        <div className="avatar-circle" style={{ backgroundColor: avatar.bg, color: avatar.text }}>
                          {avatar.initials}
                        </div>
                        <span className="capsule-name-text">{task.name || "Untitled Task"}</span>
                      </div>
                    </td>
                    <td>{formatDate(task.created_at)}</td>
                    <td>
                      <span className={`status-pill ${statusClass}`}>{statusText}</span>
                    </td>
                    <td style={{ textAlign: 'right', paddingRight: '24px' }}>
                      <button 
                        className="view-btn" 
                        style={{ 
                          padding: '6px 16px', 
                          borderRadius: '8px', 
                          fontSize: '0.85rem', 
                          fontWeight: '600',
                          backgroundColor: 'white',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-dark)',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--primary)'; e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.color = 'var(--text-dark)'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                      >
                        Review
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

const reviewTasks = []; // Kept for reference but unused now

function MarkdownText({ text }) {
  if (!text) return null;

  const lines = text.split('\n');

  const parseInline = (str) => {
    const parts = str.split('**');
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        return <strong key={index} style={{ fontWeight: '600', color: '#FFFFFF' }}>{part}</strong>;
      }
      return part;
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {lines.map((line, lineIndex) => {
        const trimmed = line.trim();
        
        if (trimmed.startsWith('### ')) {
          return (
            <h3 key={lineIndex} style={{ margin: '8px 0 2px 0', fontSize: '1rem', fontWeight: '600', color: '#A3E635' }}>
              {parseInline(trimmed.substring(4))}
            </h3>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h2 key={lineIndex} style={{ margin: '12px 0 4px 0', fontSize: '1.1rem', fontWeight: '600', color: '#A3E635' }}>
              {parseInline(trimmed.substring(3))}
            </h2>
          );
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h1 key={lineIndex} style={{ margin: '16px 0 6px 0', fontSize: '1.25rem', fontWeight: '700', color: '#A3E635' }}>
              {parseInline(trimmed.substring(2))}
            </h1>
          );
        }
        if (trimmed.startsWith('- ')) {
          return (
            <div key={lineIndex} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', paddingLeft: '8px' }}>
              <span style={{ color: '#A3E635' }}>•</span>
              <span style={{ flex: 1 }}>{parseInline(trimmed.substring(2))}</span>
            </div>
          );
        }
        const numListMatch = trimmed.match(/^(\d+)\.\s(.*)$/);
        if (numListMatch) {
          const num = numListMatch[1];
          const content = numListMatch[2];
          return (
            <div key={lineIndex} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', paddingLeft: '8px' }}>
              <span style={{ color: '#A3E635', fontWeight: '500' }}>{num}.</span>
              <span style={{ flex: 1 }}>{parseInline(content)}</span>
            </div>
          );
        }

        if (trimmed === '') {
          return <div key={lineIndex} style={{ height: '4px' }} />;
        }

        return (
          <p key={lineIndex} style={{ margin: 0, lineHeight: '1.5' }}>
            {parseInline(line)}
          </p>
        );
      })}
    </div>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return !!localStorage.getItem('bearer_token');
  });
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeView, setActiveView] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    return hash || 'dashboard';
  });

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') || 'dashboard';
      setActiveView(prev => prev === hash ? prev : hash);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    const currentHash = window.location.hash.replace('#', '') || 'dashboard';
    if (currentHash !== activeView) {
      window.location.hash = activeView;
    }
  }, [activeView]);

  const [selectedTask, setSelectedTask] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [scopistTab, setScopistTab] = useState('new');
  const [selectedReviewTask, setSelectedReviewTask] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [isAiOpen, setIsAiOpen] = useState(false);

  const [dashboardData, setDashboardData] = useState({
    revenue: null,
    distribution: [],
    salesPerformance: [],
    activity: [],
    funnel: [],
    loading: true,
    error: null,
  });

  // AI assistant chat state
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { role: 'assistant', content: 'Hello! I am VerbaLex AI. Ask me anything about your dashboard metrics, team performance, or pipeline tasks.' }
  ]);
  const [isChatSending, setIsChatSending] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      const fetchUser = async () => {
        try {
          const res = await api('/api/v1/users/me');
          if (res.ok) {
            const data = await res.json();
            setCurrentUser(data);
          } else if (res.status === 401) {
            setIsAuthenticated(false);
          }
        } catch (e) {
          console.error('Failed to fetch user', e);
        }
      };
      fetchUser();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const orgId = localStorage.getItem('organization_id');
    if (!orgId) return;

    const fetchDashboardData = async () => {
      setDashboardData(prev => ({ ...prev, loading: true, error: null }));
      try {
        const res = await api(`/api/v1/organizations/${orgId}/dashboard/all`);

        if (!res.ok) {
          throw new Error('Failed to load dashboard metrics');
        }

        const data = await res.json();

        setDashboardData({
          revenue: data.revenue,
          distribution: data.distribution,
          salesPerformance: data.performers,
          activity: data.activity,
          funnel: data.funnel,
          loading: false,
          error: null,
        });
      } catch (err) {
        console.error('Failed to fetch dashboard data', err);
        setDashboardData(prev => ({ ...prev, loading: false, error: err.message }));
      }
    };

    if (activeView === 'dashboard') {
      fetchDashboardData();
    }
  }, [activeView, isAuthenticated]);

  const handleSendChatMessage = async (e) => {
    if (e) e.preventDefault();
    if (!chatMessage.trim() || isChatSending) return;

    const orgId = localStorage.getItem('organization_id');
    if (!orgId) return;

    const userMsg = chatMessage.trim();
    setChatMessage('');
    setChatHistory(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsChatSending(true);

    try {
      const res = await api(`/api/v1/organizations/${orgId}/dashboard/chat`, {
        method: 'POST',
        body: JSON.stringify({ message: userMsg }),
      });

      if (!res.ok) {
        throw new Error('Failed to get response from AI');
      }

      const data = await res.json();
      setChatHistory(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      console.error('[AI CHAT ERROR]', err);
      setChatHistory(prev => [...prev, { role: 'assistant', content: `Error: ${err.message || 'Unable to contact AI assistant.'}` }]);
    } finally {
      setIsChatSending(false);
    }
  };

  if (!isAuthenticated) {
    return <Auth onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className={`app-container ${isCollapsed ? 'collapsed' : ''} ${isDarkMode ? 'dark-mode' : ''}`}>
      {/* Sidebar */}
      <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-logo" style={{ cursor: 'pointer' }} onClick={() => setIsCollapsed(!isCollapsed)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="var(--text-dark)"/>
              <path d="M2 17L12 22L22 17" stroke="var(--text-dark)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="var(--text-dark)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {!isCollapsed && "VerbaLex AI"}
          </div>
        </div>

        <nav className="nav-section">
          <div className={`nav-item ${activeView === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveView('dashboard')}>
            <LayoutDashboard className="nav-icon" />
            {!isCollapsed && <span>Dashboard</span>}
          </div>
          
          {/* 
          <div className="nav-item">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
              <CheckSquare className="nav-icon" />
              {!isCollapsed && <span>Tasks</span>}
            </div>
            {!isCollapsed && <ChevronUp size={16} color="#8C8C9A" />}
          </div>
          
          {!isCollapsed && (
            <div className="nav-sub-items">
              <div className={`nav-sub-item ${activeView === 'new' ? 'active' : ''}`} onClick={() => { setActiveView('new'); setSelectedTask(null); }}>New</div>
              <div className={`nav-sub-item ${activeView === 'review' ? 'active' : ''}`} onClick={() => { setActiveView('review'); setSelectedReviewTask(null); setSelectedTask(null); }}>Review & Edit</div>
              <div className={`nav-sub-item ${activeView === 'history' ? 'active' : ''}`} onClick={() => { setActiveView('history'); setSelectedTask(null); }}>History</div>
            </div>
          )}
          */}

          <div className={`nav-item ${(activeView === 'scopist' || activeView === 'history' || activeView === 'history-details') ? 'active' : ''}`} onClick={() => { setActiveView('history'); setSelectedTask(null); }}>
            <Edit className="nav-icon" />
            {!isCollapsed && <span>Scopist</span>}
          </div>

          <div className={`nav-item ${activeView === 'review' ? 'active' : ''}`} onClick={() => { setActiveView('review'); setSelectedReviewTask(null); setSelectedTask(null); setIsCollapsed(true); }}>
            <CheckSquare className="nav-icon" />
            {!isCollapsed && <span>Review and Edit</span>}
          </div>

          <div className={`nav-item ${activeView === 'usage' ? 'active' : ''}`} onClick={() => { setActiveView('usage'); setSelectedTask(null); }}>
            <Activity className="nav-icon" />
            {!isCollapsed && <span>Usage</span>}
          </div>

          <div className={`nav-item ${activeView === 'admin' ? 'active' : ''}`} onClick={() => { setActiveView('admin'); setSelectedTask(null); }}>
            <Users className="nav-icon" />
            {!isCollapsed && <span>Organization (Admin)</span>}
          </div>
        </nav>

        <div className="sidebar-bottom">
          <div className="dark-mode-toggle">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Moon className="nav-icon" />
              {!isCollapsed && <span>Dark Mode</span>}
            </div>
            {!isCollapsed && (
              <div 
                className={`toggle-switch ${isDarkMode ? 'active' : ''}`} 
                onClick={() => setIsDarkMode(!isDarkMode)}
                style={{ backgroundColor: isDarkMode ? '#5B44E9' : '#2A2A30' }}
              ></div>
            )}
          </div>
          <div className={`nav-item ${activeView === 'settings' ? 'active' : ''}`} onClick={() => { setActiveView('settings'); setSelectedTask(null); }}>
            <Settings className="nav-icon" />
            {!isCollapsed && <span>Settings</span>}
          </div>
          <div className="nav-item" onClick={() => {
            localStorage.removeItem('bearer_token');
            localStorage.removeItem('refresh_token');
            setCurrentUser(null);
            setIsAuthenticated(false);
          }}>
            <LogOut className="nav-icon" />
            {!isCollapsed && <span>Log out</span>}
          </div>

          <div className="sidebar-user" style={{ marginTop: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '16px', paddingLeft: isCollapsed ? '0' : '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            {currentUser ? (
              <>
                <img src={currentUser.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.first_name || 'User')}+${encodeURIComponent(currentUser.last_name || '')}&background=random`} alt="User" style={{ width: '32px', height: '32px', borderRadius: '50%', margin: isCollapsed ? '0 auto' : '0' }} />
                {!isCollapsed && (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-dark)' }}>
                      {currentUser.first_name || ''} {currentUser.last_name || ''}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#8C8C9A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                      {currentUser.email}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="skeleton" style={{ display: 'flex', gap: '12px', alignItems: 'center', width: '100%' }}>
                <div className="skeleton-avatar" style={{ width: '32px', height: '32px', minWidth: '32px', margin: isCollapsed ? '0 auto' : '0' }}></div>
                {!isCollapsed && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                    <div className="skeleton-line" style={{ width: '100px', height: '14px', margin: 0 }}></div>
                    <div className="skeleton-line" style={{ width: '140px', height: '10px', margin: 0 }}></div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content" style={(activeView === 'history' || activeView === 'history-details') ? { paddingTop: '32px' } : activeView === 'review' ? { paddingTop: '16px', overflow: 'hidden' } : activeView === 'scopist' ? { padding: 0 } : {}}>
        {/* Header */}
        {activeView !== 'scopist' && activeView !== 'history' && activeView !== 'history-details' && activeView !== 'review' && <header className="header"></header>}

        {/* Main Content Area */}
        {activeView === 'dashboard' && (
          dashboardData.loading ? (
            <div className="overview-section skeleton" style={{ padding: '32px' }}>
              <div className="skeleton-title" style={{ width: '250px', height: '28px', marginBottom: '16px', backgroundColor: 'var(--border-color)', borderRadius: '4px' }}></div>
              <div className="skeleton-text" style={{ width: '400px', height: '16px', marginBottom: '32px', backgroundColor: 'var(--border-color)', borderRadius: '4px' }}></div>
              <div className="overview-stats" style={{ display: 'flex', gap: '24px', marginBottom: '32px' }}>
                {[1, 2, 3].map(i => (
                  <div key={i} className="stat-item" style={{ flex: 1, height: '100px', backgroundColor: 'var(--border-color)', borderRadius: '12px' }}></div>
                ))}
              </div>
              <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginBottom: '32px' }}>
                {[1, 2, 3].map(i => (
                  <div key={i} className="card" style={{ height: '320px', backgroundColor: 'var(--border-color)', borderRadius: '16px' }}></div>
                ))}
              </div>
            </div>
          ) : dashboardData.error ? (
            <div style={{ padding: '32px', color: '#EF4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '12px', margin: '32px' }}>
              <h3>Failed to load dashboard</h3>
              <p>{dashboardData.error}</p>
            </div>
          ) : (() => {
            const mrrGrowth = dashboardData.revenue?.mrr_growth || 0;
            const subGrowth = dashboardData.revenue?.subscriptions_growth || 0;
            const churnGrowth = dashboardData.revenue?.churn_growth || 0;

            // Donut chart logic
            const distColors = ['#5B44E9', '#60A5FA', '#A3E635', '#F59E0B', '#EF4444'];
            const totalDistRevenue = dashboardData.distribution.reduce((acc, item) => acc + item.revenue, 0);
            
            const formatTotalRevenue = (val) => {
              if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
              return `$${val}`;
            };

            let currentOffset = 25;
            const donutSegments = dashboardData.distribution.map((item, index) => {
              const percentage = item.percentage;
              const offset = currentOffset;
              currentOffset -= percentage;
              const color = distColors[index % distColors.length];
              const planLabel = item.plan.charAt(0).toUpperCase() + item.plan.slice(1).replace('_', ' ');
              return {
                ...item,
                label: planLabel,
                offset,
                color,
              };
            });

            // Funnel chart logic
            const maxFunnelCount = Math.max(...dashboardData.funnel.map(s => s.count), 0);

            return (
              <>
                {/* Revenue Overview */}
                <div className="overview-section">
                  <div className="overview-title">
                    <h1>Revenue Overview</h1>
                    <p>A real-time snapshot of your organization subscriptions, usage, and revenue.</p>
                  </div>
                  
                  <div className="overview-stats">
                    <div className="stat-item">
                      <div className="stat-icon green-glow">
                        {mrrGrowth >= 0 ? <ArrowUpRight size={24} color="#A3E635" /> : <ArrowDownRight size={24} color="#EF4444" />}
                      </div>
                      <div className="stat-info">
                        <div className="stat-value">
                          ${dashboardData.revenue?.mrr.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className={mrrGrowth >= 0 ? "badge-green" : "badge-red"}>{mrrGrowth >= 0 ? '+' : ''}{mrrGrowth}%</span>
                        </div>
                        <div className="stat-label">MRR</div>
                      </div>
                    </div>
                    
                    <div className="stat-item">
                      <div className="stat-icon" style={{ boxShadow: 'inset 0 0 0 2px #5B44E9' }}>
                        {subGrowth >= 0 ? <ArrowUpRight size={24} color="#5B44E9" /> : <ArrowDownRight size={24} color="#EF4444" />}
                      </div>
                      <div className="stat-info">
                        <div className="stat-value">
                          {dashboardData.revenue?.active_subscriptions.toLocaleString()} <span className={subGrowth >= 0 ? "badge-green" : "badge-red"}>{subGrowth >= 0 ? '+' : ''}{subGrowth}%</span>
                        </div>
                        <div className="stat-label">Active Subscriptions</div>
                      </div>
                    </div>
                    
                    <div className="stat-item">
                      <div className="stat-icon" style={{ boxShadow: 'inset 0 0 0 2px #333' }}>
                        {churnGrowth <= 0 ? <ArrowDownRight size={24} color="#A0AEC0" /> : <ArrowUpRight size={24} color="#EF4444" />}
                      </div>
                      <div className="stat-info">
                        <div className="stat-value">
                          {dashboardData.revenue?.churn_rate}% <span className={churnGrowth <= 0 ? "badge-green" : "badge-red"}>{churnGrowth >= 0 ? '+' : ''}{churnGrowth}%</span>
                        </div>
                        <div className="stat-label">Churn Rate</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dashboard Grid Row 1 */}
                <div className="dashboard-grid">
                  {/* Revenue Distribution */}
                  <div className="card">
                    <div className="card-header">
                      <div className="card-title">
                        <PieChart className="card-icon" />
                        Revenue Distribution
                      </div>
                      <span className="card-action">View details</span>
                    </div>
                    <div className="donut-container">
                      {dashboardData.distribution.length === 0 ? (
                        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: '#6b7280', height: '200px' }}>
                          No active subscriptions
                        </div>
                      ) : (
                        <div className="donut-chart">
                          <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%' }}>
                            {/* Background ring */}
                            <path
                              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              fill="none" stroke="#F1F1F4" strokeWidth="6" strokeDasharray="100, 100"
                            />
                            {/* Dynamic slices */}
                            {donutSegments.map((seg, idx) => (
                              <path
                                key={idx}
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none" 
                                stroke={seg.color} 
                                strokeWidth="6" 
                                strokeDasharray={`${seg.percentage}, 100`}
                                style={{ strokeDashoffset: seg.offset, transition: 'stroke-dashoffset 0.3s ease' }}
                              />
                            ))}
                          </svg>
                          <div className="donut-center">
                            <div className="donut-total">{formatTotalRevenue(totalDistRevenue)}</div>
                            <div className="donut-label">Total Revenue</div>
                          </div>
                        </div>
                      )}
                      
                      {dashboardData.distribution.length > 0 && (
                        <div className="legend">
                          {donutSegments.map((seg, idx) => (
                            <div key={idx} className="legend-item">
                              <div className="legend-header">
                                <div className="legend-dot" style={{ backgroundColor: seg.color }}></div>
                                {seg.label}
                              </div>
                              <div className="legend-value">{seg.percentage}%</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Team Performance */}
                  <div className="card">
                    <div className="card-header">
                      <div className="card-title">
                        <TrendingUp className="card-icon" />
                        Team Usage & Performance
                      </div>
                      <span className="card-action" style={{ cursor: 'pointer' }} onClick={() => { setActiveView('usage'); setSelectedTask(null); }}>View details</span>
                    </div>
                    
                    <div className="person-list">
                      {dashboardData.salesPerformance.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                          No team members have completed tasks yet.
                        </div>
                      ) : (
                        dashboardData.salesPerformance.map((performer, idx) => {
                          const avatar = performer.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(performer.name)}&background=random`;
                          return (
                            <div key={performer.user_id || idx} className="person-item">
                              <img src={avatar} alt={performer.name} className="person-avatar" />
                              <div className="person-info">
                                <div className="person-name">{performer.name}</div>
                                <div className="person-stats">
                                  ${performer.revenue_generated.toLocaleString()} revenue • {performer.tasks_completed} task{performer.tasks_completed !== 1 ? 's' : ''} completed
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Recent Activity */}
                  <div className="card">
                    <div className="card-header">
                      <div className="card-title">
                        <Activity className="card-icon" />
                        Recent Activity
                      </div>
                      <span className="card-action" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>Filter <ChevronDown size={14} /></span>
                    </div>
                    
                    <div className="activity-list">
                      {dashboardData.activity.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                          No recent activities.
                        </div>
                      ) : (
                        dashboardData.activity.map(item => {
                          const status = item.metadata?.status || 'active';
                          const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
                          return (
                            <div key={item.id} className="activity-item">
                              <div className="activity-icon">
                                {status === 'canceled' ? <XCircle size={16} /> : status === 'renewed' ? <RefreshCw size={16} /> : <CreditCard size={16} />}
                              </div>
                              <div className="activity-info">
                                <div className="activity-title">{item.title}</div>
                                <div className="activity-time">{new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                              </div>
                              <div className={`status-pill status-${status}`}>{statusLabel}</div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Dashboard Grid Row 2 */}
                <div className="dashboard-grid-bottom">
                  {/* Funnel Overview */}
                  <div className="card funnel-container">
                    <div className="card-header">
                      <div className="card-title">
                        <Activity className="card-icon" />
                        Task Pipeline Funnel
                      </div>
                      <span className="card-action" style={{ cursor: 'pointer' }} onClick={() => { setActiveView('history'); setSelectedTask(null); }}>View details</span>
                    </div>
                    
                    <div style={{ color: '#6B7280', fontSize: '0.9rem', marginBottom: '16px' }}>Task completion conversion rates</div>
                    
                    <div className="funnel-stats-row">
                      {dashboardData.funnel.map((stageItem, idx) => {
                        const count = stageItem.count;
                        
                        const stageLabels = {
                          'queued': 'In Queue',
                          'not_started': 'In Queue',
                          'in_progress': 'In Progress',
                          'completed': 'Completed',
                          'failed': 'Failed'
                        };
                        const label = stageLabels[stageItem.stage] || stageItem.stage;
                        
                        const barColors = {
                          'queued': '#A0AEC0',
                          'not_started': '#A0AEC0',
                          'in_progress': '#5B44E9',
                          'completed': '#A3E635',
                          'failed': '#EF4444'
                        };
                        const color = barColors[stageItem.stage] || '#E5E7EB';

                        return (
                          <div key={idx} className="funnel-stat">
                            <div className="funnel-stat-value">{count.toLocaleString()}</div>
                            <div className="funnel-stat-label">
                              <span style={{ color: color, fontSize: '20px', lineHeight: 0 }}>•</span> {label}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    <div className="funnel-bars">
                      {dashboardData.funnel.map((stageItem, idx) => {
                        const count = stageItem.count;
                        const heightPercent = maxFunnelCount > 0 ? (count / maxFunnelCount) * 100 : 0;
                        
                        const barColors = {
                          'queued': '#A0AEC0',
                          'not_started': '#A0AEC0',
                          'in_progress': '#5B44E9',
                          'completed': '#A3E635',
                          'failed': '#EF4444'
                        };
                        const color = barColors[stageItem.stage] || '#E5E7EB';

                        return (
                          <div key={idx} className="funnel-bar-col">
                            <div className="funnel-bar-percent" style={{ color: color }}>{maxFunnelCount > 0 ? `${Math.round((count / maxFunnelCount) * 100)}%` : '0%'}</div>
                            <div className="funnel-bar" style={{ height: `${heightPercent}%`, backgroundColor: color }}>
                              <div style={{ position: 'absolute', top: '8px', left: '50%', transform: 'translateX(-50%)', width: '20px', height: '4px', backgroundColor: 'white', borderRadius: '2px', opacity: 0.5 }}></div>
                            </div>
                            <div className="funnel-bar-bg" style={{ height: '100%' }}></div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Floating VerbaLex AI Assistant */}
                <div className="ai-floating-container" style={{ position: 'fixed', bottom: '32px', right: '32px', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '12px' }}>
                  {isAiOpen && (
                    <div className="ai-card floating-chat" style={{
                      width: '380px',
                      height: '480px',
                      display: 'flex',
                      flexDirection: 'column',
                      boxShadow: '0 12px 48px rgba(0, 0, 0, 0.25)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '24px',
                    }}>
                      <div className="ai-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#A3E635"/>
                            <path d="M2 17L12 22L22 17" stroke="#A3E635" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M2 12L12 17L22 12" stroke="#A3E635" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          <span className="ai-title" style={{ fontWeight: '600' }}>VerbaLex AI Assistant</span>
                        </div>
                        <div className="ai-icon-btn" onClick={() => setIsAiOpen(false)} style={{ cursor: 'pointer' }}>
                          <Minus size={16} />
                        </div>
                      </div>
                      
                      <div className="ai-chat-history" style={{ 
                        flex: 1, 
                        overflowY: 'auto', 
                        padding: '16px 0', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '12px', 
                        fontSize: '0.85rem',
                        color: 'white',
                        textAlign: 'left'
                      }}>
                        {chatHistory.map((chat, idx) => (
                          <div key={idx} style={{ 
                            alignSelf: chat.role === 'user' ? 'flex-end' : 'flex-start',
                            backgroundColor: chat.role === 'user' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(91, 68, 233, 0.45)',
                            padding: '10px 14px',
                            borderRadius: '16px',
                            maxWidth: '85%',
                            wordBreak: 'break-word',
                            lineHeight: '1.4',
                            border: chat.role === 'user' ? '1px solid rgba(255, 255, 255, 0.1)' : 'none'
                          }}>
                            <MarkdownText text={chat.content} />
                          </div>
                        ))}
                        {isChatSending && (
                          <div style={{ alignSelf: 'flex-start', color: '#A3E635', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', paddingLeft: '4px' }}>
                            <Loader2 className="animate-spin" size={12} />
                            <span>VerbaLex is thinking...</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="ai-actions" style={{ display: 'flex', gap: '8px', padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <button type="button" className="ai-action-btn" style={{ flex: 1, justifyContent: 'center', fontSize: '0.75rem', padding: '6px 10px' }} onClick={() => {
                          setChatMessage('Provide a smart analysis of our revenue and completed tasks.');
                        }}>
                          <PieChart size={14} /> Smart Analysis
                        </button>
                        <button type="button" className="ai-action-btn" style={{ flex: 1, justifyContent: 'center', fontSize: '0.75rem', padding: '6px 10px' }} onClick={() => {
                          setChatMessage('Write a brief report summarizing current task stages.');
                        }}>
                          <FileText size={14} /> Generate Report
                        </button>
                      </div>
                      
                      <form onSubmit={handleSendChatMessage} className="ai-input-container" style={{ margin: '8px 0 0 0' }}>
                        <input 
                          type="text" 
                          placeholder="Ask anything..." 
                          value={chatMessage} 
                          onChange={e => setChatMessage(e.target.value)}
                          disabled={isChatSending}
                          style={{ borderRadius: '12px' }}
                        />
                        <button type="submit" className="ai-voice-btn" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }} disabled={isChatSending}>
                          <Send size={16} />
                        </button>
                      </form>
                    </div>
                  )}

                  {/* Circular Floating Logo Button */}
                  <button 
                    onClick={() => setIsAiOpen(!isAiOpen)} 
                    style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '50%',
                      backgroundColor: '#161619',
                      border: '1px solid var(--border-color)',
                      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 16px rgba(91, 68, 233, 0.2)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      outline: 'none',
                    }}
                    className="ai-floating-btn"
                  >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#A3E635"/>
                      <path d="M2 17L12 22L22 17" stroke="#A3E635" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M2 12L12 17L22 12" stroke="#A3E635" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </>
            );
          })()
        )}

        {activeView === 'new' && (
          <NewTask 
            onCancel={() => setActiveView('history')} 
            onTaskCreated={(newTask) => {
              setSelectedTask(newTask);
              setActiveView('history-details');
            }} 
          />
        )}
        {activeView === 'history' && !selectedTask && (
          <History 
            onViewDetails={(task) => {
              setSelectedTask(task);
              setActiveView('history-details');
            }} 
            onNewTask={() => setActiveView('scopist')}
          />
        )}
        {activeView === 'history-details' && selectedTask && (
          <HistoryDetails 
            task={selectedTask} 
            onBack={() => {
              setSelectedTask(null);
              setActiveView('history');
            }} 
            onWorkstation={() => {
              setSelectedReviewTask(selectedTask);
              setActiveView('review');
              setIsCollapsed(true);
            }}
          />
        )}
        {activeView === 'review' && !selectedReviewTask && <ReviewPage onSelect={setSelectedReviewTask} />}
        {activeView === 'review' && selectedReviewTask && (
          <ReviewEdit task={selectedReviewTask} onBack={() => {
            if (selectedTask && selectedTask.id === selectedReviewTask.id) {
              setActiveView('history-details');
              setSelectedReviewTask(null);
            } else {
              setSelectedReviewTask(null);
            }
          }} />
        )}
        {activeView === 'admin' && <Admin />}
        {activeView === 'settings' && <SettingsView />}
        {activeView === 'usage' && <Usage />}
        {activeView === 'scopist' && (
          <div className="scopist-page">
            
            <div className="scopist-tab-content" style={{ padding: '32px 40px 32px 40px' }}>
              {scopistTab === 'new' && (
                <NewTask 
                  onCancel={() => setActiveView('history')} 
                  onTaskCreated={(newTask) => {
                    setSelectedTask(newTask);
                    setActiveView('history-details');
                  }} 
                />
              )}
              {scopistTab === 'review' && !selectedReviewTask && <ReviewPage onSelect={setSelectedReviewTask} />}
              {scopistTab === 'review' && selectedReviewTask && <ReviewEdit task={selectedReviewTask} onBack={() => setScopistTab('history')} />}
              {scopistTab === 'history' && (
                <History 
                  onViewDetails={(task) => {
                    setSelectedTask(task);
                    setActiveView('history-details');
                  }} 
                  onNewTask={() => setScopistTab('new')}
                />
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

export default App;
