import { useState, useRef, useCallback } from 'react';
import { apiClient } from '../lib/apiClient';
import type { ParsedIntent } from '../lib/intentTypes';

export function useAssetPipeline() {
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [imageSrc, setImageSrc] = useState<string | undefined>(undefined);
  const [videoSrc, setVideoSrc] = useState<string | undefined>(undefined);
  const [textOverlay, setTextOverlay] = useState<string | undefined>(undefined);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationMessage, setGenerationMessage] = useState('Idle');
  const [audioSrc, setAudioSrc] = useState<string | undefined>(undefined);
  const [latency, setLatency] = useState<number | undefined>(undefined);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tryonImageSrc, setTryonImageSrc] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const runVirtualTryon = useCallback(async (prompt: string, frameBytes: string, clothBytes?: string) => {
    cancelActiveRequest();

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsGenerating(true);
    setGenerationMessage("Generating realistic AI try-on...");
    setErrorMsg(null);
    const startTime = Date.now();

    try {
      const result = await apiClient.generateTryon(prompt, frameBytes, clothBytes, controller.signal);
      if (result.isFallback) {
        setErrorMsg(result.errorMsg || 'Try-on fallback returned');
      }
      setTryonImageSrc(result.data);
      setLatency(Date.now() - startTime);
      setIsGenerating(false);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error("Try-on failed:", e);
        setErrorMsg(e.message || "Try-on generation failed.");
        setIsGenerating(false);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [cancelActiveRequest]);

  const cancelActiveRequest = useCallback(() => {
    if (abortControllerRef.current) {
      console.log('[useAssetPipeline] Aborting active request');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setGenerationMessage('Request cancelled by user interruption.');
  }, []);

  const handleIntent = useCallback(async (intent: ParsedIntent) => {
    // 1. Interruption handling: Cancel any in-flight requests immediately
    cancelActiveRequest();

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsGenerating(true);
    setErrorMsg(null);

    const startTime = Date.now();

    try {
      if (intent.intent === 'new-image') {
        const prompt = intent.prompt || 'Modern product ad';
        setGenerationMessage(`Generating creative for: "${prompt}"...`);

        // Generate a new unique Asset ID
        const newAssetId = `asset_${Date.now()}`;
        setActiveAssetId(newAssetId);

        // Fetch image from Nano Banana 2 Lite
        const result = await apiClient.generateImage(prompt, controller.signal);

        if (result.isFallback) {
          setErrorMsg(result.errorMsg || 'Generated fallback image due to API limit');
        }

        setImageSrc(result.data);
        setVideoSrc(undefined); // Reset previous video state
        setTextOverlay(prompt); // Optimistic default text layer
        setIsGenerating(false);

        // Benchmark timing
        setLatency(Date.now() - startTime);

        // Session Pre-Warming: Pre-warm the Omni Flash video session in the background
        console.log('[useAssetPipeline] Background pre-warming Omni Flash session...');
        apiClient.seedVideoSession(newAssetId, result.data, undefined, controller.signal)
          .then((res) => {
            console.log('[useAssetPipeline] Background session pre-warmed:', res.sessionId);
          })
          .catch((err) => {
            if (err.name !== 'AbortError') {
              console.error('[useAssetPipeline] Session pre-warming failed:', err);
            }
          });

      } else if (intent.intent === 'wardrobe') {
        if (!activeAssetId || !imageSrc) {
          throw new Error('Please speak to generate a base creative image first.');
        }

        const description = intent.description || 'casual wear';
        setGenerationMessage(`Updating wardrobe to: "${description}"...`);

        const result = await apiClient.editVideo(activeAssetId, `Change wardrobe of the subject to: ${description}`, controller.signal);
        
        if (result.isFallback) {
          setErrorMsg(result.errorMsg || 'Used fallback video due to API rate limits');
        }

        if (result.videoBytes) {
          setVideoSrc(result.videoBytes);
        }
        setIsGenerating(false);
        setLatency(Date.now() - startTime);

      } else if (intent.intent === 'animate') {
        if (!activeAssetId || !imageSrc) {
          throw new Error('Please speak to generate a base creative image first.');
        }

        const prompt = intent.prompt || 'Cinematic pan';
        const voiceover = intent.voiceover || '';
        setGenerationMessage(`Animating creative: "${prompt}"...`);

        // Execute video animation and TTS script generation in parallel to reduce perceived latency
        const [videoResult, ttsResult] = await Promise.all([
          apiClient.editVideo(activeAssetId, prompt, controller.signal),
          voiceover ? apiClient.generateTts(voiceover, controller.signal) : Promise.resolve(null)
        ]);

        if (videoResult.isFallback) {
          setErrorMsg(videoResult.errorMsg || 'Used fallback video due to API rate limits');
        }

        if (videoResult.videoBytes) {
          setVideoSrc(videoResult.videoBytes);
        }

        if (ttsResult && ttsResult.audioBytes) {
          setAudioSrc(ttsResult.audioBytes);
          // Auto-play the synthesized audio file
          const audio = new Audio(`data:${ttsResult.mimeType};base64,${ttsResult.audioBytes}`);
          audio.play().catch(e => console.log('Audio playback blocked or failed:', e));
        }

        setIsGenerating(false);
        setLatency(Date.now() - startTime);

      } else if (intent.intent === 'translate') {
        if (!textOverlay) {
          throw new Error('No active ad creative text to translate.');
        }

        const language = intent.language || 'Hindi';
        setGenerationMessage(`Localizing copy into ${language}...`);

        // Translate the current text overlay copy
        const transResult = await apiClient.translateText(textOverlay, language, controller.signal);
        setTextOverlay(transResult.translatedText);

        // Generate TTS in the target language for the translated copy
        const ttsResult = await apiClient.generateTts(transResult.translatedText, controller.signal);

        if (ttsResult && ttsResult.audioBytes) {
          setAudioSrc(ttsResult.audioBytes);
          const audio = new Audio(`data:${ttsResult.mimeType};base64,${ttsResult.audioBytes}`);
          audio.play().catch(e => console.log('Audio playback blocked or failed:', e));
        }

        setIsGenerating(false);
        setLatency(Date.now() - startTime);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('[useAssetPipeline] Flow execution error:', err);
        setErrorMsg(err.message || 'Model execution failed.');
        setIsGenerating(false);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [activeAssetId, imageSrc, textOverlay, cancelActiveRequest]);

  return {
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
    setErrorMsg,
    tryonImageSrc,
    setTryonImageSrc,
    runVirtualTryon
  };
}
