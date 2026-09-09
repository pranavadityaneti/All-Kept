import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { FlatList, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ItemDetail } from "../../components/ItemDetail";
import { collectionFor } from "../../lib/collection";
import { usePalette } from "../../lib/theme";

/** One save, or a swipeable run of them when it was opened from a list. */
export default function ItemScreen() {
  const p = usePalette();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { pages, startIndex } = useMemo(() => {
    const ids = collectionFor(id ?? "");
    return { pages: ids.map((value) => ({ id: value })), startIndex: Math.max(0, ids.indexOf(id ?? "")) };
  }, [id]);

  const back = () => router.back();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }} edges={["top", "left", "right"]}>
      {pages.length === 1 ? (
        <ItemDetail id={pages[0]!.id} width={width} onBack={back} />
      ) : (
        <FlatList
          data={pages}
          keyExtractor={(n) => n.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={startIndex}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          windowSize={3}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          renderItem={({ item }) => <ItemDetail id={item.id} width={width} onBack={back} />}
          ListEmptyComponent={<View style={{ width }} />}
        />
      )}
    </SafeAreaView>
  );
}
