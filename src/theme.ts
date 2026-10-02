import { Platform } from 'react-native';

export const colors = {
  bg: '#F3EDE3',
  paper: '#FFF9F1',
  ink: '#1F1A16',
  muted: '#7A7068',
  line: '#E4D8C8',
  pine: '#2C5348',
  pineSoft: '#E4EFEA',
  clay: '#C45C26',
  claySoft: '#F8E6DC',
  moss: '#3F6B3A',
  mossSoft: '#E7F0E4',
  wine: '#8F3A32',
  wineSoft: '#F8E4E1',
  blue: '#4F6F8F',
  gold: '#C9A227',
};

const isAndroid =
  Platform.OS === 'android' ||
  (Platform.OS === 'web' && typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent));

// iPhone keeps extra room above the home indicator; Android has no indicator overlapping the bar.
export const tabBarBottomGap = isAndroid ? 8 : Platform.OS === 'web' ? 30 : 24;

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
};
