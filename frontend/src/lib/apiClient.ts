const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8787';

export interface ImageResponse {
  mimeType: string;
  data: string;
  isFallback?: boolean;
  errorMsg?: string;
}

export interface VideoResponse {
  success: boolean;
  sessionId: string;
  videoBytes: string | null;
  errorMsg?: string;
  isFallback?: boolean;
}

export interface TtsResponse {
  mimeType: string;
  audioBytes: string;
  isFallback?: boolean;
  errorMsg?: string;
}

export interface TranslateResponse {
  translatedText: string;
  isFallback?: boolean;
  errorMsg?: string;
}

export const apiClient = {
  async generateImage(prompt: string, signal?: AbortSignal): Promise<ImageResponse> {
    const response = await fetch(`${BACKEND_URL}/api/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal
    });
    if (!response.ok) throw new Error("Image API call failed");
    return response.json();
  },

  async seedVideoSession(assetId: string, imageBytes: string, prompt?: string, signal?: AbortSignal): Promise<VideoResponse> {
    const response = await fetch(`${BACKEND_URL}/api/video/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId, imageBytes, prompt }),
      signal
    });
    if (!response.ok) throw new Error("Video seed API call failed");
    return response.json();
  },

  async editVideo(assetId: string, prompt: string, signal?: AbortSignal): Promise<VideoResponse> {
    const response = await fetch(`${BACKEND_URL}/api/video/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId, prompt }),
      signal
    });
    if (!response.ok) throw new Error("Video turn API call failed");
    return response.json();
  },

  async generateTts(text: string, signal?: AbortSignal): Promise<TtsResponse> {
    const response = await fetch(`${BACKEND_URL}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal
    });
    if (!response.ok) throw new Error("TTS API call failed");
    return response.json();
  },

  async translateText(text: string, targetLanguage: 'Hindi' | 'Kannada', signal?: AbortSignal): Promise<TranslateResponse> {
    const response = await fetch(`${BACKEND_URL}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, targetLanguage }),
      signal
    });
    if (!response.ok) throw new Error("Translation API call failed");
    return response.json();
  }
};
