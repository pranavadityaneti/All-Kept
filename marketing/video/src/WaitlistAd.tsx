import { AbsoluteFill, Sequence } from "remotion";
import { cardsFor } from "./cards";
import type { WaitlistAdProps } from "./props";
import { Hook } from "./scenes/Hook";
import { Pile } from "./scenes/Pile";
import { Sort } from "./scenes/Sort";
import { HOOK, PILE, SORT } from "./timeline";

export const WaitlistAd: React.FC<WaitlistAdProps> = ({ country, headline, subline, categories }) => {
  const cards = cardsFor(country);
  return (
    <AbsoluteFill>
      <Sequence from={HOOK.from} durationInFrames={HOOK.length} name="Hook">
        <Hook headline={headline} subline={subline} length={HOOK.length} />
      </Sequence>
      <Sequence from={PILE.from} durationInFrames={PILE.length} name="Pile">
        <Pile cards={cards} length={PILE.length} />
      </Sequence>
      <Sequence from={SORT.from} durationInFrames={SORT.length} name="Sort">
        <Sort cards={cards} categories={categories} />
      </Sequence>
    </AbsoluteFill>
  );
};
