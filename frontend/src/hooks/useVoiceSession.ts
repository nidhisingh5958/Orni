import { useState, useRef, useEffect, useCallback } from 'react';

export function useVoiceSession(callbacks: {
  onIntentText: (text: string) => void;
  onInterrupted: () => void;
}) {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef<boolean>(false);

  const startSession = useCallback(async (existingStream?: MediaStream | null) => {
    setError(null);
    setTranscript('');
    setStatus('connecting');

    // Resolve native speech recognition constructors in web environments
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.");
      setStatus('disconnected');
      return;
    }

    try {
      const rec = new SpeechRecognition();
      rec.continuous = false; // Stop listening automatically once the user finishes speaking
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setStatus('connected');
        isListeningRef.current = true;
      };

      rec.onresult = (event: any) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            const final = event.results[i][0].transcript;
            setTranscript(final);
            callbacks.onIntentText(final);
          } else {
            interimTranscript += event.results[i][0].transcript;
            setTranscript(interimTranscript);
          }
        }
      };

      rec.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        if (event.error !== 'no-speech') {
          setError(`Microphone error: ${event.error}`);
        }
        setStatus('disconnected');
        isListeningRef.current = false;
      };

      rec.onend = () => {
        setStatus('disconnected');
        isListeningRef.current = false;
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (e: any) {
      console.error("Failed to start SpeechRecognition:", e);
      setError(e.message || "Failed to start microphone speech parser.");
      setStatus('disconnected');
      isListeningRef.current = false;
    }
  }, [callbacks]);

  const stopSession = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setStatus('disconnected');
    isListeningRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  return {
    isListening: status === 'connected' || status === 'connecting',
    status,
    transcript,
    error,
    startSession,
    stopSession
  };
}
