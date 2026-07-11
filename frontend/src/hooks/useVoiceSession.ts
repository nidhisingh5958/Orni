import { useState, useRef, useEffect, useCallback } from 'react';
import { VoiceStreamClient } from '../components/VoiceStreamClient';
import type { ParsedIntent } from '../lib/intentTypes';

export function useVoiceSession(callbacks: {
  onIntent: (intent: ParsedIntent) => void;
  onInterrupted: () => void;
}) {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [transcript, setTranscript] = useState('');
  const [parsedIntent, setParsedIntent] = useState<ParsedIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<VoiceStreamClient | null>(null);

  const startSession = useCallback(async (existingStream?: MediaStream | null) => {
    setError(null);
    setTranscript('');
    setParsedIntent(null);

    const client = new VoiceStreamClient({
      onTranscriptChunk: (chunk) => {
        setTranscript((prev) => prev + chunk);
      },
      onIntentParsed: (intent) => {
        setParsedIntent(intent);
        callbacks.onIntent(intent);
      },
      onInterrupted: () => {
        callbacks.onInterrupted();
      },
      onError: (msg) => {
        setError(msg);
      },
      onStatusChange: (newStatus) => {
        setStatus(newStatus);
      }
    });

    clientRef.current = client;
    await client.start(existingStream);
  }, [callbacks]);

  const stopSession = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.stop();
      clientRef.current = null;
    }
    setStatus('disconnected');
  }, []);

  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.stop();
      }
    };
  }, []);

  return {
    isListening: status === 'connected' || status === 'connecting',
    status,
    transcript,
    parsedIntent,
    error,
    startSession,
    stopSession
  };
}
