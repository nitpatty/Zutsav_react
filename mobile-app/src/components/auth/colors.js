// Shared palette for the auth flow (login/register/etc.), matching the
// approved warm-cream / gold-temple design. Kept separate from themeStore
// because auth screens render before a user/theme is loaded.
export const AUTH_COLORS = {
  bgTop:        '#FFFCF6',
  bgMid:        '#FBEFDA',
  bgBottom:     '#F3DFB6',

  ring: {
    orange: '#FF6B00',
    red:    '#CC1100',
    gold:   '#F5A800',
    purple: '#7B2D8B',
    green:  '#1B8A3C',
    blue:   '#1B5EB3',
  },

  mandala:      '#D8B98C',

  heading:      '#2B1B12',
  subtitle:     '#8A8478',

  card:         '#FFFEFB',
  cardShadow:   'rgba(120,80,20,0.18)',

  inputBg:      '#FDF8EE',
  inputBorder:  '#E9D6AC',
  placeholder:  '#A8A29E',
  inputText:    '#2B1B12',

  checkboxBorder: '#D8B98C',
  rememberText:   '#57534E',
  forgotText:     '#B8863B',

  buttonGradient: ['#F6C667', '#DE9A2E'],
  buttonText:     '#FFFFFF',
  buttonShadow:   'rgba(222,154,46,0.5)',

  diyaBowl:     '#8A4A2A',
  diyaBowlDark: '#6B3820',
  flameOuter:   '#FFB347',
  flameInner:   '#FFE29A',

  bellGold:     '#D8A93E',
  bellGoldDark: '#9C6B1F',
  bellString:   '#8A6A3E',

  link:         '#3D2A1A',

  // Sunrise sky (top -> horizon), warmer than the plain cream/gold wash above.
  skyTop:    '#FFF8EC',
  skyUpper:  '#FDEACB',
  skyHorizon:'#F7CE8E',
  skyLow:    '#F3DFB6',

  sunCore: '#FFF3D6',
  sunGlow: '#FFC773',
  godRay:  'rgba(255,197,120,0.22)',

  templeFar:  'rgba(188,140,84,0.20)',
  templeNear: 'rgba(150,102,52,0.26)',
  templeGlow: 'rgba(255,224,168,0.55)',

  pillarStone:    'rgba(197,158,104,0.30)',
  pillarStoneDark:'rgba(140,96,50,0.26)',

  mistWhite: 'rgba(255,251,244,0.60)',

  lotusPetal:     'rgba(224,132,110,0.30)',
  lotusPetalDark: 'rgba(191,96,80,0.26)',
  lotusCenter:    'rgba(216,150,60,0.36)',

  bird: 'rgba(94,64,42,0.35)',

  readabilityOverlay: '#FFFDF7',
};
