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
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const accumulatedTextRef = useRef<string>('');

  const startSession = useCallback(async (existingStream?: MediaStream | null) => {
    setError(null);
    setTranscript('');
    setStatus('connecting');
    accumulatedTextRef.current = '';

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.");
      setStatus('disconnected');
      return;
    }

    try {
      const rec = new SpeechRecognition();
      rec.continuous = true; // Stay active to prevent instant disconnected errors on short silences
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setStatus('connected');
        isListeningRef.current = true;
      };

      const handleSpeechFinalized = (finalText: string) => {
        if (finalText.trim()) {
          console.log("[useVoiceSession] Speech finalized text:", finalText);
          callbacks.onIntentText(finalText);
        }
        // Restart speech text accumulator for subsequent runs
        accumulatedTextRef.current = '';
        setTranscript('');
      };

      rec.onresult = (event: any) => {
        let interimTranscript = '';
        let finalChunk = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const text = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalChunk = text;
          } else {
            interimTranscript += text;
          }
        }

        // Build running transcript state
        const currentText = finalChunk || interimTranscript;
        if (currentText.trim()) {
          setTranscript(currentText);
          accumulatedTextRef.current = currentText;

          // Clear previous silence countdown
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }

          // Debounce: if user stops speaking for 1.5 seconds, automatically process command
          silenceTimerRef.current = setTimeout(() => {
            if (accumulatedTextRef.current.trim()) {
              handleSpeechFinalized(accumulatedTextRef.current);
            }
          }, 1500);
        }
      };

      rec.onerror = (event: any) => {
        console.warn("[useVoiceSession] Recognition error event:", event.error);
        
        // Ignore 'no-speech' and 'aborted' status errors to keep the mic session active
        if (event.error === 'no-speech') {
          return; 
        }

        setError(`Microphone issue: ${event.error}`);
        setStatus('disconnected');
        isListeningRef.current = false;
      };

      rec.onend = () => {
        // If there is any remaining un-processed text when mic finishes, process it now
        if (accumulatedTextRef.current.trim()) {
          handleSpeechFinalized(accumulatedTextRef.current);
        }
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
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (accumulatedTextRef.current.trim()) {
      const remaining = accumulatedTextRef.current;
      accumulatedTextRef.current = '';
      callbacks.onIntentText(remaining);
    }
    setStatus('disconnected');
    isListeningRef.current = false;
  }, [callbacks]);

  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
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
