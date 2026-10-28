import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import Badge from '../Badge';

// Render smoke test: proves the jest-expo + React Native Testing Library
// pipeline (JSX transform, RN host components) works for UI components.
describe('Badge', () => {
  it('renders its label', () => {
    render(<Badge label="Approved" variant="success" />);
    expect(screen.getByText('Approved')).toBeTruthy();
  });

  it('renders an optional icon next to the label', () => {
    render(<Badge label="Pending" variant="warning" icon={<Text>!</Text>} />);
    expect(screen.getByText('!')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
  });

  it('falls back to the neutral variant for an unknown variant', () => {
    expect(() => render(<Badge label="Whatever" variant="does-not-exist" />)).not.toThrow();
    expect(screen.getByText('Whatever')).toBeTruthy();
  });
});
