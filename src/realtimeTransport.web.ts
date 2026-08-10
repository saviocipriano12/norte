export type RealtimeTransportCallbacks = {
  /** 0..1 level sampled from the microphone input, while connected. */
  onLocalAmplitude?: (level: number) => void;
  /** 0..1 level sampled from the remote (Norte voice) audio track, while connected. */
  onRemoteAmplitude?: (level: number) => void;
};

export type RealtimeTransport = {
  peerConnection: RTCPeerConnection;
  dataChannel: RTCDataChannel;
  stop: () => void;
};

export function isRealtimeVoiceSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean((window as any).RTCPeerConnection) &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

function sampleLevel(analyser: AnalyserNode, buffer: Uint8Array<ArrayBuffer>) {
  analyser.getByteTimeDomainData(buffer);

  let total = 0;
  for (const sample of buffer) {
    total += Math.abs(sample - 128);
  }

  return Math.min(1, total / buffer.length / 40);
}

export async function createRealtimeTransport(callbacks: RealtimeTransportCallbacks = {}): Promise<RealtimeTransport> {
  const PeerConnection = (window as any).RTCPeerConnection as typeof RTCPeerConnection;
  const peerConnection = new PeerConnection();

  const remoteAudio = new Audio();
  remoteAudio.autoplay = true;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
  });

  stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));

  const AudioContextCtor = (window as any).AudioContext ?? (window as any).webkitAudioContext;
  const audioContext: AudioContext | null = AudioContextCtor ? new AudioContextCtor() : null;
  const sampleBuffer: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(512));
  let localAnalyser: AnalyserNode | null = null;
  let remoteAnalyser: AnalyserNode | null = null;
  let rafId: number | null = null;

  if (audioContext && callbacks.onLocalAmplitude) {
    localAnalyser = audioContext.createAnalyser();
    localAnalyser.fftSize = 512;
    audioContext.createMediaStreamSource(stream).connect(localAnalyser);
  }

  peerConnection.ontrack = (event) => {
    remoteAudio.srcObject = event.streams[0];

    if (audioContext && callbacks.onRemoteAmplitude && event.streams[0]) {
      remoteAnalyser = audioContext.createAnalyser();
      remoteAnalyser.fftSize = 512;
      audioContext.createMediaStreamSource(event.streams[0]).connect(remoteAnalyser);
    }
  };

  if (callbacks.onLocalAmplitude || callbacks.onRemoteAmplitude) {
    const tick = () => {
      if (localAnalyser && callbacks.onLocalAmplitude) {
        callbacks.onLocalAmplitude(sampleLevel(localAnalyser, sampleBuffer));
      }

      if (remoteAnalyser && callbacks.onRemoteAmplitude) {
        callbacks.onRemoteAmplitude(sampleLevel(remoteAnalyser, sampleBuffer));
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
  }

  const dataChannel = peerConnection.createDataChannel('oai-events');

  const stop = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }

    dataChannel.close?.();
    peerConnection.getSenders?.().forEach((sender) => sender.track?.stop?.());
    peerConnection.close?.();
    stream.getTracks().forEach((track) => track.stop());
    remoteAudio.pause?.();
    remoteAudio.srcObject = null;
    void audioContext?.close?.();
  };

  return { peerConnection, dataChannel, stop };
}
