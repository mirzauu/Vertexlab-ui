import React, { useState, useEffect } from 'react';
import './History.css';
import { FileText, Download, Calendar, MoreVertical, Tag } from 'lucide-react';

export default function History({ onViewDetails, onNewTask }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTasks = async () => {
      const orgId = localStorage.getItem('organization_id');
      const token = localStorage.getItem('bearer_token');

      if (!orgId || !token) {
        setError('Missing organization ID or authentication token.');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`http://127.0.0.1:8000/api/v1/organizations/${orgId}/tasks/?page=1&page_size=20`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch tasks.');
        }

        const data = await response.json();
        setTasks(data.items || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
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
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280', backgroundColor: '#f9fafb', borderRadius: '0.5rem', border: '1px dashed #d1d5db' }}>
            No tasks found.
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
