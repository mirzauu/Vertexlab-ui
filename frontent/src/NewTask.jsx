import React, { useState, useRef } from 'react';
import './NewTask.css';
import { 
  Mic, FileText, ArrowLeft, UploadCloud, CheckCircle2, 
  AlertCircle, Loader2, Plus, X, Tag, Sparkles, FolderOpen 
} from 'lucide-react';
import { api } from './services/api';

export default function NewTask({ onCancel, onTaskCreated }) {
  const [currentStep, setCurrentStep] = useState(1);
  
  // Files State
  const [audioFile, setAudioFile] = useState(null);
  const [docFiles, setDocFiles] = useState([]);
  
  // Details State
  const [taskName, setTaskName] = useState('');
  const [description, setDescription] = useState('');
  
  // Tags State
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState([]);

  // Pipeline execution & lifecycle state
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiStep, setApiStep] = useState(0); // 1: task, 2: audio, 3: docs, 4: pipeline
  const [errorMessage, setErrorMessage] = useState(null);
  const [createdTaskData, setCreatedTaskData] = useState(null);

  // Hidden File Inputs Refs
  const audioInputRef = useRef(null);
  const docInputRef = useRef(null);

  const triggerAudioSelect = () => {
    if (audioInputRef.current) audioInputRef.current.click();
  };

  const triggerDocSelect = () => {
    if (docInputRef.current) docInputRef.current.click();
  };

  const PRESET_TAGS = [
    'Finance', 'Q3', 'Meeting', 'Medical', 'Legal', 
    'Sales', 'Customer Success', 'Interview', 'Clinical', 'Board Review'
  ];

  const handleAudioChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAudioFile(file);
    }
  };

  const handleDocChange = (e) => {
    const selected = Array.from(e.target.files);
    if (selected.length > 0) {
      setDocFiles(prev => [...prev, ...selected]);
    }
  };

  const removeAudioFile = () => {
    setAudioFile(null);
    if (audioInputRef.current) audioInputRef.current.value = '';
  };

  const removeDocFile = (indexToRemove) => {
    setDocFiles(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleAddTag = (e) => {
    if (e && e.key !== 'Enter') return;
    if (e) e.preventDefault();
    const cleanTag = tagInput.trim();
    if (cleanTag && !tags.includes(cleanTag)) {
      setTags(prev => [...prev, cleanTag]);
      setTagInput('');
    }
  };

  const togglePresetTag = (preset) => {
    if (tags.includes(preset)) {
      setTags(prev => prev.filter(t => t !== preset));
    } else {
      setTags(prev => [...prev, preset]);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const dm = 2;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // The actual sequential API call chain
  const handleLaunchPipeline = async () => {
    const orgId = localStorage.getItem('organization_id');
    const token = localStorage.getItem('bearer_token');

    if (!orgId || !token) {
      setErrorMessage('Authentication credentials or organization ID not found. Please log in.');
      return;
    }

    if (!taskName.trim()) {
      setErrorMessage('Task Name is required.');
      setCurrentStep(2);
      return;
    }

    if (!audioFile) {
      setErrorMessage('An audio file is required to run the transcription pipeline.');
      setCurrentStep(1);
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    let taskId = null;
    let taskObj = null;

    try {
      // ── Step 1: Initialize Task Container ───────────────────────────────
      setApiStep(1);
      const containerRes = await api(`/api/v1/organizations/${orgId}/tasks/`, {
        method: 'POST',
        body: JSON.stringify({
          name: taskName.trim(),
          description: description.trim(),
          tags: tags
        })
      });

      if (!containerRes.ok) {
        throw new Error(`Failed to initialize task: ${containerRes.statusText}`);
      }
      taskObj = await containerRes.json();
      taskId = taskObj.id;

      // ── Step 2: Upload Audio Recording ─────────────────────────────────
      setApiStep(2);
      const audioFormData = new FormData();
      audioFormData.append('file', audioFile);

      const audioUploadRes = await api(`/api/v1/organizations/${orgId}/tasks/${taskId}/files`, {
        method: 'POST',
        body: audioFormData
      });

      if (!audioUploadRes.ok) {
        throw new Error(`Failed to upload audio: ${audioUploadRes.statusText}`);
      }

      // ── Step 3: Upload Supporting Documents (Optional) ──────────────────
      if (docFiles.length > 0) {
        setApiStep(3);
        for (const doc of docFiles) {
          const docFormData = new FormData();
          docFormData.append('file', doc);

          const docUploadRes = await api(`/api/v1/organizations/${orgId}/tasks/${taskId}/documents`, {
            method: 'POST',
            body: docFormData
          });

          if (!docUploadRes.ok) {
            throw new Error(`Failed to upload reference document "${doc.name}": ${docUploadRes.statusText}`);
          }
        }
      }

      // ── Step 4: Run AI Pipeline ────────────────────────────────────────
      setApiStep(4);
      const runPipelineRes = await api(`/api/v1/organizations/${orgId}/tasks/${taskId}/pipeline/run`, {
        method: 'POST'
      });

      if (!runPipelineRes.ok) {
        throw new Error(`Failed to trigger pipeline execution: ${runPipelineRes.statusText}`);
      }

      // Successful completion
      setApiStep(5);
      setCreatedTaskData(taskObj);

    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || 'An unexpected error occurred during pipeline initialization.');
      setIsProcessing(false);
    }
  };

  const nextStep = () => {
    if (currentStep === 1) {
      if (!audioFile) {
        setErrorMessage('Please select a valid speech audio file to transcribe.');
        return;
      }
      setErrorMessage(null);
    }
    if (currentStep === 2) {
      if (!taskName.trim()) {
        setErrorMessage('Please provide a name for this task.');
        return;
      }
      setErrorMessage(null);
    }
    setCurrentStep(prev => Math.min(prev + 1, 4));
  };
  
  const prevStep = () => {
    setErrorMessage(null);
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  return (
    <div className="new-task-container">
      <div className="back-button-container" style={{ marginBottom: '20px' }}>
        <button className="back-btn" onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', color: '#6B7280', fontSize: '0.9rem', fontWeight: '500', cursor: 'pointer', padding: '0' }}>
          <ArrowLeft size={18} />
          Back to History
        </button>
      </div>

      <div className="new-task-body">
        {/* Left Sidebar Stepper */}
        <div className="new-task-stepper">
          <div className={`step-item ${currentStep === 1 ? 'active' : currentStep > 1 ? 'completed' : ''}`}>
            <div className="step-circle">{currentStep > 1 ? '✓' : '1'}</div>
            <div className="step-content">
              <h4>Audio & References</h4>
              <p>Upload meeting speech & raw sheets</p>
            </div>
            <div className="step-line"></div>
          </div>
          <div className={`step-item ${currentStep === 2 ? 'active' : currentStep > 2 ? 'completed' : ''}`}>
            <div className="step-circle">{currentStep > 2 ? '✓' : '2'}</div>
            <div className="step-content">
              <h4>Task Details</h4>
              <p>Enter task name and description</p>
            </div>
            <div className="step-line"></div>
          </div>
          <div className={`step-item ${currentStep === 3 ? 'active' : currentStep > 3 ? 'completed' : ''}`}>
            <div className="step-circle">{currentStep > 3 ? '✓' : '3'}</div>
            <div className="step-content">
              <h4>Category Tags</h4>
              <p>Add labels to structure reports</p>
            </div>
            <div className="step-line"></div>
          </div>
          <div className={`step-item ${currentStep === 4 ? 'active' : ''}`}>
            <div className="step-circle">4</div>
            <div className="step-content">
              <h4>Launch Review</h4>
              <p>Verify pipeline items and process</p>
            </div>
          </div>
        </div>

        {/* Right Content Form */}
        <div className="new-task-form">
          {errorMessage && !isProcessing && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '14px',
              color: '#dc2626',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '12px',
              marginBottom: '24px',
              fontSize: '0.9rem'
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </div>
          )}

          {isProcessing ? (
            /* SLEEK REAL-TIME API PIPELINE PROGRESS VIEW */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-dark)', marginBottom: '8px' }}>
                  {apiStep === 5 ? "Task Ready!" : "Handing over to AI..."}
                </h3>
                <p style={{ color: '#6B7280', fontSize: '0.9rem' }}>
                  {apiStep === 5 
                    ? "The background intelligence pipeline has been triggered successfully." 
                    : "Connecting to Verbalex API and processing speech audio data..."
                  }
                </p>
              </div>

              {/* Progress Checklist */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', backgroundColor: '#f9fafb', padding: '24px', borderRadius: '16px', border: '1px solid #f3f4f6' }}>
                
                {/* Stage 1: Container Creation */}
                <div style={{ display: 'flex', gap: '16px', opacity: apiStep >= 1 ? 1 : 0.4 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ 
                      width: '24px', height: '24px', borderRadius: '50%', 
                      backgroundColor: apiStep > 1 ? '#22c55e' : apiStep === 1 ? '#5B44E9' : '#e5e7eb',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white'
                    }}>
                      {apiStep > 1 ? "✓" : apiStep === 1 ? <Loader2 size={12} className="animate-spin" /> : "1"}
                    </div>
                  </div>
                  <div>
                    <h5 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-dark)' }}>📝 Initializing Task Container</h5>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#6B7280' }}>Creates task shell metadata and category tag scope.</p>
                  </div>
                </div>

                {/* Stage 2: Audio Upload & Diarization */}
                <div style={{ display: 'flex', gap: '16px', opacity: apiStep >= 2 ? 1 : 0.4 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ 
                      width: '24px', height: '24px', borderRadius: '50%', 
                      backgroundColor: apiStep > 2 ? '#22c55e' : apiStep === 2 ? '#5B44E9' : '#e5e7eb',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white'
                    }}>
                      {apiStep > 2 ? "✓" : apiStep === 2 ? <Loader2 size={12} className="animate-spin" /> : "2"}
                    </div>
                  </div>
                  <div>
                    <h5 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-dark)' }}>🎙️ Uploading & Transcribing Audio</h5>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#6B7280' }}>
                      {apiStep === 2 
                        ? "Uploading speech stream & running Deepgram Nova-3 speaker diarization (can take 20-30s)..." 
                        : "Uploads audio file & diarizes speakers to establish baseline transcript."
                      }
                    </p>
                  </div>
                </div>

                {/* Stage 3: Supporting Documents */}
                <div style={{ display: 'flex', gap: '16px', opacity: apiStep >= 3 ? 1 : 0.4 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ 
                      width: '24px', height: '24px', borderRadius: '50%', 
                      backgroundColor: apiStep > 3 ? '#22c55e' : apiStep === 3 ? '#5B44E9' : '#e5e7eb',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white'
                    }}>
                      {apiStep > 3 ? "✓" : apiStep === 3 ? <Loader2 size={12} className="animate-spin" /> : "3"}
                    </div>
                  </div>
                  <div>
                    <h5 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-dark)' }}>📄 Uploading Supporting References</h5>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#6B7280' }}>
                      {docFiles.length === 0 
                        ? "Skipped (no supporting documents added)." 
                        : `Uploading ${docFiles.length} supporting reference document(s) to augment intelligence.`
                      }
                    </p>
                  </div>
                </div>

                {/* Stage 4: Run AI Pipeline */}
                <div style={{ display: 'flex', gap: '16px', opacity: apiStep >= 4 ? 1 : 0.4 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ 
                      width: '24px', height: '24px', borderRadius: '50%', 
                      backgroundColor: apiStep > 4 ? '#22c55e' : apiStep === 4 ? '#5B44E9' : '#e5e7eb',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white'
                    }}>
                      {apiStep > 4 ? "✓" : apiStep === 4 ? <Loader2 size={12} className="animate-spin" /> : "4"}
                    </div>
                  </div>
                  <div>
                    <h5 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-dark)' }}>⚡ Activating background AI pipeline</h5>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#6B7280' }}>Triggers 7-step analysis flow (embedding chunks, matching evidence, drafting document).</p>
                  </div>
                </div>

              </div>

              {/* Action Buttons for Processing View */}
              {apiStep === 5 && (
                <div style={{ textAlign: 'center', marginTop: '20px' }}>
                  <CheckCircle2 size={48} color="#22c55e" style={{ margin: '0 auto 16px auto' }} />
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-dark)', marginBottom: '8px' }}>Pipeline Launched!</h4>
                  <p style={{ fontSize: '0.875rem', color: '#6B7280', marginBottom: '24px' }}>Your report is now being assembled in the background.</p>
                  <button 
                    className="btn-next" 
                    style={{ width: '100%', padding: '14px' }}
                    onClick={() => {
                      if (onTaskCreated && createdTaskData) {
                        onTaskCreated(createdTaskData);
                      } else {
                        onCancel();
                      }
                    }}
                  >
                    Open Live Stepper Status
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* MULTI-STEP CREATION FORM */
            <>
              {/* STEP 1: UPLOAD FILES */}
              {currentStep === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-dark)', marginBottom: '8px' }}>Upload Files</h3>
                    <p style={{ color: '#6B7280', fontSize: '0.9rem' }}>Attach the speech audio and any reference slides or guidelines.</p>
                  </div>

                  <div className="upload-sections">
                    {/* Audio Upload Area */}
                    <div className="upload-group">
                      <h4 className="form-section-title">Upload Audio Recording</h4>
                      <input 
                        type="file" 
                        ref={audioInputRef} 
                        style={{ display: 'none' }} 
                        accept=".mp3,.wav,.m4a,.ogg,.flac" 
                        onChange={handleAudioChange} 
                      />
                      {!audioFile ? (
                        <div className="upload-dropzone compact" onClick={triggerAudioSelect}>
                          <div className="dropzone-content">
                            <Mic size={28} color="#5B44E9" />
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-dark)' }}>Select Speech Audio</span>
                            <span className="tiny-text">MP3, WAV, M4A, FLAC</span>
                          </div>
                        </div>
                      ) : (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '16px',
                          border: '1.5px solid #e5e7eb',
                          borderRadius: '12px',
                          backgroundColor: '#f9fafb'
                        }}>
                          <div style={{
                            width: '36px', height: '36px', borderRadius: '8px', 
                            backgroundColor: '#EEF2FF', display: 'flex', 
                            alignItems: 'center', justifyContent: 'center', color: '#5B44E9'
                          }}>
                            <Mic size={18} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dark)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {audioFile.name}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>{formatFileSize(audioFile.size)}</span>
                          </div>
                          <button 
                            onClick={removeAudioFile}
                            style={{ background: 'transparent', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: '4px' }}
                          >
                            <X size={18} />
                          </button>
                        </div>
                      )}
                    </div>
                    
                    {/* Supporting Documents Upload Area */}
                    <div className="upload-group">
                      <h4 className="form-section-title">Raw Data Reference Doc</h4>
                      <input 
                        type="file" 
                        ref={docInputRef} 
                        style={{ display: 'none' }} 
                        accept=".pdf,.txt,.docx,.csv,.xlsx" 
                        multiple
                        onChange={handleDocChange} 
                      />
                      <div className="upload-dropzone compact" onClick={triggerDocSelect}>
                        <div className="dropzone-content">
                          <FileText size={28} color="#5B44E9" />
                          <span style={{ fontSize: '0.9rem', color: 'var(--text-dark)' }}>Add Support Docs</span>
                          <span className="tiny-text">PDF, TXT, DOCX, CSV, XLSX</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Supporting Files List */}
                  {docFiles.length > 0 && (
                    <div>
                      <h4 className="form-section-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FolderOpen size={16} /> Attached Reference Sheets ({docFiles.length})
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {docFiles.map((doc, idx) => (
                          <div key={idx} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '10px 14px',
                            border: '1px solid #f3f4f6',
                            borderRadius: '8px',
                            backgroundColor: 'white'
                          }}>
                            <FileText size={16} color="#6B7280" />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-dark)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {doc.name}
                              </span>
                            </div>
                            <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>{formatFileSize(doc.size)}</span>
                            <button 
                              onClick={() => removeDocFile(idx)}
                              style={{ background: 'transparent', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: '2px' }}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: TASK DETAILS */}
              {currentStep === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-dark)', marginBottom: '8px' }}>Task Details</h3>
                    <p style={{ color: '#6B7280', fontSize: '0.9rem' }}>Give your report-generation task a clean identifier name.</p>
                  </div>

                  <div className="step-2-form">
                    <div className="form-group" style={{ marginBottom: '24px' }}>
                      <label>Task Name</label>
                      <input 
                        type="text" 
                        value={taskName}
                        onChange={(e) => setTaskName(e.target.value)}
                        placeholder="e.g. Q3 Sales Sync and Strategy Alignment" 
                        style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #D1D5DB' }} 
                      />
                    </div>
                    <div className="form-group">
                      <label>Description / Notes</label>
                      <textarea 
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Provide background context, goals, or summary constraints for the AI report generation..." 
                        style={{ width: '100%', height: '140px', padding: '12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontFamily: 'inherit', resize: 'none', outline: 'none' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: CATEGORY TAGS */}
              {currentStep === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-dark)', marginBottom: '8px' }}>Category Tags</h3>
                    <p style={{ color: '#6B7280', fontSize: '0.9rem' }}>Scope your document and classify reports by adding category metadata tags.</p>
                  </div>

                  {/* Dynamic Tags Input */}
                  <div className="form-group">
                    <label>Add Custom Tag</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input 
                        type="text" 
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={handleAddTag}
                        placeholder="e.g. Boardroom, Diagnostics" 
                        style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #D1D5DB' }} 
                      />
                      <button 
                        onClick={handleAddTag}
                        style={{ 
                          backgroundColor: '#5B44E9', color: 'white', 
                          border: 'none', padding: '0 20px', borderRadius: '8px', 
                          fontWeight: '600', cursor: 'pointer', display: 'flex', 
                          alignItems: 'center', gap: '4px' 
                        }}
                      >
                        <Plus size={16} /> Add
                      </button>
                    </div>
                  </div>

                  {/* Selected Tags Display */}
                  {tags.length > 0 && (
                    <div>
                      <h4 className="form-section-title" style={{ fontSize: '0.85rem', color: '#6B7280' }}>Selected Labels</h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {tags.map(tag => (
                          <div 
                            key={tag}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '6px',
                              backgroundColor: '#EEF2FF', color: '#5B44E9',
                              padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem',
                              fontWeight: 600, border: '1px solid #C7D2FE'
                            }}
                          >
                            <Tag size={12} />
                            <span>{tag}</span>
                            <button 
                              onClick={() => togglePresetTag(tag)}
                              style={{ background: 'transparent', border: 'none', color: '#5B44E9', cursor: 'pointer', padding: 0 }}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Preset Tags Suggestions */}
                  <div>
                    <h4 className="form-section-title" style={{ fontSize: '0.85rem', color: '#6B7280', marginBottom: '10px' }}>Suggestions</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {PRESET_TAGS.map(preset => {
                        const active = tags.includes(preset);
                        return (
                          <button
                            key={preset}
                            onClick={() => togglePresetTag(preset)}
                            style={{
                              border: active ? '1px solid #5B44E9' : '1px solid #e5e7eb',
                              backgroundColor: active ? '#EEF2FF' : 'white',
                              color: active ? '#5B44E9' : '#4B5563',
                              padding: '8px 14px', borderRadius: '12px', fontSize: '0.8rem',
                              fontWeight: active ? 600 : 500, cursor: 'pointer', transition: 'all 0.2s'
                            }}
                          >
                            {preset}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: OVERVIEW & LAUNCH */}
              {currentStep === 4 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-dark)', marginBottom: '8px' }}>Launch Verification</h3>
                    <p style={{ color: '#6B7280', fontSize: '0.9rem' }}>Please verify the pipeline parameters below before triggering the AI flow.</p>
                  </div>

                  {/* Overview Cards */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {/* Details Summary */}
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px', backgroundColor: 'white' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #f3f4f6', paddingBottom: '10px', marginBottom: '10px' }}>
                        <Sparkles size={16} color="#5B44E9" />
                        <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-dark)' }}>Report Metadata</h4>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>Task Name:</span>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dark)' }}>{taskName}</span>
                        </div>
                        {description && (
                          <div style={{ display: 'flex', flexDirection: 'column', marginTop: '4px' }}>
                            <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>Description:</span>
                            <span style={{ fontSize: '0.8rem', color: '#4B5563', backgroundColor: '#f9fafb', padding: '8px', borderRadius: '6px', marginTop: '4px', lineHeight: 1.4 }}>
                              {description}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Speech Audio Details */}
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px', backgroundColor: 'white' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #f3f4f6', paddingBottom: '10px', marginBottom: '10px' }}>
                        <Mic size={16} color="#5B44E9" />
                        <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-dark)' }}>Speech Audio Stream</h4>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>
                          {audioFile?.name}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>{formatFileSize(audioFile?.size)}</span>
                      </div>
                    </div>

                    {/* Support Documents Count */}
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px', backgroundColor: 'white' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #f3f4f6', paddingBottom: '10px', marginBottom: '10px' }}>
                        <FileText size={16} color="#5B44E9" />
                        <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-dark)' }}>Reference Documents</h4>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', color: '#4B5563' }}>Attached Sheets:</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dark)' }}>{docFiles.length} doc(s)</span>
                      </div>
                      {docFiles.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                          {docFiles.map(d => (
                            <div key={d.name} style={{ fontSize: '0.75rem', color: '#6B7280', backgroundColor: '#f3f4f6', padding: '4px 8px', borderRadius: '4px' }}>
                              {d.name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Category Tags Count */}
                    {tags.length > 0 && (
                      <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px', backgroundColor: 'white' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #f3f4f6', paddingBottom: '10px', marginBottom: '10px' }}>
                          <Tag size={16} color="#5B44E9" />
                          <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-dark)' }}>Category Scopes</h4>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {tags.map(t => (
                            <span key={t} style={{ fontSize: '0.75rem', fontWeight: 600, color: '#5B44E9', backgroundColor: '#EEF2FF', padding: '4px 10px', borderRadius: '20px' }}>
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              )}

              {/* Navigation Actions */}
              <div className="form-actions" style={{ marginTop: '40px' }}>
                <button className="btn-cancel" onClick={currentStep > 1 ? prevStep : onCancel}>
                  {currentStep > 1 ? 'Back' : 'Cancel'}
                </button>
                <button 
                  className="btn-next" 
                  onClick={currentStep === 4 ? handleLaunchPipeline : nextStep}
                  style={{ backgroundColor: currentStep === 4 ? '#22c55e' : '#5B44E9' }}
                >
                  {currentStep === 4 ? 'Launch Pipeline' : 'Next Step'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
