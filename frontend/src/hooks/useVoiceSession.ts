import { useState, useRef, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/apiClient';

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

  // MediaRecorder backup elements
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startSession = useCallback(async (existingStream?: MediaStream | null) => {
    setError(null);
    setTranscript('');
    setStatus('connecting');
    accumulatedTextRef.current = '';
    audioChunksRef.current = [];

    // 1. Try to start the MediaRecorder background backup tracker if audio stream track is available
    if (existingStream) {
      try {
        const audioTracks = existingStream.getAudioTracks();
        if (audioTracks.length > 0) {
          const audioStream = new MediaStream([audioTracks[0]]);
          const options = { mimeType: 'audio/webm' };
          
          let mediaRecorder: MediaRecorder;
          try {
            mediaRecorder = new MediaRecorder(audioStream, options);
          } catch (e) {
            mediaRecorder = new MediaRecorder(audioStream);
          }

          mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
              audioChunksRef.current.push(event.data);
            }
          };

          mediaRecorder.onstop = async () => {
            // Process the recorded audio payload if SpeechRecognition failed to return any text
            if (!accumulatedTextRef.current.trim() && audioChunksRef.current.length > 0) {
              try {
                console.log("[useVoiceSession] Fallback: transcribing recorded audio chunks...");
                const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
                
                // Read blob to base64
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = async () => {
                  const base64Data = (reader.result as string).split(',')[1];
                  try {
                    const result = await apiClient.transcribeAudio(base64Data, audioBlob.type);
                    if (result.text && result.text.trim()) {
                      console.log("[useVoiceSession] Fallback translation result:", result.text);
                      setTranscript(result.text);
                      callbacks.onIntentText(result.text);
                    }
                  } catch (err) {
                    console.error("[useVoiceSession] Fallback transcription API failed:", err);
                  }
                };
              } catch (blobErr) {
                console.error("[useVoiceSession] Fallback blob builder failed:", blobErr);
              }
            }
          };

          mediaRecorderRef.current = mediaRecorder;
          mediaRecorder.start(250); // Collect data in 250ms chunks
        }
      } catch (recErr) {
        console.warn("[useVoiceSession] Failed to initialize MediaRecorder backup tracker:", recErr);
      }
    }

    // 2. Start the primary browser SpeechRecognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("[useVoiceSession] webkitSpeechRecognition missing, proceeding with backup recorder only.");
      setStatus('connected');
      isListeningRef.current = true;
      return;
    }

    try {
      const rec = new SpeechRecognition();
      rec.continuous = true;
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

        const currentText = finalChunk || interimTranscript;
        if (currentText.trim()) {
          setTranscript(currentText);
          accumulatedTextRef.current = currentText;

          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }

          silenceTimerRef.current = setTimeout(() => {
            if (accumulatedTextRef.current.trim()) {
              handleSpeechFinalized(accumulatedTextRef.current);
            }
          }, 1500);
        }
      };

      rec.onerror = (event: any) => {
        // Suppress no-speech errors to stay active and rely on MediaRecorder backing
        if (event.error === 'no-speech') {
          return; 
        }

        console.warn("[useVoiceSession] Recognition error:", event.error);
        // We do not disconnect immediately on errors to allow MediaRecorder fallback processing
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
      // Fail gracefully: Let status remain 'connected' so backup MediaRecorder can run
      setStatus('connected');
      isListeningRef.current = true;
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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
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
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
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
