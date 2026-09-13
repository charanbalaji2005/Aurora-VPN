import React from 'react';
import Svg, {Path} from 'react-native-svg';

/**
 * A hand-built icon set.
 *
 * Not a dependency, for two reasons. Icon-font packages need asset linking and
 * ship thousands of glyphs to deliver the thirty used here. And, more to the
 * point: **no emoji anywhere in this app**. Emoji render differently on every
 * OEM skin, are missing for some symbols, and screen readers announce them
 * mid-sentence. Every icon here is a stroked path with a real label at the
 * call site.
 *
 * Paths sit on a 24×24 grid and are stroked, so weight stays even at any size.
 */
export type IconName =
  | 'power'
  | 'shield'
  | 'shieldCheck'
  | 'shieldAlert'
  | 'globe'
  | 'chart'
  | 'settings'
  | 'chevronRight'
  | 'chevronDown'
  | 'arrowLeft'
  | 'search'
  | 'star'
  | 'starFilled'
  | 'download'
  | 'upload'
  | 'zap'
  | 'clock'
  | 'check'
  | 'checkCircle'
  | 'alert'
  | 'x'
  | 'refresh'
  | 'user'
  | 'lock'
  | 'mail'
  | 'eye'
  | 'eyeOff'
  | 'route'
  | 'bell'
  | 'palette'
  | 'help'
  | 'info'
  | 'logout'
  | 'device'
  | 'server'
  | 'key'
  | 'activity'
  | 'swap';

const paths: Record<IconName, string> = {
  power: 'M12 4v8M7.8 6.8a7 7 0 108.4 0',
  shield: 'M12 3l7 3v5.5c0 4.3-3 7.6-7 9.5-4-1.9-7-5.2-7-9.5V6l7-3z',
  shieldCheck: 'M12 3l7 3v5.5c0 4.3-3 7.6-7 9.5-4-1.9-7-5.2-7-9.5V6l7-3zM9 12l2 2 4-4',
  shieldAlert: 'M12 3l7 3v5.5c0 4.3-3 7.6-7 9.5-4-1.9-7-5.2-7-9.5V6l7-3zM12 8v4M12 15.5v.4',
  globe:
    'M12 3a9 9 0 100 18 9 9 0 000-18zM3.6 9h16.8M3.6 15h16.8M12 3c2.3 2.4 3.4 5.5 3.4 9S14.3 18.6 12 21c-2.3-2.4-3.4-5.5-3.4-9S9.7 5.4 12 3z',
  chart: 'M5 20V10M12 20V4M19 20v-6',
  settings:
    'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.1A1.7 1.7 0 006.9 19.7l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003.1 14H3a2 2 0 110-4h.1a1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 0010 3.1V3a2 2 0 114 0v.1a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 001.2 2.9H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  arrowLeft: 'M19 12H5M11 18l-6-6 6-6',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
  star: 'M12 4l2.5 5.1 5.5.8-4 3.9 1 5.5-5-2.6-5 2.6 1-5.5-4-3.9 5.5-.8L12 4z',
  starFilled: 'M12 4l2.5 5.1 5.5.8-4 3.9 1 5.5-5-2.6-5 2.6 1-5.5-4-3.9 5.5-.8L12 4z',
  download: 'M12 4v12M7 12l5 5 5-5M5 20h14',
  upload: 'M12 20V8M7 12l5-5 5 5M5 4h14',
  zap: 'M13 3L5 14h6l-1 7 8-11h-6l1-7z',
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2',
  check: 'M5 13l4 4L19 7',
  checkCircle: 'M12 3a9 9 0 100 18 9 9 0 000-18zM8.5 12.2l2.3 2.3 4.7-4.7',
  alert: 'M12 3l9 16H3l9-16zM12 9v4M12 16.4v.4',
  x: 'M6 6l12 12M18 6L6 18',
  refresh: 'M20 12a8 8 0 11-2.3-5.7M20 4v4h-4',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20a7.5 7.5 0 0115 0',
  lock: 'M6 11h12v9H6v-9zM9 11V8a3 3 0 016 0v3',
  mail: 'M4 6h16v12H4V6zM4 7l8 6 8-6',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 14.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  eyeOff: 'M4 4l16 16M10 6a9.6 9.6 0 012-.2c6 0 9.5 6.2 9.5 6.2a16 16 0 01-3.3 4M6.6 7.9A16 16 0 002.5 12S6 18.2 12 18.2c1.2 0 2.3-.2 3.3-.6',
  route: 'M6 19a2 2 0 100-4 2 2 0 000 4zM18 9a2 2 0 100-4 2 2 0 000 4zM8 17h6a4 4 0 000-8h-4a4 4 0 010-8',
  bell: 'M18 8a6 6 0 10-12 0c0 6-2 7-2 7h16s-2-1-2-7zM10.5 20a2 2 0 003 0',
  palette:
    'M12 21a9 9 0 110-18c4.9 0 9 3.3 9 7.3 0 2.3-2 3.7-4.2 3.7H15a2 2 0 00-1.4 3.4c.4.4.4 1.6-1.6 1.6zM7.5 11a1 1 0 100-2 1 1 0 000 2zM11.5 8a1 1 0 100-2 1 1 0 000 2zM16 9.5a1 1 0 100-2 1 1 0 000 2z',
  help: 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.6 9.2a2.5 2.5 0 114.1 2.4c-.9.7-1.7 1.2-1.7 2.4M12 17.2v.4',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 7.6v.4',
  logout: 'M10 20H5V4h5M16 16l4-4-4-4M20 12H9',
  device: 'M7 3h10v18H7V3zM10.5 18.2h3',
  server:
    'M4 5h16v5H4V5zM4 14h16v5H4v-5zM7.5 7.4v.2M7.5 16.4v.2',
  key: 'M15 9a4 4 0 10-3.5 4L13 14.5l2 2 2-2 2 2 2-2-4-4A4 4 0 0015 9z',
  activity: 'M3 12h4l3-7 4 14 3-7h4',
  swap: 'M7 8h12l-3-3M17 16H5l3 3',
};

export function Icon({
  name,
  size = 20,
  color = '#F4F6FA',
  filled = false,
  strokeWidth = 1.7,
}: {
  name: IconName;
  size?: number;
  color?: string;
  filled?: boolean;
  strokeWidth?: number;
}) {
  const shouldFill = filled || name === 'starFilled';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={paths[name]}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={shouldFill ? color : 'none'}
      />
    </Svg>
  );
}

/** Signal-strength bars, used for server load in the location list. */
export function SignalBars({
  level,
  color,
  size = 16,
}: {
  level: 1 | 2 | 3 | 4;
  color: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      {[0, 1, 2, 3].map(index => {
        const barHeight = 4 + index * 3;
        return (
          <Path
            key={index}
            d={`M${2 + index * 4} ${14} L${2 + index * 4} ${14 - barHeight}`}
            stroke={color}
            strokeWidth={2.2}
            strokeLinecap="round"
            opacity={index < level ? 1 : 0.22}
          />
        );
      })}
    </Svg>
  );
}
