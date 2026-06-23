import React, { useState, useEffect } from 'react';
import './HistoryDetails.css';
import { CheckCircle, Clock, Database, RefreshCw, UserCheck, CheckCircle2, ArrowLeft, FileText, Download, Mic, Cpu, Search, FileCheck, Loader2, XCircle } from 'lucide-react';
import { api } from './services/api';

// Steps must exactly match backend PIPELINE_STEPS in app/pipeline/orchestrator.py
const PIPELINE_STEPS = [
  'stt',
  'data_processing',
  'analysis',
  'matching',
  'document_generation'
];

const getStepInfo = (stepName) => {
  const map = {
    stt: { title: "Audio processing", icon: <Mic size={20} />, description: "Speech-to-text and audio enhancement." },
    data_processing: { title: "Raw data processing", icon: <Database size={20} />, description: "Data extraction and validation." },
    analysis: { title: "Analysis", icon: <Cpu size={20} />, description: "Embedding and analyzing chunks." },
    matching: { title: "Matching", icon: <Search size={20} />, description: "Cross-referencing and matching evidence." },
    document_generation: { title: "Document Generation", icon: <FileCheck size={20} />, description: "Task finalized and report generated." }
  };
  return map[stepName] || { title: stepName.replace('_', ' '), icon: <CheckCircle2 size={20} />, description: "Processing step." };
};

// Module-level map to track active connections/requests for each task
const activeTaskSessions = new Map();

const registerSession = (taskId) => {
  let session = activeTaskSessions.get(taskId);
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
    sseConnected: false,
    timeoutId: null
  };
  activeTaskSessions.set(taskId, session);
  return session;
};

const deregisterSession = (taskId) => {
  const session = activeTaskSessions.get(taskId);
  if (!session) return;

  session.count -= 1;
  if (session.count <= 0) {
    session.timeoutId = setTimeout(() => {
      session.controller.abort();
      activeTaskSessions.delete(taskId);
    }, 100);
  }
};

