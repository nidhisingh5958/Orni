import React, { useRef, useEffect } from 'react';

interface CanvasProps {
  imageSrc?: string; // Base64 image
  videoSrc?: string; // Base64 video
  textOverlay?: string;
  isShimmering?: boolean;
}

export const Canvas: React.FC<CanvasProps> = ({
  imageSrc,
  videoSrc,
  textOverlay,
  isShimmering
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let isDrawing = true;

    // Set up image element
    const img = new Image();
    let imgLoaded = false;
    if (imageSrc && !videoSrc) {
      img.src = imageSrc.startsWith('data:') ? imageSrc : `data:image/png;base64,${imageSrc}`;
      img.onload = () => {
        imgLoaded = true;
      };
    }

    // Set up video element
    if (videoSrc) {
      if (!videoRef.current) {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        videoRef.current = video;
      }
      const video = videoRef.current;
      video.src = videoSrc.startsWith('data:') ? videoSrc : `data:video/mp4;base64,${videoSrc}`;
      video.load();
      video.play().catch(e => console.log('Autoplay blocked or video loading:', e));
    } else {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current = null;
      }
    }

    const draw = () => {
      if (!isDrawing) return;

      // Clear canvas context
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (videoRef.current && videoRef.current.readyState >= 2) {
        // Draw video frames natively onto canvas
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      } else if (imgLoaded) {
        // Draw static image creative
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      } else {
        // Premium default gradient background
        const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        grad.addColorStop(0, '#0f172a'); // deep slate blue
        grad.addColorStop(1, '#1e293b');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Centered instruction copy
        ctx.fillStyle = '#94a3b8';
        ctx.font = '22px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Press "Start Speech" and speak to generate ad creative...', canvas.width / 2, canvas.height / 2);
      }

      // Draw bottom banner text overlay
      if (textOverlay) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
        ctx.fillRect(0, canvas.height - 110, canvas.width, 110);

        ctx.fillStyle = '#f8fafc';
        ctx.font = '600 26px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(textOverlay, canvas.width / 2, canvas.height - 55);
      }

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      isDrawing = false;
      cancelAnimationFrame(animationId);
      if (videoRef.current) {
        videoRef.current.pause();
      }
    };
  }, [imageSrc, videoSrc, textOverlay]);

  return (
    <div className="canvas-container">
      <canvas
        ref={canvasRef}
        width={1024}
        height={1024}
        className={`ad-canvas ${isShimmering ? 'shimmering' : ''}`}
      />
    </div>
  );
};
