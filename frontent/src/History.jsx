import React, { useState, useEffect } from 'react';
import './History.css';
import { 
  FileText, Calendar, MoreHorizontal, Users, Plus, Star, 
  ChevronDown, SlidersHorizontal, Search, FileSpreadsheet, 
  Loader2, Home, Edit 
} from 'lucide-react';
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

export default function History({ onViewDetails, onNewTask }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
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
        session.fetchPromise = api(`/api/v1/organizations/${orgId}/tasks/?page=1&page_size=50`, {
          signal: controller.signal
        }).then(res => {
          if (!res.ok) throw new Error('Failed to fetch tasks.');
          return res.json();
        });
      }

      try {
        const data = await session.fetchPromise;
        setTasks(data.items || []);
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

  return (
    <div className="history-page-container">
      {/* Breadcrumbs */}
      <nav className="breadcrumb-nav">
        <a href="#home" onClick={(e) => { e.preventDefault(); }}>
          <Home size={14} />
          <span>Home</span>
        </a>
        <span className="breadcrumb-separator">/</span>
        <span>Tasks</span>
        <span className="breadcrumb-separator">/</span>
        <span className="active-crumb">Task History</span>
      </nav>

      {/* Header */}
      <header className="history-page-header">
        <div className="header-title-block">
          <div className="header-icon-wrapper">
            <Edit size={24} />
          </div>
          <div className="header-text-info">
            <h1>
              Task History
            </h1>
            <p>View all pipeline tasks and their statuses.</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn-add-new" onClick={onNewTask}>
            <Plus size={16} />
            <span>Add New Task</span>
          </button>
        </div>
      </header>

      {error && (
        <div style={{
          padding: '1rem', 
          color: '#c62828', 
          backgroundColor: '#ffebee', 
          borderRadius: '0.5rem', 
          marginBottom: '1.5rem',
          fontSize: '0.875rem'
        }}>
          {error}
        </div>
      )}

      {/* Table Card */}
      <div className="table-card-wrapper">
        <table className="redesigned-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: '24px' }}>Task ID</th>
              <th>Task Name</th>
              <th>Created Date</th>
              <th>Status</th>
              <th style={{ textAlign: 'right', paddingRight: '24px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="5" className="table-empty-state">
                  <Loader2 className="animate-spin" size={24} style={{ color: '#2A6F4D', margin: '0 auto 12px auto' }} />
                  <span>Loading tasks...</span>
                </td>
              </tr>
            ) : tasks.length === 0 ? (
              <tr>
                <td colSpan="5" className="table-empty-state" style={{ padding: '48px 24px' }}>
                  <span>No tasks found. Create a new task to get started.</span>
                </td>
              </tr>
            ) : (
              tasks.map((item) => {
                const avatar = getAvatarProps(item.name);
                
                let statusClass = "status-queued";
                let statusText = "In Queue";
                const lowerStatus = item.status?.toLowerCase();
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
                  <tr key={item.id} style={{ cursor: 'pointer' }} onClick={() => handleRowClick(item)}>
                    <td className="booking-no-cell" style={{ paddingLeft: '24px' }}>
                      #{item.id ? item.id.substring(0, 6) : 'N/A'}
                    </td>
                    <td>
                      <div className="capsule-user-cell">
                        <div className="avatar-circle" style={{ backgroundColor: avatar.bg, color: avatar.text }}>
                          {avatar.initials}
                        </div>
                        <span className="capsule-name-text">{item.name || "Untitled Task"}</span>
                      </div>
                    </td>
                    <td>{formatDate(item.created_at)}</td>
                    <td>
                      <span className={`status-pill ${statusClass}`}>{statusText}</span>
                    </td>
                    <td style={{ textAlign: 'right', paddingRight: '24px' }} onClick={(e) => e.stopPropagation()}>
                      <button className="view-btn" style={{ 
                        padding: '6px 16px', 
                        borderRadius: '8px', 
                        fontSize: '0.85rem', 
                        fontWeight: '600',
                        backgroundColor: 'white',
                        border: '1px solid #D1D5DB',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        color: '#2A6F4D'
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
