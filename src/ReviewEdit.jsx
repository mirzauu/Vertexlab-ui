import React, { useState, useEffect, useRef } from 'react';
import './ReviewEdit.css';
import { Play, Pause, SkipBack, SkipForward, Save, Send, ArrowLeft, Loader2, Volume1, Volume2, VolumeX, Zap, Download } from 'lucide-react';
import { api } from './services/api';

// Module-level trackers for deduplication across StrictMode double-mounts
const activeWorkstationSessions = new Map();

const registerWorkstationSession = (taskId) => {
  let session = activeWorkstationSessions.get(taskId);
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
    dataPromise: null,
    audioUrl: null,
    timeoutId: null
  };
  activeWorkstationSessions.set(taskId, session);
  return session;
};

const deregisterWorkstationSession = (taskId) => {
  const session = activeWorkstationSessions.get(taskId);
  if (!session) return;

  session.count -= 1;
  if (session.count <= 0) {
    session.timeoutId = setTimeout(() => {
      session.controller.abort();
      if (session.audioUrl) {
        URL.revokeObjectURL(session.audioUrl);
      }
      activeWorkstationSessions.delete(taskId);
    }, 100);
  }
};

export default function ReviewEdit({ task, onBack }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [audioUrl, setAudioUrl] = useState(null);
  const [localChunks, setLocalChunks] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);
  const [isDownloadingWord, setIsDownloadingWord] = useState(false);

  useEffect(() => {
    if (results) {
      const docChunks = results.document?.corrected_chunks;
      const initialChunks = (docChunks && docChunks.length > 0) ? docChunks : (results.matches || []);
      setLocalChunks(JSON.parse(JSON.stringify(initialChunks)));
    }
  }, [results]);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isBoosted, setIsBoosted] = useState(false);
  const [speechEnhancer, setSpeechEnhancer] = useState(false);
  const [filterMode, setFilterMode] = useState('normal');
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [showFxPanel, setShowFxPanel] = useState(false);
  const [isPlayerFloating, setIsPlayerFloating] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
    const saved = localStorage.getItem('reviewPanelWidth');
    return saved ? parseFloat(saved) : 35;
  });
  const isDraggingRef = useRef(false);
  const reviewContentRef = useRef(null);

  const audioRef = useRef(null);
  const transcriptContainerRef = useRef(null);
  const dataTableWrapperRef = useRef(null);
  const docEditorContainerRef = useRef(null);
  const audioPlayerCardRef = useRef(null);

  const audioContextRef = useRef(null);
  const gainNodeRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const biquadFilterRef = useRef(null);
  const compressorNodeRef = useRef(null);

  useEffect(() => {
    const orgId = localStorage.getItem('organization_id') || task?.organization_id;
    const token = localStorage.getItem('bearer_token');

    if (!orgId || !token || !task) {
      setLoading(false);
      return;
    }

    const session = registerWorkstationSession(task.id);
    const signal = session.controller.signal;

    if (!session.dataPromise) {
      session.dataPromise = (async () => {
        // Fetch results
        const res = await api(`/api/v1/organizations/${orgId}/tasks/${task.id}/pipeline/results`, {
          signal
        });
        let resultsData = null;
        if (res.ok) {
          resultsData = await res.json();
        }

        // Fetch task files via the API
        const filesRes = await api(`/api/v1/organizations/${orgId}/tasks/${task.id}/files`, {
          signal
        });
        let taskFiles = [];
        if (filesRes.ok) {
          taskFiles = await filesRes.json();
        }

        // Fetch audio securely
        const audioFile = taskFiles.find(f => 
          f.file_type === 'audio' || 
          (resultsData && f.file_path === resultsData.audio_file_path)
        );

        let audioUrl = null;
        if (audioFile) {
          const audioRes = await api(`/api/v1/files/${audioFile.id}/download`, {
            signal
          });
          
          if (audioRes.ok) {
            const blob = await audioRes.blob();
            audioUrl = URL.createObjectURL(blob);
            session.audioUrl = audioUrl;
          } else {
            console.error("Failed to download audio. Status:", audioRes.status);
          }
        } else {
          console.warn("No audio files attached to this task to play.");
        }

        return { resultsData, audioUrl };
      })();
    }

    const loadWorkstationData = async () => {
      try {
        const { resultsData, audioUrl } = await session.dataPromise;
        if (resultsData) setResults(resultsData);
        if (audioUrl) setAudioUrl(audioUrl);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error("Failed to load workstation data:", err);
          session.dataPromise = null;
        }
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    };

    loadWorkstationData();

    return () => {
      deregisterWorkstationSession(task.id);
    };
  }, [task]);

  // Show floating player when the original card scrolls out of view
  useEffect(() => {
    if (!audioPlayerCardRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsPlayerFloating(!entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(audioPlayerCardRef.current);
    return () => observer.disconnect();
  }, [audioPlayerCardRef.current]);

  const isProgrammaticScrollRef = useRef(false);
  const scrollTimeoutRef = useRef(null);
  const userScrollingTranscriptRef = useRef(false);
  const userScrollTimeoutRef = useRef(null);
  const userScrollingDataRef = useRef(false);
  const userScrollDataTimeoutRef = useRef(null);
  const userScrollingDocRef = useRef(false);
  const userScrollDocTimeoutRef = useRef(null);

  // Scroll only within a specific container - never touches parent scrollbars
  const scrollElementIntoContainer = (container, element) => {
    if (!container || !element) return;
    const containerTop = container.getBoundingClientRect().top;
    const elementTop = element.getBoundingClientRect().top;
    const offset = elementTop - containerTop;
    const center = offset - container.clientHeight / 2 + element.clientHeight / 2;
    container.scrollTop += center;
  };

  const triggerProgrammaticScroll = (container, element, userScrollingRef) => {
    if (!container || !element) return;
    // If the user is manually scrolling this container, don't fight them
    if (userScrollingRef && userScrollingRef.current) return;
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    isProgrammaticScrollRef.current = true;
    scrollElementIntoContainer(container, element);
    scrollTimeoutRef.current = setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 150);
  };

  const handleTranscriptScroll = () => {
    // Mark that user is manually scrolling the transcript
    userScrollingTranscriptRef.current = true;
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }
    // After 2 seconds of no scrolling, resume auto-scroll
    userScrollTimeoutRef.current = setTimeout(() => {
      userScrollingTranscriptRef.current = false;
    }, 2000);
  };

  const handleDataScroll = () => {
    // Mark that user is manually scrolling the raw data table
    userScrollingDataRef.current = true;
    if (userScrollDataTimeoutRef.current) {
      clearTimeout(userScrollDataTimeoutRef.current);
    }
    // After 2 seconds of no scrolling, resume auto-scroll
    userScrollDataTimeoutRef.current = setTimeout(() => {
      userScrollingDataRef.current = false;
    }, 2000);
  };

  const handleDocScroll = () => {
    // Mark that user is manually scrolling the doc editor
    userScrollingDocRef.current = true;
    if (userScrollDocTimeoutRef.current) {
      clearTimeout(userScrollDocTimeoutRef.current);
    }
    userScrollDocTimeoutRef.current = setTimeout(() => {
      userScrollingDocRef.current = false;
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
      if (userScrollDataTimeoutRef.current) clearTimeout(userScrollDataTimeoutRef.current);
      if (userScrollDocTimeoutRef.current) clearTimeout(userScrollDocTimeoutRef.current);
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(err => console.error("Error closing AudioContext:", err));
        audioContextRef.current = null;
        gainNodeRef.current = null;
        sourceNodeRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      // Sync playback rate
      audioRef.current.playbackRate = playbackSpeed;

      if (gainNodeRef.current && audioContextRef.current) {
        const ctx = audioContextRef.current;
        
        // Volume + Boost Gain
        const multiplier = isBoosted ? 3.0 : 1.0;
        const targetGain = isMuted ? 0 : volume * multiplier;
        gainNodeRef.current.gain.setValueAtTime(targetGain, ctx.currentTime);

        // Speech Enhancer (Dynamics Compressor Node)
        if (compressorNodeRef.current) {
          if (speechEnhancer) {
            // Apply strong compression to bring quiet words up and keep loud words down
            compressorNodeRef.current.threshold.setValueAtTime(-36, ctx.currentTime);
            compressorNodeRef.current.knee.setValueAtTime(30, ctx.currentTime);
            compressorNodeRef.current.ratio.setValueAtTime(12, ctx.currentTime);
            compressorNodeRef.current.attack.setValueAtTime(0.003, ctx.currentTime);
            compressorNodeRef.current.release.setValueAtTime(0.25, ctx.currentTime);
          } else {
            // Disable compression (set ratio to 1)
            compressorNodeRef.current.threshold.setValueAtTime(0, ctx.currentTime);
            compressorNodeRef.current.ratio.setValueAtTime(1, ctx.currentTime);
          }
        }

        // EQ filter mode
        if (biquadFilterRef.current) {
          if (filterMode === 'clarity') {
            // Speech Intelligibility Peaking filter: boost 2kHz where human consonants are
            biquadFilterRef.current.type = 'peaking';
            biquadFilterRef.current.frequency.setValueAtTime(2000, ctx.currentTime);
            biquadFilterRef.current.Q.setValueAtTime(1.0, ctx.currentTime);
            biquadFilterRef.current.gain.setValueAtTime(6.0, ctx.currentTime); // +6dB boost
          } else if (filterMode === 'noise_reduce') {
            // Low-pass filter to cut out high-frequency hiss
            biquadFilterRef.current.type = 'lowpass';
            biquadFilterRef.current.frequency.setValueAtTime(3000, ctx.currentTime);
            biquadFilterRef.current.Q.setValueAtTime(1.0, ctx.currentTime);
          } else {
            // Normal: set to peaking with 0 gain (bypassed)
            biquadFilterRef.current.type = 'peaking';
            biquadFilterRef.current.frequency.setValueAtTime(1000, ctx.currentTime);
            biquadFilterRef.current.gain.setValueAtTime(0.0, ctx.currentTime);
          }
        }

        audioRef.current.volume = 1.0;
        audioRef.current.muted = false;
      } else {
        // Fallback
        audioRef.current.volume = isMuted ? 0 : volume;
        audioRef.current.muted = isMuted;
      }
    }
  }, [audioUrl, volume, isMuted, isBoosted, speechEnhancer, filterMode, playbackSpeed]);

  useEffect(() => {
    if (transcriptContainerRef.current) {
      const activeSeg = transcriptContainerRef.current.querySelector('.active-segment');
      if (activeSeg) {
        triggerProgrammaticScroll(transcriptContainerRef.current, activeSeg, userScrollingTranscriptRef);
      }
    }
    
    if (dataTableWrapperRef.current) {
      const activeMatch = dataTableWrapperRef.current.querySelector('.active-match');
      if (activeMatch) {
        triggerProgrammaticScroll(dataTableWrapperRef.current, activeMatch, userScrollingDataRef);
      }
    }

    // Auto-scroll AI document to the currently playing chunk
    if (docEditorContainerRef.current) {
      const activeChunk = docEditorContainerRef.current.querySelector('.active-chunk-block');
      if (activeChunk) {
        triggerProgrammaticScroll(docEditorContainerRef.current, activeChunk, userScrollingDocRef);
      }
    }
  }, [currentTime]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const initAudioContext = () => {
    if (!audioRef.current || audioContextRef.current) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContextClass();
      
      const source = ctx.createMediaElementSource(audioRef.current);
      const filterNode = ctx.createBiquadFilter();
      const compressorNode = ctx.createDynamicsCompressor();
      const gainNode = ctx.createGain();
      
      // Chain: source -> filter -> compressor -> gain -> destination
      source.connect(filterNode);
      filterNode.connect(compressorNode);
      compressorNode.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      audioContextRef.current = ctx;
      biquadFilterRef.current = filterNode;
      compressorNodeRef.current = compressorNode;
      gainNodeRef.current = gainNode;
      sourceNodeRef.current = source;
      
      audioRef.current.volume = 1.0;
    } catch (err) {
      console.error("Failed to initialize Web Audio API:", err);
    }
  };

  const handleSpeedChange = (speed) => {
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  const toggleBoost = () => {
    initAudioContext();
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    setIsBoosted(!isBoosted);
  };

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const handleSegmentClick = (start) => {
    initAudioContext();
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    if (audioRef.current) {
      audioRef.current.currentTime = start;
      setCurrentTime(start);
      if (!isPlaying) {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (val > 0) {
      setIsMuted(false);
    }
    initAudioContext();
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    if (audioRef.current) {
      if (!gainNodeRef.current) {
        audioRef.current.volume = val;
        audioRef.current.muted = val === 0;
      }
    }
  };

  const toggleMute = () => {
    initAudioContext();
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    if (audioRef.current) {
      const nextMuted = !isMuted;
      setIsMuted(nextMuted);
      if (!gainNodeRef.current) {
        audioRef.current.muted = nextMuted;
      }
      if (!nextMuted && volume === 0) {
        setVolume(0.5);
        if (!gainNodeRef.current) {
          audioRef.current.volume = 0.5;
        }
      }
    }
  };

  const togglePlay = () => {
    initAudioContext();
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const skipBack = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10);
    }
  };

  const skipForward = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.min(audioRef.current.duration, audioRef.current.currentTime + 10);
    }
  };

  const formatTime = (seconds) => {
    if (isNaN(seconds)) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleChunkTextChange = (chunkId, newText) => {
    setLocalChunks(prev => prev.map(c => {
      if (c.raw_chunk_id === chunkId) {
        return { ...c, corrected_text: newText };
      }
      return c;
    }));
  };

  const handleSaveDocument = async () => {
    if (!task) return;
    setIsSaving(true);
    try {
      const orgId = localStorage.getItem('organization_id') || task?.organization_id;
      const payload = {
        title: results?.document?.title || "AI-Corrected Proof Document",
        corrected_chunks: localChunks.map(c => ({
          raw_chunk_id: c.raw_chunk_id,
          original_raw_text: c.original_raw_text || c.raw_chunk_text || "",
          corrected_text: c.corrected_text !== undefined ? c.corrected_text : (c.raw_chunk_text || c.original_raw_text || ""),
          was_ai_corrected: c.was_ai_corrected !== undefined ? c.was_ai_corrected : true,
          match_status: c.match_status || "unknown",
          confidence_score: c.confidence_score || 0,
          audio_start_time_sec: c.audio_start_time_sec,
          audio_end_time_sec: c.audio_end_time_sec,
          speakers: c.speakers || []
        }))
      };

      const response = await api(`/api/v1/organizations/${orgId}/tasks/${task.id}/pipeline/document`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error('Save failed');
      const updatedDoc = await response.json();
      
      setResults(prev => ({
        ...prev,
        document: updatedDoc
      }));
      alert('Document draft saved successfully!');
    } catch (err) {
      console.error('Save document error:', err);
      alert('Failed to save document.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!task) return;
    setIsDownloadingPDF(true);
    try {
      const orgId = localStorage.getItem('organization_id') || task?.organization_id;
      const response = await api(`/api/v1/organizations/${orgId}/tasks/${task.id}/pipeline/document/pdf`);
      if (!response.ok) throw new Error('PDF download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${task?.name || 'document'}_ai_corrected.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF download error:', err);
      alert('Failed to download PDF.');
    } finally {
      setIsDownloadingPDF(false);
    }
  };

  const handleDownloadWord = async () => {
    if (!task) return;
    setIsDownloadingWord(true);
    try {
      const orgId = localStorage.getItem('organization_id') || task?.organization_id;
      const response = await api(`/api/v1/organizations/${orgId}/tasks/${task.id}/pipeline/document/word`);
      if (!response.ok) throw new Error('Word download failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${task?.name || 'document'}_ai_corrected.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Word download error:', err);
      alert('Failed to download Word document.');
    } finally {
      setIsDownloadingWord(false);
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // --- Resize handlers ---
  const handleResizeMouseDown = (e) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent) => {
      if (!isDraggingRef.current || !reviewContentRef.current) return;
      const rect = reviewContentRef.current.getBoundingClientRect();
      const offsetX = moveEvent.clientX - rect.left;
      const pct = (offsetX / rect.width) * 100;
      // Clamp between 20% and 70%
      const clamped = Math.min(70, Math.max(20, pct));
      setLeftPanelWidth(clamped);
      localStorage.setItem('reviewPanelWidth', clamped);
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  if (loading) {
    return (
      <div className="review-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Loader2 className="animate-spin" size={32} color="#5B44E9" />
        <span style={{ marginLeft: '12px', color: '#6b7280' }}>Loading Workstation Data...</span>
      </div>
    );
  }

  return (
    <>
    <div className="review-container">
      <div className="back-button-container" style={{ marginBottom: '32px' }}>
        <button className="back-btn" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', color: '#6B7280', fontSize: '0.9rem', fontWeight: '500', cursor: 'pointer', padding: '0' }}>
          <ArrowLeft size={18} />
          Back
        </button>
      </div>
      <div className="review-content" ref={reviewContentRef}>
        {/* Left Side: Sources */}
        <div className="review-left" style={{ width: `${leftPanelWidth}%`, flex: 'none' }}>
          <div className="review-card audio-player" ref={audioPlayerCardRef}>
            <h3>Audio File</h3>
            
            {audioUrl && (
              <audio 
                ref={audioRef} 
                src={audioUrl} 
                onTimeUpdate={handleTimeUpdate} 
                onLoadedMetadata={handleLoadedMetadata} 
                onEnded={() => setIsPlaying(false)}
                style={{ display: 'none' }}
              />
            )}

            <div className="player-controls">
              <input 
                type="range"
                min="0"
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className="timeline-slider"
                style={{
                  background: `linear-gradient(to right, #003BFF 0%, #003BFF ${progressPercent}%, #F3F4F6 ${progressPercent}%, #F3F4F6 100%)`
                }}
              />
              <div className="controls-row">
                <span className="time">{formatTime(currentTime)}</span>
                <div className="main-btns">
                  <SkipBack size={20} style={{ cursor: 'pointer' }} onClick={skipBack} />
                  <div className="play-btn" onClick={togglePlay}>
                    {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                  </div>
                  <SkipForward size={20} style={{ cursor: 'pointer' }} onClick={skipForward} />
                </div>

                <div className="volume-control">
                  <div className="volume-btn" onClick={toggleMute} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    {isMuted || volume === 0 ? <VolumeX size={18} /> : volume < 0.5 ? <Volume1 size={18} /> : <Volume2 size={18} />}
                  </div>
                  <input 
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="volume-slider"
                    style={{
                      background: `linear-gradient(to right, #003BFF 0%, #003BFF ${(isMuted ? 0 : volume) * 100}%, #F3F4F6 ${(isMuted ? 0 : volume) * 100}%, #F3F4F6 100%)`
                    }}
                  />
                  <button 
                    className={`boost-btn ${isBoosted ? 'boost-active' : ''}`}
                    onClick={toggleBoost}
                    title="Boost volume past standard maximum"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      borderRadius: '8px',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      border: '1px solid var(--border-color)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      backgroundColor: isBoosted ? '#FF5E00' : 'transparent',
                      color: isBoosted ? 'white' : 'var(--text-dark)',
                      borderColor: isBoosted ? '#FF5E00' : 'var(--border-color)',
                      boxShadow: isBoosted ? '0 0 10px rgba(255, 94, 0, 0.4)' : 'none',
                      marginLeft: '6px'
                    }}
                  >
                    <Zap size={12} fill={isBoosted ? 'currentColor' : 'none'} className={isBoosted ? 'boost-active-icon' : ''} />
                    <span>Boost</span>
                  </button>
                </div>
                <span className="time">{formatTime(duration)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button 
                  onClick={() => setShowFxPanel(!showFxPanel)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    border: '1px solid var(--border-color)',
                    cursor: 'pointer',
                    backgroundColor: showFxPanel ? 'var(--text-dark)' : 'transparent',
                    color: showFxPanel ? 'white' : 'var(--text-dark)',
                    transition: 'all 0.2s'
                  }}
                >
                  <Volume2 size={14} />
                  <span>Audio Adjustments {speechEnhancer || filterMode !== 'normal' ? '•' : ''}</span>
                </button>
              </div>

              {showFxPanel && (
                <div className="fx-panel" style={{
                  marginTop: '16px',
                  paddingTop: '16px',
                  borderTop: '1px solid var(--border-color)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-dark)', display: 'block' }}>Speech Intelligibility Enhancer</span>
                      <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>Amplifies low speech/whispers, limits sudden loud noise</span>
                    </div>
                    <button
                      onClick={() => {
                        initAudioContext();
                        setSpeechEnhancer(!speechEnhancer);
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        border: '1px solid',
                        cursor: 'pointer',
                        backgroundColor: speechEnhancer ? '#10B981' : 'transparent',
                        color: speechEnhancer ? 'white' : 'var(--text-dark)',
                        borderColor: speechEnhancer ? '#10B981' : 'var(--border-color)',
                        boxShadow: speechEnhancer ? '0 0 10px rgba(16, 185, 129, 0.3)' : 'none',
                        transition: 'all 0.2s'
                      }}
                    >
                      {speechEnhancer ? 'ACTIVE' : 'OFF'}
                    </button>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-dark)' }}>Equalizer Presets</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {[
                        { id: 'normal', label: 'Normal' },
                        { id: 'clarity', label: 'Voice Clarify (+6dB Consonants)' },
                        { id: 'noise_reduce', label: 'Noise Reduction' }
                      ].map(preset => (
                        <button
                          key={preset.id}
                          onClick={() => {
                            initAudioContext();
                            setFilterMode(preset.id);
                          }}
                          style={{
                            flex: 1,
                            padding: '8px 10px',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            border: '1px solid',
                            cursor: 'pointer',
                            backgroundColor: filterMode === preset.id ? '#5B44E9' : 'transparent',
                            color: filterMode === preset.id ? 'white' : 'var(--text-dark)',
                            borderColor: filterMode === preset.id ? '#5B44E9' : 'var(--border-color)',
                            boxShadow: filterMode === preset.id ? '0 0 10px rgba(91, 68, 233, 0.3)' : 'none',
                            transition: 'all 0.2s'
                          }}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-dark)', display: 'block' }}>Playback Speed</span>
                      <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>Listen closely to capture tough pronunciations</span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map(speed => (
                        <button
                          key={speed}
                          onClick={() => handleSpeedChange(speed)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            border: '1px solid',
                            cursor: 'pointer',
                            backgroundColor: playbackSpeed === speed ? 'var(--text-dark)' : 'transparent',
                            color: playbackSpeed === speed ? 'white' : 'var(--text-dark)',
                            borderColor: playbackSpeed === speed ? 'var(--text-dark)' : 'var(--border-color)',
                            transition: 'all 0.2s'
                          }}
                        >
                          {speed}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="review-card transcript-section">
            <h3>Transcribe</h3>
            <div className="scroll-content" ref={transcriptContainerRef} onScroll={handleTranscriptScroll}>
              {results?.transcribed_data && results.transcribed_data.length > 0 ? (
                results.transcribed_data.map((segment, index) => {
                  const isActive = currentTime >= segment.start && currentTime <= segment.end;
                  return (
                    <p 
                      key={index} 
                      className={`transcript-segment ${isActive ? 'active-segment' : ''}`}
                      onClick={() => handleSegmentClick(segment.start)}
                    >
                      <span>[{formatTime(segment.start)}]</span> <strong>{segment.speaker}</strong>: {segment.text}
                    </p>
                  );
                })
              ) : (
                <p style={{ color: '#9CA3AF' }}>No transcription data available.</p>
              )}
            </div>
          </div>

          <div className="review-card raw-data-section">
            <h3>Matched Raw Data</h3>
            <div className="data-table-wrapper" ref={dataTableWrapperRef} onScroll={handleDataScroll} style={{ maxHeight: '200px', overflowY: 'auto' }}>
              <table className="data-table">
                <thead style={{ position: 'sticky', top: 0, backgroundColor: 'white' }}>
                  <tr>
                    <th>Confidence</th>
                    <th>Status</th>
                    <th>Match Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {results?.matches && results.matches.length > 0 ? (
                    results.matches.map((match, index) => {
                      const isActive = currentTime >= match.audio_start_time_sec && currentTime <= match.audio_end_time_sec;
                      return (
                        <tr 
                          key={index} 
                          className={isActive ? 'active-match' : ''}
                          onClick={() => {
                            if (match.audio_start_time_sec !== null && match.audio_start_time_sec !== undefined) {
                              handleSegmentClick(match.audio_start_time_sec);
                            }
                          }}
                          style={{ cursor: match.audio_start_time_sec !== null ? 'pointer' : 'default' }}
                        >
                          <td>{match.confidence_score ? `${match.confidence_score.toFixed(1)}%` : 'N/A'}</td>
                          <td style={{ textTransform: 'capitalize' }}>{match.match_status}</td>
                          <td style={{ fontSize: '0.85rem' }}>{match.raw_chunk_text}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="3" style={{ textAlign: 'center', color: '#9CA3AF' }}>No matched data available.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Resize Handle */}
        <div className="resize-handle" onMouseDown={handleResizeMouseDown}>
          <div className="resize-handle-line" />
        </div>

        {/* Right Side: AI Document */}
        <div className="review-right" style={{ flex: 1 }}>
          <div className="ai-document">
            <div className="doc-header">
              <div className="doc-header-left">
                <h3>AI Generated Document</h3>
                <div className={`doc-badge ${results?.document?.is_draft === false ? 'badge-final' : 'badge-draft'}`}>
                  {results?.document?.is_draft === false ? 'FINAL' : 'AI DRAFT'}
                </div>
              </div>
              <div className="doc-actions-group">
                <button 
                  className="secondary-btn action-btn-doc" 
                  onClick={handleSaveDocument}
                  disabled={isSaving || !localChunks.length}
                >
                  {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                  <span>{isSaving ? 'Saving...' : 'Save Draft'}</span>
                </button>
                <button 
                  className="primary-btn action-btn-doc" 
                  onClick={handleDownloadPDF}
                  disabled={isDownloadingPDF || isDownloadingWord || !localChunks.length}
                >
                  {isDownloadingPDF ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                  <span>{isDownloadingPDF ? 'Downloading...' : 'Download PDF'}</span>
                </button>
                <button 
                  className="primary-btn action-btn-doc" 
                  onClick={handleDownloadWord}
                  disabled={isDownloadingPDF || isDownloadingWord || !localChunks.length}
                  style={{ backgroundColor: '#2b579a', borderColor: '#2b579a' }}
                >
                  {isDownloadingWord ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                  <span>{isDownloadingWord ? 'Downloading...' : 'Download Word'}</span>
                </button>
              </div>
            </div>



            <div className="doc-editor-container" ref={docEditorContainerRef} onScroll={handleDocScroll}>
              {localChunks && localChunks.length > 0 ? (
                <div className="doc-chunks-list">
                  {localChunks.map((chunk, idx) => {
                    const isActive = currentTime >= chunk.audio_start_time_sec && currentTime <= chunk.audio_end_time_sec;
                    const timeStr = chunk.audio_start_time_sec !== null && chunk.audio_start_time_sec !== undefined
                      ? `[${formatTime(chunk.audio_start_time_sec)} - ${formatTime(chunk.audio_end_time_sec || chunk.audio_start_time_sec)}]`
                      : '[No Audio Time]';
                    
                    const chunkText = chunk.corrected_text || chunk.raw_chunk_text || chunk.original_raw_text || "";
                    return (
                      <div 
                        key={idx} 
                        className={`doc-chunk-block ${isActive ? 'active-chunk-block' : ''}`}
                      >
                        {/* Per-chunk timeline bar: shows timestamp + play button */}
                        {chunk.audio_start_time_sec != null && (
                          <div className="chunk-play-bar" onClick={() => handleSegmentClick(chunk.audio_start_time_sec)}>
                            <span className={`chunk-play-icon ${isActive ? 'playing' : ''}`}>
                              {isActive ? '▶' : '▷'}
                            </span>
                            <span className="chunk-timestamp">
                              {formatTime(chunk.audio_start_time_sec)}
                              {chunk.audio_end_time_sec && ` – ${formatTime(chunk.audio_end_time_sec)}`}
                            </span>
                            {isActive && <span className="chunk-now-playing">NOW PLAYING</span>}
                          </div>
                        )}
                        <textarea
                          className="doc-chunk-editor"
                          value={chunkText}
                          onChange={(e) => handleChunkTextChange(chunk.raw_chunk_id, e.target.value)}
                          rows={Math.max(2, Math.ceil(chunkText.length / 90))}
                          style={{ resize: 'vertical' }}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="doc-empty-state">
                  <p>No document chunks available. Run pipeline to generate.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>

      {/* Floating mini-player — appears when audio card scrolls out of view */}
      {isPlayerFloating && (
        <div className="floating-player">
          <div className="floating-player-inner">
            <div className="floating-player-left">
              <div className="floating-play-btn" onClick={togglePlay}>
                {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
              </div>
              <div className="floating-time">
                <span>{formatTime(currentTime)}</span>
                <span className="floating-duration"> / {formatTime(duration)}</span>
              </div>
            </div>

            <div className="floating-timeline-wrap">
              <input
                type="range"
                min="0"
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className="timeline-slider"
                style={{
                  background: `linear-gradient(to right, #003BFF 0%, #003BFF ${progressPercent}%, rgba(255,255,255,0.2) ${progressPercent}%, rgba(255,255,255,0.2) 100%)`
                }}
              />
            </div>

            <div className="floating-player-right">
              <SkipBack size={14} style={{ cursor: 'pointer', opacity: 0.8 }} onClick={skipBack} />
              <SkipForward size={14} style={{ cursor: 'pointer', opacity: 0.8 }} onClick={skipForward} />
              <div className="floating-vol-btn" onClick={toggleMute}>
                {isMuted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </div>
              <input
                type="range"
                min="0" max="1" step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="volume-slider"
                style={{ width: '60px', background: `linear-gradient(to right, #003BFF 0%, #003BFF ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.2) ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.2) 100%)` }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
