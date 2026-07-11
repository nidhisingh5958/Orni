import React, { useRef, useEffect } from 'react';

interface CanvasProps {
  imageSrc?: string; // Original loaded/uploaded image or try-on result
  videoSrc?: string;
  textOverlay?: string;
  isShimmering?: boolean;
  cameraStream?: MediaStream | null;
  wardrobeStyle?: 'old-money' | 'space-suit' | 'cyberpunk' | 'tactical-armor' | null;
  activeFilter?: 'cinematic' | 'sci-fi' | 'war' | 'cyberpunk' | null;
  tryonImageSrc?: string | null; // Realistic AI generated try-on image backdrop
}

export const Canvas: React.FC<CanvasProps> = ({
  imageSrc,
  videoSrc,
  textOverlay,
  isShimmering,
  cameraStream,
  wardrobeStyle,
  activeFilter,
  tryonImageSrc
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let isDrawing = true;

    // Set up try-on generated AI backdrop image
    const tryonImg = new Image();
    let tryonImgLoaded = false;
    if (tryonImageSrc) {
      tryonImg.src = tryonImageSrc.startsWith('data:') ? tryonImageSrc : `data:image/png;base64,${tryonImageSrc}`;
      tryonImg.onload = () => {
        tryonImgLoaded = true;
      };
    }

    // Set up static image fallback element
    const img = new Image();
    let imgLoaded = false;
    if (imageSrc && !videoSrc) {
      img.src = imageSrc.startsWith('data:') ? imageSrc : `data:image/png;base64,${imageSrc}`;
      img.onload = () => {
        imgLoaded = true;
      };
    }

    // Set up static video element
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
      video.play().catch(e => console.log('Video autoplay blocked or loading:', e));
    } else {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current = null;
      }
    }

    // Set up camera video element
    if (cameraStream) {
      if (!cameraVideoRef.current) {
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        cameraVideoRef.current = video;
      }
      const video = cameraVideoRef.current;
      if (video.srcObject !== cameraStream) {
        video.srcObject = cameraStream;
        video.play().catch(e => console.log('Camera video play blocked:', e));
      }
    } else {
      if (cameraVideoRef.current) {
        cameraVideoRef.current.pause();
        cameraVideoRef.current.srcObject = null;
        cameraVideoRef.current = null;
      }
    }

    const draw = () => {
      if (!isDrawing) return;

      // Clear canvas context
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 1. Draw Background Backdrop (AI generated Try-on first, then live camera stream, then video/image fallbacks)
      if (tryonImageSrc && tryonImgLoaded) {
        ctx.drawImage(tryonImg, 0, 0, canvas.width, canvas.height);
      } else if (cameraVideoRef.current && cameraVideoRef.current.readyState >= 2) {
        ctx.drawImage(cameraVideoRef.current, 0, 0, canvas.width, canvas.height);
      } else if (videoRef.current && videoRef.current.readyState >= 2) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      } else if (imgLoaded) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      } else {
        const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        grad.addColorStop(0, '#090d16');
        grad.addColorStop(1, '#020617');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#64748b';
        ctx.font = '20px Manrope, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Mirror Feed Initializing...', canvas.width / 2, canvas.height / 2);
      }

      // 2. Draw Body Alignment Calibration Outline (Draw only when live stream is showing and try-on is not generated yet)
      if (!tryonImageSrc && cameraVideoRef.current && cameraVideoRef.current.readyState >= 2) {
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.35)'; // translucent blue calibration ring
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);

        // Circular head guide
        ctx.beginPath();
        ctx.arc(512, 330, 95, 0, Math.PI * 2);
        ctx.stroke();

        // Shoulder slopes guide
        ctx.beginPath();
        ctx.moveTo(280, 680);
        ctx.quadraticCurveTo(390, 500, 415, 430);
        ctx.lineTo(609, 430);
        ctx.quadraticCurveTo(634, 500, 744, 680);
        ctx.stroke();

        ctx.setLineDash([]); // Reset line dashes
      }

      // 3. Draw Digital Wardrobe Try-On Overlays (Draw only as instant placeholder overlays before the real AI Try-On loads)
      if (!tryonImageSrc && wardrobeStyle) {
        if (wardrobeStyle === 'old-money') {
          // Luxury Linen Cream Blazer with Gold Amber Trims
          ctx.fillStyle = 'rgba(248, 250, 252, 0.95)'; // linen cream
          ctx.strokeStyle = '#b45309'; // gold/amber trims
          ctx.lineWidth = 4;

          // Main blazer body
          ctx.beginPath();
          ctx.moveTo(270, 700);
          ctx.quadraticCurveTo(390, 500, 415, 430);
          ctx.lineTo(609, 430);
          ctx.quadraticCurveTo(634, 500, 754, 700);
          ctx.lineTo(620, 960);
          ctx.lineTo(404, 960);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Contrast Lapels (V shape cut)
          ctx.fillStyle = '#0f172a'; // dark lapels
          ctx.beginPath();
          ctx.moveTo(512, 630);
          ctx.lineTo(415, 430);
          ctx.lineTo(470, 430);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(512, 630);
          ctx.lineTo(609, 430);
          ctx.lineTo(554, 430);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Gold pocket square detail
          ctx.fillStyle = '#b45309';
          ctx.fillRect(430, 520, 40, 15);

          // Double breasted gold buttons
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.arc(480, 680, 8, 0, Math.PI * 2);
          ctx.arc(544, 680, 8, 0, Math.PI * 2);
          ctx.arc(480, 760, 8, 0, Math.PI * 2);
          ctx.arc(544, 760, 8, 0, Math.PI * 2);
          ctx.fill();

        } else if (wardrobeStyle === 'space-suit') {
          // Futuristic cyber astronaut chest plates
          ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
          ctx.strokeStyle = '#06b6d4'; // glowing neon cyan
          ctx.lineWidth = 4;

          // Armor shoulders
          ctx.beginPath();
          ctx.moveTo(250, 710);
          ctx.lineTo(395, 470);
          ctx.lineTo(629, 470);
          ctx.lineTo(774, 710);
          ctx.lineTo(640, 960);
          ctx.lineTo(384, 960);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Circular chest glow core
          ctx.save();
          ctx.shadowColor = '#06b6d4';
          ctx.shadowBlur = 20;
          ctx.fillStyle = '#22d3ee';
          ctx.beginPath();
          ctx.arc(512, 600, 38, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // Futuristic collar bracket
          ctx.fillStyle = '#334155';
          ctx.fillRect(452, 470, 120, 25);

          // Neon decals
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(310, 630);
          ctx.lineTo(395, 490);
          ctx.moveTo(714, 630);
          ctx.lineTo(629, 490);
          ctx.stroke();

        } else if (wardrobeStyle === 'cyberpunk') {
          // Neon Indigo/Pink high-collar jacket
          ctx.fillStyle = '#1e1b4b'; // deep purple/indigo
          ctx.strokeStyle = '#d946ef'; // glowing neon magenta
          ctx.lineWidth = 4;

          // High fold collars
          ctx.beginPath();
          ctx.moveTo(415, 440);
          ctx.lineTo(370, 360);
          ctx.lineTo(460, 410);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(609, 440);
          ctx.lineTo(654, 360);
          ctx.lineTo(564, 410);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Main body jacket shape
          ctx.beginPath();
          ctx.moveTo(260, 700);
          ctx.quadraticCurveTo(390, 500, 415, 440);
          ctx.lineTo(609, 440);
          ctx.quadraticCurveTo(634, 500, 764, 700);
          ctx.lineTo(620, 960);
          ctx.lineTo(404, 960);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Cyan neon contrast lining
          ctx.strokeStyle = '#3b82f6'; // glowing electric blue
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(512, 440);
          ctx.lineTo(512, 700);
          ctx.stroke();

        } else if (wardrobeStyle === 'tactical-armor') {
          // Military combat heavy tactical vest
          ctx.fillStyle = '#1c1917'; // tactical stone
          ctx.strokeStyle = '#84cc16'; // lime green trim
          ctx.lineWidth = 4;

          // Base plate
          ctx.beginPath();
          ctx.moveTo(300, 710);
          ctx.lineTo(385, 460);
          ctx.lineTo(639, 460);
          ctx.lineTo(724, 710);
          ctx.lineTo(610, 960);
          ctx.lineTo(414, 960);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Tactical pockets
          ctx.fillStyle = '#292524';
          ctx.fillRect(380, 550, 90, 80);
          ctx.fillRect(554, 550, 90, 80);
          ctx.fillRect(465, 660, 94, 70);

          // Buckles
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(420, 490, 24, 12);
          ctx.fillRect(580, 490, 24, 12);
        }
      }

      // 4. Draw Cinematic Filter/HUD Overlay
      if (activeFilter) {
        if (activeFilter === 'cinematic') {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, canvas.width, 120);
          ctx.fillRect(0, canvas.height - 120, canvas.width, 120);

          ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
          for (let i = 0; i < 250; i++) {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            ctx.fillRect(x, y, 2, 2);
          }

          ctx.fillStyle = '#f1f5f9';
          ctx.font = '500 16px monospace';
          ctx.textAlign = 'left';
          ctx.fillText('REC ● 24 FPS', 40, 80);

          ctx.textAlign = 'right';
          ctx.fillText('CINEMATIC 2.39:1', canvas.width - 40, 80);

        } else if (activeFilter === 'sci-fi') {
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
          ctx.lineWidth = 2;

          const bracket = 50;
          const offset = 30;

          ctx.beginPath();
          ctx.moveTo(offset, offset + bracket);
          ctx.lineTo(offset, offset);
          ctx.lineTo(offset + bracket, offset);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(canvas.width - offset, offset + bracket);
          ctx.lineTo(canvas.width - offset, offset);
          ctx.lineTo(canvas.width - offset - bracket, offset);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(offset, canvas.height - offset - bracket);
          ctx.lineTo(offset, canvas.height - offset);
          ctx.lineTo(offset + bracket, canvas.height - offset);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(canvas.width - offset, canvas.height - offset - bracket);
          ctx.lineTo(canvas.width - offset, canvas.height - offset);
          ctx.lineTo(canvas.width - offset - bracket, canvas.height - offset);
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(512, 512, 110, 0, Math.PI * 2);
          ctx.moveTo(512, 380);
          ctx.lineTo(512, 410);
          ctx.moveTo(512, 614);
          ctx.lineTo(512, 644);
          ctx.moveTo(380, 512);
          ctx.lineTo(410, 512);
          ctx.moveTo(614, 512);
          ctx.lineTo(644, 512);
          ctx.stroke();

          ctx.fillStyle = '#22d3ee';
          ctx.font = '14px monospace';
          ctx.textAlign = 'left';
          ctx.fillText('SYSTEM OK // LINK STATE STATUS: 1', offset + 20, offset + 90);
          ctx.fillText('LATENCY: SECURE HIGH RELAY', offset + 20, offset + 110);
          ctx.fillText('VIRTUAL MIRROR LOCK: ON', offset + 20, offset + 130);

        } else if (activeFilter === 'war') {
          ctx.fillStyle = 'rgba(180, 83, 9, 0.16)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          ctx.strokeStyle = 'rgba(12, 10, 9, 0.3)';
          ctx.lineWidth = 1.5;
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            const startX = Math.random() * canvas.width;
            ctx.moveTo(startX, 0);
            ctx.lineTo(startX + (Math.random() * 30 - 15), canvas.height);
            ctx.stroke();
          }

          const vign = ctx.createRadialGradient(512, 512, 450, 512, 512, 750);
          vign.addColorStop(0, 'rgba(0,0,0,0)');
          vign.addColorStop(1, 'rgba(0,0,0,0.8)');
          ctx.fillStyle = vign;
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          ctx.fillStyle = '#b45309';
          ctx.font = '700 16px monospace';
          ctx.textAlign = 'right';
          ctx.fillText('WAR ROOM BATTLE FEED', canvas.width - 40, 60);

        } else if (activeFilter === 'cyberpunk') {
          ctx.fillStyle = 'rgba(217, 70, 239, 0.08)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
          for (let y = 0; y < canvas.height; y += 6) {
            ctx.fillRect(0, y, canvas.width, 2);
          }

          if (Math.random() > 0.82) {
            ctx.fillStyle = 'rgba(34, 197, 94, 0.35)';
            ctx.fillRect(Math.random() * (canvas.width - 250), Math.random() * (canvas.height - 50), 250, 30);
          }
        }
      }

      // 5. Draw Bottom Text Banner Overlay
      if (textOverlay) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
        ctx.fillRect(0, canvas.height - 110, canvas.width, 110);

        ctx.fillStyle = '#f8fafc';
        ctx.font = '600 24px Manrope, sans-serif';
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
      if (cameraVideoRef.current) {
        cameraVideoRef.current.pause();
        cameraVideoRef.current.srcObject = null;
      }
    };
  }, [imageSrc, videoSrc, textOverlay, cameraStream, wardrobeStyle, activeFilter, tryonImageSrc]);

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
