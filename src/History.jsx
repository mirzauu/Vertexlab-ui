import React, { useState, useEffect } from 'react';
import './History.css';
import { FileText, Download, Calendar, MoreVertical, Tag, PlusCircle } from 'lucide-react';
import { api } from './services/api';

// Module-level trackers for deduplication across StrictMode double-mounts
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
        session.fetchPromise = api(`/api/v1/organizations/${orgId}/tasks/?page=1&page_size=20`, {
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
          session.fetchPromise = null; // Clear on error so future retries can run
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

  if (loading) {
    return (
      <div className="history-container skeleton">
        <div className="history-header">
          <div>
            <div className="skeleton-title" style={{ marginBottom: '8px' }}></div>
            <div className="skeleton-text" style={{ width: '300px' }}></div>
          </div>
          <div className="history-filters">
            <div className="filter-chip" style={{ width: '80px', height: '32px', backgroundColor: 'var(--border-color)', border: 'none' }}></div>
            <div className="filter-chip" style={{ width: '100px', height: '32px', backgroundColor: 'var(--border-color)', border: 'none' }}></div>
            <div className="filter-chip" style={{ width: '100px', height: '32px', backgroundColor: 'var(--border-color)', border: 'none' }}></div>
          </div>
        </div>

        <div className="history-list">
          {[1, 2, 3].map(i => (
            <div key={i} className="history-card" style={{ display: 'flex', justifyContent: 'space-between', padding: '1.5rem', opacity: 0.7 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center' }}>
                  <div className="skeleton-button" style={{ width: '80px', height: '24px' }}></div>
                  <div className="skeleton-text" style={{ width: '100px', height: '14px' }}></div>
                </div>
                <div className="skeleton-title" style={{ width: '250px', marginBottom: '0.5rem', height: '24px' }}></div>
                <div className="skeleton-text" style={{ width: '400px', marginBottom: '1rem', height: '14px' }}></div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <div className="skeleton-button" style={{ width: '60px', height: '24px' }}></div>
                  <div className="skeleton-button" style={{ width: '60px', height: '24px' }}></div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div className="skeleton-button" style={{ width: '100px' }}></div>
                <div className="skeleton-icon" style={{ width: '24px', height: '24px' }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="history-container">
      <div className="history-header">
        <div>
          <h1>Task History</h1>
          <p>Review and manage your previously completed tasks and reports.</p>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div className="history-filters">
            <div className="filter-chip active">All Time</div>
            <div className="filter-chip">Last 30 Days</div>
            <div className="filter-chip">Reports Only</div>
          </div>
          <button className="view-btn" onClick={onNewTask}>New Task</button>
        </div>
      </div>

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

      <div className="history-list">
        {tasks.length === 0 && !error && (
          <div style={{ 
            padding: '40px 32px', 
            textAlign: 'center', 
            backgroundColor: '#F9FAFB', 
            borderRadius: '16px', 
            border: '2px dashed #E5E7EB',
            maxWidth: '600px',
            margin: '40px auto',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
          }}>
            <div style={{ 
              width: '56px', 
              height: '56px', 
              borderRadius: '50%', 
              backgroundColor: 'rgba(26, 77, 57, 0.08)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              margin: '0 auto 20px auto',
              color: '#1A4D39'
            }}>
              <PlusCircle size={28} />
            </div>
            
            <h3 style={{ fontSize: '1.25rem', color: '#111827', fontWeight: '700', marginBottom: '8px' }}>
              Create your first transcription task
            </h3>
            
            <p style={{ fontSize: '0.9rem', color: '#6B7280', lineHeight: '1.5', marginBottom: '24px', maxWidth: '480px', margin: '0 auto 24px auto' }}>
              Welcome to VerbaLex AI! The Scopist page is where you upload audio files, generate legal transcripts, and run AI-powered analysis. Let's get started.
            </p>
            
            <div style={{ 
              textAlign: 'left', 
              backgroundColor: '#FFFFFF', 
              border: '1px solid #E5E7EB', 
              borderRadius: '12px', 
              padding: '20px', 
              marginBottom: '28px',
              maxWidth: '440px',
              margin: '0 auto 28px auto'
            }}>
              <h4 style={{ fontSize: '0.85rem', color: '#111827', fontWeight: '700', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                How it works:
              </h4>
              <ol style={{ fontSize: '0.825rem', color: '#4B5563', paddingLeft: '16px', margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <li>Click <strong>Create New Task</strong> below to start.</li>
                <li>Upload your deposition audio file or raw STT transcript.</li>
                <li>Let our pipeline transcribe and analyze the speech.</li>
                <li>Refine the text in the <strong>Review and Edit</strong> workstation.</li>
              </ol>
            </div>
            
            <button 
              onClick={onNewTask} 
              style={{ 
                backgroundColor: '#1A4D39', 
                color: 'white', 
                padding: '12px 24px', 
                borderRadius: '8px', 
                fontSize: '0.9rem', 
                fontWeight: '600',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 6px rgba(26, 77, 57, 0.15)',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
              onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
            >
              Create New Task
            </button>
          </div>
        )}
        
        {tasks.map(task => (
          <div key={task.id} className="history-card">
            <div className="history-card-main">
              <div className="task-info-top">
                <div className="task-type-badge" style={{ textTransform: 'capitalize' }}>
                  {task.status || 'unknown'}
                </div>
                <div className="task-date">
                  <Calendar size={14} />
                  {task.created_at ? new Date(task.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown date'}
                </div>
              </div>
              
              <h3 className="task-name">{task.name || 'Untitled Task'}</h3>
              <p className="task-description">{task.description || 'No description provided.'}</p>
              
              <div className="task-files">
                {task.tags && task.tags.map((tag, index) => (
                  <div key={index} className="file-pill">
                    <Tag size={14} />
                    <span>{tag}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="history-card-actions">
              <button className="view-btn" onClick={() => onViewDetails(task)}>View Details</button>
              <div className="more-btn">
                <MoreVertical size={18} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
