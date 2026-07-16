// ─────────────────────────────────────────────────────────────────────────
// Pandit App Design System — single source of truth.
//
// Every screen/component in the Pandit application must read colors,
// spacing, radius, shadows, and typography from here rather than
// hardcoding values. This file encodes the visual language established by
// the approved Pandit Dashboard mockup: warm cream + gold/saffron,
// generous whitespace, soft elevation, no harsh blacks or saturated hues.
// ─────────────────────────────────────────────────────────────────────────

export const COLORS = {
  background:      '#FBF6EC',
  backgroundAlt:   '#F5EEDF',

  surface:         '#FFFFFF',
  card:            '#FFFDF9',

  primary:         '#D4A017',
  primaryDark:     '#B8860B',
  primaryLight:    '#F0D98C',
  onPrimary:       '#FFFFFF',

  success:         '#4C9A6A',
  successBg:       '#E8F4EC',
  warning:         '#D9922E',
  warningBg:       '#FBF0DE',
  error:           '#C25B54',
  errorBg:         '#FBEAE8',
  info:            '#4C7EA8',
  infoBg:          '#E9F1F7',

  text:            '#2A2622',
  textSecondary:   '#8A8378',
  textMuted:       '#B5AFA2',
  onDark:          '#FFFFFF',

  border:          '#ECE3D0',
  borderStrong:    '#E0D3B0',
  divider:         '#F0E9DC',

  heroOverlayFrom: 'rgba(20,14,6,0.35)',
  heroOverlayTo:   'rgba(20,14,6,0.88)',

  shadow:          'rgba(120,90,20,0.16)',
};

export const SPACING = {
  xs:   4,
  sm:   8,
  md:   12,
  base: 16,
  lg:   20,
  xl:   24,
  xxl:  32,
  xxxl: 40,
  huge: 48,
};

export const RADIUS = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  24,
  pill: 999,
};

export const SHADOW = {
  card: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 4,
  },
  raised: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 3,
  },
  floating: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 8,
  },
  button: {
    shadowColor: 'rgba(212,160,23,0.45)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 5,
  },
};

export const FONT = {
  family: undefined, // system default; swap here app-wide if a custom font is added later
  size: {
    greeting: 13,
    heading:  22,
    section:  16,
    cardTitle: 14,
    body:     14,
    caption:  12,
    label:    11,
    stat:     16,
    button:   15,
  },
  weight: {
    regular:  '400',
    medium:   '600',
    bold:     '700',
    black:    '800',
  },
};

export const ICON_SIZE = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 28,
};

export const SIZES = {
  buttonHeight:     52,
  buttonHeightSm:   40,
  inputHeight:      52,
  tabBarHeight:     64,
  fabSize:          58,
  avatarSm:         32,
  avatarMd:         44,
  avatarLg:         64,
  iconContainerSm:  32,
  iconContainerMd:  44,
  iconContainerLg:  56,
};

const tokens = { COLORS, SPACING, RADIUS, SHADOW, FONT, ICON_SIZE, SIZES };
export default tokens;
