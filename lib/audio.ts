function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mobi/i.test(navigator.userAgent || '');
}

// Feature detection for MSE with WebM Opus
export function canUseWebmOpusMSE(): boolean {
  try {
    // MediaSource existence and type support check
    const hasMS = typeof (window as any).MediaSource !== 'undefined';
    if (!hasMS) return false;
    const MS: any = (window as any).MediaSource;
    if (typeof MS.isTypeSupported !== 'function') return false;
    return !!MS.isTypeSupported('audio/webm; codecs="opus"');
  } catch {
    return false;
  }
}

export async function playEarcon() {
  const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return;
  const ctx = new AC();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 880;
  gain.gain.value = 0.0001;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const now = ctx.currentTime;
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.05, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.00001, now + 0.20);
  osc.stop(now + 0.22);
}

// Conditional audio player: uses MSE on mobile for streaming chunks, blob playback on desktop.
export class AudioPlayer {
  private audio: HTMLAudioElement;
  private useMSE: boolean = false;
  // Mobile (MSE)
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private pendingChunks: ArrayBuffer[] = [];
  private objectUrl: string | null = null;
  // Desktop (buffer until end)
  private desktopChunks: ArrayBuffer[] = [];

  constructor() {
    const el = document.getElementById('tts-player') as HTMLAudioElement | null;
    if (!el) throw new Error('Persistent audio element #tts-player not found');
    this.audio = el;
    const useMSE = canUseWebmOpusMSE();
    this.useMSE = useMSE;

    if (useMSE) {
      const ms = new MediaSource();
      this.mediaSource = ms;
      const url = URL.createObjectURL(ms);
      this.objectUrl = url;
      this.audio.src = url;
      ms.addEventListener('sourceopen', () => {
        try {
          if (!this.mediaSource || this.mediaSource.readyState !== 'open') return;
          // MIME type for WebM Opus
          const sb = this.mediaSource.addSourceBuffer('audio/webm; codecs=opus');
          this.sourceBuffer = sb;
          sb.addEventListener('updateend', () => {
            this.flushPending();
          });
          // Attempt to flush any chunks received before buffer was ready
          this.flushPending();
        } catch (e) {
          console.error('Failed to initialize SourceBuffer:', e);
        }
      });
    } else {
      // Desktop path: no special setup
      this.desktopChunks = [];
    }
  }

  private flushPending() {
    const sb = this.sourceBuffer;
    if (!sb || sb.updating) return;
    const chunk = this.pendingChunks.shift();
    if (chunk) {
      try {
        sb.appendBuffer(chunk);
      } catch (e) {
        console.error('appendBuffer failed, re-queueing:', e);
        // Put it back and retry on next updateend
        this.pendingChunks.unshift(chunk);
      }
    }
  }

  appendChunk(chunk: ArrayBuffer) {
  if (this.useMSE) {
      if (!this.sourceBuffer) {
        this.pendingChunks.push(chunk);
        return;
      }
      if (this.sourceBuffer.updating) {
        this.pendingChunks.push(chunk);
        return;
      }
      try {
        this.sourceBuffer.appendBuffer(chunk);
      } catch (e) {
        console.error('appendBuffer failed, queueing:', e);
        this.pendingChunks.push(chunk);
      }
    } else {
      this.desktopChunks.push(chunk);
    }
  }

  async play() {
    try {
      await this.audio.play();
    } catch (e) {
      // Best-effort, some browsers require user gesture
      try { (this.audio as any).play?.(); } catch {}
    }
  }

  onEnded(callback: () => void) {
    this.audio.onended = () => {
      try { callback(); } catch {}
      // Cleanup object URL on mobile streams
      if (this.objectUrl) {
        try { URL.revokeObjectURL(this.objectUrl); } catch {}
        this.objectUrl = null;
      }
    };
  }

  async endStream() {
  if (this.useMSE) {
      try {
        // Flush any remaining pending chunks first
        this.flushPending();
        if (this.mediaSource && this.mediaSource.readyState === 'open') {
          this.mediaSource.endOfStream();
        }
      } catch (e) {
        console.warn('endOfStream failed:', e);
      } finally {
        await this.play();
      }
    } else {
      if (!this.desktopChunks.length) return;
      const merged = mergeArrayBuffers(this.desktopChunks);
      this.desktopChunks = [];
      const blob = new Blob([merged], { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      this.audio.src = url;
      try {
        await this.play();
      } finally {
        // Release URL after playback ends via onEnded cleanup
      }
    }
  }
}

function mergeArrayBuffers(parts: ArrayBuffer[]): ArrayBuffer {
  const total = parts.reduce((n, b) => n + b.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) { out.set(new Uint8Array(p), offset); offset += p.byteLength; }
  return out.buffer;
}
