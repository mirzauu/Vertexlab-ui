import React, { useState, useEffect, useRef } from 'react';
import './ReviewEdit.css';
import { Play, Pause, SkipBack, SkipForward, Save, Send, ArrowLeft, Loader2, Volume1, Volume2, VolumeX, Zap, Download, FileText, ChevronDown, Sliders, X, Maximize2 } from 'lucide-react';
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
    audioPromise: null,
    audioUrl: null,
    resultsData: null,
    taskFiles: null,
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
  const [audioLoading, setAudioLoading] = useState(false);
  const [localChunks, setLocalChunks] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);
  const [isDownloadingWord, setIsDownloadingWord] = useState(false);
  const [showDownloadDropdown, setShowDownloadDropdown] = useState(false);
  const downloadDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (downloadDropdownRef.current && !downloadDropdownRef.current.contains(event.target)) {
        setShowDownloadDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
  const [transcriptionExpanded, setTranscriptionExpanded] = useState(true);
  const [matchesExpanded, setMatchesExpanded] = useState(true);
  const [highlightTimeRange, setHighlightTimeRange] = useState(null);
  const [isPlayerFloating, setIsPlayerFloating] = useState(false);
  const [isPlayerClosed, setIsPlayerClosed] = useState(false);
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
        // Fetch results & files in parallel
        const [res, filesRes] = await Promise.all([
          api(`/api/v1/organizations/${orgId}/tasks/${task.id}/pipeline/results`, { signal }),
          api(`/api/v1/organizations/${orgId}/tasks/${task.id}/files`, { signal })
        ]);

        let resultsData = null;
        if (res.ok) {
          resultsData = await res.json();
        }

        let taskFiles = [];
        if (filesRes.ok) {
          taskFiles = await filesRes.json();
        }

        session.resultsData = resultsData;
        session.taskFiles = taskFiles;
        return { resultsData, taskFiles };
      })();
    }

    const startAudioDownload = (taskFiles, resultsData) => {
      if (session.audioPromise) {
        // If promise exists, hook the .then handler to this mount instance
        session.audioPromise.then((url) => {
          if (!signal.aborted) {
            if (url) setAudioUrl(url);
            setAudioLoading(false);
          }
        });
        return;
      }

      const audioFile = taskFiles.find(f => 
        f.file_type === 'audio' || 
        (resultsData && f.file_path === resultsData.audio_file_path)
      );

      if (!audioFile) {
        console.warn("No audio files attached to this task to play.");
        return;
      }

      setAudioLoading(true);
      session.audioPromise = (async () => {
        try {
          const audioRes = await api(`/api/v1/files/${audioFile.id}/download`, { signal });
          if (audioRes.ok) {
            const blob = await audioRes.blob();
            const url = URL.createObjectURL(blob);
            session.audioUrl = url;
            return url;
          } else {
            console.error("Failed to download audio. Status:", audioRes.status);
            return null;
          }
        } catch (err) {
          if (err.name !== 'AbortError') {
            console.error("Audio download error:", err);
            session.audioPromise = null;
          }
          return null;
        }
      })();

      session.audioPromise.then((url) => {
        if (!signal.aborted) {
          if (url) setAudioUrl(url);
          setAudioLoading(false);
        }
      });
    };

    const loadWorkstationData = async () => {
      try {
        const { resultsData, taskFiles } = await session.dataPromise;
        if (!signal.aborted) {
          if (resultsData) setResults(resultsData);
          setLoading(false);
        }

        if (session.audioUrl) {
          setAudioUrl(session.audioUrl);
          setAudioLoading(false);
        } else if (taskFiles) {
          startAudioDownload(taskFiles, resultsData);
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error("Failed to load workstation data:", err);
          session.dataPromise = null;
        }
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

  const handleCrossPanelHover = (startTime, endTime) => {
    setHighlightTimeRange({ start: startTime, end: endTime });
  };

  const handleCrossPanelLeave = () => {
    setHighlightTimeRange(null);
  };

  const isTimeHighlighted = (startTime, endTime) => {
    if (!highlightTimeRange || startTime == null || endTime == null) return false;
    return startTime <= highlightTimeRange.end && endTime >= highlightTimeRange.start;
  };

  // Keyboard shortcuts for power users
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
      
      if (e.code === 'Space') {
        e.preventDefault();
        if (audioRef.current) {
          if (audioRef.current.paused) {
            initAudioContext();
            if (audioContextRef.current?.state === 'suspended') {
              audioContextRef.current.resume();
            }
            audioRef.current.play();
            setIsPlaying(true);
          } else {
            audioRef.current.pause();
            setIsPlaying(false);
          }
        }
      }
      if (e.ctrlKey && e.key === '1') {
        e.preventDefault();
        setTranscriptionExpanded(prev => !prev);
      }
      if (e.ctrlKey && e.key === '2') {
        e.preventDefault();
        setMatchesExpanded(prev => !prev);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

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

    // Auto-scroll AI document to the currently playing paragraph
    if (docEditorContainerRef.current) {
      const activePara = docEditorContainerRef.current.querySelector('.active-paragraph');
      if (activePara) {
        triggerProgrammaticScroll(docEditorContainerRef.current, activePara, userScrollingDocRef);
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

  const isAudioDisabled = loading || audioLoading || !audioUrl;

  return (
    <>
    <div className="review-container">
      <div className="back-button-container" style={{ marginBottom: '24px' }}>
        <button 
          className="back-btn" 
          onClick={onBack} 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            background: 'white', 
            border: '1px solid var(--border-color)', 
            borderRadius: '10px',
            color: 'var(--text-dark)', 
            fontSize: '0.88rem', 
            fontWeight: '600', 
            cursor: 'pointer', 
            padding: '8px 16px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--sidebar-hover)'; e.currentTarget.style.transform = 'translateX(-2px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.transform = 'none'; }}
        >
          <ArrowLeft size={16} />
          <span>Back to Tasks</span>
        </button>
      </div>
      <div className="review-content" ref={reviewContentRef}>
        {/* Left Side: Sources */}
        <div className="review-left" style={{ width: `${leftPanelWidth}%`, flex: 'none' }}>
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

          {!isPlayerClosed && (
            <div className="review-card audio-player sticky-audio-player" ref={audioPlayerCardRef}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>Audio File</h3>
                <button 
                  onClick={() => setIsPlayerClosed(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#9CA3AF',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-dark)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#9CA3AF'}
                  title="Collapse Player"
                >
                  <X size={14} />
                </button>
              </div>

            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', margin: '16px 0', color: '#6B7280', fontSize: '0.85rem', fontWeight: '500' }}>
                <Loader2 className="animate-spin" size={16} color="#5B44E9" />
                <span>Checking audio files...</span>
              </div>
            )}

            {!loading && audioLoading && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', margin: '16px 0', color: '#6B7280', fontSize: '0.85rem', fontWeight: '500' }}>
                <Loader2 className="animate-spin" size={16} color="#5B44E9" />
                <span>Downloading audio for playback...</span>
              </div>
            )}

            {!loading && !audioLoading && !audioUrl && (
              <div style={{ margin: '16px 0', textAlign: 'center', color: '#9CA3AF', fontSize: '0.85rem' }}>
                No playable audio file attached to this task.
              </div>
            )}

            <div className="player-controls" style={{ opacity: isAudioDisabled ? 0.5 : 1, pointerEvents: isAudioDisabled ? 'none' : 'auto' }}>
              <div className="timeline-container" style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                <input 
                  type="range"
                  min="0"
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleSeek}
                  className="timeline-slider"
                  style={{
                    background: `linear-gradient(to right, #5B44E9 0%, #5B44E9 ${progressPercent}%, #F3F4F6 ${progressPercent}%, #F3F4F6 100%)`
                  }}
                />
                <div className="time-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#9CA3AF', fontWeight: '500' }}>
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              <div className="controls-row-wrapper" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                
                {/* Left: Playback controls + inline time */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="main-btns" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button 
                      onClick={skipBack}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dark)', padding: '4px', display: 'flex', alignItems: 'center' }}
                    >
                      <SkipBack size={18} />
                    </button>
                    <div 
                      className="play-btn" 
                      onClick={togglePlay}
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--text-dark)',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'transform 0.2s'
                      }}
                    >
                      {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                    </div>
                    <button 
                      onClick={skipForward}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dark)', padding: '4px', display: 'flex', alignItems: 'center' }}
                    >
                      <SkipForward size={18} />
                    </button>
                  </div>
                  
                  <div className="time-display" style={{ fontSize: '0.75rem', color: '#9CA3AF', fontWeight: '600', whiteSpace: 'nowrap' }}>
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </div>
                </div>

                {/* Right: Volume Hover + settings icon toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div className="volume-hover-container">
                    <button 
                      className="volume-icon-btn" 
                      onClick={toggleMute}
                      title={isMuted ? "Unmute" : "Mute"}
                    >
                      {isMuted || volume === 0 ? <VolumeX size={16} /> : volume < 0.5 ? <Volume1 size={16} /> : <Volume2 size={16} />}
                    </button>
                    <div className="volume-hover-slider">
                      <input 
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={isMuted ? 0 : volume}
                        onChange={handleVolumeChange}
                        className="volume-slider"
                        style={{
                          width: '70px',
                          background: `linear-gradient(to right, #5B44E9 0%, #5B44E9 ${(isMuted ? 0 : volume) * 100}%, #F3F4F6 ${(isMuted ? 0 : volume) * 100}%, #F3F4F6 100%)`
                        }}
                      />
                    </div>
                  </div>

                  <button 
                    className={`fx-toggle-icon ${showFxPanel ? 'fx-active' : ''}`}
                    onClick={() => setShowFxPanel(!showFxPanel)}
                    title="Audio Adjustments"
                  >
                    <Sliders size={16} />
                    {(speechEnhancer || filterMode !== 'normal' || isBoosted) && <div className="fx-indicator" />}
                  </button>
                </div>

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
                      <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-dark)', display: 'block' }}>Audio Volume Boost</span>
                      <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>Boost volume past standard maximum for quiet audio files</span>
                    </div>
                    <button
                      className={`boost-btn ${isBoosted ? 'boost-active' : ''}`}
                      onClick={toggleBoost}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        border: '1px solid',
                        cursor: 'pointer',
                        backgroundColor: isBoosted ? '#FF5E00' : 'transparent',
                        color: isBoosted ? 'white' : 'var(--text-dark)',
                        borderColor: isBoosted ? '#FF5E00' : 'var(--border-color)',
                        boxShadow: isBoosted ? '0 0 10px rgba(255, 94, 0, 0.3)' : 'none',
                        transition: 'all 0.2s'
                      }}
                    >
                      <Zap size={12} fill={isBoosted ? 'currentColor' : 'none'} className={isBoosted ? 'boost-active-icon' : ''} />
                      <span>{isBoosted ? 'BOOST ACTIVE' : 'BOOST OFF'}</span>
                    </button>
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
          )}

          {/* Accordion Container — both sections visible, one expanded at a time */}
          <div className="accordion-container">
            {/* ── Transcription Section ──────────────────────── */}
            <div className={`accordion-section ${transcriptionExpanded ? 'expanded' : 'collapsed'}`}>
              <div className="accordion-header" onClick={() => setTranscriptionExpanded(!transcriptionExpanded)}>
                <div className="accordion-header-left">
                  <ChevronDown size={16} className="accordion-chevron" />
                  <span className="accordion-title">Transcription</span>
                  {results?.transcribed_data?.length > 0 && (
                    <span className="accordion-count">{results.transcribed_data.length}</span>
                  )}
                </div>
                {!transcriptionExpanded && results?.transcribed_data?.length > 0 && (
                  <span className="accordion-preview">{results.transcribed_data.length} segments</span>
                )}
              </div>
              <div className="accordion-content" ref={transcriptContainerRef} onScroll={handleTranscriptScroll}>
                {loading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }}>
                    <div className="skeleton-bar long shimmer" style={{ height: '16px' }} />
                    <div className="skeleton-bar medium shimmer" style={{ height: '16px' }} />
                    <div className="skeleton-bar short shimmer" style={{ height: '16px' }} />
                    <div className="skeleton-bar long shimmer" style={{ height: '16px' }} />
                    <div className="skeleton-bar medium shimmer" style={{ height: '16px' }} />
                  </div>
                ) : results?.transcribed_data && results.transcribed_data.length > 0 ? (
                  (() => {
                    let lastSpeaker = null;
                    return results.transcribed_data.map((segment, index) => {
                      const isActive = currentTime >= segment.start && currentTime <= segment.end;
                      const isCrossHighlighted = isTimeHighlighted(segment.start, segment.end);
                      const showSpeakerHeader = segment.speaker !== lastSpeaker;
                      lastSpeaker = segment.speaker;
                      
                      return (
                        <React.Fragment key={index}>
                          {showSpeakerHeader && (
                            <div className="transcript-speaker-header" style={{ fontWeight: '700', fontSize: '0.72rem', color: '#5B44E9', marginTop: '14px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.08em', paddingLeft: '8px' }}>
                              {segment.speaker || "Speaker"}
                            </div>
                          )}
                          <p 
                            className={`transcript-segment ${isActive ? 'active-segment' : ''} ${isCrossHighlighted && !isActive ? 'cross-highlight' : ''}`}
                            onClick={() => handleSegmentClick(segment.start)}
                            onMouseEnter={() => handleCrossPanelHover(segment.start, segment.end)}
                            onMouseLeave={handleCrossPanelLeave}
                            style={{ margin: '2px 0', paddingLeft: '8px', borderLeft: '3px solid transparent' }}
                          >
                            <span style={{ fontSize: '0.75rem', opacity: 0.6, marginRight: '8px', fontWeight: '500' }}>[{formatTime(segment.start)}]</span>
                            {segment.text}
                          </p>
                        </React.Fragment>
                      );
                    });
                  })()
                ) : (
                  <p style={{ color: '#9CA3AF' }}>No transcription data available.</p>
                )}
              </div>
            </div>
 
            {/* ── Matches Section ───────────────────────────── */}
            <div className={`accordion-section ${matchesExpanded ? 'expanded' : 'collapsed'}`}>
              <div className="accordion-header" onClick={() => setMatchesExpanded(!matchesExpanded)}>
                <div className="accordion-header-left">
                  <ChevronDown size={16} className="accordion-chevron" />
                  <span className="accordion-title">Matches</span>
                  {results?.matches?.length > 0 && (
                    <span className="accordion-count">{results.matches.length}</span>
                  )}
                </div>
                {!matchesExpanded && results?.matches?.length > 0 && (
                  <span className="accordion-preview">
                    {results.matches.filter(m => m.confidence_score >= 80).length} high confidence
                  </span>
                )}
              </div>
              <div className="accordion-content" ref={dataTableWrapperRef} onScroll={handleDataScroll}>
                {loading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 0' }}>
                    <div className="skeleton-bar long shimmer" style={{ height: '40px', borderRadius: '10px' }} />
                    <div className="skeleton-bar long shimmer" style={{ height: '40px', borderRadius: '10px' }} />
                    <div className="skeleton-bar long shimmer" style={{ height: '40px', borderRadius: '10px' }} />
                  </div>
                ) : results?.matches && results.matches.length > 0 ? (
                  results.matches.map((match, index) => {
                    const isActive = currentTime >= match.audio_start_time_sec && currentTime <= match.audio_end_time_sec;
                    const isCrossHighlighted = isTimeHighlighted(match.audio_start_time_sec, match.audio_end_time_sec);
                    const score = match.confidence_score || 0;
                    const confidenceClass = score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low';
                    
                    return (
                      <div
                        key={index}
                        className={`match-row ${isActive ? 'active-match' : ''} ${isCrossHighlighted && !isActive ? 'cross-highlight' : ''}`}
                        onClick={() => {
                          if (match.audio_start_time_sec != null) {
                            handleSegmentClick(match.audio_start_time_sec);
                          }
                        }}
                        onMouseEnter={() => handleCrossPanelHover(match.audio_start_time_sec, match.audio_end_time_sec)}
                        onMouseLeave={handleCrossPanelLeave}
                      >
                        <span 
                          className={`confidence-dot ${confidenceClass}`} 
                          title={`${score.toFixed(1)}% confidence`}
                        />
                        <div className="match-meta">
                          <div className="match-meta-top">
                            <span className="match-confidence-label">{score.toFixed(1)}%</span>
                            <span className="match-status">{match.match_status}</span>
                          </div>
                          <span className="match-text">{match.raw_chunk_text}</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p style={{ color: '#9CA3AF', textAlign: 'center', padding: '20px 0' }}>No matched data available.</p>
                )}
              </div>
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
                {loading ? (
                  <div className="skeleton-bar shimmer" style={{ height: '20px', width: '70px', margin: 0, borderRadius: '6px' }} />
                ) : (
                  <div className={`doc-badge ${results?.document?.is_draft === false ? 'badge-final' : 'badge-draft'}`}>
                    {results?.document?.is_draft === false ? 'FINAL' : 'AI DRAFT'}
                  </div>
                )}
              </div>
              <div className="doc-actions-group">
                <button 
                  className="secondary-btn action-btn-doc" 
                  onClick={handleSaveDocument}
                  disabled={loading || isSaving || !localChunks.length}
                >
                  {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                  <span>{isSaving ? 'Saving...' : 'Save Draft'}</span>
                </button>
                <div className="download-dropdown-container" ref={downloadDropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
                  <button 
                    className="primary-btn action-btn-doc" 
                    onClick={() => setShowDownloadDropdown(!showDownloadDropdown)}
                    disabled={loading || isDownloadingPDF || isDownloadingWord || !localChunks.length}
                  >
                    {isDownloadingPDF || isDownloadingWord ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <Download size={16} />
                    )}
                    <span>
                      {isDownloadingPDF ? 'Downloading PDF...' : 
                       isDownloadingWord ? 'Downloading Word...' : 
                       'Download'}
                    </span>
                  </button>

                  {showDownloadDropdown && (
                    <div 
                      className="download-dropdown-menu" 
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: '100%',
                        marginTop: '8px',
                        backgroundColor: 'white',
                        border: '1px solid var(--border-color)',
                        borderRadius: '12px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                        zIndex: 100,
                        minWidth: '160px',
                        overflow: 'hidden'
                      }}
                    >
                      <button
                        onClick={() => {
                          setShowDownloadDropdown(false);
                          handleDownloadPDF();
                        }}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-dark)',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          fontWeight: '500',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--sidebar-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <FileText size={16} color="#dc2626" />
                        <span>Download PDF</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowDownloadDropdown(false);
                          handleDownloadWord();
                        }}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-dark)',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          fontWeight: '500',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--sidebar-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <FileText size={16} color="#2b579a" />
                        <span>Download Word</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>



            <div className="doc-editor-container" ref={docEditorContainerRef} onScroll={handleDocScroll}>
              {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '16px' }}>
                  <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
                    <div className="skeleton-bar short shimmer" style={{ height: '12px', marginBottom: '8px' }} />
                    <div className="skeleton-bar long shimmer" style={{ height: '60px' }} />
                  </div>
                  <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
                    <div className="skeleton-bar short shimmer" style={{ height: '12px', marginBottom: '8px' }} />
                    <div className="skeleton-bar medium shimmer" style={{ height: '40px' }} />
                  </div>
                  <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
                    <div className="skeleton-bar short shimmer" style={{ height: '12px', marginBottom: '8px' }} />
                    <div className="skeleton-bar long shimmer" style={{ height: '80px' }} />
                  </div>
                </div>
              ) : localChunks && localChunks.length > 0 ? (
                <div className="doc-page">
                  {localChunks.map((chunk, idx) => {
                    const isActive = currentTime >= chunk.audio_start_time_sec && currentTime <= chunk.audio_end_time_sec;
                    const isCrossHighlighted = isTimeHighlighted(chunk.audio_start_time_sec, chunk.audio_end_time_sec);
                    const chunkText = chunk.corrected_text || chunk.raw_chunk_text || chunk.original_raw_text || "";

                    return (
                      <div
                        key={idx}
                        className={`doc-paragraph ${isActive ? 'active-paragraph' : ''} ${isCrossHighlighted && !isActive ? 'cross-highlight' : ''}`}
                        onMouseEnter={() => handleCrossPanelHover(chunk.audio_start_time_sec, chunk.audio_end_time_sec)}
                        onMouseLeave={handleCrossPanelLeave}
                        onClick={() => {
                          if (chunk.audio_start_time_sec != null) {
                            handleSegmentClick(chunk.audio_start_time_sec);
                          }
                        }}
                      >
                        <textarea
                          ref={(el) => {
                            if (el) {
                              el.style.height = 'auto';
                              el.style.height = `${el.scrollHeight}px`;
                            }
                          }}
                          className="doc-paragraph-text"
                          value={chunkText}
                          onChange={(e) => {
                            handleChunkTextChange(chunk.raw_chunk_id, e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = `${e.target.scrollHeight}px`;
                          }}
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

      {/* Floating mini-player — appears when audio card scrolls out of view or is collapsed */}
      {(isPlayerFloating || isPlayerClosed) && !isAudioDisabled && (
        <div className="floating-player">
          <div className="floating-player-inner">
            <div className="floating-player-left">
              {isPlayerClosed && (
                <button 
                  onClick={() => setIsPlayerClosed(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'white',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    marginRight: '8px',
                    opacity: 0.8,
                    transition: 'opacity 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}
                  title="Expand Player"
                >
                  <Maximize2 size={16} />
                </button>
              )}
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
                  background: `linear-gradient(to right, #5B44E9 0%, #5B44E9 ${progressPercent}%, rgba(255,255,255,0.2) ${progressPercent}%, rgba(255,255,255,0.2) 100%)`
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
                style={{ width: '60px', background: `linear-gradient(to right, #5B44E9 0%, #5B44E9 ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.2) ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.2) 100%)` }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
