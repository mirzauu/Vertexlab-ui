import React, { useState, useRef, useEffect } from 'react';
import './NewTask.css';
import { 
  Mic, FileText, ArrowLeft, UploadCloud, CheckCircle2, 
  AlertCircle, Loader2, Plus, X, Tag, Sparkles, FolderOpen, Maximize2 
} from 'lucide-react';
import { api } from './services/api';

function PdfThumbnail({ pdfDoc, pageNum, onSelect, isSelected, isBeforeSelected, isAfterSelected }) {
  const canvasRef = useRef(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (!active) return;
        
        const viewport = page.getViewport({ scale: 0.35 });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        const renderContext = {
          canvasContext: context,
          viewport: viewport
        };
        await page.render(renderContext).promise;
        if (active) setLoading(false);
      } catch (err) {
        console.error("Error rendering PDF thumbnail:", err);
      }
    };

    renderPage();
    return () => {
      active = false;
    };
  }, [pdfDoc, pageNum]);

  return (
    <div 
      className={`pdf-page-card ${isSelected ? 'selected' : ''} ${isBeforeSelected ? 'cover-sec' : ''} ${isAfterSelected ? 'exam-sec' : ''}`}
      onClick={() => onSelect(pageNum)}
      style={{
        border: isSelected ? '2.5px solid #5B44E9' : '1px solid #e5e7eb',
        borderRadius: '10px',
        overflow: 'hidden',
        cursor: 'pointer',
        backgroundColor: 'white',
        transition: 'all 0.2s ease-in-out',
        boxShadow: isSelected ? '0 0 0 4px rgba(91, 68, 233, 0.25)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative'
      }}
      onMouseOver={(e) => {
        if (!isSelected) e.currentTarget.style.borderColor = '#5B44E9';
      }}
      onMouseOut={(e) => {
        if (!isSelected) e.currentTarget.style.borderColor = '#e5e7eb';
      }}
    >
      <div style={{
        padding: '6px 10px',
        borderBottom: '1px solid #f3f4f6',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: isSelected ? '#EEF2FF' : '#f9fafb'
      }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Page {pageNum}</span>
        {isSelected && (
          <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#5B44E9', color: 'white', fontWeight: 'bold' }}>
            Starts Here
          </span>
        )}
        {isBeforeSelected && (
          <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#f3f4f6', color: '#6b7280', fontWeight: '500' }}>
            Cover
          </span>
        )}
        {isAfterSelected && (
          <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#EEF2FF', color: '#5B44E9', fontWeight: '500' }}>
            Exam
          </span>
        )}
      </div>
      <div className="canvas-container" style={{ flex: 1, position: 'relative', minHeight: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb', padding: '6px' }}>
        {loading && (
          <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Rendering...</div>
        )}
        <canvas ref={canvasRef} style={{ display: loading ? 'none' : 'block', width: '100%', height: 'auto', borderRadius: '4px' }} />
      </div>
    </div>
  );
}


export default function NewTask({ onCancel, onTaskCreated }) {
  const [currentStep, setCurrentStep] = useState(1);
  
  // Files State
  const [audioFile, setAudioFile] = useState(null);
  const [docFiles, setDocFiles] = useState([]);
  
  // Details State
  const [taskName, setTaskName] = useState('');
  const [description, setDescription] = useState('');
  
  // PDF manual split state
  const [pdfDocument, setPdfDocument] = useState(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [examStartPage, setExamStartPage] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pagesPerPage = 30;
  const [showFullViewModal, setShowFullViewModal] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);



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

  useEffect(() => {
    if (currentStep === 3) {
      const firstPdf = docFiles.find(f => f.name.toLowerCase().endsWith('.pdf'));
      if (firstPdf) {
        setLoadingPdf(true);
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
        
        const fileReader = new FileReader();
        fileReader.onload = async function() {
          try {
            const typedarray = new Uint8Array(this.result);
            const pdf = await window.pdfjsLib.getDocument({ data: typedarray }).promise;
            setPdfDocument(pdf);
          } catch (err) {
            console.error("Failed to load PDF document:", err);
          } finally {
            setLoadingPdf(false);
          }
        };
        fileReader.readAsArrayBuffer(firstPdf);
      } else {
        setPdfDocument(null);
      }
    }
  }, [currentStep, docFiles]);

  const togglePresetTag = (preset) => {
    // Deprecated tag toggle helper
  };

  const handleOpenFullView = () => {
    const firstPdf = docFiles.find(f => f.name.toLowerCase().endsWith('.pdf'));
    if (firstPdf) {
      const url = URL.createObjectURL(firstPdf);
      setPdfUrl(url);
      setShowFullViewModal(true);
    }
  };

  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);


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
          tags: []
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

          const isPdf = doc.name.toLowerCase().endsWith('.pdf');
          let uploadUrl = `/api/v1/organizations/${orgId}/tasks/${taskId}/documents`;
          if (isPdf && examStartPage) {
            uploadUrl += `?examination_start_page=${examStartPage}`;
          }

          const docUploadRes = await api(uploadUrl, {
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
              <h4>Examination Start</h4>
              <p>Select examination start page</p>
            </div>
            <div className="step-line"></div>
          </div>
          <div className={`step-item ${currentStep === 4 ? 'active' : ''}`}>
            <div className="step-circle">4</div>
            <div className="step-content">
              <h4>Start AI Scoping</h4>
              <p>Verify items and analyze with AI</p>
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
                  {apiStep === 5 ? "Task Scope Ready!" : "Handing over to AI..."}
                </h3>
                <p style={{ color: 'var(--text-gray)', fontSize: '0.9rem' }}>
                  {apiStep === 5 
                    ? "AI analysis and scoping has been triggered successfully." 
                    : "Connecting to Verbalex API and processing speech audio data..."
                  }
                </p>
              </div>

              {/* Progress Checklist */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', backgroundColor: 'var(--bg-light)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
                
                {/* Stage 1: Container Creation */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', opacity: apiStep >= 1 ? 1 : 0.4 }}>
                  <div style={{ 
                    width: '24px', height: '24px', borderRadius: '50%', 
                    backgroundColor: apiStep > 1 ? '#22c55e' : apiStep === 1 ? '#5B44E9' : 'var(--border-color)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: apiStep >= 1 ? 'white' : 'var(--text-gray)',
                    fontSize: '0.8rem', fontWeight: 600,
                    flexShrink: 0
                  }}>
                    {apiStep > 1 ? "✓" : apiStep === 1 ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : "1"}
                  </div>
                  <h5 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-dark)' }}>📝 Initializing Task Container</h5>
                </div>

                {/* Stage 2: Audio Upload & Diarization */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', opacity: apiStep >= 2 ? 1 : 0.4 }}>
                  <div style={{ 
                    width: '24px', height: '24px', borderRadius: '50%', 
                    backgroundColor: apiStep > 2 ? '#22c55e' : apiStep === 2 ? '#5B44E9' : 'var(--border-color)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: apiStep >= 2 ? 'white' : 'var(--text-gray)',
                    fontSize: '0.8rem', fontWeight: 600,
                    flexShrink: 0
                  }}>
                    {apiStep > 2 ? "✓" : apiStep === 2 ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : "2"}
                  </div>
                  <h5 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-dark)' }}>🎙️ Uploading & Transcribing Audio</h5>
                </div>

                {/* Stage 3: Supporting Documents */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', opacity: apiStep >= 3 ? 1 : 0.4 }}>
                  <div style={{ 
                    width: '24px', height: '24px', borderRadius: '50%', 
                    backgroundColor: apiStep > 3 ? '#22c55e' : apiStep === 3 ? '#5B44E9' : 'var(--border-color)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: apiStep >= 3 ? 'white' : 'var(--text-gray)',
                    fontSize: '0.8rem', fontWeight: 600,
                    flexShrink: 0
                  }}>
                    {apiStep > 3 ? "✓" : apiStep === 3 ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : "3"}
                  </div>
                  <h5 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-dark)' }}>📄 Uploading Supporting References</h5>
                </div>

                {/* Stage 4: Run AI Pipeline */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', opacity: apiStep >= 4 ? 1 : 0.4 }}>
                  <div style={{ 
                    width: '24px', height: '24px', borderRadius: '50%', 
                    backgroundColor: apiStep > 4 ? '#22c55e' : apiStep === 4 ? '#5B44E9' : 'var(--border-color)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: apiStep >= 4 ? 'white' : 'var(--text-gray)',
                    fontSize: '0.8rem', fontWeight: 600,
                    flexShrink: 0
                  }}>
                    {apiStep > 4 ? "✓" : apiStep === 4 ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : "4"}
                  </div>
                  <h5 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-dark)' }}>⚡ Initiating AI analysis engine</h5>
                </div>
              </div>


              {/* Action Buttons for Processing View */}
              {apiStep === 5 && (
                <div style={{ textAlign: 'center', marginTop: '20px' }}>
                  <CheckCircle2 size={48} color="#22c55e" style={{ margin: '0 auto 16px auto' }} />
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-dark)', marginBottom: '8px' }}>AI Analysis Started!</h4>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-gray)', marginBottom: '24px' }}>Your document analysis and scoping report is now being compiled by the AI.</p>
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

              {/* STEP 3: EXAMINATION START */}
              {currentStep === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-dark)', margin: 0 }}>Examination Start</h3>
                      {pdfDocument && (
                        <button 
                          onClick={handleOpenFullView}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'white', border: '1px solid #d1d5db', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, color: '#4b5563', cursor: 'pointer', transition: 'all 0.2s' }}
                          onMouseOver={(e) => { e.currentTarget.style.borderColor = '#5B44E9'; e.currentTarget.style.color = '#5B44E9'; }}
                          onMouseOut={(e) => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.color = '#4b5563'; }}
                        >
                          <Maximize2 size={14} /> Full View
                        </button>
                      )}
                    </div>
                    <p style={{ color: '#6B7280', fontSize: '0.9rem' }}>Select the page where the examination begins. Content before this page will form the cover section.</p>
                  </div>
                  
                  {loadingPdf ? (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                      <Loader2 className="animate-spin" size={32} style={{ color: '#5B44E9', margin: '0 auto 12px' }} />
                      <p style={{ color: '#6B7280', fontSize: '0.9rem' }}>Loading reference PDF pages...</p>
                    </div>
                  ) : !pdfDocument ? (
                    <div style={{ padding: '24px', border: '1.5px dashed #d1d5db', borderRadius: '12px', textAlign: 'center', backgroundColor: '#f9fafb' }}>
                      <p style={{ color: '#6B7280', fontSize: '0.9rem', margin: '0 0 12px 0' }}>No PDF reference document uploaded.</p>
                      <p style={{ color: '#9CA3AF', fontSize: '0.8rem', margin: 0 }}>You can skip this step or go back to upload a PDF.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {/* Pagination Controls */}
                      {Math.ceil(pdfDocument.numPages / pagesPerPage) > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                          <span style={{ fontSize: '0.8rem', color: '#4B5563', fontWeight: '500' }}>
                            Pages {(currentPage - 1) * pagesPerPage + 1} - {Math.min(currentPage * pagesPerPage, pdfDocument.numPages)} of {pdfDocument.numPages}
                          </span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              disabled={currentPage === 1}
                              onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                              style={{ padding: '4px 10px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: 'white', color: currentPage === 1 ? '#d1d5db' : '#4b5563', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                            >
                              Prev
                            </button>
                            <button
                              disabled={currentPage === Math.ceil(pdfDocument.numPages / pagesPerPage)}
                              onClick={() => setCurrentPage(p => Math.min(p + 1, Math.ceil(pdfDocument.numPages / pagesPerPage)))}
                              style={{ padding: '4px 10px', fontSize: '0.8rem', border: '1px solid #d1d5db', borderRadius: '4px', backgroundColor: 'white', color: currentPage === Math.ceil(pdfDocument.numPages / pagesPerPage) ? '#d1d5db' : '#4b5563', cursor: currentPage === Math.ceil(pdfDocument.numPages / pagesPerPage) ? 'not-allowed' : 'pointer' }}
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}

                      {/* PDF Thumbnail Grid */}
                      <div className="pdf-page-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px', maxHeight: '420px', overflowY: 'auto', padding: '4px' }}>
                        {Array.from({ length: Math.min(pagesPerPage, pdfDocument.numPages - (currentPage - 1) * pagesPerPage) }).map((_, i) => {
                          const pageNum = (currentPage - 1) * pagesPerPage + i + 1;
                          const isSelected = examStartPage === pageNum;
                          const isBeforeSelected = examStartPage !== null && pageNum < examStartPage;
                          const isAfterSelected = examStartPage !== null && pageNum > examStartPage;
                          
                          return (
                            <PdfThumbnail
                              key={pageNum}
                              pdfDoc={pdfDocument}
                              pageNum={pageNum}
                              onSelect={setExamStartPage}
                              isSelected={isSelected}
                              isBeforeSelected={isBeforeSelected}
                              isAfterSelected={isAfterSelected}
                            />
                          );
                        })}
                      </div>

                      {examStartPage && (
                        <div style={{ padding: '12px 16px', backgroundColor: '#EEF2FF', borderRadius: '8px', border: '1px solid #C7D2FE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.85rem', color: '#374151' }}>
                            Selected starting page: <strong style={{ color: '#5B44E9' }}>Page {examStartPage}</strong>
                          </span>
                          <button
                            onClick={() => setExamStartPage(null)}
                            style={{ background: 'transparent', border: 'none', color: '#dc2626', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                          >
                            Clear Selection
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* STEP 4: OVERVIEW & LAUNCH */}
              {currentStep === 4 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-dark)', marginBottom: '8px' }}>Start AI Analysis & Scoping</h3>
                    <p style={{ color: 'var(--text-gray)', fontSize: '0.9rem' }}>Please review the parameters below before sending the document for AI analysis.</p>
                  </div>

                  {/* Overview Cards */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {/* Details Summary */}
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', backgroundColor: 'var(--card-bg)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '10px' }}>
                        <Sparkles size={16} color="#5B44E9" />
                        <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-dark)' }}>Report Metadata</h4>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-gray)' }}>Task Name:</span>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dark)' }}>{taskName}</span>
                        </div>
                        {description && (
                          <div style={{ display: 'flex', flexDirection: 'column', marginTop: '4px' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-gray)' }}>Description:</span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-dark)', backgroundColor: 'var(--bg-light)', padding: '8px', borderRadius: '6px', marginTop: '4px', lineHeight: 1.4 }}>
                              {description}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Speech Audio Details */}
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', backgroundColor: 'var(--card-bg)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '10px' }}>
                        <Mic size={16} color="#5B44E9" />
                        <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-dark)' }}>Speech Audio Stream</h4>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>
                          {audioFile?.name}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-gray)' }}>{formatFileSize(audioFile?.size)}</span>
                      </div>
                    </div>

                    {/* Support Documents Count */}
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', backgroundColor: 'var(--card-bg)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '10px' }}>
                        <FileText size={16} color="#5B44E9" />
                        <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-dark)' }}>Reference Documents</h4>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-gray)' }}>Attached Sheets:</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dark)' }}>{docFiles.length} doc(s)</span>
                      </div>
                      {docFiles.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                          {docFiles.map(d => (
                            <div key={d.name} style={{ fontSize: '0.75rem', color: 'var(--text-gray)', backgroundColor: 'var(--bg-light)', padding: '4px 8px', borderRadius: '4px' }}>
                              {d.name}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Examination Split Parameters */}
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', backgroundColor: 'var(--card-bg)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '10px' }}>
                        <FileText size={16} color="#5B44E9" />
                        <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-dark)' }}>Examination Split Parameters</h4>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-gray)' }}>Examination Start Page:</span>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dark)' }}>
                            {examStartPage ? `Page ${examStartPage}` : 'Auto-detected / Full Document'}
                          </span>
                        </div>
                        {examStartPage && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-gray)', marginTop: '4px' }}>
                            <span>Cover Pages: 1 - {examStartPage - 1}</span>
                            <span>Examination Pages: {examStartPage} - {pdfDocument ? pdfDocument.numPages : 'End'}</span>
                          </div>
                        )}
                      </div>
                    </div>

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
                  {currentStep === 4 ? 'Start AI Analysis' : 'Next Step'}
                </button>
              </div>
            </>
          )}
          {showFullViewModal && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.75)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px' }}>
              <div style={{ position: 'relative', width: '100%', maxWidth: '1000px', height: '100%', backgroundColor: 'var(--card-bg)', borderRadius: '16px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
                {/* Modal Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-light)' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-dark)' }}>PDF Full View</h3>
                  <button 
                    onClick={() => {
                      setShowFullViewModal(false);
                      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
                      setPdfUrl(null);
                    }} 
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-gray)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', borderRadius: '4px' }}
                  >
                    <X size={20} />
                  </button>
                </div>
                {/* Modal Body (Iframe) */}
                <div style={{ flex: 1, backgroundColor: 'var(--bg-light)' }}>
                  <iframe 
                    src={pdfUrl} 
                    style={{ width: '100%', height: '100%', border: 'none' }} 
                    title="PDF Document"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
