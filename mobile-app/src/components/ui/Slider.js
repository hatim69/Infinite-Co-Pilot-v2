import React, { useRef, useState, useCallback } from "react";
import { View, StyleSheet, PanResponder, Animated } from "react-native";

export default function Slider({
  value,
  onValueChange,
  minimumValue = 0,
  maximumValue = 1,
  fillColor = '#34D399',
  trackColor = 'rgba(51, 65, 85, 0.6)',
}) {
  // Store trackWidth in a ref so PanResponder callbacks always read the latest value
  const trackWidthRef = useRef(0);
  const [trackWidth, setTrackWidth] = useState(0);

  // The animated position of the thumb/fill (in pixels, 0..trackWidth)
  const position = useRef(new Animated.Value(0)).current;

  // Track whether we're in the middle of a drag
  const isDragging = useRef(false);

  // Keep a ref to the current external value so we can initialise properly
  const valueRef = useRef(value);
  valueRef.current = value;

  // Convert a pixel position → normalised value and fire the callback
  const fireChange = useCallback(
    (px) => {
      const w = trackWidthRef.current;
      if (w === 0) return;
      const clamped = Math.max(0, Math.min(w, px));
      const pct = clamped / w;
      const newVal = minimumValue + pct * (maximumValue - minimumValue);
      if (onValueChange) onValueChange(newVal);
    },
    [minimumValue, maximumValue, onValueChange]
  );

  // When track layout is known (or changes), set position from current value
  const onTrackLayout = useCallback(
    (e) => {
      const w = e.nativeEvent.layout.width;
      trackWidthRef.current = w;
      setTrackWidth(w);

      if (!isDragging.current) {
        const pct =
          (valueRef.current - minimumValue) / (maximumValue - minimumValue);
        position.setValue(Math.max(0, Math.min(w, pct * w)));
      }
    },
    [minimumValue, maximumValue, position]
  );

  // Keep the thumb in sync when the external value changes (e.g. on modal open)
  // Only while not dragging — during drag we drive position ourselves
  React.useEffect(() => {
    if (!isDragging.current && trackWidthRef.current > 0) {
      const pct = (value - minimumValue) / (maximumValue - minimumValue);
      const px = Math.max(0, Math.min(trackWidthRef.current, pct * trackWidthRef.current));
      position.setValue(px);
    }
  }, [value, minimumValue, maximumValue, position]);

  // The start-of-drag pixel position (so we can compute delta correctly)
  const dragStartPx = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (evt) => {
        isDragging.current = true;
        // Capture the position at the moment the finger touches down
        // so we can compute absolute position as startPx + dx
        position.stopAnimation((v) => {
          dragStartPx.current = v;
        });
        // Synchronously read the current value via _value (reliable for grant)
        dragStartPx.current = position._value;
      },

      onPanResponderMove: (evt, gestureState) => {
        const w = trackWidthRef.current;
        if (w === 0) return;
        const newPx = Math.max(0, Math.min(w, dragStartPx.current + gestureState.dx));
        position.setValue(newPx);
        // Fire live update for instant feedback
        const pct = newPx / w;
        const newVal = minimumValue + pct * (maximumValue - minimumValue);
        if (onValueChange) onValueChange(newVal);
      },

      onPanResponderRelease: (evt, gestureState) => {
        const w = trackWidthRef.current;
        if (w > 0) {
          const finalPx = Math.max(0, Math.min(w, dragStartPx.current + gestureState.dx));
          position.setValue(finalPx);
          const pct = finalPx / w;
          const finalVal = minimumValue + pct * (maximumValue - minimumValue);
          if (onValueChange) onValueChange(finalVal);
        }
        isDragging.current = false;
      },

      onPanResponderTerminate: () => {
        isDragging.current = false;
      },
    })
  ).current;

  const clampedRange = [0, Math.max(1, trackWidth)];

  return (
    <View style={styles.container}>
      <View
        style={[styles.track, { backgroundColor: trackColor }]}
        onLayout={onTrackLayout}
        {...panResponder.panHandlers}
      >
        {/* Filled portion */}
        <Animated.View
          style={[
            styles.fill,
            {
              backgroundColor: fillColor,
              width: position.interpolate({
                inputRange: clampedRange,
                outputRange: clampedRange,
                extrapolate: "clamp",
              }),
            },
          ]}
        />

        {/* Thumb */}
        <Animated.View
          style={[
            styles.thumb,
            {
              transform: [
                {
                  translateX: position.interpolate({
                    inputRange: clampedRange,
                    outputRange: clampedRange,
                    extrapolate: "clamp",
                  }),
                },
              ],
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 44,
    justifyContent: "center",
    paddingVertical: 10,
  },
  track: {
    height: 6,
    backgroundColor: "rgba(51, 65, 85, 0.6)", // overridden inline via trackColor prop
    borderRadius: 3,
    position: "relative",
    justifyContent: "center",
  },
  fill: {
    height: "100%",
    backgroundColor: "#34D399", // overridden inline via fillColor prop
    borderRadius: 3,
    position: "absolute",
    left: 0,
  },
  thumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
    position: "absolute",
    left: -11, // centre the thumb over the edge of the fill
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
});
