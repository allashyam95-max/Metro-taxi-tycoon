import { SurfaceType, VehicleCategory } from '../types/game';

export interface EngineAudioParams {
  braking?: boolean;
  lateralSlip?: number;
  surface?: SurfaceType;
  category?: VehicleCategory;
}

export interface BackgroundAudioParams {
  nearestTrafficDist: number;
  nearestTrafficSpeed: number;
  nearestTrafficPan: number; // -1..1
  trafficDensity: number; // 0..1
  inCity: boolean;
  nearBeach: boolean;
  isDaytime: boolean;
  playerSpeedRatio: number;
  dt: number;
}

class SoundEngine {
  private ctx: AudioContext | null = null;

  // Separate master gain buses for Options volume controls
  private carMasterGain: GainNode | null = null;
  private bgMasterGain: GainNode | null = null;

  // Player vehicle driving sound nodes
  private engineOsc: OscillatorNode | null = null;
  private engineSubOsc: OscillatorNode | null = null;
  private engineHarmOsc: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  private roadNoiseSource: AudioBufferSourceNode | null = null;
  private roadFilter: BiquadFilterNode | null = null;
  private roadGain: GainNode | null = null;

  private skidNoiseSource: AudioBufferSourceNode | null = null;
  private skidFilter: BiquadFilterNode | null = null;
  private skidGain: GainNode | null = null;

  // Background sound effect nodes (other traffic, wind, city, beach)
  private trafficOsc: OscillatorNode | null = null;
  private trafficSubOsc: OscillatorNode | null = null;
  private trafficFilter: BiquadFilterNode | null = null;
  private trafficGain: GainNode | null = null;
  private trafficPanner: StereoPannerNode | null = null;

  private cityNoiseSource: AudioBufferSourceNode | null = null;
  private cityFilter: BiquadFilterNode | null = null;
  private cityGain: GainNode | null = null;

  private windNoiseSource: AudioBufferSourceNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;

  private beachNoiseSource: AudioBufferSourceNode | null = null;
  private beachFilter: BiquadFilterNode | null = null;
  private beachGain: GainNode | null = null;

  private sharedNoiseBuffer: AudioBuffer | null = null;

  private enabled = true;
  private paused = false;
  private carSoundVolume = 0.75;
  private backgroundSoundVolume = 0.65;

  private ambientClock = 0;
  private distantHornCooldown = 7;
  private birdCooldown = 4.5;

