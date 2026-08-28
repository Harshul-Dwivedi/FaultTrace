# FaultTrace UI — Design Requirements

**Purpose:** This document provides all UI requirements, component specs, data mappings, and interaction details needed to create a Figma design for the FaultTrace dashboard and investigation reports.

**Tech stack:** Vite + React + TypeScript + Tailwind CSS
**API:** TrueForge REST API at `http://localhost:8790/api/v1/`

---

## 1. Design Context

### What FaultTrace does
FaultTrace is an autonomous forensic investigation agent for vehicle diagnostics. Given a failure event (DTC codes + sensor data), it:
1. Gathers evidence via MCP tools (DTCs, freeze frames, sensor logs, service history)
2. Generates competing root-cause hypotheses
3. Writes and runs analysis code in a sandbox
4. Ranks causes with Bayesian math (prior × likelihood → posterior)
5. Recommends the highest-information-gain next test
6. Stops for human approval before any irreversible action

### Who uses it
- Automotive technicians reviewing AI-generated diagnoses
- Hackathon judges evaluating the investigation quality
- Developers debugging agent behavior

### Design tone
- **Technical but readable** — like a flight diagnostic panel, not a toy
- **Data-dense** — hypothesis tables, Bayesian numbers, cost metrics
- **Dark mode primary** — automotive/industrial feel
- **Accent color:** Electric blue (`#3B82F6`) for primary actions, amber (`#F59E0B`) for warnings, red (`#EF4444`) for critical gates

---

## 2. Color Palette

| Token | Hex | Usage |
|---|---|---|
| `bg-primary` | `#0F172A` | Page background (dark slate) |
| `bg-secondary` | `#1E293B` | Card backgrounds |
| `bg-tertiary` | `#334155` | Hover states, active items |
| `border` | `#475569` | Card borders, dividers |
| `text-primary` | `#F8FAFC` | Headings, primary text |
| `text-secondary` | `#94A3B8` | Descriptions, labels |
| `text-muted` | `#64748B` | Timestamps, metadata |
| `accent-blue` | `#3B82F6` | Primary actions, links, posterior bars |
| `accent-green` | `#10B981` | Success, confirmed, approved |
| `accent-amber` | `#F59E0B` | Warnings, pending gates |
| `accent-red` | `#EF4444` | Errors, rejected, critical |
| `accent-purple` | `#8B5CF6` | Hypothesis cards, info-gain highlights |

---

## 3. Typography

| Element | Font | Size | Weight |
|---|---|---|---|
| Page title | Inter | 24px | Bold (700) |
| Section heading | Inter | 18px | SemiBold (600) |
| Card title | Inter | 14px | SemiBold (600) |
| Body text | Inter | 14px | Regular (400) |
| Label / metadata | Inter | 12px | Regular (400) |
| Monospace (data) | JetBrains Mono | 13px | Regular (400) |
| Badge / pill | Inter | 11px | Medium (500) |

---

## 4. Layout

### 4.1 Page Shell

```
┌──────────────────────────────────────────────────────────────────┐
│  [Logo] FaultTrace Dashboard                     [$X.XX total]  │
├────────────┬─────────────────────────────────────────────────────┤
│            │                                                     │
│  Session   │   Main Content Area                                 │
│  Sidebar   │   ( Investigation Detail / Empty State )            │
│            │                                                     │
│  280px     │   flex-1                                            │
│            │                                                     │
│            │                                                     │
│            │                                                     │
└────────────┴─────────────────────────────────────────────────────┘
```

- **Fixed header:** 56px height, dark background (`bg-primary`), border-bottom
- **Sidebar:** 280px fixed width, scrollable session list
- **Main area:** Flex-1, scrollable, padding 24px
- **Responsive:** Below 1024px, sidebar collapses to a hamburger/drawer

### 4.2 Empty State (no session selected)

