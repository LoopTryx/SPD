import { forwardRef, useImperativeHandle, useRef } from "react";

export interface CameraFeedHandle {
  getVideo: () => HTMLVideoElement | null;
}

const CameraFeed = forwardRef<CameraFeedHandle>((_props, ref) => {
  const video = useRef<HTMLVideoElement>(null);
  useImperativeHandle(ref, () => ({ getVideo: () => video.current }));
  return (
    <video
      ref={video}
      data-spd-video
      autoPlay
      playsInline
      muted
      style={{
        position: "fixed",
        width: 1,
        height: 1,
        opacity: 0,
        pointerEvents: "none",
      }}
    />
  );
});

CameraFeed.displayName = "CameraFeed";
export default CameraFeed;
