import React, { useState, useEffect } from 'react';
import { useVoiceSession } from './hooks/useVoiceSession';
import { useAssetPipeline } from './hooks/useAssetPipeline';
import { Canvas } from './components/Canvas';
import { PlaceholderShimmer } from './components/PlaceholderShimmer';
import { TranscriptOverlay } from './components/TranscriptOverlay';
import { apiClient } from './lib/apiClient';
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
    runVirtualTryon,
    isVideoOutput
  } = useAssetPipeline();

  // Flagship UI Layout States
  const [activeTab, setActiveTab] = useState<'wardrobe' | 'videogen'>('wardrobe');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  
  // Clothing upload image preview state
  const [clothImageBytes, setClothImageBytes] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');

  // Dynamic mirror overlays
  const [wardrobeStyle, setWardrobeStyle] = useState<'old-money' | 'space-suit' | 'cyberpunk' | 'tactical-armor' | null>(null);
  const [activeFilter, setActiveFilter] = useState<'cinematic' | 'sci-fi' | 'war' | 'cyberpunk' | null>(null);
  // Track whether videoSrc is a real video (Veo MP4) or a still image (Imagen/Gemini)
  const [isVideoOutput, setIsVideoOutput] = useState(false);

  // Connect Theme state to document element attributes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Hook live SpeechRecognition transcription session
  const {
    isListening,
    status,
    transcript,
    error: voiceError,
    startSession,
    stopSession
  } = useVoiceSession({
    onIntentText: (text) => {
      processUserTextCommand(text);
    },
    onInterrupted: () => {
      cancelActiveRequest();
    }
  });

  // Request camera access immediately on page load, but keep microphone muted/off by default
  useEffect(() => {
    const initCameraOnLoad = async () => {
      try {
        console.log('[App] Requesting camera stream track...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1024, height: 1024 },
          audio: true
        });
        setCameraStream(stream);
      } catch (e) {
        console.error('[App] Camera capture blocked, trying default constraints:', e);
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          setCameraStream(stream);
        } catch (err) {
          console.error('[App] Complete media permission block:', err);
          setErrorMsg("Hardware permissions denied. Please allow camera access to run the creative mirror.");
        }
      }
    };
    initCameraOnLoad();

    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Process translated voice/text commands dynamically through Gemini without client-side keywords
  const processUserTextCommand = async (text: string) => {
    if (!text.trim()) return;

    setTextOverlay(`Listening: "${text}"...`);
    
    try {
      // 1. Send the natural language command to the backend Gemini Intent parser
      const parsed = await apiClient.parseIntent(text);
      console.log("[App] Resolved Dynamic Intent:", parsed);

      // 2. Route dynamically based on Gemini's categorization
      if (parsed.type === 'wardrobe') {
        setActiveTab('wardrobe');
        setTryonImageSrc(null); // Reset previous frame

        // Dynamically select outfit overlay placeholder based on Gemini's identified subject
        const sub = parsed.subject.toLowerCase();
        let overlayPlaceholder: any = null;
        if (sub.includes('glasses') || sub.includes('shades') || sub.includes('sunglasses') || sub.includes('spectacles')) {
          overlayPlaceholder = 'glasses';
        } else if (sub.includes('shirt') || sub.includes('t-shirt') || sub.includes('top') || sub.includes('clothing')) {
          overlayPlaceholder = 'shirt';
        } else if (sub.includes('money') || sub.includes('suit') || sub.includes('coat') || sub.includes('blazer')) {
          overlayPlaceholder = 'old-money';
        } else if (sub.includes('space') || sub.includes('astronaut')) {
          overlayPlaceholder = 'space-suit';
        } else if (sub.includes('cyber') || sub.includes('neon') || sub.includes('jacket')) {
          overlayPlaceholder = 'cyberpunk';
        } else if (sub.includes('combat') || sub.includes('armor') || sub.includes('vest') || sub.includes('tactical')) {
          overlayPlaceholder = 'tactical-armor';
        }
        setWardrobeStyle(overlayPlaceholder);
        setTextOverlay(`AI Styling: putting ${parsed.subject} on you...`);

        // Capture current canvas frame bytes
        const canvasEl = document.querySelector('.ad-canvas') as HTMLCanvasElement;
        let frameBase64 = '';
        if (canvasEl) {
          frameBase64 = canvasEl.toDataURL('image/png').split(',')[1];
        }

        // Call backend AI virtual try-on
        await runVirtualTryon(
          parsed.subject,
          frameBase64,
          clothImageBytes || undefined
        );

        setTextOverlay(clothImageBytes ? "AI Try-On: Custom uploaded item styled!" : `AI Try-On: ${parsed.subject} styled!`);

      } else if (parsed.type === 'filter') {
        setActiveTab('wardrobe');
        const sub = parsed.subject.toLowerCase();
        let activeF: any = null;
        if (sub.includes('cinematic')) activeF = 'cinematic';
        else if (sub.includes('sci-fi') || sub.includes('hud')) activeF = 'sci-fi';
        else if (sub.includes('war') || sub.includes('sepia')) activeF = 'war';
        else if (sub.includes('glitch') || sub.includes('cyber')) activeF = 'cyberpunk';
        
        setActiveFilter(activeF);
        setTextOverlay(`Applied Mirror Overlay: ${parsed.subject}`);

      } else if (parsed.type === 'videogen') {
        setActiveTab('videogen');
        setTextOverlay(`AI Video Gen: "${parsed.prompt}"...`);

        // Trigger side-panel video generation pipeline
        const dummyIntent = {
          intent: 'animate' as const,
          prompt: parsed.prompt,
          voiceover: `Here is the cinematic video loop generated for: ${parsed.prompt}`
        };
        await handleIntent(dummyIntent);
        setTextOverlay(`Video Generated: ${parsed.prompt}`);
      }

    } catch (e: any) {
      console.error("[App] Intent parsing error:", e);
      setErrorMsg(e.message || "Failed to process text command.");
    }
  };

  // Microphone toggle button
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
      setTextOverlay("Digital Clothing uploaded. Speak try-on command to style it.");
    };
    reader.readAsDataURL(file);
  };

  // Manual Trigger options for testing in standard demo environments
  const handleManualTryonTrigger = (styleName: 'old-money' | 'space-suit' | 'cyberpunk' | 'tactical-armor' | 'glasses' | 'shirt') => {
    processUserTextCommand(`wear ${styleName === 'glasses' ? 'glasses' : styleName === 'shirt' ? 'a green shirt' : 'an ' + styleName.replace('-', ' ')}`);
  };

  // Manual Video generation test
  const handleManualVideoTrigger = (promptText: string) => {
    processUserTextCommand(`generate a video of ${promptText}`);
  };

  // Keyboard command override form
  const handleManualCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    processUserTextCommand(manualInput);
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
            <span>Microphone: {status.toUpperCase()}</span>
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

          {/* Continuous microphone bar (OFF by default) */}
          <div className="voice-action-container">
            <button
              onClick={handleMicToggle}
              className={`record-btn ${isListening ? 'recording' : ''}`}
              aria-label={isListening ? 'Mute Microphone' : 'Unmute Microphone'}
            >
              {isListening ? '🎙️' : '🔇'}
            </button>
            <span className="voice-status-text">
              {isListening ? 'Microphone Listening...' : 'Microphone Muted (Click to speak)'}
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
              <button onClick={() => handleManualTryonTrigger('glasses')} className="action-tag-btn">🕶️ Glasses</button>
              <button onClick={() => handleManualTryonTrigger('shirt')} className="action-tag-btn">👕 Green T-Shirt</button>
            </div>
          </div>
        </section>

        {/* Right Column: Video Generation Hub */}
        <section className="video-hub-panel">
          <h3 className="card-title" style={{ fontSize: '1.25rem' }}>AI Standalone Video Output</h3>
          
          <div className="video-player-container">
            {videoSrc ? (
              isVideoOutput ? (
                // Veo 2 returned a real MP4 — render as looping video
                <video
                  key={videoSrc.slice(0, 20)}
                  src={`data:video/mp4;base64,${videoSrc}`}
                  autoPlay
                  loop
                  muted
                  playsInline
                  controls
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '0.75rem' }}
                />
              ) : (
                // Imagen 3 / Gemini Exp returned a still frame — render with Ken Burns motion
                <img
                  key={videoSrc.slice(0, 20)}
                  src={`data:image/jpeg;base64,${videoSrc}`}
                  alt="AI Generated Cinematic Frame"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    borderRadius: '0.75rem',
                    animation: 'kenBurns 8s ease-in-out infinite alternate'
                  }}
                />
              )
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
              <button onClick={() => handleManualVideoTrigger('sports car racing loop')} className="action-tag-btn">🏎️ Car Racing</button>
              <button onClick={() => handleManualVideoTrigger('space battle sci-fi scene')} className="action-tag-btn">🌌 Sci-Fi Space War</button>
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
            parsedIntent={null}
            latency={latency}
          />
        </section>

      </main>
    </div>
  );
}
