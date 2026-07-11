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
    setErrorMsg,
    tryonImageSrc,
    setTryonImageSrc,
    runVirtualTryon
  } = useAssetPipeline();

  // Flagship UI Layout States
  const [activeTab, setActiveTab] = useState<'wardrobe' | 'videogen'>('wardrobe');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  
  // Clothing upload image preview state
  const [clothImageBytes, setClothImageBytes] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');

  // Local mirror snap indicators
  const [wardrobeStyle, setWardrobeStyle] = useState<'old-money' | 'space-suit' | 'cyberpunk' | 'tactical-armor' | null>(null);
  const [activeFilter, setActiveFilter] = useState<'cinematic' | 'sci-fi' | 'war' | 'cyberpunk' | null>(null);

  // Connect Theme state to document element attributes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Hook live WebSocket voice stream session
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
      routeParsedIntent(intent);
    },
    onInterrupted: () => {
      cancelActiveRequest();
    }
  });

  // Automatically request camera/microphone streams on page load
  useEffect(() => {
    const initCameraOnLoad = async () => {
      try {
        console.log('[App] Initializing hardware media devices...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1024, height: 1024 },
          audio: true
        });
        setCameraStream(stream);
        await startSession(stream);
      } catch (e) {
        console.error('[App] Media capture blocked, requesting mic fallback:', e);
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          await startSession(stream);
        } catch (err) {
          console.error('[App] Complete mic permission block:', err);
          setErrorMsg("Hardware permissions denied. Please allow microphone & camera access to run the creative mirror.");
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

  // Route parsed voice commands dynamically to Try-On or Video Gen
  const routeParsedIntent = async (intent: any) => {
    if (!intent) return;
    const text = (intent.prompt || intent.description || '').toLowerCase();

    // 1. Check if the voice command is for Digital Try-On
    if (intent.intent === 'wardrobe' || text.includes('style') || text.includes('wear') || text.includes('coat') || text.includes('jacket') || text.includes('put on') || text.includes('outfit')) {
      setActiveTab('wardrobe');
      
      // Determine wardrobe style index instantly for zero-latency placeholder
      let localStyle: any = null;
      if (text.includes('old money') || text.includes('blazer') || text.includes('suit') || text.includes('cream')) {
        localStyle = 'old-money';
      } else if (text.includes('space') || text.includes('astronaut') || text.includes('cosmic')) {
        localStyle = 'space-suit';
      } else if (text.includes('cyberpunk') || text.includes('neon') || text.includes('jacket')) {
        localStyle = 'cyberpunk';
      } else if (text.includes('tactical') || text.includes('war') || text.includes('armor') || text.includes('vest')) {
        localStyle = 'tactical-armor';
      }
      setWardrobeStyle(localStyle);
      setTextOverlay(`AI processing try-on for style: ${text || 'clothing item'}...`);

      // Clear previous try-on result before starting a new request
      setTryonImageSrc(null);

      // Capture current canvas frame bytes as baseline
      const canvasEl = document.querySelector('.ad-canvas') as HTMLCanvasElement;
      let frameBase64 = '';
      if (canvasEl) {
        frameBase64 = canvasEl.toDataURL('image/png').split(',')[1];
      }

      // Execute backend AI try-on image-to-image edit
      await runVirtualTryon(
        text || 'fitting coat',
        frameBase64,
        clothImageBytes || undefined
      );

      setTextOverlay(clothImageBytes ? "AI Try-On: Uploaded Outfit applied" : `AI Try-On: ${text || 'coat'} applied`);

    // 2. Otherwise route to Standalone Video Generation
    } else {
      setActiveTab('videogen');
      setTextOverlay(`Generating cinematic video: "${intent.prompt || 'cinematic campaign'}"`);

      // Trigger background video loops and metadata updates
      await handleIntent(intent);
    }
  };

  // Mute / Unmute switch
  const handleMicToggle = async () => {
    if (isListening) {
      stopSession();
    } else {
      await startSession(cameraStream);
    }
  };

  // Theme Toggler
  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // Handle uploaded digital clothing pictures
  const handleClothingImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const base64 = dataUrl.split(',')[1];
      setClothImageBytes(base64);
      setTextOverlay("Digital Clothing uploaded. Speak try-on command to fit it.");
    };
    reader.readAsDataURL(file);
  };

  // Manual Trigger options for testing in standard demo environments
  const handleManualTryonTrigger = async (styleName: 'old-money' | 'space-suit' | 'cyberpunk' | 'tactical-armor') => {
    setActiveTab('wardrobe');
    setWardrobeStyle(styleName);
    setTryonImageSrc(null);
    setTextOverlay(`AI processing: trying on ${styleName.replace('-', ' ')}...`);

    const canvasEl = document.querySelector('.ad-canvas') as HTMLCanvasElement;
    let frameBase64 = '';
    if (canvasEl) {
      frameBase64 = canvasEl.toDataURL('image/png').split(',')[1];
    }

    await runVirtualTryon(
      `wear a ${styleName.replace('-', ' ')}`,
      frameBase64,
      clothImageBytes || undefined
    );
    setTextOverlay(`AI Try-On: ${styleName.replace('-', ' ')} applied`);
  };

  // Manual Video generation test
  const handleManualVideoTrigger = async (promptText: string) => {
    setActiveTab('videogen');
    const dummyIntent = {
      intent: 'animate' as const,
      prompt: promptText,
      voiceover: "Here is your cinematic generated video output."
    };
    await handleIntent(dummyIntent);
  };

  // Keyboard command override form
  const handleManualCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    
    routeParsedIntent({
      intent: 'wardrobe',
      prompt: manualInput,
      description: manualInput
    });
    setManualInput('');
  };

  return (
    <div className="app-container">
      {/* Header bar with Status Indicators & Theme toggle */}
      <header className="app-header">
        <div className="logo-section">
          <h1>VoiceCanvas AI</h1>
          <p>Real-Time Multimodal Try-On & Video Generation Hub</p>
        </div>
        <div className="header-actions">
          <button onClick={toggleTheme} className="theme-toggle-btn">
            {theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
          </button>
          <div className="system-status">
            <span className="status-indicator" data-status={status}></span>
            <span>Mirror: {status.toUpperCase()}</span>
          </div>
        </div>
      </header>

      {/* Global Alert box */}
      {(errorMsg || voiceError) && (
        <div className="alert-error">
          <strong>Notice:</strong> {errorMsg || voiceError}
        </div>
      )}

      {/* Flagship Side-by-Side layout */}
      <main className="workspace-grid">
        
        {/* Left Column: Interactive Webcam Mirror & Local Controls */}
        <section className="mirror-panel">
          <div className="mode-selectors">
            <button
              onClick={() => setActiveTab('wardrobe')}
              className={`mode-tab ${activeTab === 'wardrobe' ? 'active' : ''}`}
            >
              Virtual Styler Mirror
            </button>
            <button
              onClick={() => setActiveTab('videogen')}
              className={`mode-tab ${activeTab === 'videogen' ? 'active' : ''}`}
            >
              Live Video Canvas
            </button>
          </div>

          {/* Large Main Mirror Canvas */}
          <div style={{ position: 'relative' }}>
            <Canvas
              imageSrc={imageSrc}
              videoSrc={videoSrc}
              textOverlay={textOverlay}
              isShimmering={isGenerating}
              cameraStream={cameraStream}
              wardrobeStyle={wardrobeStyle}
              activeFilter={activeFilter}
              tryonImageSrc={tryonImageSrc}
            />
            {/* Shimmer loading spinner */}
            <PlaceholderShimmer visible={isGenerating} message={generationMessage} />
          </div>

          {/* Continuous microphone bar */}
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
          </div>

          {/* File Upload card: Snap digital outfits without wearing them */}
          <div className="card-section">
            <h3 className="card-title">Digital Cloth Upload</h3>
            <div className="upload-btn-wrapper">
              <button className="upload-design-btn">
                {clothImageBytes ? '✅ Clothing Image Loaded' : '📁 Upload Clothing Image'}
              </button>
              <input
                type="file"
                accept="image/*"
                onChange={handleClothingImageUpload}
                className="file-input"
              />
            </div>
            {clothImageBytes && (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
                <img
                  src={`data:image/png;base64,${clothImageBytes}`}
                  alt="Clothing preview"
                  style={{ width: 45, height: 45, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--panel-border)' }}
                />
                <button onClick={() => setClothImageBytes(null)} className="action-tag-btn" style={{ padding: '0.35rem 0.5rem', border: 'none', background: 'var(--danger-color)', color: 'white', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}>Remove</button>
              </div>
            )}
          </div>

          {/* Manual Try-on triggers for click demonstrations */}
          <div className="card-section">
            <h3 className="card-title">Wardrobe Styling Presets</h3>
            <div className="grid-buttons">
              <button onClick={() => handleManualTryonTrigger('old-money')} className="action-tag-btn">👔 Old Money Blazer</button>
              <button onClick={() => handleManualTryonTrigger('space-suit')} className="action-tag-btn">🚀 Space Suit</button>
              <button onClick={() => handleManualTryonTrigger('cyberpunk')} className="action-tag-btn">🧥 Cyberpunk Jacket</button>
              <button onClick={() => handleManualTryonTrigger('tactical-armor')} className="action-tag-btn">🛡️ Combat Vest</button>
            </div>
          </div>
        </section>

        {/* Right Column: Video Generation Hub */}
        <section className="video-hub-panel">
          <h3 className="card-title" style={{ fontSize: '1.25rem' }}>AI Standalone Video Output</h3>
          
          <div className="video-player-container">
            {videoSrc ? (
              <video
                src={`data:video/mp4;base64,${videoSrc}`}
                autoPlay
                loop
                muted
                playsInline
                controls
              />
            ) : (
              <div className="video-placeholder-text">
                <p style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📹</p>
                <p>No video generated yet.</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  Speak commands like: "Generate a futuristic space war video" or "create a car racing cinematic loop" to see the output here.
                </p>
              </div>
            )}
          </div>

          {/* Video player metadata details */}
          {videoSrc && (
            <div className="video-meta-section">
              <span style={{ fontWeight: 700, color: 'var(--accent-color)' }}>Status: Generation complete</span>
              <span>Asset ID: {activeAssetId || 'Seeded Session'}</span>
              <span>Inference duration: {latency ? `${(latency / 1000).toFixed(2)}s` : 'N/A'}</span>
            </div>
          )}

          {/* Manual Video triggers */}
          <div className="card-section">
            <h3 className="card-title">Video Generation Presets</h3>
            <div className="grid-buttons">
              <button onClick={() => handleManualVideoTrigger('Generate a sports car racing loop')} className="action-tag-btn">🏎️ Car Racing</button>
              <button onClick={() => handleManualVideoTrigger('Generate a space battle sci-fi scene')} className="action-tag-btn">🌌 Sci-Fi Space War</button>
            </div>
          </div>

          {/* Keyboard Form override */}
          <div className="card-section">
            <h3 className="card-title">Text Command Override</h3>
            <form onSubmit={handleManualCommandSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Type command (e.g. style me in old money coat)..."
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
                Send
              </button>
            </form>
          </div>

          {/* Telemetry log boxes */}
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
