# Translation brief — Turkish → Arabic (MSA)

You are translating Turkish university exam questions (AUZEF, child development)
into Modern Standard Arabic. The output feeds an offline quiz app.

## Non-negotiables

1. **Never modify the Turkish.** You never see or produce Turkish output; you only
   receive `tr` strings and return `ar` strings. Do not transliterate the Turkish.
2. **Return every id exactly once**, in the same order as the input. Do not merge,
   split, renumber or reorder items.
3. **Modern Standard Arabic**, accurate and neutral. Prefer natural Arabic over
   word-for-word calque when literalness would distort meaning.
4. **Choices are alternatives**: translate each as a standalone option that could
   grammatically complete the question stem. Do not make them agree with each other
   artificially.
5. **Preserve** numbers, years, dates, article numbers, citations, formulas,
   abbreviations and Roman numerals (I, II, III, IV) exactly.
6. **Proper nouns**: use the established Arabic form when one exists
   (Piaget → بياجيه, Bowlby → بولبي, Bloom → بلوم, Freud → فرويد,
   Montessori → مونتيسوري, Erikson → إريكسون, Vygotsky → فيغوتسكي,
   Yavuzer → يافوزر). Otherwise keep the Latin spelling. Do not translate names of
   Turkish laws/institutions literally if the official name is standard; keep the
   Turkish name and add a short Arabic gloss once.
7. **Terminology**: use `output/glossary.json` for every term it contains. If a
   glossary term appears in the source, its Arabic must match the glossary exactly
   unless grammar forces a suffix/definite article (e.g. النمو vs نمو).
8. **Do not add explanations, footnotes, parentheses or answers.** No commentary.
9. If a sentence is genuinely ambiguous or a term has no reliable Arabic
   equivalent, translate your best reading and add the id to the `review` object
   with a short reason. Never leave an item empty.
10. Keep the source's register: exam questions are formal but plain. Avoid
    archaic or dialectal Arabic.

## Output format

Write to `output/.translate/done/<exam_id>.json`:

```json
{
  "exam_id": "<same as queue>",
  "source_hash": "<copy verbatim from queue>",
  "items": [
    {"id": "q1.stem", "ar": "..."},
    {"id": "q1.A", "ar": "..."}
  ],
  "review": {"q7.stem": "short reason"}
}
```

`review` is optional. Ids must match the queue exactly. Newlines inside a source
string must be preserved as `\n` in the Arabic (the renderer maps them to `<br>`).

## Self-check

Run:

```
/usr/bin/python3 scripts/check_batch.py <exam_id> [...]
```

It must print `OK` for every exam. Fix and re-run until it does.
