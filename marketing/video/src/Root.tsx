import { Composition } from "remotion";
import { WaitlistAd } from "./WaitlistAd";
import { IN_PROPS, US_PROPS } from "./props";
import { FPS, TOTAL } from "./timeline";

export const WIDTH = 1080;
export const HEIGHT = 1920;

export const Root: React.FC = () => (
  <>
    <Composition
      id="WaitlistAd-IN"
      component={WaitlistAd}
      durationInFrames={TOTAL}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={IN_PROPS}
    />
    <Composition
      id="WaitlistAd-US"
      component={WaitlistAd}
      durationInFrames={TOTAL}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={US_PROPS}
    />
  </>
);
