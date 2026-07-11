import React, { useState } from 'react';

interface TranscriptOverlayProps {
  status: string;
  transcript: string;
  parsedIntent: any;
  latency?: number;
}

export const TranscriptOverlay: React.FC<TranscriptOverlayProps> = ({
  status,
  transcript,
  parsedIntent,
  latency
}) => {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div className={`transcript-overlay ${collapsed ? 'collapsed' : ''}`}>
      <div className="transcript-header" onClick={() => setCollapsed(!collapsed)}>
        <span className="status-indicator" data-status={status}></span>
        <span className="status-label">Voice Telemetry — {status}</span>
        <button className="collapse-btn">{collapsed ? 'Show Debug' : 'Hide Debug'}</button>
      </div>
      {!collapsed && (
        <div className="transcript-content">
          <div className="telemetry-row">
            <strong>Audio Transcript:</strong>
            <p className="telemetry-text">{transcript || "Silence"}</p>
          </div>
          <div className="telemetry-row">
            <strong>Parsed Intent JSON:</strong>
            <pre className="telemetry-json">
              {parsedIntent ? JSON.stringify(parsedIntent, null, 2) : 'None'}
            </pre>
          </div>
          {latency !== undefined && (
            <div className="telemetry-row">
              <strong>E2E Generation Latency:</strong>
              <span>{latency}ms</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
