import React from 'react';
import { Text } from 'react-native';
import { COLORS, FONT } from '../../theme/tokens';

const base = { fontFamily: FONT.family };

export function Greeting({ style, color = COLORS.textSecondary, ...rest }) {
  return <Text {...rest} style={[base, { fontSize: FONT.size.greeting, color, fontWeight: FONT.weight.medium }, style]} />;
}

export function Heading({ style, color = COLORS.text, ...rest }) {
  return <Text {...rest} style={[base, { fontSize: FONT.size.heading, color, fontWeight: FONT.weight.black }, style]} />;
}

export function SectionHeading({ style, color = COLORS.text, ...rest }) {
  return <Text {...rest} style={[base, { fontSize: FONT.size.section, color, fontWeight: FONT.weight.bold }, style]} />;
}

export function CardTitle({ style, color = COLORS.text, ...rest }) {
  return <Text {...rest} style={[base, { fontSize: FONT.size.cardTitle, color, fontWeight: FONT.weight.medium }, style]} />;
}

export function Body({ style, color = COLORS.text, ...rest }) {
  return <Text {...rest} style={[base, { fontSize: FONT.size.body, color, fontWeight: FONT.weight.regular }, style]} />;
}

export function Caption({ style, color = COLORS.textSecondary, ...rest }) {
  return <Text {...rest} style={[base, { fontSize: FONT.size.caption, color, fontWeight: FONT.weight.regular }, style]} />;
}

export function Label({ style, color = COLORS.textSecondary, ...rest }) {
  return <Text {...rest} style={[base, { fontSize: FONT.size.label, color, fontWeight: FONT.weight.medium }, style]} />;
}

export function StatValue({ style, color = COLORS.text, ...rest }) {
  return <Text {...rest} style={[base, { fontSize: FONT.size.stat, color, fontWeight: FONT.weight.black }, style]} />;
}
