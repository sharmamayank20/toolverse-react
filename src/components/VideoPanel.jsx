import { useEffect, useRef } from 'react';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react';

function VideoTile({ stream, label, colorClass, isSelf, videoEnabled }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream || null;
  }, [stream]);

  return (
    <div className="video-tile">
      {stream && videoEnabled ? (
        <video ref={videoRef} autoPlay playsInline muted={isSelf} />
      ) : (
        <div className={`video-placeholder ${colorClass}`} aria-hidden="true" />
      )}
      <span className="video-label">{label}</span>
    </div>
  );
}

export default function VideoPanel({
  localStream, remoteStreams, remoteVideoEnabled, players, myColor,
  micOn, camOn, toggleMic, toggleCam, mediaError,
}) {
  const others = players.filter((p) => p.color !== myColor && p.socketId);

  return (
    <aside className="video-panel">
      <VideoTile
        stream={localStream}
        label="You"
        colorClass={`swatch-${(myColor || '').toLowerCase()}`}
        isSelf
        videoEnabled={camOn}
      />
      {others.map((p) => (
        <VideoTile
          key={p.socketId}
          stream={remoteStreams.get(p.socketId)}
          label={p.name}
          colorClass={`swatch-${p.color.toLowerCase()}`}
          videoEnabled={!!remoteVideoEnabled.get(p.socketId)}
        />
      ))}

      <div className="video-controls">
        <button
          type="button"
          className={`btn-mini ${micOn ? 'accent' : ''}`}
          onClick={toggleMic}
          aria-pressed={micOn}
          aria-label="Toggle microphone"
        >
          {micOn ? <Mic size={14} /> : <MicOff size={14} />}
        </button>
        <button
          type="button"
          className={`btn-mini ${camOn ? 'accent' : ''}`}
          onClick={toggleCam}
          aria-pressed={camOn}
          aria-label="Toggle camera"
        >
          {camOn ? <Video size={14} /> : <VideoOff size={14} />}
        </button>
      </div>
      {mediaError && <p className="video-error">{mediaError}</p>}
    </aside>
  );
}