export default function HistoryDetails({ task, onBack, onWorkstation }) {
  const [pipelineData, setPipelineData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isReloading, setIsReloading] = useState(false);
  const [reloadError, setReloadError] = useState(null);

  useEffect(() => {
    const orgId = localStorage.getItem('organization_id') || task.organization_id;
    const token = localStorage.getItem('bearer_token');
    const cacheKey = `pipeline_status_${task.id}`;

    if (!orgId || !token) {
      setError('Missing organization ID or authentication token.');
      setLoading(false);
      return;
    }

    const session = registerSession(task.id);
    const abortController = session.controller;
    let buffer = '';

    const connectSSE = async (retryCount = 0) => {
      if (abortController.signal.aborted) return;
      session.sseConnected = true;

      const scheduleReconnect = () => {
        if (retryCount >= 5 || abortController.signal.aborted) return;
        const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
        console.warn(`[SSE] Disconnected. Reconnecting in ${delay}ms (attempt ${retryCount + 1}/5)...`);
        setTimeout(() => {
          session.sseConnected = false;
          connectSSE(retryCount + 1);
        }, delay);
      };

      try {
        const response = await api(
          `/api/v1/organizations/${orgId}/tasks/${task.id}/pipeline/status/stream`,
          {
            headers: { 'Accept': 'text/event-stream' },
            signal: abortController.signal
          }
        );
        if (!response.ok) {
          session.sseConnected = false;
          scheduleReconnect();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6).trim();
              if (!dataStr) continue;
              try {
                const data = JSON.parse(dataStr);
                setPipelineData(data);
                // Update cache with latest SSE data
                sessionStorage.setItem(cacheKey, JSON.stringify(data));
                // Normalize to lowercase — backend always sends lowercase status
                const normalizedStatus = data.status?.toLowerCase();
                if (normalizedStatus === 'completed' || normalizedStatus === 'failed') {
                  abortController.abort();
                  return;
                }
              } catch (e) {
                console.error('SSE parse error', e);
              }
            }
          }
        }
        // Stream closed by server unexpectedly — schedule reconnect
        session.sseConnected = false;
        scheduleReconnect();
      } catch (err) {
        session.sseConnected = false;
        if (err.name === 'AbortError') return;
        console.error('[SSE] Connection error:', err);
        scheduleReconnect();
      }
    };

    const fetchInitialStatus = async () => {
      // ── Step 1: Show cached data instantly (if available) ───────────────
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          const cachedData = JSON.parse(cached);
          setPipelineData(cachedData);
          setLoading(false);
          // If already completed, no need to hit the network at all
          const cachedStatus = cachedData.status?.toLowerCase();
          if (cachedStatus === 'completed' || cachedStatus === 'failed') return;
        } catch (_) { /* bad cache, ignore */ }
      }

      // ── Step 2: Fetch fresh data from REST ──────────────────────────────
      if (!session.fetchPromise) {
        session.fetchPromise = api(
          `/api/v1/organizations/${orgId}/tasks/${task.id}/pipeline/status`,
          {
            signal: abortController.signal
          }
        ).then(res => {
          if (!res.ok) throw new Error('Fetch failed');
          return res.json();
        });
      }

      try {
        const data = await session.fetchPromise;
        sessionStorage.setItem(cacheKey, JSON.stringify(data)); // cache it
        setPipelineData(data);
        setLoading(false);

        // ── Step 3: Open SSE only if still running ───────────────────────
        const activeStatus = data.status?.toLowerCase();
        if (activeStatus !== 'completed' && activeStatus !== 'failed') {
          connectSSE();
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          session.fetchPromise = null; // reset to allow retries
        }
        setLoading(false);
        if (err.name !== 'AbortError') {
          connectSSE();
        }
      }
    };

    fetchInitialStatus();

    return () => {
      deregisterSession(task.id);
    };
  }, [task.id, refreshKey]); // ← task.id not task — avoids re-trigger on parent re-render


  const handleReload = async () => {
    setIsReloading(true);
    setReloadError(null);
    const orgId = localStorage.getItem('organization_id') || task.organization_id;

    try {
      const res = await api(`/api/v1/organizations/${orgId}/tasks/${task.id}/pipeline/run`, {
        method: 'POST'
      });
      if (res.ok) {
        sessionStorage.removeItem(`pipeline_status_${task.id}`); // bust the cache
        // Bust active session so that it will start clean
        const session = activeTaskSessions.get(task.id);
        if (session) {
          session.controller.abort();
          activeTaskSessions.delete(task.id);
        }
        setPipelineData(null);
        setLoading(true);
        setRefreshKey(prev => prev + 1);
      } else {
        let message = 'Failed to start pipeline.';
        try {
          const errData = await res.json();
          message = errData.detail || errData.message || message;
        } catch (_) {}
        setReloadError(message);
        setTimeout(() => setReloadError(null), 5000);
      }
    } catch (e) {
      console.error('[Reload] Network error:', e);
      setReloadError('Network error. Could not connect to the server.');
      setTimeout(() => setReloadError(null), 5000);
    } finally {
      setIsReloading(false);
    }
  };

  const handleDownload = async (file) => {
    const token = localStorage.getItem('bearer_token');
    if (!token) {
      alert('Missing authentication token.');
      return;
    }

    try {
      const response = await api(`/api/v1/files/${file.id}/download`);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.file_name || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
      alert('Failed to download file.');
    }
  };


  const displayDate = pipelineData?.completed_at 
    ? new Date(pipelineData.completed_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : (task.completed_at || task.created_at ? new Date(task.completed_at || task.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown Date');
  
  const displayFiles = pipelineData?.task?.files || task.files || [];
  const steps = pipelineData?.steps || [];
  const isDocGenCompleted = steps.find(s => s.step_name === 'document_generation')?.status === 'completed' || task.status?.toLowerCase() === 'completed';
  
  // Extract summaries if available
  const sttStep = steps.find(s => s.step_name === 'stt');
  const matchingStep = steps.find(s => s.step_name === 'matching');
  const scoringStep = steps.find(s => s.step_name === 'scoring');


  // Removed full-page loading blocker so UI renders instantly with initial task data

  if (error) {
    return (
      <div className="history-details-container">
        <div className="history-details-header">
          <button className="back-btn" onClick={onBack}>
            <ArrowLeft size={18} />
            Back to History
          </button>
        </div>
        <div style={{ padding: '2rem', color: '#c62828', backgroundColor: '#ffebee', borderRadius: '0.5rem', margin: '2rem' }}>
          Error loading details: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="history-details-container">
      <div className="history-details-header">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={18} />
          Back to History
        </button>
        <div className="task-header-info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>{task.name || 'Untitled Task'}</h1>
            <div className="task-meta">
              <span className="task-id">ID: #{task.id ? task.id.toString().substring(0, 8) : '0248'}</span>
              <span className="task-date">Completed on {displayDate}</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                className="view-btn" 
                style={{ backgroundColor: '#f3f4f6', color: '#4b5563', border: '1px solid #d1d5db', padding: '10px 16px', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }} 
                onClick={handleReload}
                disabled={isReloading}
              >
                <RefreshCw size={16} className={isReloading ? "animate-spin" : ""} />
                Reload
              </button>
              {isDocGenCompleted && (
                <button className="view-btn" style={{ backgroundColor: '#5B44E9', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', fontWeight: '600', cursor: 'pointer' }} onClick={onWorkstation}>
                  Workstation
                </button>
              )}
            </div>
            {reloadError && (
              <div style={{ fontSize: '0.8rem', color: '#dc2626', backgroundColor: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '6px', padding: '6px 10px', maxWidth: '300px', textAlign: 'right', lineHeight: '1.4' }}>
                ⚠️ {reloadError}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="history-details-body">
        {/* Left Stepper */}
        <div className="history-stepper">
          {PIPELINE_STEPS.map((stepName, index) => {
            const actualStep = steps.find(s => s.step_name === stepName);
            const stepInfo = getStepInfo(stepName);
            
            const isStatusLoading = !pipelineData;
            const status = isStatusLoading ? 'loading' : (actualStep?.status || 'pending');
            
            const isCompleted = status === 'completed';
            const isProcessing = status === 'processing' || status === 'in_progress';
            const isFailed = status === 'failed';
            const isPending = status === 'pending';
            const isLoading = status === 'loading';
            
            let circleColor = '#e5e7eb'; // pending
            if (isCompleted) circleColor = '#22c55e';
            if (isProcessing) circleColor = '#3b82f6';
            if (isFailed) circleColor = '#ef4444';
            if (isLoading) circleColor = '#f3f4f6';
            
            let statusLabelColor = '#6b7280';
            let statusLabelBg = 'rgba(156, 163, 175, 0.1)';
            if (isCompleted) { statusLabelColor = '#16a34a'; statusLabelBg = 'rgba(34, 197, 94, 0.1)'; }
            if (isProcessing) { statusLabelColor = '#2563eb'; statusLabelBg = 'rgba(59, 130, 246, 0.1)'; }
            if (isFailed) { statusLabelColor = '#dc2626'; statusLabelBg = 'rgba(239, 68, 68, 0.1)'; }

            return (
              <div key={stepName} className={`history-step-item ${status}`}>
                <div className="step-marker">
                  <div className="step-circle" style={{ 
                    backgroundColor: circleColor,
                    color: (isCompleted || isProcessing || isFailed) ? 'white' : '#9ca3af'
                  }}>
                    {isCompleted && <CheckCircle size={16} />}
                    {isProcessing && <Loader2 size={16} className="animate-spin" />}
                    {isFailed && <XCircle size={16} />}
                    {isPending && <div style={{width: 8, height: 8, borderRadius: '50%', backgroundColor: '#9ca3af'}}></div>}
                    {isLoading && <Loader2 size={12} className="animate-spin" style={{ color: '#5B44E9' }} />}
                  </div>
                  {index < PIPELINE_STEPS.length - 1 && <div className={`step-line ${isCompleted ? 'completed-line' : ''}`} style={{ backgroundColor: isCompleted ? '#22c55e' : '#e5e7eb' }}></div>}
                </div>
                <div className="step-info" style={{ opacity: (isPending || isLoading) ? 0.6 : 1, width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h4 style={{ textTransform: 'capitalize', margin: 0 }}>{stepInfo.title}</h4>
                    {isLoading ? (
                      <div className="skeleton-bar short shimmer" style={{ height: '14px', width: '60px' }}></div>
                    ) : (
                      <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: statusLabelBg, color: statusLabelColor, textTransform: 'uppercase', fontWeight: 600 }}>
                        {status}
                      </span>
                    )}
                  </div>
                  {isLoading ? (
                    <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div className="skeleton-bar medium shimmer"></div>
                      <div className="skeleton-bar short shimmer"></div>
                    </div>
                  ) : (
                    <p>{stepInfo.description}</p>
                  )}
                  
                  {/* Additional Metadata Details per Step */}
                  {actualStep?.metadata_json && Object.keys(actualStep.metadata_json).length > 0 && (
                    <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#f9fafb', borderRadius: '6px', fontSize: '0.8rem', color: '#4b5563' }}>
                      {Object.entries(actualStep.metadata_json).map(([key, value]) => {
                        if (typeof value === 'object') return null; // Skip complex objects like status_breakdown
                        return (
                          <div key={key} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                            <span style={{ color: '#9ca3af', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}:</span>
                            <span style={{ fontWeight: 500 }}>{String(value)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Show error message if failed */}
                  {isFailed && actualStep?.error_message && (
                    <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#fef2f2', borderRadius: '6px', fontSize: '0.8rem', color: '#dc2626', border: '1px solid #fee2e2' }}>
                      {actualStep.error_message}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Content */}
        <div className="history-details-content">
          <div className="details-card">
            <h3>Processing Summary</h3>
            <div className="summary-grid">
              <div className="summary-item">
                <label>Audio Segments</label>
                {!pipelineData ? (
                  <div className="skeleton-value shimmer"></div>
                ) : (
                  <span>{sttStep?.metadata_json?.segments_count || 'N/A'}</span>
                )}
              </div>
              <div className="summary-item">
                <label>Quality Matches</label>
                {!pipelineData ? (
                  <div className="skeleton-value shimmer"></div>
                ) : (
                  <span>{matchingStep?.metadata_json?.quality_matches || 'N/A'}</span>
                )}
              </div>
              <div className="summary-item">
                <label>Confidence Score</label>
                {!pipelineData ? (
                  <div className="skeleton-value shimmer"></div>
                ) : (
                  <span>{scoringStep?.metadata_json?.overall_score ? `${(scoringStep.metadata_json.overall_score * 100).toFixed(1)}%` : 'N/A'}</span>
                )}
              </div>
              <div className="summary-item">
                <label>Avg Match Confidence</label>
                {!pipelineData ? (
                  <div className="skeleton-value shimmer"></div>
                ) : (
                  <span>{matchingStep?.metadata_json?.average_confidence ? `${matchingStep.metadata_json.average_confidence}%` : 'N/A'}</span>
                )}
              </div>
            </div>
          </div>

          <div className="details-card">
            <h3>Associated Files</h3>
            <div className="details-files">
              {displayFiles.map((file, index) => (
                <div key={file.id || index} className="details-file-item">
                  <div className="file-icon-wrapper">
                    <FileText size={20} />
                  </div>
                  <div className="file-info" style={{ flex: 1, minWidth: 0 }}>
                    <span className="file-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{file.file_name || file}</span>
                    {file.file_size && <span className="file-size">{(file.file_size / (1024 * 1024)).toFixed(2)} MB</span>}
                  </div>
                  {file.file_path && (
                    <button 
                      className="file-download-btn" 
                      title="Download File"
                      onClick={() => handleDownload(file)}
                    >
                      <Download size={16} />
                    </button>
                  )}
                </div>
              ))}
              {displayFiles.length === 0 && (
                <div style={{ color: '#9ca3af', fontSize: '0.9rem' }}>No files associated with this task.</div>
              )}
            </div>
          </div>

          <div className="details-card">
            <h3>Task Description</h3>
            <p className="description-text">{task.description || 'No description provided.'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
