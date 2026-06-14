import type { TrackId, TrackDefinition } from './types';

const trackList: TrackDefinition[] = [
  { id: 'title', source: require('../../assets/music/title-screen.mp3') },
  { id: 'game', source: require('../../assets/music/pallet-town.mp3') },
  { id: 'hint', source: require('../../assets/music/wild-pokemon-battle.mp3') },
  { id: 'result', source: require('../../assets/music/pokemon-center.mp3') },
  { id: 'pokedex', source: require('../../assets/music/yellow-opening.mp3') },
];

export const TRACK_REGISTRY = new Map<TrackId, TrackDefinition>(
  trackList.map((t) => [t.id, t])
);

export const HINT_SUCCESS_SFX = require('../../assets/music/wild-pokemon-caught.mp3');
export const MIC_READY_SFX = require('../../assets/music/notification-smooth-modern-stereo-332449.mp3');
