export interface OverlaySwipeVisual {
  progress: number;
  direction: "left" | "right";
}

// Partial or cancelled swipes never alter visibility.
export function getOverlayVisualState(
  visible: boolean,
  _swipe: OverlaySwipeVisual | null = null,
) {
  return {
    mounted: visible,
    opacity: visible ? 1 : 0,
    translateX: 0,
    revealEdge: false,
  };
}