```
┌─────────────────────────────────────────┐
│                                         │
│         🔍 (icon)                       │
│                                         │
│    Select an investigation session      │
│    from the sidebar to view details.    │
│                                         │
│    Sessions appear here after the       │
│    agent completes an investigation.    │
│                                         │
└─────────────────────────────────────────┘
```

Centered vertically and horizontally. Muted text, icon at 48px.

---

## 5. Components

### 5.1 Header Bar

| Element | Details |
|---|---|
| Logo | FaultTrace icon + "FaultTrace" text, left-aligned |
| Subtitle | "Dashboard" in muted text next to logo |
| Cost summary | Right-aligned, shows total cost across all sessions: "$X.XX" with a small wallet icon |
| Refresh button | Circular arrow icon, right side, triggers re-fetch of sessions |

**States:** Default, Loading (spinner on refresh), Error (toast notification)

---

### 5.2 Session Sidebar

#### Session Card

```
┌──────────────────────────────┐
│  🚗 2003 Honda Accord        │
│      Scenario A — Vacuum leak │
│                              │
│  Status: ● Complete          │
│  Duration: 4m 32s            │
│  Cost: $0.12                 │
│  Aug 26, 2026 · 3:42 PM     │
└──────────────────────────────┘
```

| Field | Source | Format |
|---|---|---|
| Vehicle name | `session.agent.spec.instructions` (parsed) or `title` | Bold, 14px |
| Scenario description | Parsed from session title or first turn output | Muted, 12px |
| Status dot | Turn `state.status` | Green (complete), amber (running), red (error) |
| Duration | `turn.state.completed_at - turn.created_at` | "Xm Ys" |
| Cost | `turn.state.metrics.total_cost_in_usd` | "$X.XX" |
| Timestamp | `session.created_at` | Relative or absolute |

**States:**
- **Default:** `bg-secondary`, border-left transparent
- **Hover:** `bg-tertiary`, border-left 2px `accent-blue`
- **Selected:** `bg-tertiary`, border-left 3px `accent-blue`, brighter text
- **Running:** Pulsing status dot (CSS animation)

**Empty state:** "No sessions yet" with a muted message

---

### 5.3 Vehicle Header (top of Investigation Detail)

```
┌──────────────────────────────────────────────────────────────────┐
│  🚗 2003 Honda Accord EX 2.4L I4                                │
│  VIN: 1HGCM82633A004352                                         │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ P0171    │ │ P0300    │ │ Status   │ │ Duration │            │
│  │ Lean     │ │ Misfire  │ │ ✅ Done  │ │ 4m 32s   │            │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘            │
└──────────────────────────────────────────────────────────────────┘
```

| Element | Details |
|---|---|
| Vehicle name | Large, bold, with car icon |
| VIN | Monospace, muted, copy-to-clipboard on click |
| DTC badges | Pill-shaped, color-coded: red for active, amber for pending |
| Status badge | Green check for complete, amber spinner for running |
| Duration | Monospace |

**DTC badge colors:**
- Active DTC: `accent-red` background, white text
- Pending DTC: `accent-amber` background, dark text
- History DTC: `bg-tertiary` background, muted text

---

### 5.4 Evidence Timeline

Shows the chronological sequence of tool calls the agent made during investigation.

