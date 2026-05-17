import React, { useState } from 'react';
import './NewTask.css';
import { Mic, FileText, ArrowLeft } from 'lucide-react';

export default function NewTask({ onCancel }) {
  const [currentStep, setCurrentStep] = useState(1);

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, 4));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  return (
    <div className="new-task-container">
      <div className="back-button-container" style={{ marginBottom: '16px' }}>
        <button className="back-btn" onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', color: '#6B7280', fontSize: '0.9rem', fontWeight: '500', cursor: 'pointer', padding: '0' }}>
          <ArrowLeft size={18} />
          Back
        </button>
      </div>
      <div className="new-task-body">
        {/* Left Sidebar Stepper */}
        <div className="new-task-stepper">
          <div className={`step-item ${currentStep === 1 ? 'active' : currentStep > 1 ? 'completed' : ''}`}>
            <div className="step-circle">{currentStep > 1 ? '✓' : '1'}</div>
            <div className="step-content">
              <h4>Upload File</h4>
              <p>Upload files in JPG and PNG format</p>
            </div>
            <div className="step-line"></div>
          </div>
          <div className={`step-item ${currentStep === 2 ? 'active' : currentStep > 2 ? 'completed' : ''}`}>
            <div className="step-circle">{currentStep > 2 ? '✓' : '2'}</div>
            <div className="step-content">
              <h4>Caption</h4>
              <p>Write a description about this uploaded photo</p>
            </div>
            <div className="step-line"></div>
          </div>
          <div className={`step-item ${currentStep === 3 ? 'active' : currentStep > 3 ? 'completed' : ''}`}>
            <div className="step-circle">{currentStep > 3 ? '✓' : '3'}</div>
            <div className="step-content">
              <h4>Tags</h4>
              <p>Put work-related tags to be seen more</p>
            </div>
            <div className="step-line"></div>
          </div>
          <div className={`step-item ${currentStep === 4 ? 'active' : ''}`}>
            <div className="step-circle">4</div>
            <div className="step-content">
              <h4>Overview</h4>
              <p>Finally, do a final check and publish your post</p>
            </div>
          </div>
        </div>

        {/* Right Content Form */}
        <div className="new-task-form">
          {currentStep === 1 && (
            <>
              <div className="upload-sections">
                <div className="upload-group">
                  <h4 className="form-section-title">Upload Audio</h4>
                  <div className="upload-dropzone compact">
                    <div className="dropzone-content">
                      <Mic size={24} color="#1D4ED8" />
                      <span>Upload Audio</span>
                      <span className="tiny-text">MP3, WAV, M4A</span>
                    </div>
                  </div>
                </div>
                
                <div className="upload-group">
                  <h4 className="form-section-title">Raw Data Doc</h4>
                  <div className="upload-dropzone compact">
                    <div className="dropzone-content">
                      <FileText size={24} color="#1D4ED8" />
                      <span>Upload Data</span>
                      <span className="tiny-text">CSV, JSON, XLSX</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="thumbnails-row">
                <div className="thumbnail mock-doc"></div>
                <div className="thumbnail mock-doc"></div>
                <div className="thumbnail mock-doc"></div>
                <div className="thumbnail mock-doc"></div>
                <div className="thumbnail mock-doc"></div>
              </div>
            </>
          )}

          {currentStep === 2 && (
            <div className="step-2-form">
              <h4 className="form-section-title">Task Details</h4>
              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label>Task Name</label>
                <input type="text" placeholder="e.g. Sales Analysis Q2" style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #D1D5DB' }} />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea 
                  placeholder="Provide a detailed description of the task..." 
                  style={{ width: '100%', height: '150px', padding: '12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontFamily: 'inherit', resize: 'none' }}
                />
              </div>
            </div>
          )}

          <div className="form-actions" style={{ marginTop: '40px' }}>
            <button className="btn-cancel" onClick={currentStep > 1 ? prevStep : onCancel}>
              {currentStep > 1 ? 'Back' : 'Cancel'}
            </button>
            <button className="btn-next" onClick={nextStep}>
              {currentStep === 4 ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
