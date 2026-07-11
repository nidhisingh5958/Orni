import React, { useState, useEffect } from 'react';
import { useVoiceSession } from './hooks/useVoiceSession';
import { useAssetPipeline } from './hooks/useAssetPipeline';
import { Canvas } from './components/Canvas';
import { PlaceholderShimmer } from './components/PlaceholderShimmer';
import { TranscriptOverlay } from './components/TranscriptOverlay';
import './styles/app.css';

export default function App() {
  const {
    activeAssetId,
    imageSrc,
    videoSrc,
    textOverlay,
    isGenerating,
    generationMessage,
    latency,
    errorMsg,
    handleIntent,
    cancelActiveRequest,
    setImageSrc,
    setVideoSrc,
    setTextOverlay,
    setActiveAssetId,
    setErrorMsg
  } = useAssetPipeline();

  const [manualInput, setManualInput] = useState('');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  
  // Real-time styling states (snapped instantly for zero-latency feedback)
  const [wardrobeStyle, setWardrobeStyle] = useState<'old-money' | 'space-suit' | 'cyberpunk' | 'tactical-armor' | null>(null);
  const [activeFilter, setActiveFilter] = useState<'cinematic' | 'sci-fi' | 'war' | 'cyberpunk' | null>(null);

  // Connect to live voice session
  const {
    isListening,
    status,
    transcript,
    parsedIntent,
    error: voiceError,
    startSession,
    stopSession
  } = useVoiceSession({
    onIntent: (intent) => {
      // 1. Trigger zero-latency canvas updates
      parseLocalIntent(intent);
      // 2. Launch background Gemini asset pipeline
      handleIntent(intent);
    },
    onInterrupted: () => {
      cancelActiveRequest();
    }
  });

  // Local zero-latency intent parser to change canvas overlays instantly
  const parseLocalIntent = (intent: any) => {
    if (!intent) return;
    const text = (intent.prompt || intent.description || '').toLowerCase();
    
    if (intent.intent === 'wardrobe' || text.includes('style') || text.includes('wear') || text.includes('outfit')) {
      if (text.includes('old money') || text.includes('blazer') || text.includes('suit') || text.includes('cream')) {
        setWardrobeStyle('old-money');
        setTextOverlay("Wardrobe: Old Money Cream Blazer");
      } else if (text.includes('space') || text.includes('astronaut') || text.includes('sci fi') || text.includes('cosmic')) {
        setWardrobeStyle('space-suit');
        setTextOverlay("Wardrobe: Cyber Space Suit");
      } else if (text.includes('cyberpunk') || text.includes('neon') || text.includes('jacket') || text.includes('pink')) {
        setWardrobeStyle('cyberpunk');
        setTextOverlay("Wardrobe: Cyberpunk Neon Jacket");
      } else if (text.includes('tactical') || text.includes('war') || text.includes('armor') || text.includes('vest')) {
        setWardrobeStyle('tactical-armor');
        setTextOverlay("Wardrobe: Tactical Combat Armor");
      }
    }

    if (intent.intent === 'animate' || intent.intent === 'new-image' || text.includes('cinematic') || text.includes('filter') || text.includes('theme') || text.includes('video')) {
      if (text.includes('cinematic') || text.includes('widescreen') || text.includes('movie')) {
        setActiveFilter('cinematic');
        setTextOverlay("Theme: Widescreen Cinematic 2.39:1");
      } else if (text.includes('sci fi') || text.includes('hud') || text.includes('space') || text.includes('grid')) {
        setActiveFilter('sci-fi');
        setTextOverlay("Theme: Sci-Fi Telemetry HUD");
      } else if (text.includes('war') || text.includes('battle') || text.includes('sepia') || text.includes('military')) {
        setActiveFilter('war');
        setTextOverlay("Theme: War Room Sepia Feed");
      } else if (text.includes('cyberpunk') || text.includes('glitch') || text.includes('static')) {
        setActiveFilter('cyberpunk');
        setTextOverlay("Theme: Cyberpunk Glitch Scanlines");
      }
    }
  };

  // Automatically initialize camera and microphone on page load
  useEffect(() => {
    const initCameraOnLoad = async () => {
      try {
        console.log('[App] Requesting hardware media permissions on load...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1024, height: 1024 },
          audio: true
        });
        setCameraStream(stream);
        
        // Connect WebSocket speech session reusing the webcam stream
        await startSession(stream);
      } catch (e) {
        console.error('[App] Direct audio/video getUserMedia block, falling back to mic only:', e);
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          await startSession(stream);
        } catch (err) {
          console.error('[App] Complete hardware permission block:', err);
          setErrorMsg("Hardware permissions denied. Please allow camera & microphone access in your browser.");
        }
      }
    };
    initCameraOnLoad();

    return () => {
      stopSession();
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Simple Mic Mute / Unmute switch
  const handleMicToggle = async () => {
    if (isListening) {
      stopSession();
    } else {
      await startSession(cameraStream);
    }
  };

  // Manual Trigger helper buttons for demo click-throughs
  const handleManualStyleChange = (type: 'wardrobe' | 'filter', value: any) => {
    if (type === 'wardrobe') {
      setWardrobeStyle(value);
      setTextOverlay(`Wardrobe snapped: ${value ? value.replace('-', ' ') : 'None'}`);
    } else {
      setActiveFilter(value);
      setTextOverlay(`Theme filter: ${value ? value : 'None'}`);
    }
  };

  // Fail-safe manual text input form
  const handleManualCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;

    const dummyIntent = {
      intent: 'wardrobe',
      prompt: manualInput,
      description: manualInput
    };
    parseLocalIntent(dummyIntent);
    handleIntent(dummyIntent);
    setManualInput('');
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-section">
          <h1>VoiceCanvas AI</h1>
          <p>Real-Time Voice-Driven Multimodal Creative Pipeline</p>
        </div>
        <div className="system-status">
          <span className="status-indicator" data-status={status}></span>
          <span>Live Mirror Connection: {status.toUpperCase()}</span>
        </div>
      </header>

      {/* Global Warning Alerts */}
      {(errorMsg || voiceError) && (
        <div className="alert-error">
          <strong>Notice:</strong> {errorMsg || voiceError}
        </div>
      )}

      <main className="workspace-grid">
        {/* Left Column: Center Interactive Mirror Canvas */}
        <section className="canvas-panel">
          <Canvas
            imageSrc={imageSrc}
            videoSrc={videoSrc}
            textOverlay={textOverlay}
            isShimmering={isGenerating}
            cameraStream={cameraStream}
            wardrobeStyle={wardrobeStyle}
            activeFilter={activeFilter}
          />
          {/* Optimistic visual loader shimmers */}
          <PlaceholderShimmer visible={isGenerating} message={generationMessage} />
        </section>

        {/* Right Column: Mirror Dashboard Controls */}
        <section className="controls-panel">
          {/* Microphone Status card */}
          <div className="card-section">
            <h3 className="card-title">Continuous Microphone Pipeline</h3>
            <div className="voice-action-container">
              <button
                onClick={handleMicToggle}
                className={`record-btn ${isListening ? 'recording' : ''}`}
                aria-label={isListening ? 'Mute Microphone' : 'Unmute Microphone'}
              >
                {isListening ? '🎙️' : '🔇'}
              </button>
              <span className="voice-status-text">
                {isListening ? 'Microphone Active' : 'Microphone Muted'}
              </span>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                {isListening ? 'Speak naturally to change wardrobes or cinematic video loops' : 'Click microphone icon to unmute voice session'}
              </p>
            </div>
          </div>

          {/* Real-time Digital Wardrobe Triggers */}
          <div className="card-section">
            <h3 className="card-title">Virtual Wardrobe Snaps</h3>
            <div className="grid-buttons">
              <button onClick={() => handleManualStyleChange('wardrobe', 'old-money')} className={`action-tag-btn ${wardrobeStyle === 'old-money' ? 'active-tag' : ''}`}>👔 Old Money</button>
              <button onClick={() => handleManualStyleChange('wardrobe', 'space-suit')} className={`action-tag-btn ${wardrobeStyle === 'space-suit' ? 'active-tag' : ''}`}>🚀 Space Suit</button>
              <button onClick={() => handleManualStyleChange('wardrobe', 'cyberpunk')} className={`action-tag-btn ${wardrobeStyle === 'cyberpunk' ? 'active-tag' : ''}`}>🧥 Cyberpunk Jacket</button>
              <button onClick={() => handleManualStyleChange('wardrobe', 'tactical-armor')} className={`action-tag-btn ${wardrobeStyle === 'tactical-armor' ? 'active-tag' : ''}`}>🛡️ Combat Armor</button>
              <button onClick={() => handleManualStyleChange('wardrobe', null)} className="action-tag-btn reset">Clear Wardrobe</button>
            </div>
          </div>

          {/* Real-time Cinematic Filters */}
          <div className="card-section">
            <h3 className="card-title">Cinematic Video & HUD Filters</h3>
            <div className="grid-buttons">
              <button onClick={() => handleManualStyleChange('filter', 'cinematic')} className={`action-tag-btn ${activeFilter === 'cinematic' ? 'active-tag' : ''}`}>🎬 Cinematic 2.39:1</button>
              <button onClick={() => handleManualStyleChange('filter', 'sci-fi')} className={`action-tag-btn ${activeFilter === 'sci-fi' ? 'active-tag' : ''}`}>🛰️ Sci-Fi HUD</button>
              <button onClick={() => handleManualStyleChange('filter', 'war')} className={`action-tag-btn ${activeFilter === 'war' ? 'active-tag' : ''}`}>💥 Sepia War room</button>
              <button onClick={() => handleManualStyleChange('filter', 'cyberpunk')} className={`action-tag-btn ${activeFilter === 'cyberpunk' ? 'active-tag' : ''}`}>⚡ Cyber Glitch</button>
              <button onClick={() => handleManualStyleChange('filter', null)} className="action-tag-btn reset">Clear Theme</button>
            </div>
          </div>

          {/* Manual Command Form */}
          <div className="card-section">
            <h3 className="card-title">Manual Keyboard Override</h3>
            <form onSubmit={handleManualCommandSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Type wardrobe or video style..."
                style={{
                  flex: 1,
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid var(--panel-border)',
                  borderRadius: '10px',
                  padding: '0.75rem',
                  color: 'white'
                }}
              />
              <button
                type="submit"
                style={{
                  background: 'var(--accent-color)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '0.75rem 1.25rem',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Apply
              </button>
            </form>
          </div>

          {/* Telemetry diagnostics overlay strip */}
          <TranscriptOverlay
            status={status}
            transcript={transcript}
            parsedIntent={parsedIntent}
            latency={latency}
          />
        </section>
      </main>
    </div>
  );
}
