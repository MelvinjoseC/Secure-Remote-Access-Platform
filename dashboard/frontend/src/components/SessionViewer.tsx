import React, { useEffect, useRef, useState } from 'react';

interface SessionViewerProps {
  token: string;
  deviceId: string;
  backendUrl: string;
  signalingUrl: string;
  onDisconnect: () => void;
}

interface ConnectionStats {
  width: number;
  height: number;
  frameCount: number;
  bytesReceived: number;
  fps: number;
}

export const SessionViewer: React.FC<SessionViewerProps> = ({
  token,
  deviceId,
  backendUrl,
  signalingUrl,
  onDisconnect,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<string>('initializing');
  const [error, setError] = useState<string | null>(null);
  const [qualityPreset, setQualityPreset] = useState<string>('medium');

  const handleQualityPresetChange = (preset: string) => {
    setQualityPreset(preset);
    
    let width = 800;
    let height = 600;
    let fps = 10;
    let bitrate = 800;

    if (preset === 'high') {
      width = 1920;
      height = 1080;
      fps = 20;
      bitrate = 2000;
    } else if (preset === 'low') {
      width = 640;
      height = 480;
      fps = 5;
      bitrate = 300;
    }

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'quality_change',
        width,
        height,
        fps,
        bitrate
      }));
    }
  };

  // Connection references
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const inputChannelRef = useRef<RTCDataChannel | null>(null);

  // Statistics
  const [stats, setStats] = useState<ConnectionStats>({
    width: 0,
    height: 0,
    frameCount: 0,
    bytesReceived: 0,
    fps: 0,
  });

  const lastFramesRef = useRef<number>(0);

  // 1. Audit Log Session Start
  useEffect(() => {
    const startAuditSession = async () => {
      try {
        const res = await fetch(`${backendUrl}/api/sessions/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ device_id: deviceId }),
        });
        if (!res.ok) {
          throw new Error('Failed to record session initiation in audit logs.');
        }
        const data = await res.json();
        setSessionId(data.session_id);
      } catch (err: any) {
        setError(err.message || 'Audit Log error');
        setConnectionState('failed');
      }
    };

    startAuditSession();
  }, [deviceId, token, backendUrl]);

  // 2. Initialize WebRTC connection once session is logged
  useEffect(() => {
    if (!sessionId) return;

    setConnectionState('connecting');
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: 'turn:localhost:3478',
          username: 'demo',
          credential: 'password123',
        },
      ],
    });
    pcRef.current = pc;

    // Create Input Data Channel (replaces media data-channel, which is now a real video track)
    const inputChannel = pc.createDataChannel('input', { ordered: true });
    inputChannelRef.current = inputChannel;

    // Connect to Signaling Server WebSocket
    const cleanSignalingUrl = signalingUrl.replace(/^http/, 'ws');
    const ws = new WebSocket(`${cleanSignalingUrl}/client/connect?deviceId=${deviceId}&token=${token}`);
    wsRef.current = ws;

    ws.onopen = async () => {
      console.log('Connected to signaling server. Creating WebRTC Offer...');
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: 'offer', sdp: offer.sdp }));
      } catch (err: any) {
        console.error('Error creating offer:', err);
        setError('Failed to negotiate connection.');
        setConnectionState('failed');
      }
    };

    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      try {
        if (msg.type === 'answer') {
          console.log('Received WebRTC Answer from Agent');
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: msg.sdp }));
        } else if (msg.type === 'candidate' && msg.candidate) {
          console.log('Received remote ICE Candidate');
          await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
        } else if (msg.type === 'disconnect') {
          console.log('Agent sent disconnect signal.');
          handleClose();
        }
      } catch (err: any) {
        console.error('Error handling signaling message:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('Signaling WebSocket error:', err);
      setError('Signaling server connection lost.');
      setConnectionState('failed');
    };

    ws.onclose = () => {
      console.log('Signaling WebSocket closed.');
    };

    // PeerConnection Event Listeners
    pc.onicecandidate = (event) => {
      if (event.candidate && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('WebRTC Connection State changed:', pc.connectionState);
      setConnectionState(pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        setError('WebRTC connection failed or closed.');
      }
    };

    // Receive incoming WebRTC video tracks
    pc.ontrack = (event) => {
      console.log('Incoming video track event:', event.streams);
      if (videoRef.current && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0];
        // Auto-focus container to receive keyboard inputs immediately
        containerRef.current?.focus();
      }
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      pc.close();
    };
  }, [sessionId]);

  // 3. WebRTC Stats Collector (Bytes Received & FPS)
  useEffect(() => {
    if (connectionState !== 'connected' || !pcRef.current) return;

    const interval = setInterval(async () => {
      if (!pcRef.current) return;
      try {
        const statsReport = await pcRef.current.getStats();
        statsReport.forEach((report) => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            const bytes = report.bytesReceived || 0;
            const frames = report.framesDecoded || 0;
            setStats((prev) => {
              const frameDiff = frames - lastFramesRef.current;
              lastFramesRef.current = frames;
              return {
                ...prev,
                bytesReceived: bytes,
                frameCount: frames,
                fps: frameDiff > 0 ? frameDiff : 0,
              };
            });
          }
        });
      } catch (e) {
        console.error('Error fetching WebRTC stats:', e);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [connectionState]);

  // Close session action
  const handleClose = async () => {
    if (sessionId) {
      try {
        await fetch(`${backendUrl}/api/sessions/end`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ session_id: sessionId }),
        });
      } catch (err) {
        console.error('Failed to log session closure:', err);
      }
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    if (pcRef.current) {
      pcRef.current.close();
    }

    onDisconnect();
  };

  // ==========================================
  // INPUT EVENT HANDLERS (MOUSE & KEYBOARD)
  // ==========================================

  const getNormalizedCoords = (e: React.MouseEvent<HTMLVideoElement>) => {
    const video = videoRef.current;
    if (!video) return null;
    const rect = video.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return { x, y };
  };

  const sendInputEvent = (eventData: any) => {
    const inputChannel = inputChannelRef.current;
    if (inputChannel && inputChannel.readyState === 'open') {
      inputChannel.send(JSON.stringify(eventData));
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLVideoElement>) => {
    const coords = getNormalizedCoords(e);
    if (coords) {
      sendInputEvent({
        type: 'mousemove',
        x: coords.x,
        y: coords.y,
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLVideoElement>) => {
    const coords = getNormalizedCoords(e);
    if (coords) {
      const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle';
      sendInputEvent({
        type: 'mousedown',
        button,
        x: coords.x,
        y: coords.y,
      });
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLVideoElement>) => {
    const coords = getNormalizedCoords(e);
    if (coords) {
      const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle';
      sendInputEvent({
        type: 'mouseup',
        button,
        x: coords.x,
        y: coords.y,
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Tab', ' '].includes(e.key)) {
      e.preventDefault();
    }
    sendInputEvent({
      type: 'keydown',
      key: e.key,
    });
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    sendInputEvent({
      type: 'keyup',
      key: e.key,
    });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const handleVideoMetadata = () => {
    if (videoRef.current) {
      setStats((prev) => ({
        ...prev,
        width: videoRef.current?.videoWidth || 800,
        height: videoRef.current?.videoHeight || 600,
      }));
    }
  };

  // Convert bytes received to MB
  const mbReceived = (stats.bytesReceived / (1024 * 1024)).toFixed(2);

  return (
    <div className="session-layout">
      <div className="video-panel">
        <div className="viewer-header">
          <div className="viewer-title">
            <span className={`indicator ${connectionState === 'connected' ? 'connected' : ''}`}></span>
            <span>Remote Desktop Session: <strong className="text-mono">{deviceId}</strong></span>
          </div>
          <button className="disconnect-btn" onClick={handleClose}>
            Disconnect Session
          </button>
        </div>

        <div
          ref={containerRef}
          className="canvas-container"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          style={{ outline: 'none' }}
        >
          {connectionState !== 'connected' && (
            <div className="overlay-message">
              {connectionState === 'connecting' || connectionState === 'new' || connectionState === 'checking' ? (
                <>
                  <div className="spinner"></div>
                  <p>Negotiating encrypted WebRTC tunnel (DTLS/SRTP)...</p>
                </>
              ) : connectionState === 'initializing' ? (
                <>
                  <div className="spinner"></div>
                  <p>Recording connection request in Postgres Audit Log...</p>
                </>
              ) : (
                <>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <p style={{ color: '#ff8a80', fontWeight: 'semibold' }}>{error || 'Connection Failed'}</p>
                  <button className="connect-btn" style={{ width: 'auto', marginTop: '1rem' }} onClick={handleClose}>
                    Return to Console
                  </button>
                </>
              )}
            </div>
          )}

          <video
            ref={videoRef}
            className="remote-canvas"
            style={{ display: connectionState === 'connected' ? 'block' : 'none', width: '100%', height: '100%', objectFit: 'contain', background: '#070a13' }}
            autoPlay
            playsInline
            muted
            onLoadedMetadata={handleVideoMetadata}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onContextMenu={handleContextMenu}
          />
        </div>
      </div>

      <div className="session-sidebar">
        <div className="stats-card">
          <h3 className="stats-title">Session Telemetry</h3>
          <div className="stat-item">
            <span className="stat-label">Tunnel Status</span>
            <span className="stat-value" style={{ color: connectionState === 'connected' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              {connectionState.toUpperCase()}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Resolution</span>
            <span className="stat-value">{stats.width > 0 ? `${stats.width}x${stats.height}` : 'Detecting...'}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Data Received</span>
            <span className="stat-value">{mbReceived} MB</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Frame Rate</span>
            <span className="stat-value" style={{ color: stats.fps > 0 ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>
              {stats.fps} FPS
            </span>
          </div>
        </div>

        <div className="stats-card">
          <h3 className="stats-title">Stream Configuration</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Video Quality:</span>
              <select
                value={qualityPreset}
                onChange={(e) => handleQualityPresetChange(e.target.value)}
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                disabled={connectionState !== 'connected'}
              >
                <option value="high">High (1080p @ 20fps)</option>
                <option value="medium">Medium (720p @ 10fps)</option>
                <option value="low">Low (480p @ 5fps)</option>
              </select>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Alters resolution and frame rate on the agent dynamic encoder instantly.
            </div>
          </div>
        </div>

        <div className="stats-card">
          <h3 className="stats-title">Remote Control</h3>
          <div className="controls-hint">
            <strong>Active Control Loop:</strong><br />
            - Click on screen to capture mouse cursor.<br />
            - Press keys to send keyboard injections.<br />
            - All input commands are encrypted over peer DTLS channels.<br />
            - Mouse coordinates are dynamically normalized (0.0 - 1.0).
          </div>
        </div>

        <div className="stats-card">
          <h3 className="stats-title">Audit Logging</h3>
          <div className="controls-hint" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
            <strong>Session ID:</strong><br />
            <span className="text-mono" style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>
              {sessionId || 'Assigning...'}
            </span>
            <br /><br />
            This session is logged to PostgreSQL. Start time and end time are automatically captured for audit compliance.
          </div>
        </div>
      </div>
    </div>
  );
};
