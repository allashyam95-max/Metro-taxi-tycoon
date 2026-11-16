import { MUSIC_TRACKS, MusicMood, MusicTrackSpec, getMusicTrackById } from '../config/musicTracks';
import { soundEngine } from './soundEngine';

export interface MusicPlayerSnapshot {
  currentTrackId: string;
  currentTrack: MusicTrackSpec;
  isPlaying: boolean;
  isUnlocked: boolean;
  volume: number;
  muted: boolean;
  autoSwitch: boolean;
  allTracksFailed: boolean;
  failedTrackIds: string[];
}

export type DrivingMusicContext = 'freeroam' | 'taxi-idle' | 'trip' | 'trip-vip';

interface DeckState {
  audio: HTMLAudioElement;
  trackId: string | null;
  fadeWeight: number;
}

class MusicPlayer {
  private decks: [DeckState, DeckState] | null = null;
  private activeDeckIdx: 0 | 1 = 0;

  private currentTrackId: string = MUSIC_TRACKS[0]?.id ?? 'chill1';
  private volume = 0.55;
  private muted = false;
  private autoSwitch = true;

  private isUnlocked = false;
  private isPlaying = false;
  private userPaused = false;

  private engineLoudness = 0;
  private currentDuck = 1;
  private fadeTimer: number | null = null;

  private failedTrackIds = new Set<string>();
  private lastContext: DrivingMusicContext = 'taxi-idle';
  private masterSoundEnabled = true;

  private listeners = new Set<(snap: MusicPlayerSnapshot) => void>();
  private onTrackPersist: ((trackId: string) => void) | null = null;

  constructor() {
    this.masterSoundEnabled = soundEngine.isEnabled();
    soundEngine.onEnabledChange((enabled) => {
      this.masterSoundEnabled = enabled;
      this.applyVolumes();
    });
    soundEngine.onEngineLoudnessChange((loudness) => {
      this.setEngineLoudness(loudness);
    });
  }

  public init(options: {
    trackId: string;
    volume: number;
    muted: boolean;
    autoSwitch: boolean;
    onTrackPersist?: (trackId: string) => void;
  }): void {
    this.currentTrackId = getMusicTrackById(options.trackId).id;
    this.volume = Math.max(0, Math.min(1, options.volume));
    this.muted = options.muted;
    this.autoSwitch = options.autoSwitch;
    this.onTrackPersist = options.onTrackPersist ?? null;
    this.ensureDecks();
    this.emit();
  }

