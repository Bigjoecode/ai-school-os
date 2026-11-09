# Writing enrichment for Guided practicals

A **Guided practical** (simulator id `gen-practical`) runs a lesson as a marked workflow out of 20, from the lesson's own data plus an optional enrichment entry written here. Without enrichment it still works, using what it can derive. With it, the student meets real judgement calls, believable wrong tools, and real numbers.

Call it a "guided practical" in anything a student reads. It is not a virtual experiment and must not claim to be one.

## What you do for a subject

1. Create `apps/api/prisma/practicals/enrichment/<slug>.json`. `<slug>` is exactly the lesson file's name in `prisma/practicals/waec/`.
2. Write one entry per lesson, keyed by the lesson's `id`.
3. In the lesson file, set `"simulator": "gen-practical"` on each lesson you enriched, with a targeted edit. Never change a lesson that already has another simulator.
4. Check it from `apps/api`:

   ```
   node scripts/check-enrichment.cjs <slug> --stats
   ```

   Exit code 0 means no errors. Fix every `ERROR`; read every `warn`. If it complains about `@aischool/shared`, run `npm run build -w packages/shared` from the repo root first (a type error from another agent's half-written simulator doesn't stop the build writing its files).

That is the whole install: the file is hashed with its lesson file, so a change reinstalls those lessons on the next boot, and the deploy bundle copies this folder.

## File shape

```json
{
  "subject": "Woodwork",
  "room": "workshop",
  "lessons": {
    "pr-wwk-constructing-a-common-through-dovetail-joint": { "safety": { }, "setOut": { }, "decisions": [ ], "observations": [ ], "numerics": [ ], "faults": [ ], "written": { }, "board": [ ] }
  }
}
```

`room` sets the 3D room for the subject: `workshop`, `kitchen`, `studio`, `field`, `drawing` or `lab`. A lesson can set its own `room`. If neither does, the room follows the lesson's `kind`. Choose by what the work feels like: Foods and Nutrition is a `kitchen` even when its `kind` is `WORKSHOP`.

Unknown fields are rejected, so a typo fails the check instead of being silently ignored. Every part of an entry is optional, but aim to write them all.

## What the student does, and what you write

Text limits: most strings are 3 to 400 characters. Write in British English, in plain sentences, for a Nigerian SS student, at WAEC level. Use local materials, foods and prices where they are natural. Use `N` for naira.

### 1. Safety: `safety`

The student ticks everything right. The lesson's `safety` lines are always right answers, so don't repeat them.

```json
"safety": {
  "correct": ["Keep the mallet head clear of your other hand when chopping."],
  "wrong": [
    { "text": "Hold the board against your chest while sawing it.", "why": "The saw can jump into you. Secure the work in the vice." },
    { "text": "Chop towards your hand to follow the line.", "why": "Always chop away from your body with hands behind the edge." },
    { "text": "Blow the sawdust out of the joint.", "why": "Dust goes into your eyes. Use a brush." }
  ]
}
```

Give 3 to 10 `wrong` items, ideally 5 or more: at least one is always left off a paper, so a bigger pool means papers differ more. Write habits a careless student really would have, not absurdities, specific to this job. Each `why` is shown as immediate feedback and in the marks.

### 2. Set out: `setOut`

Every lesson `apparatus` and `materials` line is a right answer. Your `distractors` are wrong for this job but belong in the same room.

```json
"setOut": {
  "distractors": [
    { "name": "Ripsaw", "why": "Too coarse for fine joint work: use the dovetail saw." },
    { "name": "Claw hammer", "why": "It bruises the chisel handle: use the mallet." },
    { "name": "Spirit level", "why": "Nothing here needs to be level." }
  ],
  "optional": ["Pencil and marking knife"],
  "shapes": { "Bench hook": "board" }
}
```

- Give 3 to 10 distractors, ideally 5 or more (at least one is always left off a paper, so a bigger pool means papers differ more). The strongest ones are near misses of a real tool. A distractor must not overlap a lesson line (the checker catches this).
- `optional`: exact lesson lines that are nice to have. They are never marked either way.
- `shapes`: the picture for a tool, only when the automatic one is wrong. Run with `--stats`, or see `GEN_TOOL_SHAPES` in `packages/shared/src/simulators/gen-practical.ts`.

### 3. Procedure and decisions: `procedure`, `decisions`

The lesson's `procedure` is the true order, up to 8 steps at a time. You don't rewrite it.

```json
"procedure": { "anyOrder": [[3, 4]], "leaveOut": [7] }
```

- `anyOrder`: 1-based step numbers that really can swap. Use it honestly: a student who swaps them is not wrong.
- `leaveOut`: steps that are notes rather than actions.

`decisions` are the heart of the enrichment. A decision comes after a step, and its wrong options have consequences, not just "wrong".

```json
"decisions": [
  {
    "id": "saw-side",
    "afterStep": 3,
    "prompt": "Your gauge line is clear. Where do you saw?",
    "options": [
      { "text": "Just on the waste side of the line", "correct": true, "consequence": "The line survives, so the pins will fit the tails tightly." },
      { "text": "Straight down the middle of the line", "consequence": "The line is gone, and the joint comes out loose by half a saw cut." },
      { "text": "On the keep side, then pare back", "consequence": "The tail is now undersized and cannot be recovered: the joint has gaps." }
    ]
  }
]
```

