import React, { useState } from 'react';
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
    audioSrc,
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
      handleIntent(intent);
    },
    onInterrupted: () => {
      cancelActiveRequest();
    }
  });

  const handleVoiceToggle = () => {
    if (isListening) {
      stopSession();
    } else {
      startSession();
    }
  };

  // Handle manual photo uploads for try-on layers
  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Data = event.target?.result as string;
      const cleanBase64 = base64Data.split(',')[1];
      
      const newId = `avatar_${Date.now()}`;
      setActiveAssetId(newId);
      setImageSrc(base64Data);
      setVideoSrc(undefined);
      setTextOverlay("Avatar Loaded — Ready for Wardrobe Edit");
      setErrorMsg(null);

      // Pre-warm the Omni Flash video session using the uploaded avatar photo
      try {
        console.log('[App] Seeding Omni Flash session for uploaded avatar...', newId);
        await apiClient.seedVideoSession(newId, cleanBase64, "Seeded session with try-on avatar");
        console.log('[App] Omni Flash session seeded successfully.');
      } catch (err) {
        console.error("Failed to seed avatar session:", err);
        setErrorMsg("Failed to seed video session for try-on avatar.");
      }
    };
    reader.readAsDataURL(file);
  };

  // Fail-safe manual text input for demo environments
  const handleManualCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;

    const text = manualInput.trim().toLowerCase();
    let intent: any = { intent: 'new-image', prompt: manualInput };

    if (activeAssetId) {
      if (text.includes('put on') || text.includes('wear') || text.includes('clothes') || text.includes('wardrobe') || text.includes('apparel') || text.includes('shirt') || text.includes('pants')) {
        intent = { intent: 'wardrobe', description: manualInput };
      } else if (text.includes('animate') || text.includes('video') || text.includes('pan') || text.includes('motion')) {
        intent = { intent: 'animate', prompt: manualInput, voiceover: "Here is your cinematic campaign output." };
      }
    }

    handleIntent(intent);
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
          <span>Live Session: {status.toUpperCase()}</span>
        </div>
      </header>

      {/* Global Fallback Warning Alerts */}
      {(errorMsg || voiceError) && (
        <div className="alert-error">
          <strong>Notice:</strong> {errorMsg || voiceError}
        </div>
      )}

      <main className="workspace-grid">
        {/* Left Column: Drawing Canvas */}
        <section className="canvas-panel">
          <Canvas
            imageSrc={imageSrc}
            videoSrc={videoSrc}
            textOverlay={textOverlay}
            isShimmering={isGenerating}
          />
          {/* Optimistic visual loading shimmers */}
          <PlaceholderShimmer visible={isGenerating} message={generationMessage} />
        </section>

        {/* Right Column: Interaction Controls Panel */}
        <section className="controls-panel">
          {/* Voice Microphone Controls Card */}
          <div className="card-section">
            <h3 className="card-title">Continuous Microphone Pipeline</h3>
            <div className="voice-action-container">
              <button
                onClick={handleVoiceToggle}
                className={`record-btn ${isListening ? 'recording' : ''}`}
                aria-label={isListening ? 'Stop Listening' : 'Start Listening'}
              >
                {isListening ? '🎙️' : '🎤'}
              </button>
              <span className="voice-status-text">
                {isListening ? 'Listening... Speak continuously' : 'Microphone Inactive'}
              </span>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                {isListening ? 'Say: "Create ad for coffee..." or "put on a jacket" or "animate to panning shot"' : 'Click to establish direct WebSocket connection'}
              </p>
            </div>
          </div>

          {/* Wardrobe Try-On Upload Wrapper */}
          <div className="card-section">
            <h3 className="card-title">Avatar Try-On Layer</h3>
            <div className="upload-btn-wrapper">
              <button className="upload-design-btn">📁 Upload Avatar Photo</button>
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="file-input"
              />
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Upload a base photo, then speak or type: "Put on a black oversized t-shirt with beige cargo pants"
            </p>
          </div>

          {/* Regional Localization Translation triggers */}
          <div className="card-section">
            <h3 className="card-title">Regional Translation Passes</h3>
            <div className="lang-selector-group">
              <button onClick={() => triggerTranslation('Hindi')} className="lang-btn">Hindi (हिन्दी)</button>
              <button onClick={() => triggerTranslation('Kannada')} className="lang-btn">Kannada (ಕನ್ನಡ)</button>
            </div>
          </div>

          {/* Manual Input Fail-safe Input Box */}
          <div className="card-section">
            <h3 className="card-title">Keyboard Override (Fail-safe)</h3>
            <form onSubmit={handleManualCommandSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Type fallback command here..."
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

          {/* Telemetry Debug overlay strip */}
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