```
┌──────────────────────────────────────────────────────────┐
│  Evidence Timeline                                    12  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ●─── get_dtcs ──────────────────── 0.2s     Tier 1     │
│  │    VIN: 1HGCM82633A004352                             │
│  │    → 3 DTCs: P0171, P0300, P0174                      │
│  │                                                       │
│  ●─── get_freeze_frame ─────────── 0.3s     Tier 1     │
│  │    Code: P0171                                        │
│  │    → LTFT: +18.2%, MAF: 2.8 g/s, O2: 0.12V          │
│  │                                                       │
│  ●─── get_compact_telemetry ────── 1.1s     Tier 1     │
│  │    PIDs: stft, ltft, maf, rpm, engine_load            │
│  │    → 60 samples × 5 PIDs                              │
│  │                                                       │
│  ●─── lookup_dtc_knowledge ─────── 0.1s     Tier 1     │
│  │    Code: P0171                                        │
│  │    → 4 hypotheses, 8 available tests                  │
│  │                                                       │
│  ●─── sandbox (analysis.py) ────── 3.2s     Tier 1     │
│  │    → Bayesian ranking complete                        │
│  │                                                       │
│  ◆─── request_measurement ──────── —        Tier 2 ⏸   │
│  │    Test: smoke_test                                   │
│  │    Status: ✅ Approved by human                       │
│  │                                                       │
│  ●─── get_sensor_log (post-test) ─ 0.4s     Tier 1     │
│  │    → result: confirmed_leak                           │
│  │                                                       │
│  ◆─── order_part ───────────────── —        Tier 3 ⏸   │
│       Part: booster_vacuum_hose_03_accord_2_4l           │
│       Status: ✅ Approved by human                       │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

| Element | Details |
|---|---|
| Timeline line | Vertical line on the left, 2px, `border` color |
| Tier-1 nodes | Small filled circle (`accent-blue`), expandable on click |
| Tier-2/3 nodes | Diamond shape (`accent-amber`), always expanded |
| Tool name | Monospace, bold |
| Duration | Right-aligned, muted, "X.Xs" |
| Tier badge | Pill on the right: "Tier 1" (blue), "Tier 2" (amber), "Tier 3" (red) |
| Tool input | Collapsed by default, click to expand, monospace |
| Tool output | Collapsed by default, click to expand, monospace, max 200px height with scroll |

**Interaction:**
- Click a node to expand/collapse its input/output
- Tier-2/3 nodes auto-expand and show approval status
- Smooth height animation on expand/collapse (200ms ease)
- Scroll to latest event on initial load

**Empty state:** "Investigation in progress..." with a pulsing dot

---

### 5.5 Hypothesis Ranking

The core visualization. Shows competing root-cause hypotheses ranked by Bayesian posterior.

```
┌──────────────────────────────────────────────────────────┐
│  Hypothesis Ranking                                    4  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  1. Vacuum Leak (brake booster hose)            97.0%   │
│     ┌────────────────────────────────────────████████░░┐  │
│     │  Prior: 45% → Posterior: 97%          Bayes: 68x │  │
│     └────────────────────────────────────────────────┘  │
│     ✅ Fuel trims climb with load (+10..36%)             │
│     ✅ MAF reads 10-14% below derived airflow           │
│     ✅ O2 leans out under load                          │
│     ❌ None (all signatures match)                      │
│                                                          │
│  2. MAF Sensor Fault                          2.1%       │
│     ┌────────────────░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│     │  Prior: 20% → Posterior: 2.1%          Bayes: 0.1x│
│     └────────────────────────────────────────────────┘  │
│     ✅ None                                             │
│     ❌ MAF tracks rpm/load smoothly (no erratic spikes) │
│     ❌ No sudden MAF jumps                              │
│                                                          │
│  3. Ignition Fault                            0.6%       │
│     ┌────░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│     │  Prior: 15% → Posterior: 0.6%          Bayes: 0.04x│
│     └────────────────────────────────────────────────┘  │
│     ✅ Misfires present                                 │
│     ❌ Trims are elevated (ignition faults don't cause  │
│        lean trims)                                      │
│                                                          │
│  4. O2 Sensor Fault                           0.3%       │
│     ┌──░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│     │  Prior: 10% → Posterior: 0.3%          Bayes: 0.03x│
│     └────────────────────────────────────────────────┘  │
│     ✅ O2 voltage is low                                │
│     ❌ O2 still switches (not railed)                   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

#### Hypothesis Card (individual)