Write 2 to 4 per lesson, each with 3 or 4 options and exactly one `correct`. `afterStep` is 1-based. Up to 3 reach any one paper, chosen by seed. Wrong options should tempt: make them about the same length as the right one, because a long careful right answer gives itself away (the checker warns). Never hint in the prompt.

### 4. Observe and record: `observations`, `numerics`

```json
"observations": [
  {
    "id": "fit",
    "prompt": "You test-fit the corner. Which result means the joint is good?",
    "options": [
      { "text": "The tails seat with hand pressure and no gaps show", "correct": true },
      { "text": "The joint only closes with hard mallet blows", "why": "That force splits the short grain." },
      { "text": "It slides together and falls apart when lifted", "why": "Too loose: glue will not fill those gaps." }
    ]
  }
],
"numerics": [
  {
    "id": "slope",
    "prompt": "A tail is {h} mm long at a 1:6 slope. How far in from the end does the slope run sideways?",
    "formula": "h / 6",
    "vars": { "h": { "min": 18, "max": 60, "step": 6 } },
    "unit": "mm",
    "unitAliases": ["millimetres"],
    "tolerance": { "abs": 0.2 },
    "decimals": 1,
    "working": "Sideways run = {h} ÷ 6 = {answer} mm."
  }
]
```

- Write 1 to 3 `observations`, 3 to 5 options, exactly one `correct`. `why` on a wrong option is optional but worth having.
- Write a numeric wherever the lesson has numbers. Use `formula` with `vars` so the numbers change by seed. Use a fixed `answer` only when the data really is fixed.
- Formula language: `+ - * / ^`, brackets, `sqrt`, `round(x, dp)`, `abs`, `min`, `max`, `pi`, and your variables. Every variable must appear in the `prompt` as `{name}`.
- Give exactly one of `tolerance.abs` or `tolerance.rel` (`0.02` is 2%). Fair tolerance: a student working by hand with sensible rounding must pass.
- Choose `min`, `max` and `step` so every value makes sense. Keep the arithmetic doable by hand.
- `unit` of `""` means no unit is asked for. A right number with no unit loses a quarter of that item.
- Put the working in `working`: it appears in the solution.

### 5. Spot the fault: `faults`

Build on the lesson's `commonMistakes` and `sourcesOfError`. Write a short scene, then 3 to 6 lines, at least one fault and at least one sound.

```json
"faults": [
  {
    "id": "box-corner",
    "scenario": "Tunde cut a dovetailed box corner. The joint has a gap on one side. Here is what he did.",
    "lines": [
      { "text": "He marked the pins from the tails with a pencil held at an angle.", "fault": true, "why": "An angled pencil line sits away from the tail, so the pins come out small." },
      { "text": "He chopped past the gauge line on the inside face.", "fault": true, "why": "The cut shows as a gap when the joint closes." },
      { "text": "He cut the tails first and transferred them to the pins.", "why": "That is the correct order." },
      { "text": "He kept the work in the vice while sawing.", "why": "That is sound practice." }
    ]
  }
]
```

`why` is required on every line. One scenario appears per paper, chosen by seed; write 1 or 2.

### 6. Write-up: `written`

The student writes two precautions (the lesson's `precautions` are the marking guide) and one explanation.

```json
"written": {
  "precautionsPrompt": "State two precautions for cutting this joint accurately.",
  "explainPrompt": "Why are the tails normally cut before the pins?",
  "explainGuide": "The tails set the shape. Marking the pins directly from them transfers any small error, so the two parts still match.",
  "explainKeywords": [["tail", "tails"], ["mark", "transfer"], ["match", "fit"]],
  "explainNeed": 2
}
```

AI marks these against the guide. `explainKeywords` is the stand-in when AI can't run: one group per point, any word in the group earns the point, and `explainNeed` points earn the mark. Matching is by word start, so `transfer` also catches `transferred`. Make sure your own `explainGuide` passes your keywords, because the model answer is tested against them.

### The room: `board`

Up to 4 short lines on the whiteboard, first line the title. Keep them to the lesson's name and a general reminder. Never put an answer on the board.

## Rules that matter

- **Never** edit a lesson's `apparatus`, `procedure`, `safety` or `precautions` to suit your entry.
- Facts must be right: check a subject expert's standard text in your head before you write a consequence. A wrong "correct" answer is the worst bug here.
- No answers in prompts, and no patterns in the right answers.
- Item `id`s are lower-case letters, digits and hyphens, unique in the lesson.
- Copy no text from past papers, textbooks or websites. Write it fresh.

## How it is marked (20)

| Part | Marks | How |
| --- | --- | --- |
| Safety | 3 | right picks minus wrong picks |
| Setting out | 3 | right picks minus wrong picks |
| Procedure order | 3 | pairs in the right order, scaled so a shuffle earns nothing |
| Decisions | 3 | share right |
| Observations and results | 3 | share right, numbers with tolerance |
| Spot the fault | 2 | faults found minus sound lines accused |
| Precautions | 2 | AI, else keywords |
| Explanation | 1 | AI, else keywords |

Guided practice shows consequences straight away. Exam mode and teacher-scheduled sittings show nothing until the marks are released.

## What the engine does with no enrichment

Safety wrong answers come from a bank for the room, distractors from the subject's other lessons, decisions from the lesson's quick-check questions, the observation from `expectedObservations`, one numeric from the last worked sum in `dataAndCalculations`, and the fault scenario from `commonMistakes` against `precautions`. It works, but it knows nothing about the job. Your entry is what makes it good.