  public subscribe(listener: (snap: MusicPlayerSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getSnapshot(): MusicPlayerSnapshot {
    const track = getMusicTrackById(this.currentTrackId);
    const allTracksFailed =
      MUSIC_TRACKS.length === 0 ||
      MUSIC_TRACKS.every((t) => this.failedTrackIds.has(t.id));
    return {
      currentTrackId: track.id,
      currentTrack: track,
      isPlaying: this.isPlaying,
      isUnlocked: this.isUnlocked,
      volume: this.volume,
      muted: this.muted,
      autoSwitch: this.autoSwitch,
      allTracksFailed,
      failedTrackIds: Array.from(this.failedTrackIds),
    };
  }

  /**
   * Called on the first user tap/keydown so mobile browsers permit playback.
   */
  public unlockOnFirstTap(): void {
    if (this.isUnlocked) return;
    this.isUnlocked = true;
    if (!this.userPaused && !this.isPlaying && MUSIC_TRACKS.length > 0) {
      this.playTrack(this.currentTrackId, false);
    } else {
      this.emit();
    }
  }

  public togglePlay(): boolean {
    this.isUnlocked = true;
    if (this.isPlaying) {
      this.pause();
    } else {
      this.userPaused = false;
      // Allow retrying previously failed files when the user manually hits Play
      if (this.failedTrackIds.size >= MUSIC_TRACKS.length) {
        this.failedTrackIds.clear();
      }
      this.playTrack(this.currentTrackId, false);
    }
    return this.isPlaying;
  }

  public pause(): void {
    this.userPaused = true;
    this.isPlaying = false;
    this.stopFadeLoop();
    if (this.decks) {
      for (const deck of this.decks) {
        deck.audio.pause();
        deck.fadeWeight = 0;
      }
    }
    this.emit();
  }

  public nextTrack(): void {
    this.isUnlocked = true;
    this.userPaused = false;
    if (this.failedTrackIds.size >= MUSIC_TRACKS.length) {
      this.failedTrackIds.clear();
    }
    const next = this.findNextPlayableTrack(this.currentTrackId, 1);
    if (next) {
      this.playTrack(next.id, this.isPlaying);
    }
  }

  public previousTrack(): void {
    this.isUnlocked = true;
    this.userPaused = false;
    if (this.failedTrackIds.size >= MUSIC_TRACKS.length) {
      this.failedTrackIds.clear();
    }
    const prev = this.findNextPlayableTrack(this.currentTrackId, -1);
    if (prev) {
      this.playTrack(prev.id, this.isPlaying);
    }
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    this.applyVolumes();
    this.emit();
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolumes();
    this.emit();
  }

  public setAutoSwitch(enabled: boolean): void {
    this.autoSwitch = enabled;
    this.emit();
  }

  /**
   * Ducks music volume gently when engine sound is loud.
   */
  public setEngineLoudness(loudness01: number): void {
    const clamped = Math.max(0, Math.min(1, loudness01));
    this.engineLoudness = clamped;
    const targetDuck = 1 - clamped * 0.34;
    if (Math.abs(this.currentDuck - targetDuck) > 0.005) {
      this.currentDuck += (targetDuck - this.currentDuck) * 0.22;
      this.applyVolumes();
    }
  }

  /**
   * Optionally crossfade to a taxi/VIP track when a ride starts or a calm track in free roam.
   */
  public setDrivingContext(ctx: DrivingMusicContext): void {
    const prev = this.lastContext;
    this.lastContext = ctx;
    if (prev === ctx) return;
    if (!this.autoSwitch || !this.isUnlocked || this.userPaused) return;

    const current = getMusicTrackById(this.currentTrackId);
    let desiredMood: MusicMood | null = null;
    if (ctx === 'trip-vip') {
      desiredMood = 'vip';
    } else if (ctx === 'trip') {
      desiredMood = 'taxi';
    } else if (ctx === 'freeroam') {
      desiredMood = 'calm';
    }

    if (!desiredMood || current.mood === desiredMood) return;

    let candidate = this.findTrackByMood(desiredMood);
    if (!candidate && desiredMood === 'vip') {
      candidate = this.findTrackByMood('taxi');
    }
    if (candidate && candidate.id !== this.currentTrackId) {
      this.playTrack(candidate.id, true);
    }
  }

  private ensureDecks(): void {
    if (typeof window === 'undefined' || this.decks) return;

    const makeDeck = (idx: 0 | 1): DeckState => {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.volume = 0;

      audio.addEventListener('ended', () => {
        if (this.activeDeckIdx !== idx || !this.isPlaying) return;
        const next = this.findNextPlayableTrack(this.currentTrackId, 1);
        if (!next) {
          this.isPlaying = false;
          this.emit();
          return;
        }
        if (next.id === this.currentTrackId) {
          audio.currentTime = 0;
          audio.play().catch((err) => this.handlePlayRejection(next, err));
        } else {
          this.playTrack(next.id, false);
        }
      });

      audio.addEventListener('error', () => {
        if (this.activeDeckIdx !== idx) return;
        const deckTrackId = this.decks?.[idx].trackId;
        if (!deckTrackId) return;
        const track = getMusicTrackById(deckTrackId);
        this.handleTrackLoadFailure(track, new Error(`Audio load error for ${track.src}`));
      });

      return { audio, trackId: null, fadeWeight: 0 };
    };

    this.decks = [makeDeck(0), makeDeck(1)];
  }

  private playTrack(trackId: string, crossfade: boolean): void {
    this.ensureDecks();
    if (!this.decks || MUSIC_TRACKS.length === 0) return;

    let target = getMusicTrackById(trackId);
    if (this.failedTrackIds.has(target.id)) {
      const fallback = this.findNextPlayableTrack(target.id, 1);
      if (!fallback) {
        this.isPlaying = false;
        this.emit();
        return;
      }
      target = fallback;
    }

    this.currentTrackId = target.id;
    this.onTrackPersist?.(target.id);

    const prevIdx = this.activeDeckIdx;
    const nextIdx: 0 | 1 = crossfade && this.isPlaying ? (prevIdx === 0 ? 1 : 0) : prevIdx;
    this.activeDeckIdx = nextIdx;

    const nextDeck = this.decks[nextIdx];
    const prevDeck = this.decks[prevIdx];

    if (nextIdx === prevIdx) {
      this.stopFadeLoop();
      nextDeck.fadeWeight = 1;
    } else {
      nextDeck.fadeWeight = 0;
    }

    nextDeck.trackId = target.id;
    if (!nextDeck.audio.src.endsWith(target.src)) {
      nextDeck.audio.src = target.src;
      nextDeck.audio.load();
    } else {
      nextDeck.audio.currentTime = 0;
    }

    this.isPlaying = true;
    this.applyVolumes();
    this.emit();

    const playPromise = nextDeck.audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((err) => this.handlePlayRejection(target, err));
    }

    if (nextIdx !== prevIdx) {
      this.startCrossfade(nextDeck, prevDeck);
    }
  }

  private startCrossfade(inDeck: DeckState, outDeck: DeckState): void {
    this.stopFadeLoop();
    const startTime = performance.now();
    const durationMs = 750;

    this.fadeTimer = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - startTime) / durationMs);
      inDeck.fadeWeight = t;
      outDeck.fadeWeight = 1 - t;
      this.applyVolumes();

