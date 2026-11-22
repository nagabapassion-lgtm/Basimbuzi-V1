import heroClubPitch from './images/hero_club_pitch_1795277918886.jpg';
import newsMatchdayAction from './images/news_matchday_action_1795277903178.jpg';
import newsCommunitySupporters from './images/news_community_supporters_1795277904224.jpg';
import merchHomeJersey from './images/merch_home_jersey_1795277903802.jpg';

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
  '/src/assets/images/hero_club_pitch_1795277918886.jpg': heroClubPitch,
  '/src/assets/images/news_matchday_action_1795277903178.jpg': newsMatchdayAction,
  '/src/assets/images/news_community_supporters_1795277904224.jpg': newsCommunitySupporters,
  '/src/assets/images/merch_home_jersey_1795277903802.jpg': merchHomeJersey
};

export const resolveClubImageUrl = (rawUrl?: string, fallbackKey: string = 'preset:hero'): string => {
  const clean = (rawUrl || '').trim();
  if (!clean) {
    return PRESET_MAP[fallbackKey] || heroClubPitch;
  }
  if (PRESET_MAP[clean]) {
    return PRESET_MAP[clean];
  }
  if (/^https?:\/\//i.test(clean) || clean.startsWith('/')) {
    return clean;
  }
  return PRESET_MAP[fallbackKey] || heroClubPitch;
};
