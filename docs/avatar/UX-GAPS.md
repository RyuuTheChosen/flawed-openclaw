# Avatar Overlay — UX & Immersion Gaps

Current state: the avatar sits in a transparent window, breathes, blinks, sways, and reacts to agent events with expression swaps and text-driven lip-sync. The plugin plumbing (gateway bridge, per-agent VRM, crash recovery) is solid. The character experience is not.

---

## 1. Animation Life

~~The avatar feels robotic. Three looping sine waves (breathing, blinking, sway) repeat identically forever.~~ Partially addressed — Mixamo FBX clips with variety rotation now replace procedural sine waves.

| Gap | Status | What it means |
|-----|--------|---------------|
| ~~No idle variety~~ | ✅ Fixed | 3 idle clips rotate randomly with crossfade |
| ~~Instant state swaps~~ | ✅ Fixed | 0.5s crossfade transitions between phases |
| No follow-through | Open | Speaking ends, immediate neutral. No settling, no exhale |
| No eye gaze | Open | Eyes stare forward forever. No tracking, no glancing, no curiosity |
| No secondary motion | Open | Hair, accessories, clothes have no physics/spring simulation |
| Fixed lip-sync rate | Open | 50ms/char regardless of content. No pauses at commas, no emphasis |

---

## 2. State Machine

~~No character arc within a conversation.~~ Basic FSM now drives phase-based clip selection with crossfade. Deeper personality still TODO.

| Gap | Status | What it means |
|-----|--------|---------------|
| ~~No transition states~~ | ✅ Fixed | Crossfade transitions between phase clip pools |
| No duration awareness | Open | Thinking for 10s should look different from thinking for 1s (growing impatience, deeper focus) |
| No error personality | Open | Errors just go to idle. Could show confusion, recovery, shrug |
| No memory across phases | Open | Long conversation should feel different from fresh start |
| No interruptibility | Open | Rapid state changes (thinking-speaking-thinking-speaking) cause flickering |

---

## 3. Chat Bubble

~~The avatar is mute. It reacts to messages you cannot see.~~ Chat bubble implemented — streams assistant text, accepts user input, auto-shows/hides.

| Gap | Status | What it means |
|-----|--------|---------------|
| ~~No speech display~~ | ✅ Fixed | Streamed text word-by-word in chat bubble overlay |
| ~~No input~~ | ✅ Fixed | Text input sends to agent via gateway `chat.send` |
| ~~No auto-hide~~ | ✅ Fixed | Bubble fades after 10s inactivity |
| ~~No styling~~ | ✅ Fixed | Dark translucent panel, monospace, color-coded messages |
| No tool display | Open | When working, could show what tool is being used |

---

## 4. User Interaction

The avatar ignores you. Drag to reposition and scroll to zoom — that is all.

| Gap | What it means |
|-----|---------------|
| No hover awareness | Avatar does not notice your cursor. Should glance at it, perk up |
| ~~No click response~~ | ✅ Fixed | Click toggles chat bubble (5px drag guard) |
| No presence detection | Avatar does not know if you are at the computer. Could react to long absence/return |
| No pet/poke reactions | Fun interactions — poke the avatar, it reacts (annoyed, amused, surprised) |

---

## 5. Visual Polish

Raw WebGL canvas in a transparent window. No atmosphere.

| Gap | What it means |
|-----|---------------|
| No lighting shifts | State changes could shift light color/intensity (warm for speaking, cool for thinking) |
| No particle effects | Subtle sparkles when thinking, speech ripples when talking |
| No shadow/glow | Avatar could cast a soft glow that changes with mood |
| No transition effects | Crossfade, scale bounce, or drift when switching states |
| No ambient background | Optional subtle radial gradient or aura behind the avatar |

---

## 6. Personality

Every avatar behaves identically. thinking = surprised, speaking = happy, working = relaxed. Always.

| Gap | What it means |
|-----|---------------|
| No expression variety | Speaking about errors should look different from speaking about success |
| No mood drift | Long idle could shift to bored, sleepy. Active conversation could build energy |
| No content awareness | Could parse sentiment from agent text to pick expressions |
| No per-agent personality | Different agents could have different animation styles, not just different models |

---

## Priority Tiers

| Tier | Category | Impact |
|------|----------|--------|
| ~~**High**~~ | ~~State machine + transitions~~ | ✅ Crossfade FSM implemented |
| ~~**High**~~ | ~~Idle variety~~ | ✅ Mixamo clip rotation implemented |
| ~~**High**~~ | ~~Chat bubble~~ | ✅ Chat bubble with text streaming, input, auto-hide |
| **Medium** | Eye gaze + hover awareness | Makes the avatar feel alive and aware of you |
| **Medium** | Lip-sync prosody | Pauses, emphasis, pacing make speech feel real |
| **Medium** | Expression variety | Prevents the one-note reaction problem |
| **Low** | Visual polish (particles, glow) | Atmosphere, not function |
| **Low** | Pet/poke interactions | Fun but not core |
| **Low** | Audio | Significant complexity for marginal gain in a desktop overlay |

---

## What moves the needle

~~The state machine, idle variety, and chat bubble are where the experience jumps from "tech demo" to "companion."~~ All three core gaps (state machine, idle variety, chat bubble) are now addressed. Next priority: eye gaze, hover awareness, and expression variety.
