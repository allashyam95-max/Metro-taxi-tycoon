export type MusicMood = 'calm' | 'taxi' | 'vip';

export interface MusicTrackSpec {
  id: string;
  fileName: string;
  src: string;
  title: string;
  artist: string;
  license: string;
  mood: MusicMood;
}

/**
 * Royalty-free / CC0 (Public Domain) soundtrack tracks in /public/music/.
 * Any missing or failed file is skipped automatically without crashing.
 */
export const MUSIC_TRACKS: MusicTrackSpec[] = [
  {
    id: 'chill1',
    fileName: 'chill1.mp3',
    src: '/music/chill1.mp3',
    title: 'Chill Lofi Inspired',
    artist: 'isaiah658 (OpenGameArt)',
    license: 'CC0 1.0 Universal (Public Domain)',
    mood: 'calm',
  },
  {
    id: 'taxi1',
    fileName: 'taxi1.mp3',
    src: '/music/taxi1.mp3',
    title: 'Midnight Drive',
    artist: 'Pro Sensory (OpenGameArt)',
    license: 'CC0 1.0 Universal (Public Domain)',
    mood: 'taxi',
  },
  {
    id: 'vip1',
    fileName: 'vip1.mp3',
    src: '/music/vip1.mp3',
    title: 'Two Left Socks',
    artist: 'Umplix (OpenGameArt)',
    license: 'CC0 1.0 Universal (Public Domain)',
    mood: 'vip',
  },
  {
    id: 'chill2',
    fileName: 'chill2.mp3',
    src: '/music/chill2.mp3',
    title: 'Entanglement',
    artist: 'I_llusive (OpenGameArt)',
    license: 'CC0 1.0 Universal (Public Domain)',
    mood: 'calm',
  },
  {
    id: 'taxi2',
    fileName: 'taxi2.mp3',
    src: '/music/taxi2.mp3',
    title: 'Raspberry Jam',
    artist: 'Jan125 (OpenGameArt)',
    license: 'CC0 1.0 Universal (Public Domain)',
    mood: 'taxi',
  },
  {
    id: 'vip2',
    fileName: 'vip2.mp3',
    src: '/music/vip2.mp3',
    title: 'Jazzy Blues',
    artist: 'Charlie (OpenGameArt)',
    license: 'CC0 1.0 Universal (Public Domain)',
    mood: 'vip',
  },
];

export function getMusicTrackById(id: string): MusicTrackSpec {
  return MUSIC_TRACKS.find((t) => t.id === id) ?? MUSIC_TRACKS[0];
}
