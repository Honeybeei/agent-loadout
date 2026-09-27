---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds, with exactly one question per round**. The **frontier** is every decision whose prerequisites are already settled — the questions you can ask _now_ without guessing at answers you haven't heard yet. Choose the most important question from the frontier, number it, and give your recommended answer. Then wait for the user's answer before asking the next question.

Each question should be formatted like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

Each answer reshapes the tree — settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier after every answer, then choose the next most important question. Never ask a question whose prerequisites are still unsettled.

Finding _facts_ is your job, never the user's. Investigate inspectable facts with the tools and authority available to this session; delegate when an authorized helper is useful, otherwise investigate directly. A pending investigation blocks only questions that depend on it. Ask another useful ready question if one exists; if none does, name the missing fact or access instead of guessing. The _decisions_ are the user's — put each to them and wait.

An empty ready frontier does not by itself mean the inquiry is complete. Distinguish questions needed for the agreed judgment that are settled, blocked on facts or access, or intentionally deferred, and leave unrelated or out-of-scope branches alone. If required questions remain blocked, report the prerequisite and return a blocked or partial result; if the user chooses to pause, preserve the deferred questions without claiming they were answered. When enough is settled for the bounded judgment, summarize the shared understanding and wait for the user's confirmation before acting.
