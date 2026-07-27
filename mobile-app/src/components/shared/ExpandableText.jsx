import React, { useState } from 'react';
import { View, Text, TouchableOpacity, LayoutAnimation, Platform, UIManager } from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Read more / read less text block with a smooth expand/collapse animation.
// Truncation is measured (not guessed) via a hidden full-height layout pass,
// so the toggle only appears when the text actually overflows `numberOfLines`.
export default function ExpandableText({
  text,
  numberOfLines = 3,
  style,
  toggleColor = '#B45309',
  containerStyle,
}) {
  const [expanded, setExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const [measured, setMeasured] = useState(false);

  if (!text) return null;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  return (
    <View style={containerStyle}>
      {!measured && (
        <Text
          style={[style, { position: 'absolute', opacity: 0, left: 0, right: 0 }]}
          onTextLayout={(e) => {
            setIsTruncated(e.nativeEvent.lines.length > numberOfLines);
            setMeasured(true);
          }}
        >
          {text}
        </Text>
      )}
      <Text style={style} numberOfLines={expanded ? undefined : numberOfLines}>
        {text}
      </Text>
      {isTruncated && (
        <TouchableOpacity onPress={toggle} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Text style={{ color: toggleColor, fontSize: 11, fontWeight: '700', marginTop: 2 }}>
            {expanded ? 'Show Less' : 'Show More'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
