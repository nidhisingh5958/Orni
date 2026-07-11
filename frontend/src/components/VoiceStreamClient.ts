import { fetchEphemeralToken } from '../lib/ephemeralToken';
import type { ParsedIntent } from '../lib/intentTypes';

export class VoiceStreamClient {
  private socket: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private accumulatedText = '';
  private isMuted = false;
  private tempStream: MediaStream | null = null;

  constructor(
    private callbacks: {
      onTranscriptChunk: (text: string) => void;
      onIntentParsed: (intent: ParsedIntent) => void;
      onInterrupted: () => void;
      onError: (msg: string) => void;
      onStatusChange: (status: 'connecting' | 'connected' | 'disconnected') => void;
    }
  ) {}

  public async start(existingStream?: MediaStream | null): Promise<void> {
    try {
      this.callbacks.onStatusChange('connecting');
      this.accumulatedText = '';

      // Connect to the stable backend WebSocket relay endpoint
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8787';
      const wsUrl = backendUrl.replace(/^http/, 'ws') + '/ws';
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('[VoiceStreamClient] WebSocket connected');
        this.callbacks.onStatusChange('connected');
        this.tempStream = existingStream || null;
        this.sendSetupFrame();
      };

      this.socket.onmessage = (event) => {
        this.handleMessage(event);
      };

      this.socket.onerror = (err) => {
        console.error('[VoiceStreamClient] WebSocket error:', err);
        this.callbacks.onError('WebSocket connection error');
      };

      this.socket.onclose = (event) => {
        console.log('[VoiceStreamClient] WebSocket closed', event);
        this.callbacks.onStatusChange('disconnected');
        this.stop();
      };

    } catch (err: any) {
      console.error('[VoiceStreamClient] Start failed:', err);
      this.callbacks.onError(err.message || 'Failed to initialize voice session');
      this.callbacks.onStatusChange('disconnected');
    }
  }

  public stop(): void {
    // Stop microphone recording
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.audioContext) {
      if (this.audioContext.state !== 'closed') {
        this.audioContext.close();
      }
      this.audioContext = null;
    }

    // Close WebSocket
    if (this.socket) {
      if (this.socket.readyState === WebSocket.OPEN) {
        this.socket.close();
      }
      this.socket = null;
    }
  }

  private sendSetupFrame(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    // Direct configuration of model and generation parameters in setup frame
    const setupFrame = {
      setup: {
        model: 'models/gemini-3.1-flash-live-preview',
        generation_config: {
          response_modalities: ['AUDIO']
        },
        system_instruction: {
          parts: [{
            text: `You are the core intent-parser AI of VoiceCanvas AI. The user describes their creative intent for ad campaigns.
Your output must be a single, strict JSON object matching one of the following shapes:

1. New Image Generation:
{ "intent": "new-image", "prompt": "detailed creative brief matching user words" }

2. Wardrobe change or apparel swap:
{ "intent": "wardrobe", "description": "wardrobe/clothing edit prompt" }

3. Cinematic video animation:
{ "intent": "animate", "prompt": "animation motion brief", "voiceover": "voiceover script to read out" }

4. Localization:
{ "intent": "translate", "language": "Hindi" | "Kannada" }

Rules:
- Speak only in structured JSON as shown above.
- Do not output any chat dialog, markdown formatting, backticks, or introductions.
- Just output the raw JSON string.`
          }]
        },
        output_audio_transcription: {},
        input_audio_transcription: {}
      }
    };

    this.socket.send(JSON.stringify(setupFrame));
  }

  private async startMicrophone(existingStream?: MediaStream | null): Promise<void> {
    try {
      if (existingStream) {
        this.mediaStream = existingStream;
      } else {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      // Create AudioContext locked to 16000Hz. The browser automatically downsamples.
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000
      });

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // Use 2048 buffer size to stream audio frames with minimal latency
      this.processor = this.audioContext.createScriptProcessor(2048, 1, 1);

      this.processor.onaudioprocess = (event) => {
        if (this.isMuted) return;
        const inputData = event.inputBuffer.getChannelData(0);
        this.streamAudioChunk(inputData);
      };

      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

    } catch (err: any) {
      console.error('[VoiceStreamClient] Failed to start microphone:', err);
      this.callbacks.onError('Microphone access denied or failed to initialize');
    }
  }

  private streamAudioChunk(float32Array: Float32Array): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    // Convert Float32 raw browser audio to Int16 PCM bytes
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    // Convert ArrayBuffer to Base64
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Audio = window.btoa(binary);

    // Stream PCM audio chunk directly to the Live WebSocket endpoint
    this.socket.send(JSON.stringify({
      realtimeInput: {
        mediaChunks: [{
          mimeType: 'audio/pcm;rate=16000',
          data: base64Audio
        }]
      }
    }));
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const msg = JSON.parse(event.data);

      if (msg.setupComplete) {
        console.log('[VoiceStreamClient] Setup complete received. Starting microphone...');
        this.startMicrophone(this.tempStream);
        this.tempStream = null;
        return;
      }

      if (msg.serverContent) {
        // Handle direct user interruptions
        if (msg.serverContent.interrupted) {
          console.log('[VoiceStreamClient] Interrupted by user');
          this.callbacks.onInterrupted();
          this.accumulatedText = '';
          return;
        }

        const parts = msg.serverContent.modelTurn?.parts || [];
        for (const part of parts) {
          if (part.text) {
            this.accumulatedText += part.text;
            this.callbacks.onTranscriptChunk(part.text);
          }
        }

        if (msg.serverContent.turnComplete) {
          console.log('[VoiceStreamClient] Turn complete. Final response:', this.accumulatedText);
          this.parseAndTriggerIntent();
        }
      }
    } catch (err) {
      console.error('[VoiceStreamClient] Error handling message:', err);
    }
  }

  private parseAndTriggerIntent(): void {
    try {
      const cleaned = this.accumulatedText.replace(/```json|```/gi, '').trim();
      const parsed: ParsedIntent = JSON.parse(cleaned);
      this.callbacks.onIntentParsed(parsed);
    } catch (e) {
      console.error('[VoiceStreamClient] JSON Parse error on:', this.accumulatedText);
      this.callbacks.onError('Could not parse voice command. Please speak clearly.');
    }
    this.accumulatedText = '';
  }
}