| Element | Details |
|---|---|
| Rank number | Bold, 18px, left-aligned |
| Hypothesis name | Bold, 14px |
| Posterior % | Large, bold, right-aligned, color-coded: green (>80%), amber (20-80%), red (<20%) |
| Posterior bar | Horizontal bar, full width, filled proportionally. `accent-blue` fill on `bg-tertiary` track |
| Prior → Posterior | Monospace, muted, "Prior: X% → Posterior: Y%" |
| Bayes factor | Monospace, "Bayes: Xx" (vs second-best) |
| Supporting evidence | Green checkmarks, list of matching signatures |
| Contradictory evidence | Red X marks, list of non-matching signatures |

**States:**
- **Winning hypothesis (>80%):** Blue accent border-left, posterior bar `accent-green`
- **Runner-up (20-80%):** Default styling
- **Eliminated (<20%):** Muted, collapsed by default, posterior bar `accent-red`

---

### 5.6 Info-Gain Matrix

Shows which diagnostic test would most reduce uncertainty.

```
┌──────────────────────────────────────────────────────────────┐
│  Recommended Next Test                                  🧪   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────┬──────┬──────┬──────┬──────────┐  │
│  │ Test                   │ Gain │ Cost │ Rank │ Action   │  │
│  ├────────────────────────┼──────┼──────┼──────┼──────────┤  │
│  │ 🔵 Smoke test          │ 0.42 │ Low  │  1   │ [Run ▶]  │  │
│  │ MAF swap               │ 0.38 │ Med  │  2   │ [Run ▶]  │  │
│  │ Fuel pressure test     │ 0.21 │ Low  │  3   │ [Run ▶]  │  │
│  │ O2 log capture         │ 0.15 │ Low  │  4   │ [Run ▶]  │  │
│  │ Compression test       │ 0.08 │ High │  5   │ [Run ▶]  │  │
│  └────────────────────────┴──────┴──────┴──────┴──────────┘  │
│                                                              │
│  💡 Smoke test recommended — highest info gain at low cost   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

| Element | Details |
|---|---|
| Table | Striped rows (`bg-secondary` alternating with `bg-primary`) |
| Recommended row | Highlighted with `accent-blue` left border, bold |
| Gain column | Color-coded bar (inline, small): green (>0.3), amber (0.15-0.3), red (<0.15) |
| Cost column | Pill badges: "Low" (green), "Med" (amber), "High" (red) |
| Rank column | Number |
| Action button | "Run ▶" button, `accent-blue` background, triggers Tier-2 gate |
| Recommendation note | Bottom of card, lightbulb icon, muted accent text |

**Interaction:**
- Click "Run" to see approval confirmation modal
- Row hover highlights with `bg-tertiary`

---

### 5.7 Gate Log

Shows the approval history for Tier-2 and Tier-3 actions.

```
┌──────────────────────────────────────────────────────────┐
│  Approval Log                                        🔒  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  ◆ Tier 2 — request_measurement                    │  │
│  │  Test: smoke_test (Smoke machine intake test)      │  │
│  │  Justification: "Discriminate vacuum leak vs MAF"  │  │
│  │  Expected gain: 0.42                               │  │
│  │                                                    │  │
│  │  Status: ✅ Approved by human                      │  │
│  │  Time: 3:44:12 PM · Took 28s to approve            │  │
│  │  Result: confirmed_leak                            │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  ◆ Tier 3 — order_part                             │  │
│  │  Part: booster_vacuum_hose_03_accord_2_4l          │  │
│  │  Justification: "Repair verified, part needed"     │  │
│  │                                                    │  │
│  │  Status: ✅ Approved by human                      │  │
│  │  Time: 3:46:55 PM · Took 12s to approve            │  │
│  │  Result: Mock order placed                         │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

| Element | Details |
|---|---|
| Tier badge | Diamond icon, color-coded: Tier 2 (amber), Tier 3 (red) |
| Tool name | Monospace, bold |
| Input details | Justification, test_id/part_id in monospace |
| Status | Green check (approved), red X (rejected), amber spinner (pending) |
| Approval time | Muted, "Took Xs to approve" |
| Result | Collapsed tool response, expandable |

---

### 5.8 Cost Tracker

Bottom-right corner or a collapsible panel. Shows token usage and cost.

