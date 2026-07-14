import React, { useRef, useState, useEffect } from "react";
import { View, StyleSheet, PanResponder, Animated } from "react-native";

export default function Slider({ value, onValueChange, minimumValue = 0, maximumValue = 1 }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const pan = useRef(new Animated.Value(0)).current;
  const panValue = useRef(0);

  useEffect(() => {
    const listenerId = pan.addListener((state) => {
      panValue.current = state.value;
    });
    return () => {
      pan.removeListener(listenerId);
    };
  }, [pan]);

  // Initialize position based on current value
  useEffect(() => {
    if (trackWidth > 0 && !isDragging) {
      const clampedValue = Math.max(minimumValue, Math.min(maximumValue, value));
      const percentage = (clampedValue - minimumValue) / (maximumValue - minimumValue);
      pan.setValue(percentage * trackWidth);
      pan.setOffset(0);
    }
  }, [value, trackWidth, minimumValue, maximumValue, pan, isDragging]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt, gestureState) => {
        setIsDragging(true);
        pan.setOffset(panValue.current);
        pan.setValue(0);
      },
      onPanResponderMove: (evt, gestureState) => {
        let newX = pan._offset + gestureState.dx;
        newX = Math.max(0, Math.min(trackWidth, newX));
        updateValue(newX);
        pan.setValue(gestureState.dx);
      },
      onPanResponderRelease: (evt, gestureState) => {
        pan.flattenOffset();
        let currentX = panValue.current;
        currentX = Math.max(0, Math.min(trackWidth, currentX));
        updateValue(currentX);
        setIsDragging(false);
      },
    })
  ).current;

  const updateValue = (xPos) => {
    if (trackWidth === 0) return;
    const percentage = xPos / trackWidth;
    const newValue = minimumValue + percentage * (maximumValue - minimumValue);
    if (onValueChange) {
      onValueChange(newValue);
    }
  };

  return (
    <View style={styles.container}>
      <View
        style={styles.track}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
      >
        <Animated.View
          style={[
            styles.fill,
            {
              width: pan.interpolate({
                inputRange: [0, Math.max(1, trackWidth)],
                outputRange: [0, Math.max(1, trackWidth)],
                extrapolate: "clamp",
              }),
            },
          ]}
        />
        <Animated.View
          style={[
            styles.thumb,
            {
              transform: [
                {
                  translateX: pan.interpolate({
                    inputRange: [0, Math.max(1, trackWidth)],
                    outputRange: [0, Math.max(1, trackWidth)],
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
    height: 40,
    justifyContent: "center",
    paddingVertical: 10,
  },
  track: {
    height: 6,
    backgroundColor: "rgba(51, 65, 85, 0.6)",
    borderRadius: 3,
    position: "relative",
    justifyContent: "center",
  },
  fill: {
    height: "100%",
    backgroundColor: "#34D399",
    borderRadius: 3,
    position: "absolute",
    left: 0,
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    position: "absolute",
    left: -10, // center thumb over edge
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
});
