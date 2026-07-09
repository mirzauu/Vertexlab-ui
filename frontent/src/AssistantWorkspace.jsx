import React, { useState, useRef, useEffect } from 'react';
import { FileText, MoreHorizontal, Check, Search, Mic, UploadCloud, Plus, HardDrive, Folder, Box, X, Sparkles, ArrowRight, Play, Loader2, AlertCircle } from 'lucide-react';
import { api } from './services/api';
import Orb from './components/Orb';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import './AssistantWorkspace.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const AssistantWorkspace = ({ onTaskCreated, onCancel, isDarkMode }) => {
  const [step, setStep] = useState(0); 
  const [greetingIndex, setGreetingIndex] = useState(0);
  // 0: Doc Upload, 1: Audio Upload, 2: Case Name, 3: Proceed
  const [inputText, setInputText] = useState('');
  
  // Real File state
  const [docFile, setDocFile] = useState(null);
  const [audioFile, setAudioFile] = useState(null);
  const [examStartPage, setExamStartPage] = useState('');
  const [libraryItems, setLibraryItems] = useState([]);
  
  // PDF viewer state
  const [numPages, setNumPages] = useState(null);
  const [pdfPage, setPdfPage] = useState(1);

  // API State
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiStep, setApiStep] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);

  const docInputRef = useRef(null);
  const audioInputRef = useRef(null);

  useEffect(() => {
    if (step !== 0 || isProcessing) return;
    
    const interval = setInterval(() => {
      setGreetingIndex((prev) => (prev + 1) % 4);
    }, 12000); // Change every 12 seconds
    
    return () => clearInterval(interval);
  }, [step, isProcessing]);

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const dm = 2;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const determineNextStep = (hasDoc, hasExamPage, hasAudio, hasName) => {
    if (!hasDoc) return 0;
    if (!hasExamPage) return 1;
    if (!hasAudio) return 2;
    if (!hasName) return 3;
    return 4;
  };

  const handleDocChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setDocFile(file);
      setLibraryItems(prev => [...prev, { name: file.name, size: formatFileSize(file.size), type: 'doc' }]);
      setStep(determineNextStep(true, !!examStartPage, !!audioFile, !!inputText.trim()));
    }
  };

  const handleAudioChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAudioFile(file);
      setLibraryItems(prev => [...prev, { name: file.name, size: formatFileSize(file.size), type: 'audio' }]);
      setStep(determineNextStep(!!docFile, !!examStartPage, true, !!inputText.trim()));
    }
  };

  const triggerDocUpload = () => {
    if (docInputRef.current) docInputRef.current.click();
  };

  const triggerAudioUpload = () => {
    if (audioInputRef.current) audioInputRef.current.click();
  };
  
  const handleExamPageSubmit = () => {
    if (examStartPage.trim()) {
      setStep(determineNextStep(!!docFile, true, !!audioFile, !!inputText.trim()));
    }
  };

  const handleNameSubmit = () => {
    if (inputText.trim()) {
      setStep(determineNextStep(!!docFile, !!examStartPage, !!audioFile, true));
    }
  };

  const handleRemoveAttachment = (type) => {
    setLibraryItems(prev => prev.filter(item => item.type !== type));
    if (type === 'doc') {
      setDocFile(null);
      setStep(determineNextStep(false, !!examStartPage, !!audioFile, !!inputText.trim()));
    } else if (type === 'audio') {
      setAudioFile(null);
      setStep(determineNextStep(!!docFile, !!examStartPage, false, !!inputText.trim()));
    }
  };
  
  const playSound = (type) => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15); // E5
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
      } else {
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.05, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch(e) {
      console.error("Audio playback failed", e);
    }
  };
  
  const handleProceed = async () => {
    const orgId = localStorage.getItem('organization_id');
    const token = localStorage.getItem('bearer_token');

    if (!orgId || !token) {
      setErrorMessage('Authentication credentials not found. Please log in.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    let taskId = null;
    let taskObj = null;

    try {
      // Step 1: Initialize Task Container
      setApiStep(1);
      const containerRes = await api(`/api/v1/organizations/${orgId}/tasks/`, {
        method: 'POST',
        body: JSON.stringify({
          name: inputText.trim(),
          description: `Examination Start Page: ${examStartPage.trim()}`,
          tags: []
        })
      });

      if (!containerRes.ok) throw new Error(`Failed to initialize task: ${containerRes.statusText}`);
      taskObj = await containerRes.json();
      taskId = taskObj.id;

      // Step 2: Upload Audio
      if (audioFile) {
        setApiStep(2);
        const audioFormData = new FormData();
        audioFormData.append('file', audioFile);
        const audioUploadRes = await api(`/api/v1/organizations/${orgId}/tasks/${taskId}/files`, {
          method: 'POST',
          body: audioFormData
        });
        if (!audioUploadRes.ok) throw new Error(`Failed to upload audio: ${audioUploadRes.statusText}`);
      }

      // Step 3: Upload Document
      if (docFile) {
        setApiStep(3);
        const docFormData = new FormData();
        docFormData.append('file', docFile);
        const docUploadRes = await api(`/api/v1/organizations/${orgId}/tasks/${taskId}/documents`, {
          method: 'POST',
          body: docFormData
        });
        if (!docUploadRes.ok) throw new Error(`Failed to upload document: ${docUploadRes.statusText}`);
      }

      // Step 4: Run Pipeline
      setApiStep(4);
      const runPipelineRes = await api(`/api/v1/organizations/${orgId}/tasks/${taskId}/pipeline/run`, {
        method: 'POST'
      });
      if (!runPipelineRes.ok) throw new Error(`Failed to trigger pipeline execution: ${runPipelineRes.statusText}`);

      // Complete
      setApiStep(5);
      playSound('success');
      if (onTaskCreated) {
        onTaskCreated(taskObj);
      }

    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || 'An unexpected error occurred during processing.');
      setIsProcessing(false);
      playSound('error');
    }
  };

  const getStepContent = () => {
    if (isProcessing) {
      const msgs = [
        "Preparing...",
        "Initializing Task Container...",
        "Uploading Audio Recording...",
        "Uploading Source Document...",
        "Running AI Pipeline..."
      ];
      return {
        title: msgs[apiStep] || "Processing...",
        subtitle: "Please wait while we set up your case.",
        inputType: 'loading'
      };
    }

    switch(step) {
      case 0:
        const greetings = [
          "Hello! I'm VerbaLex Scopist AI.",
          "I'm ready when you are. Just upload a document.",
          "Let's organize your next case seamlessly.",
          "Standing by to process your files."
        ];
        return {
          title: greetings[greetingIndex],
          subtitle: "I'm here to help you prepare your tasks. Please upload your source document to get started.",
          inputType: 'doc',
          key: `step0-${greetingIndex}`
        };
      case 1:
        return {
          title: "Document received.",
          subtitle: "Please review the document and enter the page number where the examination starts.",
          inputType: 'examPage'
        };
      case 2:
        return {
          title: "Page recorded.",
          subtitle: "Great. Now, please upload or record the corresponding audio file.",
          inputType: 'audio'
        };
      case 3:
        return {
          title: "Audio received.",
          subtitle: "Almost done. What should we name this case?",
          inputType: 'text'
        };
      case 4:
        return {
          title: "Ready to process.",
          subtitle: `Please review your attachments and case name, then click Proceed.`,
          inputType: 'button'
        };
      default:
        return { title: '', subtitle: '', inputType: 'text' };
    }
  };

  const content = getStepContent();

  return (
    <div className="assistant-workspace-container">
      {/* Hidden File Inputs */}
      <input 
        type="file" 
        ref={docInputRef} 
        style={{ display: 'none' }} 
        onChange={handleDocChange}
        accept=".pdf,.docx,.doc"
      />
      <input 
        type="file" 
        ref={audioInputRef} 
        style={{ display: 'none' }} 
        onChange={handleAudioChange}
        accept="audio/*"
      />

      {/* AI Assistant Full Screen */}
      <div className="assistant-main">
        
        {/* The WebGL Orb */}
        <div style={{ 
          width: content.inputType === 'examPage' ? '120px' : '240px', 
          height: content.inputType === 'examPage' ? '120px' : '240px', 
          position: 'relative', 
          margin: '0 auto', 
          marginBottom: content.inputType === 'examPage' ? '16px' : '32px',
          transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
          <Orb
            hoverIntensity={isProcessing ? 0.8 : 0.2}
            rotateOnHover={true}
            hue={30}
            forceHoverState={isProcessing}
          />
        </div>
        
        <div className="assistant-text-content fade-in-up" key={content.key || (isProcessing ? `proc-${apiStep}` : step)}>
          <h1 className="assistant-title">{content.title}</h1>
          <p className="assistant-subtitle">{content.subtitle}</p>
        </div>

        {errorMessage && (
          <div className="error-message fade-in-up" style={{ color: '#EF4444', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', background: '#FEF2F2', padding: '12px 24px', borderRadius: '12px', border: '1px solid #FCA5A5' }}>
            <AlertCircle size={20} /> {errorMessage}
          </div>
        )}

        {/* Dynamic Input Area */}
        <div className="assistant-input-wrapper fade-in-up" key={`input-${isProcessing ? 'proc' : step}`}>
          <div className="integration-sidebar" style={{ opacity: isProcessing ? 0.5 : 1, pointerEvents: isProcessing ? 'none' : 'auto' }}>
             <button className="integration-btn drive" title="Google Drive">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M15.3 4.2998H8.7L2 15.8998L5.3 21.5998L18.6 21.5998L22 15.8998L15.3 4.2998Z" fill="#FFC107"/>
                  <path d="M5.3 21.5998L8.7 15.8998L15.3 4.2998L11.9 4.2998L2 21.5998H5.3Z" fill="#1976D2"/>
                  <path d="M18.6 21.5998L22 15.8998L15.3 4.2998L8.7 4.2998L15.3 15.8998L18.6 21.5998Z" fill="#4CAF50"/>
                </svg>
             </button>
             <button className="integration-btn box" title="Box">
                <Box size={20} color="#0061D5" />
             </button>
             <button className="integration-btn generic" title="Local Files">
                <Folder size={20} color="var(--text-gray)" />
             </button>
          </div>
          
          <div className="dynamic-input-container">
             {(libraryItems.length > 0 || (step === 3 && inputText.trim())) && (
               <div className="attachments-bar" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingBottom: '12px', justifyContent: 'center' }}>
                 {libraryItems.map((item, idx) => (
                   <div key={idx} className="fade-in-up" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--card-bg)', padding: '6px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid var(--border-color)', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                     {item.type === 'audio' ? <Mic size={14} color="var(--primary)" /> : <FileText size={14} color="var(--primary)" />}
                     <span style={{ color: 'var(--text-dark)' }}>{item.name}</span>
                     <button 
                       onClick={() => handleRemoveAttachment(item.type)} 
                       style={{ background: 'none', border: 'none', padding: 0, margin: '0 0 0 4px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#94A3B8', transition: 'color 0.2s' }}
                       onMouseEnter={(e) => e.currentTarget.style.color = '#EF4444'}
                       onMouseLeave={(e) => e.currentTarget.style.color = '#94A3B8'}
                     >
                       <X size={14} />
                     </button>
                   </div>
                 ))}
                 
                  {step >= 2 && examStartPage.trim() && (
                    <div className="fade-in-up" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(249, 115, 22, 0.08)', padding: '6px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid rgba(249, 115, 22, 0.2)', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                      <span style={{ color: 'var(--primary)' }}>Start Page: {examStartPage}</span>
                      <button 
                        onClick={() => { setExamStartPage(''); setStep(determineNextStep(!!docFile, false, !!audioFile, !!inputText.trim())); }} 
                        style={{ background: 'none', border: 'none', padding: 0, margin: '0 0 0 4px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#F97316', transition: 'color 0.2s' }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#EF4444'}
                        onMouseLeave={(e) => e.currentTarget.style.color = '#F97316'}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  {step === 4 && inputText.trim() && (
                    <div className="fade-in-up" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(249, 115, 22, 0.08)', padding: '6px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid rgba(249, 115, 22, 0.2)', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                      <Sparkles size={14} color="var(--primary)" />
                      <span style={{ color: 'var(--primary)' }}>{inputText}</span>
                      <button 
                        onClick={() => { setInputText(''); setStep(determineNextStep(!!docFile, !!examStartPage, !!audioFile, false)); }} 
                        style={{ background: 'none', border: 'none', padding: 0, margin: '0 0 0 4px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#F97316', transition: 'color 0.2s' }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#EF4444'}
                        onMouseLeave={(e) => e.currentTarget.style.color = '#F97316'}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
               </div>
             )}
             
             <div className="input-field-area" style={{ borderStyle: isProcessing ? 'dashed' : 'solid' }}>
                
                {content.inputType === 'doc' && (
                  <div className="image-upload-ui" onClick={triggerDocUpload} style={{ cursor: 'pointer', width: '100%', justifyContent: 'center' }}>
                    <UploadCloud size={20} style={{ color: 'var(--primary)' }} /> 
                    <span>Click here to upload document</span>
                  </div>
                )}
                
                {content.inputType === 'examPage' && docFile && (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                    <div style={{ textAlign: 'center', color: 'var(--text-gray)', fontSize: '0.9rem' }}>
                      Please select the start page in the PDF viewer.
                    </div>
                  </div>
                )}
                
                {content.inputType === 'audio' && (
                  <div className="audio-record-ui" style={{ width: '100%', justifyContent: 'center' }}>
                    <button className="record-btn-pulse" onClick={triggerAudioUpload}><Mic size={18} /></button> 
                    <span onClick={triggerAudioUpload} style={{ cursor: 'pointer' }}>Click to select audio file</span>
                  </div>
                )}

                {content.inputType === 'text' && (
                  <>
                    <input 
                      type="text" 
                      placeholder="Enter case name..." 
                      className="assistant-text-input" 
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
                      autoFocus
                    />
                    <button className="submit-arrow-btn" onClick={handleNameSubmit} disabled={!inputText.trim()}>
                      <ArrowRight size={18} />
                    </button>
                  </>
                )}

                {content.inputType === 'button' && (
                  <div style={{ display: 'flex', width: '100%', gap: '12px' }}>
                    <button 
                      className="cancel-action-btn" 
                      onClick={() => {
                        setDocFile(null);
                        setAudioFile(null);
                        setExamStartPage('');
                        setInputText('');
                        setLibraryItems([]);
                        setStep(0);
                        if (onCancel) onCancel();
                      }} 
                      style={{ 
                        flex: 1, 
                        padding: '14px 24px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        gap: '8px', 
                        background: 'transparent', 
                        color: '#64748B', 
                        border: '1px solid #CBD5E1', 
                        borderRadius: '12px', 
                        fontSize: '1rem', 
                        fontWeight: 600, 
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.color = '#0F172A'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748B'; }}
                    >
                      <X size={18} /> Cancel
                    </button>

                    <button 
                      className="proceed-action-btn" 
                      onClick={handleProceed} 
                      style={{ 
                        flex: 2, 
                        padding: '14px 24px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        gap: '8px', 
                        background: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '12px', 
                        fontSize: '1rem', 
                        fontWeight: 600, 
                        cursor: 'pointer',
                        boxShadow: '0 4px 14px rgba(249, 115, 22, 0.3)',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(249, 115, 22, 0.4)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(249, 115, 22, 0.3)'; }}
                    >
                      <Sparkles size={18} /> Proceed with processing
                    </button>
                  </div>
                )}

                {content.inputType === 'loading' && (
                  <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'var(--primary)', fontWeight: 600 }}>
                    <Loader2 size={20} className="spin-icon" style={{ animation: 'spin 2s linear infinite' }} />
                    Working on it...
                  </div>
                )}
             </div>
          </div>
        </div>
        
      </div>

      {/* Full Screen PDF Modal */}
      {step === 1 && docFile && (
        <div className="fade-in-up" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ width: '100%', maxWidth: '800px', height: '90%', background: 'var(--card-bg)', borderRadius: '24px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-dark)' }}>Select Examination Start Page</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: 'var(--text-gray)' }}>Page through the document and click select.</p>
              </div>
              <button 
                onClick={() => {
                  setDocFile(null);
                  setStep(0);
                }} 
                style={{ background: 'var(--bg-light)', border: 'none', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-gray)', transition: 'background 0.2s' }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#FEE2E2'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-light)'}
              >
                <X size={18} />
              </button>
            </div>

            {/* PDF Visual Viewer */}
            <div style={{ flex: 1, background: isDarkMode ? '#090A0C' : '#F1F5F9', overflowY: 'auto', display: 'flex', justifyContent: 'center', padding: '24px', position: 'relative' }}>
               <Document 
                 file={docFile} 
                 onLoadSuccess={({ numPages }) => { setNumPages(numPages); setPdfPage(1); }}
                 loading={
                   <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--primary)' }}>
                     <Loader2 size={32} className="spin-icon" style={{ animation: 'spin 2s linear infinite' }} />
                   </div>
                 }
               >
                 <Page pageNumber={pdfPage} width={500} renderTextLayer={false} renderAnnotationLayer={false} className="pdf-page-shadow" />
               </Document>
            </div>

            {/* Footer / Pagination Controls */}
            <div style={{ padding: '20px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--card-bg)' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <button 
                    onClick={() => setPdfPage(p => Math.max(1, p - 1))} 
                    disabled={pdfPage <= 1}
                    style={{ padding: '10px 20px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-light)', cursor: pdfPage <= 1 ? 'not-allowed' : 'pointer', opacity: pdfPage <= 1 ? 0.5 : 1, color: 'var(--text-dark)', fontWeight: 600 }}
                  >
                    Previous
                  </button>
                  
                  <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-gray)' }}>
                    Page {pdfPage} of {numPages || '--'}
                  </span>
                  
                  <button 
                    onClick={() => setPdfPage(p => Math.min(numPages || p, p + 1))} 
                    disabled={pdfPage >= numPages}
                    style={{ padding: '10px 20px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-light)', cursor: pdfPage >= numPages ? 'not-allowed' : 'pointer', opacity: pdfPage >= numPages ? 0.5 : 1, color: 'var(--text-dark)', fontWeight: 600 }}
                  >
                    Next
                  </button>
                </div>

                <button 
                  onClick={() => {
                    setExamStartPage(pdfPage.toString());
                    setStep(determineNextStep(!!docFile, true, !!audioFile, !!inputText.trim()));
                  }} 
                  style={{ padding: '12px 24px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '12px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 14px rgba(249, 115, 22, 0.3)' }}
                >
                  <Check size={18} /> Confirm Page {pdfPage}
                </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AssistantWorkspace;
