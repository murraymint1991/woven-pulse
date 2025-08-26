# Game Roadmap & Systems Ecosystem

This document tracks all systems, their dependencies, and our milestone plan for the Final Fantasy–inspired RPG/Dating SIM project.  
It combines **flowcharts**, **impact rules**, and a **delivery checklist**.

---

## 1) High-Level Systems Overview
```mermaid
flowchart TD
    A[Time Engine] --> B[Schedules & Reminders]
    A --> C[Status: Mood, Cycle, Effects]
    A --> D[Relationship Web]
    D --> E[Interactions]
    E --> F[Paths/Unlocks]
    F --> G[Story Locks/Quests]
    C --> H[Party Manager]
    H --> I[Scene Variants]
    I --> J[Relationship Endings]
    L[Jealousy/Suspicion] --> D
    L --> P[Interactions & Choices]
    N[Locations/Activities] --> P
    N --> Q[Scene Variants]
    B --> O[Consequences]
    E --> T[Stat Deltas]
    D --> U[Affinity Map]
    B --> V[Reminders/Notifications]
    %% Status is influenced continuously
    %% (mood, cycle, effects)
```

---

2) Systems Dependency Map (who affects whom)

Rule of thumb:

Green edges = reads

Blue edges = writes/updates

Orange edges = gates/locks

```mermaid
flowchart LR
    Time[Time Engine]:::sys -->|tick| Sched[Schedules/Reminders]:::sys
    Time -->|tick| Status[Status/Mood/Cycle]:::sys
    Time -->|tick| Rel[Relationship Web]:::sys

    Interact[Interactions]:::sys -->|modify| Rel
    Interact -->|delta| Status
    Interact --> Paths[Path Unlocks]:::sys

    Jealousy[Jealousy/Suspicion]:::sys --> Rel
    Jealousy --> Interact

    Party[Party Manager]:::sys --> Scenes[Scene Variants]:::sys
    Scenes --> Endings[Relationship Endings]:::sys
    Status --> Endings
    Paths --> Endings
    Rel --> Endings

classDef sys fill:#202c55,stroke:#88f,stroke-width:1px,color:#fff;
```


---

3) Impact Rules — “If we add X, it affects Y”

```mermaid
graph LR
    X1[Add a new Interaction] --> Y1[Updates Affection/Trust]
    X1 --> Y2[Consumes Time Slot]
    X1 --> Y3[May raise Suspicion if risky]
    X1 --> Y4[Can unlock Path flags]

    X2[Add a new Location] --> Y5[Expands available actions]
    Y5 --> Y6[Potential new witnesses (jealousy graph)]

    X3[Schedule a Date] --> Y7[Creates reminder]
    Y7 --> Y8[Triggers Scene at time]
    Y8 --> Y9[On miss: affection penalty/jealousy]
    Y9 --> Y10[On meet: apply scene outcomes]

    X4[Change Party] --> Y11[Locks/Unlocks scene variants]
    Y11 --> Y12[Alters witness set for jealousy]

    X5[Raise Suspicion Rules] --> Y13[Jealousy more likely]
    X5 --> Y14[More penalties on being caught]

```

---

4) Milestones (checklist → ship in slices)

Phase A — Foundation

[ ] A1 Time Engine: slots/day, rest, HUD on Home

[ ] A2 Schedules & Reminders: create & resolve events

[ ] A3 Interactions v1: universal actions → stat deltas & time

[ ] A4 Jealousy/Suspicion v1: witness rules, penalties

[ ] A5 Paths v1: pair-specific unlocks

[ ] A6 Party Manager: switchers + story locks


Phase B — Content Hooks

[ ] B1 Locations & Activities: open as story flags unlock

[ ] B2 NPC Schedules: availability windows

[ ] B3 Scene Variants: by party composition & path flags

[ ] B4 Relationship Endings: branch per path/affection stats


Phase C — Expansion

[ ] C1 Generational Play: children, family trees

[ ] C2 Unique Systems per MC: e.g. Nanaki can’t high-five but can be petted

[ ] C3 Advanced Mood/Sensitivities: likes/dislikes evolve dynamically

[ ] C4 Complex Consequences: missing story beats → cascades to endings



---

5) Notes & Philosophy

Keep sandbox feel: time advances by actions, not cutscenes.

Use stat progression + hidden modifiers for depth.

Paths replace flat affection: character-specific relationship identities.

Maintain modularity: systems can expand without rewriting everything.
