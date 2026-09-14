import { AbsoluteFill, Sequence } from "remotion";
import { cardsFor } from "./cards";
import type { WaitlistAdProps } from "./props";
import { Hook } from "./scenes/Hook";
import { Pile } from "./scenes/Pile";
import { Search } from "./scenes/Search";
import { Sort } from "./scenes/Sort";
import { HOOK, PILE, SEARCH, SORT } from "./timeline";

export const WaitlistAd: React.FC<WaitlistAdProps> = ({ country, headline, subline, categories, searchTerm }) => {
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
      <Sequence from={SEARCH.from} durationInFrames={SEARCH.length} name="Search">
        <Search cards={cards} categories={categories} term={searchTerm} />
      </Sequence>
    </AbsoluteFill>
  );
};
