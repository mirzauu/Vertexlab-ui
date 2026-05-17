import React from 'react';
import './ReviewEdit.css';
import { Play, Pause, SkipBack, SkipForward, Save, Send, ArrowLeft } from 'lucide-react';

export default function ReviewEdit({ onBack }) {
  return (
    <div className="review-container">
      <div className="back-button-container" style={{ marginBottom: '32px' }}>
        <button className="back-btn" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', color: '#6B7280', fontSize: '0.9rem', fontWeight: '500', cursor: 'pointer', padding: '0' }}>
          <ArrowLeft size={18} />
          Back
        </button>
      </div>
      <div className="review-content">
        {/* Left Side: Sources */}
        <div className="review-left">
          <div className="review-card audio-player">
            <h3>Audio File</h3>
            <div className="player-controls">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: '45%' }}></div>
              </div>
              <div className="controls-row">
                <span className="time">12:34</span>
                <div className="main-btns">
                  <SkipBack size={20} />
                  <div className="play-btn"><Play size={24} fill="currentColor" /></div>
                  <SkipForward size={20} />
                </div>
                <span className="time">28:50</span>
              </div>
            </div>
          </div>

          <div className="review-card transcript-section">
            <h3>Transcribe</h3>
            <div className="scroll-content">
              <p><span>[00:00]</span> Speaker 1: Welcome everyone to the quarterly sales analysis meeting.</p>
              <p><span>[00:15]</span> Speaker 2: Thank you. I've prepared the raw data for the Q2 performance.</p>
              <p><span>[00:45]</span> Speaker 1: Excellent. Let's look at the growth in the North American region first.</p>
              <p><span>[01:10]</span> Speaker 2: We saw a 12% increase compared to last year, primarily driven by our new SaaS offering.</p>
              <p><span>[01:45]</span> Speaker 1: That's consistent with what the AI analysis suggested earlier this week.</p>
              <p><span>[02:10]</span> Speaker 2: Right. I think we should also mention the churn rate improvement.</p>
            </div>
          </div>

          <div className="review-card raw-data-section">
            <h3>Raw Data</h3>
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Q1</th>
                    <th>Q2</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Revenue</td>
                    <td>$4.2M</td>
                    <td>$4.8M</td>
                  </tr>
                  <tr>
                    <td>New Users</td>
                    <td>12,400</td>
                    <td>15,600</td>
                  </tr>
                  <tr>
                    <td>Churn Rate</td>
                    <td>3.2%</td>
                    <td>2.8%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Side: AI Document */}
        <div className="review-right">
          <div className="ai-document">
            <div className="doc-header">
              <h3>AI Generated Document</h3>
              <div className="doc-badge">AI DRAFT</div>
            </div>
            <div className="doc-editor">
              <h2 contentEditable="true">Quarterly Sales Analysis Report - Q2 2026</h2>
              <p contentEditable="true"><strong>Executive Summary:</strong> The second quarter of 2026 has shown remarkable growth across all primary sectors. Revenue increased by 14% quarter-over-quarter, exceeding initial projections by 4%.</p>
              <p contentEditable="true"><strong>Regional Performance:</strong> North America remains our strongest market, contributing to 45% of total revenue. The introduction of the 'VerbaLex AI' module has significantly improved user retention in this region.</p>
              <p contentEditable="true"><strong>Key Insights:</strong></p>
              <ul contentEditable="true">
                <li>SaaS subscriptions grew by 22% following the April update.</li>
                <li>Customer churn decreased to an all-time low of 2.8%.</li>
                <li>Enterprise deals closed 15% faster compared to Q1.</li>
              </ul>
              <p contentEditable="true"><strong>Recommendations:</strong> It is recommended to double down on the AI integration features and expand the marketing budget for the European region in Q3.</p>
              <p contentEditable="true">Additional data points suggest a strong Q3 start.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
