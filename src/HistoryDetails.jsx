import React from 'react';
import './HistoryDetails.css';
import { CheckCircle, Clock, Database, RefreshCw, UserCheck, CheckCircle2, ArrowLeft, FileText, Download } from 'lucide-react';

const steps = [
  { title: "Audio processing", icon: <Clock size={20} />, description: "Speech-to-text and audio enhancement completed." },
  { title: "Raw data processing", icon: <Database size={20} />, description: "Data extraction and validation from source files." },
  { title: "Syncing", icon: <RefreshCw size={20} />, description: "Data synchronization across all distributed databases." },
  { title: "Human in the loop", icon: <UserCheck size={20} />, description: "Manual verification and quality assurance check." },
  { title: "Completed", icon: <CheckCircle2 size={20} />, description: "Task finalized and report generated successfully." }
];

export default function HistoryDetails({ task, onBack, onWorkstation }) {
  const displayDate = task.date || (task.created_at ? new Date(task.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown Date');
  const displayFiles = task.files || ['processed_transcript.txt', 'analysis_report.pdf'];

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
          <button className="view-btn" style={{ backgroundColor: '#5B44E9', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '10px', fontWeight: '600', cursor: 'pointer' }} onClick={onWorkstation}>Workstation</button>
        </div>
      </div>

      <div className="history-details-body">
        {/* Left Stepper */}
        <div className="history-stepper">
          {steps.map((step, index) => (
            <div key={index} className="history-step-item completed">
              <div className="step-marker">
                <div className="step-circle">
                  <CheckCircle size={16} />
                </div>
                {index < steps.length - 1 && <div className="step-line"></div>}
              </div>
              <div className="step-info">
                <h4>{step.title}</h4>
                <p>{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Right Content */}
        <div className="history-details-content">
          <div className="details-card">
            <h3>Processing Summary</h3>
            <div className="summary-grid">
              <div className="summary-item">
                <label>Total Audio Length</label>
                <span>42:15 mins</span>
              </div>
              <div className="summary-item">
                <label>Data Points Extracted</label>
                <span>1,284 items</span>
              </div>
              <div className="summary-item">
                <label>Sync Accuracy</label>
                <span>99.9%</span>
              </div>
              <div className="summary-item">
                <label>Verifier</label>
                <span>Sarah Johnson</span>
              </div>
            </div>
          </div>

          <div className="details-card">
            <h3>Associated Files</h3>
            <div className="details-files">
              {displayFiles.map((file, index) => (
                <div key={index} className="details-file-item">
                  <div className="file-icon-wrapper">
                    <FileText size={20} />
                  </div>
                  <div className="file-info">
                    <span className="file-name">{file}</span>
                    <span className="file-size">{(Math.random() * 5 + 1).toFixed(1)} MB</span>
                  </div>
                  <button className="file-download-btn">
                    <Download size={16} />
                  </button>
                </div>
              ))}
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
