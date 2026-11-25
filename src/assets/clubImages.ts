import heroClubPitch from './images/hero_club_pitch_1795277918886.webp';
import newsMatchdayAction from './images/news_matchday_action_1795277903178.webp';
import newsCommunitySupporters from './images/news_community_supporters_1795277904224.webp';
import merchHomeJersey from './images/merch_home_jersey_1795277903802.webp';
import { resolveSafeMediaUrl } from '../utils/security';

export interface ClubPresetImage {
  key: string;
  label: string;
  src: string;
}

export const CLUB_PRESET_IMAGES: ClubPresetImage[] = [
  { key: 'preset:hero', label: 'SC Basimbuzi Training Pitch', src: heroClubPitch },
  { key: 'preset:matchday', label: 'Matchday Action', src: newsMatchdayAction },
  { key: 'preset:supporters', label: 'Supporters & Youth Academy', src: newsCommunitySupporters },
  { key: 'preset:jersey', label: 'Official Home Jersey', src: merchHomeJersey }
];

const PRESET_MAP: Record<string, string> = {
  'preset:hero': heroClubPitch,
  'preset:matchday': newsMatchdayAction,
  'preset:supporters': newsCommunitySupporters,
  'preset:jersey': merchHomeJersey,
  '/src/assets/images/hero_club_pitch_1795277918886.webp': heroClubPitch,
  '/src/assets/images/news_matchday_action_1795277903178.webp': newsMatchdayAction,
  '/src/assets/images/news_community_supporters_1795277904224.webp': newsCommunitySupporters,
  '/src/assets/images/merch_home_jersey_1795277903802.webp': merchHomeJersey
};

export const resolveClubImageUrl = (rawUrl?: string, fallbackKey: string = 'preset:hero'): string => {
  const clean = (rawUrl || '').trim();
  const fallback = PRESET_MAP[fallbackKey] || heroClubPitch;
  if (!clean) {
    return fallback;
  }
  if (PRESET_MAP[clean]) {
    return PRESET_MAP[clean];
  }
  return resolveSafeMediaUrl(clean, fallback);
};