```
┌──────────────────────────────────────────────────────────┐
│  Cost Breakdown                                     💰   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Turn 1   │ Input: 24.3K │ Output: 1.8K │ $0.042        │
│  Turn 2   │ Input: 28.1K │ Output: 2.4K │ $0.058        │
│  Turn 3   │ Input: 12.0K │ Output: 0.9K │ $0.021        │
│  ─────────┼──────────────┼──────────────┼──────────      │
│  Total    │ 64.4K tokens │              │ $0.121         │
│                                                          │
│  Model: openrouter/stealth/ox-alpha                      │
│  Provider: OpenRouter                                    │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

| Element | Details |
|---|---|
| Table | Monospace, striped rows |
| Total row | Bold, with horizontal rule above |
| Cost values | Right-aligned, formatted as "$X.XX" |
| Token counts | Abbreviated: "24.3K" |
| Model name | Muted, bottom-left |

---

## 6. Investigation Report (HTML)

A self-contained HTML file generated at the end of each investigation. Opens in any browser — no server needed.

### Report Layout

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  FaultTrace Investigation Report                             │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                              │
│  Vehicle: 2003 Honda Accord EX 2.4L I4                       │
│  VIN: 1HGCM82633A004352                                     │
│  DTCs: P0171 (Lean), P0300 (Misfire)                         │
│  Date: August 26, 2026                                       │
│  Duration: 4 minutes 32 seconds                              │
│                                                              │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                              │
│  1. EVIDENCE SUMMARY                                         │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Tool Call              Key Findings                   │  │
│  │  ──────────────────────────────────────────────────── │  │
│  │  get_dtcs               3 DTCs: P0171, P0300, P0174    │  │
│  │  get_freeze_frame       LTFT +18.2%, MAF 2.8 g/s      │  │
│  │  get_compact_telemetry  60s × 5 PIDs at 1 Hz          │  │
│  │  lookup_dtc_knowledge   4 hypotheses, 8 tests          │  │
│  │  sandbox (analysis.py)  Bayesian computation           │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  2. HYPOTHESIS RANKING                                       │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                                                        │  │
│  │  Rank  Hypothesis          Prior   Posterior  Bayes    │  │
│  │  ────  ──────────────────  ──────  ─────────  ──────   │  │
│  │  1     Vacuum Leak         45%     97.0%      68x      │  │
│  │        ████████████████████████████████████░░░░        │  │
│  │  2     MAF Sensor Fault    20%     2.1%       0.1x     │  │
│  │        ███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░        │  │
│  │  3     Ignition Fault      15%     0.6%       0.04x    │  │
│  │        █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░        │  │
│  │  4     O2 Sensor Fault     10%     0.3%       0.03x    │  │
│  │        █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░        │  │
│  │                                                        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  3. BAYESIAN COMPUTATION                                     │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  H_before = -Σ P(Hi) × log₂(P(Hi))                   │  │
│  │           = -(0.45×1.15 + 0.20×2.32 + 0.15×2.74       │  │
│  │             + 0.10×3.32) = 1.84 bits                   │  │
│  │                                                        │  │
│  │  Test: smoke_test                                      │  │
│  │  P(positive) = Σ P(Hi) × L(test|Hi)                   │  │
│  │              = 0.45×0.95 + 0.20×0.05 + 0.15×0.05       │  │
│  │                + 0.10×0.05 = 0.46                       │  │
│  │                                                        │  │
│  │  H_after = 0.46 × 0.42 + 0.54 × 1.71 = 1.11 bits     │  │
│  │  Expected info gain = 1.84 - 1.11 = 0.73 bits         │  │
│  │                                                        │  │
│  │  Posterior (after positive result):                     │  │
│  │  P(vacuum_leak|+) = 0.45×0.95 / 0.46 = 0.93 → 93%    │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  4. SUPPORTING & CONTRADICTORY EVIDENCE                      │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Vacuum Leak (97%):                                    │  │
│  │  ✅ Fuel trims climb strongly with load (+10..36%)     │  │
│  │  ✅ MAF reads consistently 10-14% below derived        │  │
│  │  ✅ O2 leans out under load                            │  │
│  │  ❌ None — all signatures match                        │  │
│  │                                                        │  │
│  │  MAF Sensor Fault (2%):                                │  │
│  │  ✅ None                                               │  │
│  │  ❌ MAF tracks rpm/load smoothly (no erratic behavior) │  │
│  │  ❌ No sudden MAF jumps or dropouts                    │  │
│  │  ❌ Coefficient of variation is normal                 │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  5. INFO-GAIN RECOMMENDATION                                 │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Recommended: Smoke test (info gain: 0.42, cost: low)  │  │
│  │                                                        │  │
│  │  Test                  Gain    Cost    Rank             │  │
│  │  ────────────────────  ──────  ──────  ────             │  │
│  │  Smoke test            0.42    Low     1                │  │
│  │  MAF swap              0.38    Med     2                │  │
│  │  Fuel pressure test    0.21    Low     3                │  │
│  │  O2 log capture        0.15    Low     4                │  │
│  │  Compression test      0.08    High    5                │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  6. GATE APPROVALS                                           │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  ✅ Tier 2 — request_measurement (smoke_test)          │  │
│  │     Justification: "Discriminate vacuum leak vs MAF"   │  │
│  │     Approved: Aug 26, 3:44:12 PM (28s decision time)   │  │
│  │     Result: confirmed_leak                             │  │
│  │                                                        │  │
│  │  ✅ Tier 3 — order_part (booster_vacuum_hose_03_accord)│  │
│  │     Justification: "Repair verified, part needed"      │  │
│  │     Approved: Aug 26, 3:46:55 PM (12s decision time)   │  │
│  │     Result: Mock order placed                          │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  7. ROOT CAUSE CONCLUSION                                    │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                                                        │  │
│  │  ROOT CAUSE: Vacuum leak — cracked brake booster       │  │
│  │  vacuum supply hose at intake-manifold junction.       │  │
│  │                                                        │  │
│  │  MECHANISM: Unmetered air enters post-MAF, causing    │  │
│  │  the ECU to add fuel (+10..36% LTFT) to maintain      │  │
│  │  stoichiometry. Under load, the extra air exceeds     │  │
│  │  the ECU's correction range, causing lean misfires.   │  │
│  │                                                        │  │
│  │  CONFIRMED BY: Smoke test result = confirmed_leak     │  │
│  │  POSTERIOR: 97.0% (Bayes factor 68× vs next best)     │  │
│  │                                                        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  Generated by FaultTrace · TrueForge Agent Harness · Aug 2026 │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Report Styling Notes

- **Inline CSS only** — no external dependencies, fully self-contained
- **Dark theme** matching the dashboard (same color palette)
- **Monospace** for all data values (JetBrains Mono via Google Fonts CDN, with fallback)
- **Print-friendly** — add `@media print` rules for light theme
- **Responsive** — stacks vertically on mobile

---

## 7. Interactions & States

### 7.1 Loading States

| Component | Loading behavior |
|---|---|
| Session sidebar | Skeleton cards (3 placeholder rectangles with shimmer animation) |
| Investigation detail | Skeleton for each section, pulse animation |
| Evidence timeline | Dots appear sequentially (staggered fade-in) |
| Hypothesis cards | Bars animate from 0% to final value (500ms ease-out) |
| Info-gain matrix | Rows fade in from bottom (staggered 100ms) |

### 7.2 Empty States

| Component | Empty state message |
|---|---|
| Session sidebar (no sessions) | "No investigations yet. Start an agent run to see sessions here." |
| Investigation detail (no session selected) | "Select an investigation from the sidebar." |
| Evidence timeline (running) | "Investigation in progress..." with pulsing dot |
| Gate log (no gates) | "No gated actions in this investigation." |

### 7.3 Error States

| Scenario | Behavior |
|---|---|
| API unreachable | Toast notification: "Cannot reach TrueForge server at localhost:8790" with retry button |
| Session not found | "Session not found. It may have been deleted." |
| Turn data incomplete | Show partial data with "Some data unavailable" badge |

### 7.4 Animations

| Element | Animation |
|---|---|
| Session card select | Border-left slide-in (200ms) |
| Hypothesis bar fill | Width transition (500ms ease-out) on mount |
| Evidence expand/collapse | Height transition (200ms ease) |
| Gate approval | Green check fade-in (300ms) |
| Page transitions | Fade-in (200ms) |

---

## 8. Data Mapping

### 8.1 Session → Session Card

```
Session API response
├── id                    → card click handler
├── title                 → vehicle name (or parsed from agent instructions)
├── created_at            → timestamp display
├── agent.spec.instructions → parsed for vehicle info, DTCs, scenario name
└── turns[0].state
    ├── status            → status badge (running/done/error)
    ├── completed_at      → duration calculation
    └── metrics
        └── total_cost_in_usd → cost display
