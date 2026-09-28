#!/usr/bin/env node
// Embedding recall audit: OpenAI text-embedding-3-small (512) vs Gemini gemini-embedding-001 (768),
// on a small multilingual eval set that mirrors an All-Kept library — English, Japanese and Korean
// saves, with cross-lingual queries (an English query that should find a Japanese save), which is
// where a multilingual model earns its 7.5x price. See
// internal/research/gemini-embeddings-audit-2026-09-28.md.
//
// It measures top-1 and top-5 recall for each model, overall and on the cross-lingual subset, and
// prints where each model's cosine threshold falls (the gap between the right answer's score and the
// best wrong answer's). Move search to Gemini only if it wins clearly on the cross-lingual rows.
//
// Node 20+ (global fetch). No dependencies.
//   OPENAI_API_KEY=sk-... GEMINI_API_KEY=... node scripts/embedding-recall.mjs
// Run either key alone to see just that model; both to compare. Keys not in the environment are read
// from supabase/.env.admin (git-ignored), the same file the other local scripts use, so putting
// GEMINI_API_KEY beside the OpenAI key there is enough — no exports needed.
import { existsSync, readFileSync } from "node:fs";

const adminFile = new URL("../supabase/.env.admin", import.meta.url);
if ((!process.env.OPENAI_API_KEY || !process.env.GEMINI_API_KEY) && existsSync(adminFile)) {
  for (const line of readFileSync(adminFile, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) {
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}

const OPENAI_KEY = process.env.OPENAI_API_KEY?.trim();
const GEMINI_KEY = process.env.GEMINI_API_KEY?.trim();

// The corpus: caption-like documents across the app's real categories and three languages.
const DOCS = [
  { id: "veg-en", lang: "en", text: "One-pan chickpea curry, ready in 20 minutes, vegetarian and freezer-friendly." },
  { id: "ramen-ja", lang: "ja", text: "自宅で作る本格的な醤油ラーメンのレシピ。スープの取り方から麺、チャーシューまで。" },
  { id: "meal-prep-ja", lang: "ja", text: "一週間分の作り置きおかず。冷蔵庫で数日保存できる簡単レシピをまとめました。" },
  { id: "kyoto-ja", lang: "ja", text: "京都の桜の名所。哲学の道を歩いて円山公園でお花見、混雑を避ける朝の時間帯。" },
  { id: "seoul-cafe-ko", lang: "ko", text: "서울 성수동 감성 카페 추천. 인테리어가 예쁘고 사진 찍기 좋은 곳들 모음." },
  { id: "jeju-ko", lang: "ko", text: "제주도 3박 4일 여행 코스. 성산일출봉 일출과 우도 자전거, 흑돼지 맛집까지." },
  { id: "legs-ko", lang: "ko", text: "집에서 하는 하체 근력 운동 루틴. 스쿼트와 런지 중심, 기구 없이 따라 하기." },
  { id: "home-workout-en", lang: "en", text: "Full body workout you can do in your living room with no equipment at all." },
  { id: "figma-en", lang: "en", text: "Figma auto layout tutorial: building responsive components that resize cleanly." },
  { id: "rsc-en", lang: "en", text: "Understanding React Server Components and when to reach for them over client ones." },
  { id: "morning-en", lang: "en", text: "My 5am morning routine that actually changed my focus and productivity." },
  { id: "yt-grow-en", lang: "en", text: "Ten tips to grow your YouTube channel from zero subscribers this year." },
  { id: "kimchi-ko", lang: "ko", text: "집에서 담그는 배추김치 레시피. 양념 비율과 숙성 방법을 자세히 설명합니다." },
  { id: "onsen-ja", lang: "ja", text: "箱根の日帰り温泉ガイド。露天風呂からの景色と、電車でのアクセス方法。" },
];

// Queries with the one document each should retrieve. `cross` = the query language differs from the
// gold document's language: the case that decides this audit.
const QUERIES = [
  { q: "easy vegetarian dinner recipe", lang: "en", gold: "veg-en" },
  { q: "how to make japanese ramen at home", lang: "en", gold: "ramen-ja" },
  { q: "cherry blossom viewing spots in kyoto", lang: "en", gold: "kyoto-ja" },
  { q: "best aesthetic cafes to visit in seoul", lang: "en", gold: "seoul-cafe-ko" },
  { q: "home workout with no equipment", lang: "en", gold: "home-workout-en" },
  { q: "leg day routine at home", lang: "en", gold: "legs-ko" },
  { q: "figma auto layout guide", lang: "en", gold: "figma-en" },
  { q: "react server components explained", lang: "en", gold: "rsc-en" },
  { q: "morning routine for productivity", lang: "en", gold: "morning-en" },
  { q: "grow a youtube channel from zero", lang: "en", gold: "yt-grow-en" },
  { q: "簡単な作り置きレシピ", lang: "ja", gold: "meal-prep-ja" },
  { q: "제주도 여행 코스 추천", lang: "ko", gold: "jeju-ko" },
  { q: "김치 담그는 법", lang: "ko", gold: "kimchi-ko" },
  { q: "箱根 温泉 日帰り", lang: "ja", gold: "onsen-ja" },
];

const goldLang = (id) => DOCS.find((d) => d.id === id)?.lang;
for (const query of QUERIES) query.cross = query.lang !== goldLang(query.gold);

const l2 = (v) => {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
};
const cosine = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0); // both L2-normalized → dot product

async function openaiEmbed(texts) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { authorization: `Bearer ${OPENAI_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", dimensions: 512, encoding_format: "float", input: texts }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  return texts.map((_, i) => l2(body.data.find((d) => d.index === i).embedding));
}

// Gemini needs the task type: documents and queries embed differently, which is part of the gain.
async function geminiEmbed(texts, taskType) {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents", {
    method: "POST",
    headers: { "x-goog-api-key": GEMINI_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      requests: texts.map((t) => ({
        model: "models/gemini-embedding-001",
        content: { parts: [{ text: t }] },
        taskType,                     // RETRIEVAL_DOCUMENT | RETRIEVAL_QUERY
        outputDimensionality: 768,    // below 3072 → we normalize ourselves
      })),
    }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  return body.embeddings.map((e) => l2(e.values));
}

function score(docVecs, queryVecs) {
  let top1 = 0, top5 = 0, cross1 = 0, crossN = 0;
  const goldCos = [], distractorCos = [];
  QUERIES.forEach((query, qi) => {
    const ranked = DOCS.map((d, di) => ({ id: d.id, c: cosine(queryVecs[qi], docVecs[di]) })).sort((a, b) => b.c - a.c);
    const goldRank = ranked.findIndex((r) => r.id === query.gold);
    const hit1 = goldRank === 0, hit5 = goldRank >= 0 && goldRank < 5;
    if (hit1) top1++;
    if (hit5) top5++;
    if (query.cross) { crossN++; if (hit1) cross1++; }
    goldCos.push(ranked[goldRank].c);
    distractorCos.push(Math.max(...ranked.filter((r) => r.id !== query.gold).map((r) => r.c)));
  });
  const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  return {
    top1, top5, cross1, crossN, n: QUERIES.length,
    medianGold: median(goldCos), medianDistractor: median(distractorCos),
  };
}

async function run(name, embedDocs, embedQueries) {
  const docVecs = await embedDocs(DOCS.map((d) => d.text));
  const queryVecs = await embedQueries(QUERIES.map((q) => q.q));
  const s = score(docVecs, queryVecs);
  const pct = (x, n) => `${x}/${n} (${Math.round((x / n) * 100)}%)`;
  console.log(`\n${name}`);
  console.log(`  top-1 recall        ${pct(s.top1, s.n)}`);
  console.log(`  top-5 recall        ${pct(s.top5, s.n)}`);
  console.log(`  cross-lingual top-1 ${pct(s.cross1, s.crossN)}   <- the row that decides it`);
  console.log(`  median cosine: right answer ${s.medianGold.toFixed(3)} · best wrong answer ${s.medianDistractor.toFixed(3)}`);
  console.log(`  → a threshold near ${((s.medianGold + s.medianDistractor) / 2).toFixed(2)} separates them here (recalibrate on real saves)`);
  return s;
}

const main = async () => {
  console.log("Embedding recall audit — multilingual All-Kept eval set");
  console.log(`${DOCS.length} documents, ${QUERIES.length} queries (${QUERIES.filter((q) => q.cross).length} cross-lingual)`);
  if (!OPENAI_KEY && !GEMINI_KEY) { console.error("\nSet OPENAI_API_KEY and/or GEMINI_API_KEY."); process.exit(1); }
  if (OPENAI_KEY) await run("OpenAI · text-embedding-3-small · 512d (current)", openaiEmbed, openaiEmbed);
  else console.log("\nOpenAI · skipped (no OPENAI_API_KEY)");
  if (GEMINI_KEY) await run("Gemini · gemini-embedding-001 · 768d · task-typed", (t) => geminiEmbed(t, "RETRIEVAL_DOCUMENT"), (t) => geminiEmbed(t, "RETRIEVAL_QUERY"));
  else console.log("\nGemini · skipped (no GEMINI_API_KEY)");
  console.log("\nRead the cross-lingual top-1 row first. If Gemini clearly wins there, the move is worth it;");
  console.log("if it's a tie, staying on OpenAI is cheaper and already working.");
};

main().catch((e) => { console.error("\naudit failed:", e.message); process.exit(1); });
