import React, { useState, useEffect } from 'react';
import Auth from './Auth';
import NewTask from './NewTask';
import History from './History';
import HistoryDetails from './HistoryDetails';
import ReviewEdit from './ReviewEdit';
import Admin from './Admin';
import SettingsView from './Settings';
import { 
  LayoutDashboard, Users, FileText, HelpCircle, Moon, Settings, LogOut, 
  Search, Bell, MessageSquare, ArrowUpRight, ArrowDownRight, 
  CreditCard, RefreshCw, XCircle, Minus, Plus, Mic,
  ChevronDown, ChevronUp, Activity, PieChart, TrendingUp,
  Sidebar, PlusCircle, CheckSquare, Edit
} from 'lucide-react';

const reviewTasks = [
  { id: 1, name: "Quarterly Sales Analysis Report - Q2 2026", status: "In Progress", date: "Jun 22, 2026" },
  { id: 2, name: "Annual Marketing Strategy", status: "Completed", date: "Jun 21, 2026" },
  { id: 3, name: "Product Launch Feedback", status: "Not Started", date: "Jun 20, 2026" },
];

function ReviewPage({ onSelect }) {
  return (
    <div className="history-container">
      <div className="history-header">
        <div>
          <h1>Review & Edit Tasks</h1>
          <p>Select a task to review and edit in the human in the loop interface.</p>
        </div>
      </div>
      <div className="history-list">
        {reviewTasks.map(task => (
          <div key={task.id} className="history-card" style={{ cursor: 'pointer' }} onClick={() => onSelect(task)}>
            <div className="history-card-main">
              <h3 className="task-name">{task.name}</h3>
              <div className="task-info-top" style={{ marginTop: '8px' }}>
                <div className="task-type-badge" style={{ 
                  backgroundColor: task.status === 'Completed' ? 'rgba(34, 197, 94, 0.2)' : task.status === 'In Progress' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(156, 163, 175, 0.2)',
                  color: task.status === 'Completed' ? '#22c55e' : task.status === 'In Progress' ? '#3b82f6' : '#9ca3af'
                }}>
                  {task.status}
                </div>
                <div className="task-date">{task.date}</div>
              </div>
            </div>
            <div className="history-card-actions">
              <button className="view-btn">Review</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeView, setActiveView] = useState('dashboard');
  const [selectedTask, setSelectedTask] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [scopistTab, setScopistTab] = useState('new');
  const [selectedReviewTask, setSelectedReviewTask] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    if (isAuthenticated) {
      const fetchUser = async () => {
        const token = localStorage.getItem('bearer_token');
        if (!token) return;
        try {
          const res = await fetch('http://127.0.0.1:8000/api/v1/users/me', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setCurrentUser(data);
          }
        } catch (e) {
          console.error('Failed to fetch user', e);
        }
      };
      fetchUser();
    }
  }, [isAuthenticated]);

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

          <div className={`nav-item ${activeView === 'scopist' ? 'active' : ''}`} onClick={() => { setActiveView('scopist'); setSelectedTask(null); }}>
            <Edit className="nav-icon" />
            {!isCollapsed && <span>Scopist</span>}
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
          <div className="nav-item" onClick={() => setIsAuthenticated(false)}>
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
          <>
            {/* Revenue Overview */}
            <div className="overview-section">
              <div className="overview-title">
                <h1>Revenue Overview</h1>
                <p>A real-time snapshot of your sales pipeline, orders..</p>
              </div>
              
              <div className="overview-stats">
                <div className="stat-item">
                  <div className="stat-icon green-glow">
                    <ArrowUpRight size={24} color="#A3E635" />
                  </div>
                  <div className="stat-info">
                    <div className="stat-value">
                      $43,256 <span className="badge-green">+12%</span>
                    </div>
                    <div className="stat-label">MRR</div>
                  </div>
                </div>
                
                <div className="stat-item">
                  <div className="stat-icon" style={{ boxShadow: 'inset 0 0 0 2px #5B44E9' }}>
                    <RefreshCw size={24} color="#5B44E9" />
                  </div>
                  <div className="stat-info">
                    <div className="stat-value">
                      13,256 <span className="badge-green">+5%</span>
                    </div>
                    <div className="stat-label">Active Subscriptions</div>
                  </div>
                </div>
                
                <div className="stat-item">
                  <div className="stat-icon" style={{ boxShadow: 'inset 0 0 0 2px #333' }}>
                    <ArrowDownRight size={24} color="#A0AEC0" />
                  </div>
                  <div className="stat-info">
                    <div className="stat-value">
                      3.6% <span className="badge-red">-7%</span>
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
                  <div className="donut-chart">
                    <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%' }}>
                      <defs>
                        <pattern id="diagonalHatch" width="2" height="2" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                          <line x1="0" y1="0" x2="0" y2="2" stroke="#60A5FA" strokeWidth="0.5" />
                        </pattern>
                      </defs>
                      {/* Background ring */}
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none" stroke="#F1F1F4" strokeWidth="6" strokeDasharray="100, 100"
                      />
                      {/* Retained Revenue 38% - Light Blue with dashes */}
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none" stroke="url(#diagonalHatch)" strokeWidth="6" strokeDasharray="38, 100"
                        style={{ strokeDashoffset: '25' }}
                      />
                      {/* Recurring Revenue 50% - Purple */}
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none" stroke="#5B44E9" strokeWidth="6" strokeDasharray="50, 100"
                        style={{ strokeDashoffset: '-13' }}
                      />
                      {/* New Revenue 12% - Green */}
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none" stroke="#A3E635" strokeWidth="6" strokeDasharray="12, 100"
                        style={{ strokeDashoffset: '-63' }}
                      />
                    </svg>
                    <div className="donut-center">
                      <div className="donut-total">$728K</div>
                      <div className="donut-label">Total Revenue</div>
                    </div>
                    {/* Labels on chart */}
                    <div style={{ position: 'absolute', top: '10px', left: '10px', fontSize: '10px', fontWeight: 'bold' }}>10%</div>
                    <div style={{ position: 'absolute', top: '25px', right: '15px', fontSize: '10px', fontWeight: 'bold', background: '#E0E7FF', padding: '2px 6px', borderRadius: '10px' }}>33%</div>
                    <div style={{ position: 'absolute', bottom: '20px', left: '10px', fontSize: '10px', fontWeight: 'bold' }}>44%</div>
                  </div>
                  
                  <div className="legend">
                    <div className="legend-item">
                      <div className="legend-header">
                        <div className="legend-dot" style={{ backgroundColor: '#A3E635' }}></div>
                        New Revenue
                      </div>
                      <div className="legend-value">12%</div>
                    </div>
                    <div className="legend-item">
                      <div className="legend-header">
                        <div className="legend-dot" style={{ backgroundColor: '#5B44E9' }}></div>
                        Recurring Revenue
                      </div>
                      <div className="legend-value">50%</div>
                    </div>
                    <div className="legend-item">
                      <div className="legend-header">
                        <div className="legend-dot" style={{ backgroundColor: '#60A5FA' }}></div>
                        Retained Revenue
                      </div>
                      <div className="legend-value">38%</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sales Performance */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    <TrendingUp className="card-icon" />
                    Sales Performance
                  </div>
                  <span className="card-action">View details</span>
                </div>
                
                <div className="person-list">
                  <div className="person-item">
                    <img src="https://ui-avatars.com/api/?name=Robert+Jones&background=random" alt="Robert" className="person-avatar" />
                    <div className="person-info">
                      <div className="person-name">Robert Jones</div>
                      <div className="person-stats">$124K revenue • 18 deals</div>
                    </div>
                  </div>
                  
                  <div className="person-item">
                    <img src="https://ui-avatars.com/api/?name=Sofia+Lugo&background=random" alt="Sofia" className="person-avatar" />
                    <div className="person-info">
                      <div className="person-name">Sofia Lugo</div>
                      <div className="person-stats">$98K revenue • 12 deals</div>
                    </div>
                  </div>
                  
                  <div className="person-item">
                    <img src="https://ui-avatars.com/api/?name=Michael+Miller&background=random" alt="Michael" className="person-avatar" />
                    <div className="person-info">
                      <div className="person-name">Michael Miller</div>
                      <div className="person-stats">$76K revenue • 9 deals</div>
                    </div>
                  </div>
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
                  <div className="activity-item">
                    <div className="activity-icon">
                      <CreditCard size={16} />
                    </div>
                    <div className="activity-info">
                      <div className="activity-title">Pro Plan Subscription</div>
                      <div className="activity-time">Jun 19th 2026 - 11:53 PM</div>
                    </div>
                    <div className="status-pill status-active">Active</div>
                  </div>
                  
                  <div className="activity-item">
                    <div className="activity-icon">
                      <Activity size={16} />
                    </div>
                    <div className="activity-info">
                      <div className="activity-title">Free Trial Started</div>
                      <div className="activity-time">Jun 16th 2026 - 08:03 PM</div>
                    </div>
                    <div className="status-pill status-trial">Trial</div>
                  </div>
                  
                  <div className="activity-item">
                    <div className="activity-icon">
                      <XCircle size={16} />
                    </div>
                    <div className="activity-info">
                      <div className="activity-title">Subscription Canceled</div>
                      <div className="activity-time">Jun 14th 2026 - 14:21 AM</div>
                    </div>
                    <div className="status-pill status-canceled">Canceled</div>
                  </div>
                  
                  <div className="activity-item">
                    <div className="activity-icon">
                      <RefreshCw size={16} />
                    </div>
                    <div className="activity-info">
                      <div className="activity-title">Annual Plan Renewed</div>
                      <div className="activity-time">Jun 12th 2026 - 01:26 PM</div>
                    </div>
                    <div className="status-pill status-renewed">Renewed</div>
                  </div>
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
                    Funnel Overview
                  </div>
                  <span className="card-action">View details</span>
                </div>
                
                <div style={{ color: '#6B7280', fontSize: '0.9rem', marginBottom: '16px' }}>Conversion rate between stages</div>
                
                <div className="funnel-stats-row">
                  <div className="funnel-stat">
                    <div className="funnel-stat-value">20,010</div>
                    <div className="funnel-stat-label"><span style={{ color: '#A3E635', fontSize: '20px', lineHeight: 0 }}>•</span> Signups</div>
                  </div>
                  <div className="funnel-stat">
                    <div className="funnel-stat-value">17,210</div>
                    <div className="funnel-stat-label"><span style={{ color: '#111827', fontSize: '20px', lineHeight: 0 }}>•</span> Activated</div>
                  </div>
                  <div className="funnel-stat">
                    <div className="funnel-stat-value">9,210</div>
                    <div className="funnel-stat-label"><span style={{ color: '#5B44E9', fontSize: '20px', lineHeight: 0 }}>•</span> Trial</div>
                  </div>
                  <div className="funnel-stat">
                    <div className="funnel-stat-value">8,210</div>
                    <div className="funnel-stat-label"><span style={{ color: '#E5E7EB', fontSize: '20px', lineHeight: 0 }}>•</span> Paid</div>
                  </div>
                  <div className="funnel-stat">
                    <div className="funnel-stat-value">1,420</div>
                    <div className="funnel-stat-label"><span style={{ color: '#E5E7EB', fontSize: '20px', lineHeight: 0 }}>•</span> Retained</div>
                  </div>
                </div>
                
                <div className="funnel-bars">
                  <div className="funnel-bar-col">
                    <div className="funnel-bar-percent" style={{ color: '#A3E635' }}>100%</div>
                    <div className="funnel-bar" style={{ height: '100%', backgroundColor: '#A3E635' }}></div>
                  </div>
                  
                  <div className="funnel-bar-col">
                    <div className="funnel-bar-percent">86%</div>
                    <div className="funnel-bar" style={{ height: '86%', backgroundColor: '#111827' }}>
                      <div style={{ position: 'absolute', top: '8px', left: '50%', transform: 'translateX(-50%)', width: '20px', height: '4px', backgroundColor: 'white', borderRadius: '2px', opacity: 0.5 }}></div>
                    </div>
                    <div className="funnel-bar-bg" style={{ height: '100%' }}></div>
                  </div>
                  
                  <div className="funnel-bar-col">
                    <div className="funnel-bar-percent">53%</div>
                    <div className="funnel-bar" style={{ height: '53%', backgroundColor: '#5B44E9' }}>
                      <div style={{ position: 'absolute', top: '8px', left: '50%', transform: 'translateX(-50%)', width: '20px', height: '4px', backgroundColor: 'white', borderRadius: '2px', opacity: 0.5 }}></div>
                    </div>
                    <div className="funnel-bar-bg" style={{ height: '86%' }}></div>
                  </div>
                  
                  <div className="funnel-bar-col">
                    <div className="funnel-bar-percent">89%</div>
                    <div className="funnel-bar" style={{ height: '89%', backgroundColor: '#E5E7EB' }}>
                      <div style={{ position: 'absolute', top: '8px', left: '50%', transform: 'translateX(-50%)', width: '20px', height: '4px', backgroundColor: 'white', borderRadius: '2px', opacity: 0.5 }}></div>
                    </div>
                    <div className="funnel-bar-bg" style={{ height: '100%' }}></div>
                  </div>
                  
                  <div className="funnel-bar-col">
                    <div className="funnel-bar-percent">17%</div>
                    <div className="funnel-bar" style={{ height: '17%', backgroundColor: '#E5E7EB' }}>
                      <div style={{ position: 'absolute', top: '8px', left: '50%', transform: 'translateX(-50%)', width: '20px', height: '4px', backgroundColor: 'white', borderRadius: '2px', opacity: 0.5 }}></div>
                    </div>
                    <div className="funnel-bar-bg" style={{ height: '89%' }}></div>
                  </div>
                </div>
              </div>

              {/* SalesFlow AI */}
              <div className="ai-card">
                <div className="ai-header">
                  <div className="ai-icon-btn"><Minus size={16} /></div>
                  <div className="ai-title">VerbaLex AI</div>
                  <div className="ai-icon-btn"><Plus size={16} /></div>
                </div>
                
                <div className="ai-orb-container">
                  <div className="ai-orb"></div>
                </div>
                
                <div className="ai-text">
                  AI is analyzing your sales data...
                </div>
                
                <div className="ai-actions">
                  <button className="ai-action-btn">
                    <PieChart size={16} /> Smart Analysis
                  </button>
                  <button className="ai-action-btn">
                    <FileText size={16} /> Generate Report
                  </button>
                </div>
                
                <div className="ai-input-container">
                  <input type="text" placeholder="Ask anything..." />
                  <div className="ai-voice-btn">
                    <Mic size={16} />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {activeView === 'new' && <NewTask onCancel={() => setActiveView('history')} />}
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
          <ReviewEdit onBack={() => setSelectedReviewTask(null)} />
        )}
        {activeView === 'admin' && <Admin />}
        {activeView === 'settings' && <SettingsView />}
        {activeView === 'usage' && (
          <div style={{ padding: '40px' }}>
            <h1>Usage Metrics</h1>
            <p>View your application usage and statistics here.</p>
          </div>
        )}
        {activeView === 'scopist' && (
          <div className="scopist-page">

            
            <div className="scopist-tab-content" style={{ padding: '32px 40px 32px 40px' }}>
              {scopistTab === 'new' && <NewTask onCancel={() => setActiveView('history')} />}
              {scopistTab === 'review' && !selectedReviewTask && <ReviewPage onSelect={setSelectedReviewTask} />}
              {scopistTab === 'review' && selectedReviewTask && <ReviewEdit />}
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
