import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ItemDetail } from "../../components/ItemDetail";
import { collectionFor } from "../../lib/collection";
import { usePalette } from "../../lib/theme";

/**
 * One save, or a vertical run of them when it was opened from a list.
 *
 * Paged the way reels and shorts are: one save per screen, a flick moves to the next. The page size
 * is measured rather than assumed, so the notch, the home indicator and a rotation all come out
 * right instead of leaving a save half on screen.
 */
export default function ItemScreen() {
  const p = usePalette();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);

  const { pages, startIndex } = useMemo(() => {
    const ids = collectionFor(id ?? "");
    return { pages: ids.map((value) => ({ id: value })), startIndex: Math.max(0, ids.indexOf(id ?? "")) };
  }, [id]);

  const back = () => router.back();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }} edges={["top", "left", "right"]}>
      <View
        style={{ flex: 1 }}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setBox((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
        }}
      >
        {box && (pages.length === 1 ? (
          <ItemDetail id={pages[0]!.id} width={box.width} height={box.height} onBack={back} />
        ) : (
          <FlatList
            data={pages}
            keyExtractor={(n) => n.id}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            initialScrollIndex={startIndex}
            getItemLayout={(_, index) => ({ length: box.height, offset: box.height * index, index })}
            windowSize={3}
            initialNumToRender={1}
            maxToRenderPerBatch={2}
            decelerationRate="fast"
            renderItem={({ item }) => <ItemDetail id={item.id} width={box.width} height={box.height} onBack={back} />}
          />
        ))}
      </View>
    </SafeAreaView>
  );
}