      if (t >= 1) {
        this.stopFadeLoop();
        outDeck.audio.pause();
        outDeck.audio.currentTime = 0;
        outDeck.fadeWeight = 0;
      }
    }, 35);
  }

  private stopFadeLoop(): void {
    if (this.fadeTimer !== null) {
      window.clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  private handlePlayRejection(track: MusicTrackSpec, err: unknown): void {
    const name = (err as { name?: string })?.name ?? '';
    if (name === 'AbortError') return;
    if (name === 'NotAllowedError') {
      // Autoplay blocked before gesture; wait for first tap
      this.isUnlocked = false;
      this.isPlaying = false;
      this.emit();
      return;
    }
    this.handleTrackLoadFailure(track, err);
  }

  private handleTrackLoadFailure(track: MusicTrackSpec, err: unknown): void {
    if (this.failedTrackIds.has(track.id)) return;
    console.warn(`Skipping music track "${track.fileName}" (failed to load):`, err);
    this.failedTrackIds.add(track.id);

    const next = this.findNextPlayableTrack(track.id, 1);
    if (!next) {
      this.isPlaying = false;
      this.stopFadeLoop();
      if (this.decks) {
        for (const deck of this.decks) {
          deck.audio.pause();
        }
      }
      this.emit();
      return;
    }

    this.playTrack(next.id, false);
  }

  private findNextPlayableTrack(fromId: string, direction: 1 | -1): MusicTrackSpec | null {
    if (MUSIC_TRACKS.length === 0) return null;
    const startIdx = Math.max(
      0,
      MUSIC_TRACKS.findIndex((t) => t.id === fromId),
    );
    for (let offset = 1; offset <= MUSIC_TRACKS.length; offset++) {
      const idx = (startIdx + direction * offset + MUSIC_TRACKS.length * 2) % MUSIC_TRACKS.length;
      const cand = MUSIC_TRACKS[idx];
      if (!this.failedTrackIds.has(cand.id)) {
        return cand;
      }
    }
    return null;
  }

  private findTrackByMood(mood: MusicMood): MusicTrackSpec | null {
    for (const track of MUSIC_TRACKS) {
      if (track.mood === mood && !this.failedTrackIds.has(track.id)) {
        return track;
      }
    }
    return null;
  }

  private applyVolumes(): void {
    if (!this.decks) return;
    const baseGain = this.muted || !this.masterSoundEnabled ? 0 : this.volume * this.currentDuck;
    for (const deck of this.decks) {
      deck.audio.volume = Math.max(0, Math.min(1, baseGain * deck.fadeWeight));
    }
  }

  private emit(): void {
    const snap = this.getSnapshot();
    this.listeners.forEach((cb) => cb(snap));
  }

  public dispose(): void {
    this.stopFadeLoop();
    if (this.decks) {
      for (const deck of this.decks) {
        deck.audio.pause();
        deck.audio.src = '';
      }
      this.decks = null;
    }
    this.listeners.clear();
  }
}

export const musicPlayer = new MusicPlayer();
