import { mediaDevices, registerGlobals, RTCPeerConnection } from 'react-native-webrtc';

registerGlobals();

export type RealtimeTransportCallbacks = {
  /** 0..1 level sampled from the microphone input, while connected. */
  onLocalAmplitude?: (level: number) => void;
  /** 0..1 level sampled from the remote (Norte voice) audio track, while connected. */
  onRemoteAmplitude?: (level: number) => void;
};

export type RealtimeTransport = {
  peerConnection: RTCPeerConnection;
  dataChannel: ReturnType<RTCPeerConnection['createDataChannel']>;
  stop: () => void;
};

export function isRealtimeVoiceSupported() {
  return true;
}

/**
 * Best-effort amplitude reading from WebRTC's standard getStats() report.
 * react-native-webrtc doesn't expose a Web Audio AnalyserNode like the browser
 * does, so this reads the spec's `audioLevel` field where the platform
 * reports it. Field availability can vary by OS/library version — this has
 * only been verified against the web transport; treat native reactivity as
 * experimental until confirmed on a real device build.
 */
function readAudioLevels(report: any, onLocal?: (level: number) => void, onRemote?: (level: number) => void) {
  const entries: any[] = typeof report?.forEach === 'function' ? [] : Object.values(report ?? {});

  if (typeof report?.forEach === 'function') {
    report.forEach((entry: any) => entries.push(entry));
  }

  entries.forEach((entry) => {
    if (typeof entry?.audioLevel !== 'number') {
      return;
    }

    const level = Math.max(0, Math.min(1, entry.audioLevel));

    if (entry.type === 'media-source' && entry.kind === 'audio') {
      onLocal?.(level);
    } else if ((entry.type === 'inbound-rtp' || entry.type === 'track') && entry.kind === 'audio') {
      onRemote?.(level);
    }
  });
}

export async function createRealtimeTransport(callbacks: RealtimeTransportCallbacks = {}): Promise<RealtimeTransport> {
  const peerConnection = new RTCPeerConnection();

  const stream = await mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((track: any) => peerConnection.addTrack(track, stream));

  // Remote audio tracks play automatically through the device output once
  // received by react-native-webrtc; no <audio> element equivalent needed.

  let statsInterval: ReturnType<typeof setInterval> | null = null;

  if (callbacks.onLocalAmplitude || callbacks.onRemoteAmplitude) {
    statsInterval = setInterval(() => {
      peerConnection
        .getStats()
        .then((report: any) => readAudioLevels(report, callbacks.onLocalAmplitude, callbacks.onRemoteAmplitude))
        .catch(() => {
          // Ignore — stats support varies by platform.
        });
    }, 150);
  }

  const dataChannel = peerConnection.createDataChannel('oai-events');

  const stop = () => {
    if (statsInterval) {
      clearInterval(statsInterval);
    }

    dataChannel.close?.();
    stream.getTracks().forEach((track: any) => track.stop());
    peerConnection.close();
  };

  return { peerConnection, dataChannel, stop };
}
