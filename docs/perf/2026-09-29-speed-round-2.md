# Speed round 2: measurements

OnePlus 10T (CPH2401, Android 14), debug app at production JS speed with the profiling renderer,
`node scripts/perf-run.mjs`, two runs per step, **pooled**: one run holds only three day changes, and
run-to-run noise on the phone is about ±15%, too much to judge a 10% change from one run. Read from
the runs' output:

- **Today first render:** the first `[perf] index` line at launch (render ms).
- **First visit:** the `mount` line after the first `diary` / `profile` press (render ms; on screen = the `+ms after`).
- **Diary day urgent / content:** after each `date-back` press, the first `diary` render (the date label)
  and the largest `diary` render within a second of it (the day's content). Median over both runs'
  day changes; the content range in brackets. Launch and first visits: mean of the two runs.
- **Open-tab switches** commit with no render large enough to log (they were 20-32 ms to commit when
  measured on 2026-09-28), so they are not tracked row by row.

| Step | Today first render | First visit Diary | First visit Profile | Diary day urgent | Diary day content | PSS |
|---|---|---|---|---|---|---|
| Baseline (2026-09-29) | 666 ms | 177 ms | 399 ms | 22 ms | 85 ms [60-146] | 748 MB |
| Shared theme (kept) | 606 ms | 142 ms | 401 ms | 23 ms | 70 ms [52-120] | 742 MB |
| Memo icons (kept) | 613 ms | 142 ms | 350 ms | 18.5 ms | 72 ms [54-120] | 742 MB |

Targets: Diary day content ≤ 50 ms; first visits instant; Today first render ≤ 300 ms; late frames during
a day change ≤ 10%.

## Raw output: baseline

```
Starting Metro in production mode with probes...
Bundling (about a minute on a cold cache)...
Loading the app on the phone (up to a couple of minutes over wireless adb)...

== launch
      [perf] index nested-update 663.8ms @323257831
      [perf] index nested-update 1.0ms @323258151
      [perf] index nested-update 0.6ms @323258166
      [perf] index nested-update 10.2ms @323258237
      [perf] index update 85.2ms @323258827
      [perf] index update 0.1ms @323258930
      [perf] index update 14.0ms @323259826
      [perf] index update 12.4ms @323260333

== first visits
  [perf] press diary
      [perf] index update 0.3ms @323263295 +243ms after diary
      [perf] diary:nav mount 21.1ms @323263295 +243ms after diary
      [perf] diary:totals mount 21.9ms @323263295 +243ms after diary
      [perf] diary:saved mount 4.5ms @323263295 +243ms after diary
      [perf] diary:Breakfast mount 44.1ms @323263295 +243ms after diary
      [perf] diary:Lunch mount 7.4ms @323263295 +243ms after diary
      [perf] diary:Dinner mount 6.9ms @323263295 +243ms after diary
      [perf] diary:Snacks mount 7.3ms @323263295 +243ms after diary
      [perf] diary mount 156.9ms @323263295 +243ms after diary
      [perf] index nested-update 0.3ms @323263418 +366ms after diary
      [perf] diary nested-update 1.2ms @323263418 +366ms after diary
      [perf] index nested-update 0.6ms @323263443 +391ms after diary
      [perf] diary nested-update 0.4ms @323263443 +391ms after diary
      [perf] diary:Breakfast update 2.3ms @323264838 +1786ms after diary
      [perf] diary:Lunch update 1.6ms @323264838 +1786ms after diary
      [perf] diary:Dinner update 1.7ms @323264838 +1786ms after diary
      [perf] diary:Snacks update 1.6ms @323264838 +1786ms after diary
      [perf] diary update 9.5ms @323264838 +1786ms after diary
      [perf] diary:Breakfast update 1.1ms @323265327 +2275ms after diary
      [perf] diary:Lunch update 0.7ms @323265327 +2275ms after diary
      [perf] diary:Dinner update 0.7ms @323265327 +2275ms after diary
      [perf] diary:Snacks update 0.8ms @323265327 +2275ms after diary
      [perf] diary update 4.9ms @323265327 +2275ms after diary
  [perf] press index
      [perf] index update 0.9ms @323265595 +46ms after index
      [perf] diary update 0.4ms @323265595 +46ms after index
      [perf] index nested-update 0.4ms @323265667 +119ms after index
      [perf] diary nested-update 0.3ms @323265667 +119ms after index
      [perf] index nested-update 0.7ms @323265684 +136ms after index
      [perf] diary nested-update 0.5ms @323265684 +136ms after index
      [perf] index update 19.6ms @323267383 +1834ms after index
  [perf] press profile
      [perf] index update 0.5ms @323268629 +419ms after profile
      [perf] profile mount 378.9ms @323268629 +419ms after profile
      [perf] index nested-update 0.4ms @323268804 +594ms after profile
      [perf] profile nested-update 1.1ms @323268804 +594ms after profile
      [perf] index nested-update 0.7ms @323268819 +609ms after profile
      [perf] profile nested-update 0.5ms @323268819 +609ms after profile
      [perf] profile update 3.2ms @323268845 +635ms after profile
      [perf] profile update 3.4ms @323270740 +2530ms after profile
  [perf] press index
      [perf] index update 0.5ms @323270878 +47ms after index
      [perf] profile update 0.3ms @323270878 +47ms after index
      [perf] index nested-update 0.5ms @323270939 +108ms after index
      [perf] profile nested-update 0.4ms @323270939 +108ms after index
      [perf] index nested-update 0.6ms @323270959 +128ms after index
      [perf] profile nested-update 0.5ms @323270959 +128ms after index
      [perf] index update 2.9ms @323272257 +1426ms after index
      [perf] index update 2.8ms @323272753 +1922ms after index

== tab round-trips
  [perf] press diary
      [perf] index update 0.4ms @323273879 +45ms after diary
      [perf] diary update 0.6ms @323273879 +45ms after diary
      [perf] index nested-update 4.0ms @323273930 +95ms after diary
      [perf] diary nested-update 0.7ms @323273930 +95ms after diary
      [perf] index nested-update 0.9ms @323273950 +115ms after diary
      [perf] diary nested-update 0.8ms @323273950 +115ms after diary
      [perf] diary:nav update 0.8ms @323275276 +1442ms after diary
      [perf] diary:Breakfast update 1.2ms @323275276 +1442ms after diary
      [perf] diary:Lunch update 3.7ms @323275276 +1442ms after diary
      [perf] diary:Dinner update 0.7ms @323275276 +1442ms after diary
      [perf] diary:Snacks update 0.7ms @323275276 +1442ms after diary
      [perf] diary update 8.6ms @323275276 +1442ms after diary
      [perf] diary:nav update 0.3ms @323275773 +1939ms after diary
      [perf] diary:Breakfast update 0.7ms @323275773 +1939ms after diary
      [perf] diary:Lunch update 0.4ms @323275773 +1939ms after diary
      [perf] diary:Dinner update 0.4ms @323275773 +1939ms after diary
      [perf] diary:Snacks update 0.4ms @323275773 +1939ms after diary
      [perf] diary update 3.1ms @323275773 +1939ms after diary
  [perf] press index
      [perf] index update 0.4ms @323276010 +41ms after index
      [perf] diary update 0.3ms @323276010 +41ms after index
      [perf] index nested-update 0.6ms @323276081 +112ms after index
      [perf] diary nested-update 0.6ms @323276081 +112ms after index
      [perf] index nested-update 0.7ms @323276105 +136ms after index
      [perf] diary nested-update 0.5ms @323276105 +136ms after index
      [perf] index update 3.4ms @323277288 +1319ms after index
      [perf] index update 7.0ms @323277793 +1824ms after index
  [perf] press profile
      [perf] index update 0.4ms @323278193 +35ms after profile
      [perf] profile update 0.5ms @323278193 +35ms after profile
      [perf] index nested-update 0.4ms @323278260 +102ms after profile
      [perf] profile nested-update 0.5ms @323278260 +102ms after profile
      [perf] index nested-update 0.6ms @323278285 +126ms after profile
      [perf] profile nested-update 0.4ms @323278285 +126ms after profile
      [perf] profile update 3.0ms @323279804 +1646ms after profile
  [perf] press index
      [perf] profile update 2.4ms @323280317 +6ms after index
      [perf] index update 0.3ms @323280351 +41ms after index
      [perf] profile update 0.2ms @323280351 +41ms after index
      [perf] index nested-update 0.4ms @323280392 +82ms after index
      [perf] profile nested-update 0.4ms @323280392 +82ms after index
      [perf] index nested-update 0.7ms @323280418 +108ms after index
      [perf] profile nested-update 0.9ms @323280418 +108ms after index
      [perf] index update 3.2ms @323281832 +1521ms after index
      [perf] index update 3.8ms @323282336 +2026ms after index
  [perf] press diary
      [perf] index update 0.3ms @323282448 +24ms after diary
      [perf] diary update 0.4ms @323282448 +24ms after diary
      [perf] index nested-update 0.4ms @323282491 +67ms after diary
      [perf] diary nested-update 0.4ms @323282491 +67ms after diary
      [perf] index nested-update 0.8ms @323282517 +93ms after diary
      [perf] diary nested-update 0.7ms @323282517 +93ms after diary
      [perf] diary:nav update 0.3ms @323283849 +1425ms after diary
      [perf] diary:Breakfast update 0.6ms @323283849 +1425ms after diary
      [perf] diary:Lunch update 0.4ms @323283849 +1425ms after diary
      [perf] diary:Dinner update 2.7ms @323283849 +1425ms after diary
      [perf] diary:Snacks update 0.4ms @323283849 +1425ms after diary
      [perf] diary update 5.2ms @323283849 +1425ms after diary
      [perf] diary:nav update 0.3ms @323284342 +1918ms after diary
      [perf] diary:Breakfast update 0.6ms @323284342 +1918ms after diary
      [perf] diary:Lunch update 0.4ms @323284342 +1918ms after diary
      [perf] diary:Dinner update 0.5ms @323284342 +1918ms after diary
      [perf] diary:Snacks update 0.9ms @323284342 +1918ms after diary
      [perf] diary update 3.5ms @323284342 +1918ms after diary
  [perf] press index
      [perf] index update 0.3ms @323284544 +23ms after index
      [perf] diary update 0.2ms @323284544 +23ms after index
      [perf] index nested-update 0.5ms @323284593 +71ms after index
      [perf] diary nested-update 0.4ms @323284593 +71ms after index
      [perf] index nested-update 0.9ms @323284616 +95ms after index
      [perf] diary nested-update 0.6ms @323284616 +95ms after index
      [perf] index update 2.9ms @323285875 +1353ms after index
      [perf] index update 3.8ms @323286374 +1853ms after index
  [perf] press profile
      [perf] index update 0.3ms @323286649 +42ms after profile
      [perf] profile update 0.5ms @323286649 +42ms after profile
      [perf] index nested-update 0.4ms @323286692 +86ms after profile
      [perf] profile nested-update 0.4ms @323286692 +86ms after profile
      [perf] index nested-update 0.8ms @323286716 +109ms after profile
      [perf] profile nested-update 0.6ms @323286716 +109ms after profile
      [perf] profile update 1.5ms @323287876 +1269ms after profile
      [perf] profile update 1.9ms @323288388 +1781ms after profile
  [perf] press index
      [perf] index update 0.3ms @323288771 +37ms after index
      [perf] profile update 0.3ms @323288771 +37ms after index
      [perf] index nested-update 0.5ms @323288821 +87ms after index
      [perf] profile nested-update 0.4ms @323288821 +87ms after index
      [perf] index nested-update 1.0ms @323288851 +117ms after index
      [perf] profile nested-update 1.2ms @323288851 +117ms after index
      [perf] index update 3.5ms @323290399 +1665ms after index
  [perf] press diary
      [perf] index update 0.4ms @323290885 +34ms after diary
      [perf] diary update 0.5ms @323290885 +34ms after diary
      [perf] index nested-update 0.5ms @323290933 +82ms after diary
      [perf] diary nested-update 0.6ms @323290933 +82ms after diary
      [perf] index nested-update 0.7ms @323290956 +105ms after diary
      [perf] diary nested-update 0.5ms @323290956 +105ms after diary
      [perf] diary:nav update 0.3ms @323292415 +1564ms after diary
      [perf] diary:Breakfast update 0.6ms @323292415 +1564ms after diary
      [perf] diary:Lunch update 0.4ms @323292415 +1564ms after diary
      [perf] diary:Dinner update 0.3ms @323292415 +1564ms after diary
      [perf] diary:Snacks update 0.3ms @323292415 +1564ms after diary
      [perf] diary update 3.4ms @323292415 +1564ms after diary
      [perf] diary:nav update 0.4ms @323292912 +2060ms after diary
      [perf] diary:Breakfast update 0.6ms @323292912 +2060ms after diary
      [perf] diary:Lunch update 0.4ms @323292912 +2060ms after diary
      [perf] diary:Dinner update 0.4ms @323292912 +2060ms after diary
      [perf] diary:Snacks update 0.3ms @323292912 +2060ms after diary
      [perf] diary update 3.0ms @323292912 +2060ms after diary
  [perf] press index
      [perf] index update 0.3ms @323293015 +21ms after index
      [perf] diary update 0.6ms @323293015 +21ms after index
      [perf] index nested-update 0.3ms @323293054 +60ms after index
      [perf] diary nested-update 0.3ms @323293054 +60ms after index
      [perf] index nested-update 0.7ms @323293073 +79ms after index
      [perf] diary nested-update 0.5ms @323293073 +79ms after index
      [perf] index update 7.0ms @323294438 +1444ms after index
      [perf] index update 3.8ms @323294928 +1934ms after index
  [perf] press profile
      [perf] index update 0.3ms @323295142 +25ms after profile
      [perf] profile update 0.5ms @323295142 +25ms after profile
      [perf] index nested-update 0.4ms @323295186 +69ms after profile
      [perf] profile nested-update 0.5ms @323295186 +69ms after profile
      [perf] index nested-update 0.8ms @323295211 +94ms after profile
      [perf] profile nested-update 0.6ms @323295211 +94ms after profile
      [perf] profile update 1.6ms @323296433 +1316ms after profile
      [perf] profile update 1.8ms @323296935 +1818ms after profile
  [perf] press index
      [perf] index update 0.3ms @323297250 +21ms after index
      [perf] profile update 0.2ms @323297250 +21ms after index
      [perf] index nested-update 0.5ms @323297296 +67ms after index
      [perf] profile nested-update 0.4ms @323297296 +67ms after index
      [perf] index nested-update 0.8ms @323297317 +88ms after index
      [perf] profile nested-update 0.6ms @323297317 +88ms after index
      [perf] index update 3.0ms @323298481 +1252ms after index
      [perf] index update 3.2ms @323298985 +1756ms after index

== diary days
  [perf] press diary
      [perf] index update 0.4ms @323299676 +42ms after diary
      [perf] diary update 0.7ms @323299676 +42ms after diary
      [perf] index nested-update 0.6ms @323299720 +86ms after diary
      [perf] diary nested-update 0.5ms @323299720 +86ms after diary
      [perf] index nested-update 0.8ms @323299736 +102ms after diary
      [perf] diary nested-update 0.6ms @323299736 +102ms after diary
      [perf] diary:nav update 0.3ms @323301003 +1369ms after diary
      [perf] diary:Breakfast update 0.6ms @323301003 +1369ms after diary
      [perf] diary:Lunch update 0.4ms @323301003 +1369ms after diary
      [perf] diary:Dinner update 0.4ms @323301003 +1369ms after diary
      [perf] diary:Snacks update 0.4ms @323301003 +1369ms after diary
      [perf] diary update 2.9ms @323301003 +1369ms after diary
      [perf] diary:nav update 0.3ms @323301498 +1864ms after diary
      [perf] diary:Breakfast update 0.6ms @323301498 +1864ms after diary
      [perf] diary:Lunch update 0.3ms @323301498 +1864ms after diary
      [perf] diary:Dinner update 0.4ms @323301498 +1864ms after diary
      [perf] diary:Snacks update 0.3ms @323301498 +1864ms after diary
      [perf] diary update 2.8ms @323301498 +1864ms after diary
  [perf] press date-back
      [perf] diary:nav update 19.0ms @323302364 +46ms after date-back
      [perf] diary:totals update 0.0ms @323302364 +46ms after date-back
      [perf] diary:saved update 0.0ms @323302364 +46ms after date-back
      [perf] diary:Breakfast update 0.0ms @323302364 +46ms after date-back
      [perf] diary:Lunch update 0.0ms @323302364 +46ms after date-back
      [perf] diary:Dinner update 0.0ms @323302364 +46ms after date-back
      [perf] diary:Snacks update 0.1ms @323302364 +46ms after date-back
      [perf] diary update 32.6ms @323302364 +46ms after date-back
      [perf] diary update 0.1ms @323302388 +70ms after date-back
      [perf] diary:nav update 8.8ms @323302458 +140ms after date-back
      [perf] diary:totals update 9.9ms @323302458 +140ms after date-back
      [perf] diary:saved update 0.5ms @323302458 +140ms after date-back
      [perf] diary:Breakfast update 2.6ms @323302458 +140ms after date-back
      [perf] diary:Lunch update 25.7ms @323302458 +140ms after date-back
      [perf] diary:Dinner update 1.9ms @323302458 +140ms after date-back
      [perf] diary:Snacks update 1.6ms @323302458 +140ms after date-back
      [perf] diary update 59.9ms @323302458 +140ms after date-back
      [perf] diary:nav update 1.2ms @323303509 +1191ms after date-back
      [perf] diary update 1.7ms @323303509 +1191ms after date-back
  [perf] press date-back
      [perf] diary:nav update 14.1ms @323303953 +26ms after date-back
      [perf] diary:totals update 0.0ms @323303953 +26ms after date-back
      [perf] diary:saved update 0.0ms @323303953 +26ms after date-back
      [perf] diary:Breakfast update 0.0ms @323303953 +26ms after date-back
      [perf] diary:Lunch update 0.0ms @323303953 +26ms after date-back
      [perf] diary:Dinner update 0.0ms @323303953 +26ms after date-back
      [perf] diary:Snacks update 0.0ms @323303953 +26ms after date-back
      [perf] diary update 22.1ms @323303953 +26ms after date-back
      [perf] diary:nav update 11.2ms @323304122 +195ms after date-back
      [perf] diary:totals update 14.3ms @323304122 +195ms after date-back
      [perf] diary:saved update 0.5ms @323304122 +195ms after date-back
      [perf] diary:Breakfast update 29.9ms @323304122 +195ms after date-back
      [perf] diary:Lunch update 24.2ms @323304122 +195ms after date-back
      [perf] diary:Dinner update 20.4ms @323304122 +195ms after date-back
      [perf] diary:Snacks update 36.8ms @323304122 +195ms after date-back
      [perf] diary update 145.5ms @323304122 +195ms after date-back
      [perf] diary:nav update 0.5ms @323304234 +307ms after date-back
      [perf] diary update 0.5ms @323304234 +307ms after date-back
      [perf] diary:nav update 0.4ms @323305522 +1595ms after date-back
      [perf] diary update 0.6ms @323305522 +1595ms after date-back
  [perf] press date-back
      [perf] diary:nav update 13.8ms @323305614 +25ms after date-back
      [perf] diary:totals update 0.0ms @323305614 +25ms after date-back
      [perf] diary:saved update 0.0ms @323305614 +25ms after date-back
      [perf] diary:Breakfast update 0.0ms @323305614 +25ms after date-back
      [perf] diary:Lunch update 0.0ms @323305614 +25ms after date-back
      [perf] diary:Dinner update 0.0ms @323305614 +25ms after date-back
      [perf] diary:Snacks update 0.0ms @323305614 +25ms after date-back
      [perf] diary update 21.4ms @323305614 +25ms after date-back
      [perf] diary:nav update 13.2ms @323305730 +142ms after date-back
      [perf] diary:totals update 12.5ms @323305730 +142ms after date-back
      [perf] diary:saved update 0.5ms @323305730 +142ms after date-back
      [perf] diary:Breakfast update 23.2ms @323305730 +142ms after date-back
      [perf] diary:Lunch update 18.1ms @323305730 +142ms after date-back
      [perf] diary:Dinner update 2.6ms @323305730 +142ms after date-back
      [perf] diary:Snacks update 11.9ms @323305730 +142ms after date-back
      [perf] diary update 90.1ms @323305730 +142ms after date-back
      [perf] diary:nav update 0.6ms @323307036 +1447ms after date-back
      [perf] diary update 0.7ms @323307036 +1447ms after date-back
      [perf] diary:nav update 1.0ms @323307534 +1946ms after date-back
      [perf] diary update 1.2ms @323307534 +1946ms after date-back

memory (PSS): 754 MB
```
