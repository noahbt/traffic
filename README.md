# Traffic Simulation

A browser-based, top-down four-direction intersection simulation built with React and Vite.

## Features

- Four-direction traffic: eastbound, westbound, southbound, northbound
- Six-phase signal cycle with all-red clearance:
  - East-West Green
  - East-West Yellow
  - All Red (clearance)
  - North-South Green
  - North-South Yellow
  - All Red (clearance)
- Yellow logic requires full intersection clearance before red (rear bumper + safety buffer)
- Constant car speed with lane-specific follow gaps (tighter on EW)
- Cars stop slightly before stop markers (stop-line buffer)
- Top-down car rendering and intersection visualization
- Live stats for waiting cars, passed cars, and active cars
- Controls for pause/resume, next phase, and simulation speed

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Start the development server:

```bash
npm run dev
```

3. Build for production:

```bash
npm run build
```

4. Preview the production build:

```bash
npm run preview
```

## Notes

- The main simulation logic is in `src/App.jsx`.
- Styling is in `src/App.css` and `src/index.css`.

## Copilot Resume Notes

Use this section as the source of truth when resuming work.

### Simulation Model

- App state machine and lane movement logic live in `src/App.jsx`.
- Signal timeline uses the `PHASES` array and `NEXT_PHASE_KEY` map.
- Current durations:
	- Green: `7000ms`
	- Yellow: `3500ms`
	- All-red clearance: `50%` of yellow (`1750ms`)
- Car motion uses fixed-step updates (`MOTION_TICK_MS = 16`) with visual smoothing.
- Car speed is constant (`CAR_SPEED = 14`).
- Following distance is lane-specific:
	- Base follow gap: `FOLLOW_GAP = CAR_LENGTH`
	- East/West multiplier: `EW_FOLLOW_GAP_MULTIPLIER = 0.5`
	- North/South uses base gap.

### Spawn Model

- Spawn tick: every `700ms`.
- Total active-car cap: `40`.
- Spawn tries all four lanes each tick in fixed lane order:
	- `eastbound`, `westbound`, `southbound`, `northbound`
- Per-lane cap: `MAX_PER_LANE = 12` (defined in spawn effect).

### Safety Logic

- On red, cars stop at lane stop lines.
- On yellow, a car proceeds only if it can clear the entire intersection before red.
- Clearance uses rear-bumper-inclusive logic plus a caution margin:
	- `YELLOW_CLEARANCE_BUFFER = CAR_LENGTH * 0.75`
- Cars stop a bit before the line:
	- `STOP_LINE_BUFFER = 1.2`

### Geometry References

- Horizontal road spans `34%` to `66%` (middle divider at `50%`).
- Vertical road spans `34%` to `66%` (middle divider at `50%`).
- East/West lane marker lines:
	- Westbound lane line: `40%`
	- Eastbound lane line: `60%`
- East/West car centers:
	- Westbound track center: `45%`
	- Eastbound track center: `55%`
- North/South lane marker lines:
	- Southbound lane line: `40%`
	- Northbound lane line: `60%`
- North/South car centers:
	- Southbound track center: `45%`
	- Northbound track center: `55%`

### Signal Heads and Placement

- Dashboard heads are vertical stacks.
- Roadside heads are orientation-aware:
	- East/West approaches: vertical
	- North/South approaches: horizontal
- Horizontal lamp width is `26px` (`.light-stack-horizontal .lamp`).
- Roadside heads are centered by transform and currently scaled to `0.9` for tuned placement.
- Current approach head anchors:
	- EW east: `top 58%`, `left 69%`
	- EW west: `top 42%`, `left 31%`
	- NS north: `top 30%`, `left 56%`
	- NS south: `top 70%`, `left 44%`

### Visual/UX Decisions

- Page layout is split:
	- Top row: header card
	- Second row: left stack of control/info cards and right intersection panel
- Yellow center divider lines are clipped so they do not pass through the intersection core.
- Direction labels were manually tuned by percentage in `src/App.css`.

### Files To Edit First

- Behavior and timing: `src/App.jsx`
- Road geometry and placement: `src/App.css`
- Global theme/base styles: `src/index.css`

### Quick Resume Checklist

- Run `npm run dev` for local testing.
- If changing logic, validate with `npm run lint` and `npm run build`.
- Keep lane geometry changes synchronized across:
  - lane lines,
  - car tracks,
  - stop lines,
  - signal placements,
  - direction labels.