```

### 8.2 Turn Events → Evidence Timeline

```
Session events (sorted by created_at)
├── model.message (has tool_calls)
│   └── tool_calls[].function
│       ├── name              → tool name display
│       ├── arguments         → expandable input JSON
│       └── tool_info.type    → tier badge
├── tool.response
│   ├── tool_call_id          → links to parent tool_call
│   └── content               → expandable output JSON
└── turn.done
    └── state.metrics         → turn cost in CostTracker
```

### 8.3 Model Output → Hypothesis Ranking

Parse the agent's text output for:
- Hypothesis names and posterior percentages
- Prior → posterior transitions
- Bayes factors
- Supporting/contradictory evidence lines (✅/❌ prefixes)

### 8.4 Model Output → Info-Gain Matrix

Parse for:
- Test names and expected likelihoods
- Expected information gain values
- Cost classes (low/med/high)
- Recommended test (highest gain at acceptable cost)

---

## 9. Responsive Breakpoints

| Breakpoint | Layout |
|---|---|
| ≥1280px | Full layout: sidebar + main content |
| 1024px–1279px | Sidebar narrower (240px), content compresses |
| 768px–1023px | Sidebar becomes drawer (hamburger toggle) |
| <768px | Full-width single column, stacked sections |

---

## 10. Accessibility

- All interactive elements must have `aria-label` attributes
- Color is never the sole indicator (always paired with icon or text)
- Keyboard navigation: Tab through sessions, Enter to select, Escape to close drawer
- Focus indicators: 2px `accent-blue` outline on focused elements
- Screen reader: timeline events announced as "Evidence step N of M: [tool name]"

---

## 11. Figma Design Deliverables Needed

| Frame | Description |
|---|---|
| Dashboard — Empty state | No session selected, empty sidebar |
| Dashboard — Session list | 3 session cards (A, B, C) with different states |
| Dashboard — Investigation detail (Scenario A) | Full investigation view with all components |
| Dashboard — Investigation detail (Scenario B) | Alternate scenario, different hypotheses |
| Dashboard — Running state | Agent in progress, pulsing indicators |
| Dashboard — Mobile | Responsive layout at 768px |
| Report — Scenario A | Full HTML report rendered |
| Report — Scenario B | Alternate report |
| Components — All states | Button states, card states, loading skeletons |
| Color & Typography | Design tokens reference |

---

## 12. Open Questions for Design

1. **Sidebar:** Should session cards show a vehicle silhouette/icon, or just text?
2. **Hypothesis cards:** Should the bar be horizontal (as shown) or a donut/ring chart?
3. **Evidence timeline:** Vertical (as shown) or horizontal scrolling timeline?
4. **Report:** Should it have a sidebar navigation (sticky TOC) or just linear scroll?
5. **Cost tracker:** Inline in header, collapsible panel, or dedicated tab?
6. **Dark/light mode toggle:** Include in design or dark-only?