  private enabledListeners = new Set<(enabled: boolean) => void>();
  private loudnessListeners = new Set<(loudness: number) => void>();

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.applyBusGains();
    if (!enabled) {
      this.emitLoudness(0);
    }
    this.enabledListeners.forEach((cb) => cb(enabled));
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
    this.applyBusGains();
    if (paused) {
      this.emitLoudness(0);
    }
  }

  public setCarSoundVolume(volume: number): void {
    this.carSoundVolume = Math.max(0, Math.min(1, volume));
    this.applyBusGains();
  }

  public getCarSoundVolume(): number {
    return this.carSoundVolume;
  }

  public setBackgroundSoundVolume(volume: number): void {
    this.backgroundSoundVolume = Math.max(0, Math.min(1, volume));
    this.applyBusGains();
  }

  public getBackgroundSoundVolume(): number {
    return this.backgroundSoundVolume;
  }

  public onEnabledChange(cb: (enabled: boolean) => void): () => void {
    this.enabledListeners.add(cb);
    return () => {
      this.enabledListeners.delete(cb);
    };
  }

  public onEngineLoudnessChange(cb: (loudness: number) => void): () => void {
    this.loudnessListeners.add(cb);
    return () => {
      this.loudnessListeners.delete(cb);
    };
  }

  private emitLoudness(loudness: number): void {
    this.loudnessListeners.forEach((cb) => cb(loudness));
  }

  public getContext(): AudioContext | null {
    this.unlock();
    return this.ctx;
  }

  private applyBusGains(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const active = this.enabled && !this.paused;
    if (this.carMasterGain) {
      this.carMasterGain.gain.setTargetAtTime(active ? this.carSoundVolume : 0, now, 0.05);
    }
    if (this.bgMasterGain) {
      this.bgMasterGain.gain.setTargetAtTime(active ? this.backgroundSoundVolume : 0, now, 0.08);
    }
  }

  private ensureNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.sharedNoiseBuffer) return this.sharedNoiseBuffer;
    const length = Math.floor(ctx.sampleRate * 2.5);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Slightly pink-tinted noise so road/wind/surf sounds warm rather than harsh
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.16;
    }
    this.sharedNoiseBuffer = buffer;
    return buffer;
  }

  private createLoopingNoise(
    ctx: AudioContext,
    filterType: BiquadFilterType,
    freq: number,
    q: number,
    destination: AudioNode,
  ): {
    source: AudioBufferSourceNode;
    filter: BiquadFilterNode;
    gain: GainNode;
  } {
    const source = ctx.createBufferSource();
    source.buffer = this.ensureNoiseBuffer(ctx);
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = q;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    source.start();

    return { source, filter, gain };
  }

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    if (!this.carMasterGain && this.ctx) {
      try {
        const ctx = this.ctx;
        const carBus = ctx.createGain();
        carBus.gain.value = this.enabled && !this.paused ? this.carSoundVolume : 0;
        carBus.connect(ctx.destination);
        this.carMasterGain = carBus;

        const bgBus = ctx.createGain();
        bgBus.gain.value = this.enabled && !this.paused ? this.backgroundSoundVolume : 0;
        bgBus.connect(ctx.destination);
        this.bgMasterGain = bgBus;

        // 1. Player Vehicle Engine Harmonics
        const osc = ctx.createOscillator();
        const subOsc = ctx.createOscillator();
        const harmOsc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        const subGain = ctx.createGain();
        const harmGain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.value = 46;

        subOsc.type = 'triangle';
        subOsc.frequency.value = 23;
        subGain.gain.value = 0.72;

        harmOsc.type = 'sawtooth';
        harmOsc.frequency.value = 92;
        harmGain.gain.value = 0.18;

        filter.type = 'lowpass';
        filter.frequency.value = 165;
        filter.Q.value = 1.6;

        gain.gain.value = 0;

        osc.connect(filter);
        subOsc.connect(subGain);
        subGain.connect(filter);
        harmOsc.connect(harmGain);
        harmGain.connect(filter);
        filter.connect(gain);
        gain.connect(carBus);

        osc.start();
        subOsc.start();
        harmOsc.start();

        this.engineOsc = osc;
        this.engineSubOsc = subOsc;
        this.engineHarmOsc = harmOsc;
        this.engineFilter = filter;
        this.engineGain = gain;

        // 2. Player Road / Surface Rolling Noise
        const road = this.createLoopingNoise(ctx, 'bandpass', 280, 0.75, carBus);
        this.roadNoiseSource = road.source;
        this.roadFilter = road.filter;
        this.roadGain = road.gain;

        // 3. Player Tire Drift / Brake Squeal Layer
        const skid = this.createLoopingNoise(ctx, 'bandpass', 1180, 5.2, carBus);
        this.skidNoiseSource = skid.source;
        this.skidFilter = skid.filter;
        this.skidGain = skid.gain;

        // 4. Nearby Other Vehicle Drive Hum (Stereo Panned)
        const tOsc = ctx.createOscillator();
        const tSubOsc = ctx.createOscillator();
        const tFilter = ctx.createBiquadFilter();
        const tGain = ctx.createGain();
        const tSubGain = ctx.createGain();

        tOsc.type = 'sawtooth';
        tOsc.frequency.value = 58;
        tSubOsc.type = 'triangle';
        tSubOsc.frequency.value = 29;
        tSubGain.gain.value = 0.75;

        tFilter.type = 'lowpass';
        tFilter.frequency.value = 190;
        tFilter.Q.value = 1.1;
        tGain.gain.value = 0;

        tOsc.connect(tFilter);
        tSubOsc.connect(tSubGain);
        tSubGain.connect(tFilter);
        tFilter.connect(tGain);

        if (typeof ctx.createStereoPanner === 'function') {
          const panner = ctx.createStereoPanner();
          panner.pan.value = 0;
          tGain.connect(panner);
          panner.connect(bgBus);
          this.trafficPanner = panner;
        } else {
          tGain.connect(bgBus);
        }

        tOsc.start();
        tSubOsc.start();

        this.trafficOsc = tOsc;
        this.trafficSubOsc = tSubOsc;
        this.trafficFilter = tFilter;
        this.trafficGain = tGain;

        // 5. Urban City Traffic Ambience
        const city = this.createLoopingNoise(ctx, 'lowpass', 240, 0.7, bgBus);
        this.cityNoiseSource = city.source;
        this.cityFilter = city.filter;
        this.cityGain = city.gain;

        // 6. Wind Air Rush
        const wind = this.createLoopingNoise(ctx, 'bandpass', 420, 0.65, bgBus);
        this.windNoiseSource = wind.source;
        this.windFilter = wind.filter;
        this.windGain = wind.gain;

        // 7. Coastal Ocean Surf Wash
        const beach = this.createLoopingNoise(ctx, 'lowpass', 360, 0.85, bgBus);
        this.beachNoiseSource = beach.source;
        this.beachFilter = beach.filter;
        this.beachGain = beach.gain;
      } catch {
        // Ignore audio init errors in restricted environments
      }
    }
  }

  public updateEngine(
    speedRatio: number,
    accelerating: boolean,
    params?: EngineAudioParams,
  ): void {
    if (!this.enabled || this.paused) {
      this.emitLoudness(0);
      if (this.engineGain && this.ctx) {
        const now = this.ctx.currentTime;
        this.engineGain.gain.setTargetAtTime(0, now, 0.06);
        this.roadGain?.gain.setTargetAtTime(0, now, 0.06);
        this.skidGain?.gain.setTargetAtTime(0, now, 0.05);
      }
      return;
    }

    const clamped = Math.max(0, Math.min(1.2, speedRatio));
    const speed01 = Math.min(1, clamped);
    const loudness = Math.min(
      1,
      Math.max(0, (clamped / 1.2) * 0.78 + (accelerating ? 0.22 : 0)) * this.carSoundVolume,
    );
    this.emitLoudness(loudness);

    if (
      !this.ctx ||
      this.ctx.state !== 'running' ||
      !this.engineOsc ||
      !this.engineSubOsc ||
      !this.engineHarmOsc ||
      !this.engineFilter ||
      !this.engineGain
    ) {
      return;
    }

    const category = params?.category ?? 'economy';
    const surface = params?.surface ?? 'road';
    const braking = params?.braking ?? false;
    const lateralSlip = params?.lateralSlip ?? 0;

    // Subtle vehicle character pitch & filter multiplier
    let baseFreq = 44;
    let freqSpan = 104;
    let toneCutoff = 165;
    let engineGainScale = 1.0;

    if (category === 'suv') {
      baseFreq = 37;
      freqSpan = 88;
      toneCutoff = 140;
      engineGainScale = 1.08;
    } else if (category === 'luxury' || category === 'vvip') {
      baseFreq = 40;
      freqSpan = 86;
      toneCutoff = 135;
      engineGainScale = 0.86;
    } else if (category === 'private') {
      baseFreq = 48;
      freqSpan = 128;
      toneCutoff = 205;
      engineGainScale = 1.12;
    } else if (category === 'sedan') {
      baseFreq = 42;
      freqSpan = 98;
      toneCutoff = 155;
    }

    // Subtle 4-gear RPM cadence blended into overall speed curve
    const gearPhase = (speed01 * 3.35) % 1;
    const rpmCadence = speed01 * 0.76 + gearPhase * 0.24 * Math.min(1, speed01 * 2.5);
    const rpmCurve = Math.pow(Math.max(0, rpmCadence), 0.88);

    const targetFreq = baseFreq + rpmCurve * freqSpan + (accelerating ? 12 : 0);
    const targetCutoff = toneCutoff + rpmCurve * 440 + (accelerating ? 110 : 0);
    const targetGain =
      (0.02 + speed01 * 0.044 + (accelerating ? 0.014 : 0)) * engineGainScale;

    const now = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(targetFreq, now, 0.06);
    this.engineSubOsc.frequency.setTargetAtTime(targetFreq * 0.5, now, 0.06);
    this.engineHarmOsc.frequency.setTargetAtTime(targetFreq * 2.01, now, 0.06);
    this.engineFilter.frequency.setTargetAtTime(targetCutoff, now, 0.07);
    this.engineGain.gain.setTargetAtTime(targetGain, now, 0.07);

    // Road / off-road tire rolling sound
    if (this.roadFilter && this.roadGain) {
      const roadActive = speed01 > 0.03;
      const surfaceFreq =
        surface === 'road'
          ? 340 + speed01 * 480
          : surface === 'dirt'
          ? 210 + speed01 * 290
          : surface === 'grass'
          ? 260 + speed01 * 320
          : 185 + speed01 * 220;
      const surfaceGain = !roadActive
        ? 0
        : (surface === 'road' ? 0.032 : 0.056) * Math.pow(speed01, 0.8);
      this.roadFilter.frequency.setTargetAtTime(surfaceFreq, now, 0.08);
      this.roadGain.gain.setTargetAtTime(surfaceGain, now, 0.08);
    }

    // Tire drift / hard brake squeal (primarily on asphalt/hard surface)
    if (this.skidFilter && this.skidGain) {
      const slipNorm = Math.max(0, Math.min(1, (lateralSlip - 2.3) / 6.0));
      const brakeSkid = braking && speed01 > 0.35 ? 0.45 * speed01 : 0;
      const surfaceSquealMult = surface === 'road' ? 1.0 : 0.32;
      const skidLevel = Math.min(1, Math.max(slipNorm, brakeSkid)) * surfaceSquealMult;
      const skidFreq = 1080 + skidLevel * 420;
      this.skidFilter.frequency.setTargetAtTime(skidFreq, now, 0.06);
      this.skidGain.gain.setTargetAtTime(skidLevel * 0.048, now, 0.06);
    }
  }

  public updateBackground(params: BackgroundAudioParams): void {
    if (!this.ctx || this.ctx.state !== 'running' || !this.enabled || this.paused) {
      if (this.ctx) {
        const now = this.ctx.currentTime;
        this.trafficGain?.gain.setTargetAtTime(0, now, 0.08);
        this.cityGain?.gain.setTargetAtTime(0, now, 0.1);
        this.windGain?.gain.setTargetAtTime(0, now, 0.1);
        this.beachGain?.gain.setTargetAtTime(0, now, 0.1);
      }
      return;
    }

    const now = this.ctx.currentTime;
    this.ambientClock += params.dt;

    // 1. Closest other traffic vehicle drive hum (panned left/right)
    if (this.trafficOsc && this.trafficSubOsc && this.trafficFilter && this.trafficGain) {
      const maxRange = 46;
      const proximity = Math.max(0, 1 - params.nearestTrafficDist / maxRange);
      const proxCurve = proximity * proximity;
      const npcSpeed01 = Math.max(0, Math.min(1, params.nearestTrafficSpeed / 14));
      const trafficVol = proxCurve * (0.015 + npcSpeed01 * 0.065);
      const trafficFreq = 52 + npcSpeed01 * 48;

      this.trafficOsc.frequency.setTargetAtTime(trafficFreq, now, 0.09);
      this.trafficSubOsc.frequency.setTargetAtTime(trafficFreq * 0.5, now, 0.09);
      this.trafficFilter.frequency.setTargetAtTime(160 + npcSpeed01 * 230, now, 0.1);
      this.trafficGain.gain.setTargetAtTime(trafficVol, now, 0.09);
      if (this.trafficPanner) {
        this.trafficPanner.pan.setTargetAtTime(
          Math.max(-1, Math.min(1, params.nearestTrafficPan)),
          now,
          0.08,
        );
      }
    }

    // 2. Urban city distant traffic wash
    if (this.cityFilter && this.cityGain) {
      const cityBase = params.inCity ? 0.032 : 0.008;
      const cityLevel = cityBase + params.trafficDensity * 0.028;
      this.cityFilter.frequency.setTargetAtTime(params.inCity ? 250 : 170, now, 0.25);
      this.cityGain.gain.setTargetAtTime(cityLevel, now, 0.25);
    }

    // 3. Ambient breeze / driving wind rush
    if (this.windFilter && this.windGain) {
      const speedWind = Math.pow(Math.min(1, params.playerSpeedRatio), 1.3) * 0.042;
      const breeze = 0.009;
      this.windFilter.frequency.setTargetAtTime(360 + params.playerSpeedRatio * 520, now, 0.14);
      this.windGain.gain.setTargetAtTime(breeze + speedWind, now, 0.14);
    }

    // 4. Coastal ocean surf waves near the beach
    if (this.beachFilter && this.beachGain) {
      if (params.nearBeach) {
        const waveCycle = 0.5 + 0.5 * Math.sin(this.ambientClock * 0.72);
        const surfGain = 0.024 + waveCycle * 0.042;
        this.beachFilter.frequency.setTargetAtTime(240 + waveCycle * 320, now, 0.2);
        this.beachGain.gain.setTargetAtTime(surfGain, now, 0.2);
      } else {
        this.beachGain.gain.setTargetAtTime(0, now, 0.25);
      }
    }

    // 5. Occasional distant city traffic honk (adds lively urban street feel)
    if (params.inCity && this.backgroundSoundVolume > 0.02) {
      this.distantHornCooldown -= params.dt;
      if (this.distantHornCooldown <= 0) {
        this.distantHornCooldown = 8.5 + Math.random() * 9.5;
        const pan = (Math.random() * 2 - 1) * 0.85;
        const atten = 0.22 + Math.random() * 0.18;
        const variant = Math.floor(Math.random() * 3);
        this.playTrafficHorn(pan, atten, variant, Math.random() < 0.4);
      }
    }

    // 6. Occasional subtle daytime countryside / beach birds
    if (!params.inCity && params.isDaytime && this.backgroundSoundVolume > 0.02) {
      this.birdCooldown -= params.dt;
      if (this.birdCooldown <= 0) {
        this.birdCooldown = 4.5 + Math.random() * 6.5;
        this.playDistantBird((Math.random() * 2 - 1) * 0.8);
      }
    }
  }

  public playTrafficHorn(
    pan = 0,
    distanceAtten = 0.8,
    variant = 0,
    doubleBeep = true,
  ): void {
    if (!this.enabled || this.paused || !this.ctx || !this.bgMasterGain) return;
    if (this.ctx.state !== 'running' || this.backgroundSoundVolume <= 0.01) return;

    const chords: Array<[number, number]> = [
      [370, 466.16], // F#4 + A#4
      [349.23, 440], // F4 + A4
      [392, 493.88], // G4 + B4
    ];
    const [f1, f2] = chords[((variant % chords.length) + chords.length) % chords.length];
    const now = this.ctx.currentTime;
    const peak = Math.max(0.015, Math.min(0.18, 0.13 * distanceAtten));

    const triggerBlast = (start: number, duration: number) => {
      if (!this.ctx || !this.bgMasterGain) return;
      const o1 = this.ctx.createOscillator();
      const o2 = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      o1.type = 'sawtooth';
      o2.type = 'sawtooth';
      o1.frequency.setValueAtTime(f1, start);
      o2.frequency.setValueAtTime(f2, start);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(980, start);
      filter.Q.setValueAtTime(1.4, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(peak, start + 0.025);
      gain.gain.setValueAtTime(peak, start + Math.max(0.04, duration - 0.04));
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      o1.connect(filter);
      o2.connect(filter);
      filter.connect(gain);

      if (typeof this.ctx.createStereoPanner === 'function') {
        const panner = this.ctx.createStereoPanner();
        panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), start);
        gain.connect(panner);
        panner.connect(this.bgMasterGain);
      } else {
        gain.connect(this.bgMasterGain);
      }

      o1.start(start);
      o2.start(start);
      o1.stop(start + duration + 0.03);
      o2.stop(start + duration + 0.03);
    };

    if (doubleBeep) {
      triggerBlast(now, 0.12);
      triggerBlast(now + 0.18, 0.24);
    } else {
      triggerBlast(now, 0.28);
    }
  }

  private playDistantBird(pan: number): void {
    if (!this.enabled || this.paused || !this.ctx || !this.bgMasterGain) return;
    if (this.ctx.state !== 'running') return;

    const now = this.ctx.currentTime;
    const chirps = Math.random() < 0.5 ? 2 : 3;
    for (let i = 0; i < chirps; i++) {
      const start = now + i * 0.14;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const base = 2200 + Math.random() * 900;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(base, start);
      osc.frequency.exponentialRampToValueAtTime(base * 1.28, start + 0.05);
      osc.frequency.exponentialRampToValueAtTime(base * 0.92, start + 0.09);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.022, start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);

      osc.connect(gain);
      if (typeof this.ctx.createStereoPanner === 'function') {
        const panner = this.ctx.createStereoPanner();
        panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), start);
        gain.connect(panner);
        panner.connect(this.bgMasterGain);
      } else {
        gain.connect(this.bgMasterGain);
      }
      osc.start(start);
      osc.stop(start + 0.12);
    }
  }

  public playPickup(): void {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    this.tone(587.33, now, 0.09, 'sine', 0.1, this.carMasterGain ?? this.ctx.destination);
    this.tone(880, now + 0.09, 0.14, 'sine', 0.1, this.carMasterGain ?? this.ctx.destination);
  }

  public playDropoff(): void {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const dest = this.carMasterGain ?? this.ctx.destination;
    this.tone(523.25, now, 0.08, 'triangle', 0.11, dest);
    this.tone(659.25, now + 0.08, 0.09, 'triangle', 0.11, dest);
    this.tone(783.99, now + 0.17, 0.12, 'triangle', 0.11, dest);
    this.tone(1046.5, now + 0.27, 0.2, 'sine', 0.12, dest);
  }

  public playBump(): void {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const dest = this.carMasterGain ?? this.ctx.destination;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + 0.15);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playRefuel(): void {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const dest = this.carMasterGain ?? this.ctx.destination;
    this.tone(392, now, 0.08, 'sine', 0.09, dest);
    this.tone(523.25, now + 0.08, 0.12, 'sine', 0.09, dest);
  }

  public playDayFee(): void {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const dest = this.carMasterGain ?? this.ctx.destination;
    this.tone(440, now, 0.12, 'triangle', 0.09, dest);
    this.tone(349.23, now + 0.14, 0.18, 'triangle', 0.09, dest);
  }

  private tone(
    freq: number,
    startTime: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    destination: AudioNode,
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  public dispose(): void {
    for (const osc of [
      this.engineOsc,
      this.engineSubOsc,
      this.engineHarmOsc,
      this.trafficOsc,
      this.trafficSubOsc,
    ]) {
      if (osc) {
        try {
          osc.stop();
          osc.disconnect();
        } catch {
          // ignore
        }
      }
    }
    for (const src of [
      this.roadNoiseSource,
      this.skidNoiseSource,
      this.cityNoiseSource,
      this.windNoiseSource,
      this.beachNoiseSource,
    ]) {
      if (src) {
        try {
          src.stop();
          src.disconnect();
        } catch {
          // ignore
        }
      }
    }
    this.engineOsc = null;
    this.engineSubOsc = null;
    this.engineHarmOsc = null;
    this.engineFilter = null;
    this.engineGain = null;
    this.roadNoiseSource = null;
    this.roadFilter = null;
    this.roadGain = null;
    this.skidNoiseSource = null;
    this.skidFilter = null;
    this.skidGain = null;
    this.trafficOsc = null;
    this.trafficSubOsc = null;
    this.trafficFilter = null;
    this.trafficGain = null;
    this.trafficPanner = null;
    this.cityNoiseSource = null;
    this.cityFilter = null;
    this.cityGain = null;
    this.windNoiseSource = null;
    this.windFilter = null;
    this.windGain = null;
    this.beachNoiseSource = null;
    this.beachFilter = null;
    this.beachGain = null;
    this.carMasterGain = null;
    this.bgMasterGain = null;
    this.sharedNoiseBuffer = null;

    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

export const soundEngine = new SoundEngine();
