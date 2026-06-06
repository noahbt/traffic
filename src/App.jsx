import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import './App.css'

const YELLOW_DURATION_MS = 3500
const ALL_RED_DURATION_MS = Math.round(YELLOW_DURATION_MS * 0.5)

const PHASES = [
  { key: 'ew_green', label: 'East-West Green', durationMs: 7000 },
  { key: 'ew_yellow', label: 'East-West Yellow', durationMs: YELLOW_DURATION_MS },
  { key: 'all_red_to_ns', label: 'All Red (Clearance)', durationMs: ALL_RED_DURATION_MS },
  { key: 'ns_green', label: 'North-South Green', durationMs: 7000 },
  { key: 'ns_yellow', label: 'North-South Yellow', durationMs: YELLOW_DURATION_MS },
  { key: 'all_red_to_ew', label: 'All Red (Clearance)', durationMs: ALL_RED_DURATION_MS },
]

const PHASE_BY_KEY = Object.fromEntries(PHASES.map((phase) => [phase.key, phase]))
const NEXT_PHASE_KEY = {
  ew_green: 'ew_yellow',
  ew_yellow: 'all_red_to_ns',
  all_red_to_ns: 'ns_green',
  ns_green: 'ns_yellow',
  ns_yellow: 'all_red_to_ew',
  all_red_to_ew: 'ew_green',
}

const CAR_COLORS = ['#3f88c5', '#f49d37', '#d7263d', '#2f9c95', '#6a4c93']
const CAR_LENGTH = 6.5
const FOLLOW_GAP = CAR_LENGTH
const EW_FOLLOW_GAP_MULTIPLIER = 0.5
const CAR_SPEED = 14
const RENDER_SMOOTHING = 0.35
const MOTION_TICK_MS = 16
const INTERSECTION_MIN = 33
const INTERSECTION_MAX = 67
const YELLOW_CLEARANCE_BUFFER = CAR_LENGTH * 0.75
const STOP_LINE_BUFFER = 1.2
const CAR_X_HALF_HEIGHT_PX = 12
const CAR_Y_HALF_WIDTH_PX = 12

const LANES = {
  eastbound: {
    key: 'eastbound',
    label: 'Eastbound',
    axis: 'x',
    direction: 1,
    signalGroup: 'ew',
    spawnPos: -10,
    stopLine: 33,
    despawnPos: 104,
    track: 55,
  },
  westbound: {
    key: 'westbound',
    label: 'Westbound',
    axis: 'x',
    direction: -1,
    signalGroup: 'ew',
    spawnPos: 102,
    stopLine: 67,
    despawnPos: -12,
    track: 45,
  },
  southbound: {
    key: 'southbound',
    label: 'Southbound',
    axis: 'y',
    direction: 1,
    signalGroup: 'ns',
    spawnPos: -10,
    stopLine: 33,
    despawnPos: 104,
    track: 45,
  },
  northbound: {
    key: 'northbound',
    label: 'Northbound',
    axis: 'y',
    direction: -1,
    signalGroup: 'ns',
    spawnPos: 102,
    stopLine: 67,
    despawnPos: -12,
    track: 55,
  },
}

const LANE_ORDER = ['eastbound', 'westbound', 'southbound', 'northbound']

function signalReducer(state, action) {
  if (action.type === 'tick') {
    const nextElapsed = state.phaseElapsedMs + action.deltaMs
    const currentDuration = PHASE_BY_KEY[state.phaseKey].durationMs

    if (nextElapsed >= currentDuration) {
      return {
        phaseKey: NEXT_PHASE_KEY[state.phaseKey],
        phaseElapsedMs: 0,
      }
    }

    return {
      ...state,
      phaseElapsedMs: nextElapsed,
    }
  }

  if (action.type === 'nextPhase') {
    return {
      phaseKey: NEXT_PHASE_KEY[state.phaseKey],
      phaseElapsedMs: 0,
    }
  }

  return state
}

function getSignalColor(phaseKey, signalGroup) {
  if (signalGroup === 'ew') {
    if (phaseKey === 'ew_green') {
      return 'green'
    }
    if (phaseKey === 'ew_yellow') {
      return 'yellow'
    }
    return 'red'
  }

  if (phaseKey === 'ns_green') {
    return 'green'
  }
  if (phaseKey === 'ns_yellow') {
    return 'yellow'
  }
  return 'red'
}

function updateLaneCars(
  carsInLane,
  lane,
  signalColor,
  yellowRemainingMs,
  speedMultiplier,
  tickMs,
) {
  const laneFollowGap =
    lane.signalGroup === 'ew' ? FOLLOW_GAP * EW_FOLLOW_GAP_MULTIPLIER : FOLLOW_GAP

  const ordered = [...carsInLane].sort((a, b) => {
    if (lane.direction === 1) {
      return b.pos - a.pos
    }
    return a.pos - b.pos
  })

  const moved = []

  ordered.forEach((car) => {
    const step = car.speed * (tickMs / 1000) * speedMultiplier
    const desiredPos = car.pos + lane.direction * step
    const frontPos = lane.direction === 1 ? car.pos + CAR_LENGTH : car.pos
    const isBehindStopLine =
      lane.direction === 1 ? frontPos <= lane.stopLine : frontPos >= lane.stopLine
    const distanceToClearIntersection =
      lane.direction === 1
        ? Math.max(0, INTERSECTION_MAX + YELLOW_CLEARANCE_BUFFER - car.pos)
        : Math.max(
            0,
            car.pos + CAR_LENGTH - (INTERSECTION_MIN - YELLOW_CLEARANCE_BUFFER),
          )
    const canClearIntersectionOnYellow =
      (distanceToClearIntersection / (car.speed * speedMultiplier)) * 1000 <=
      yellowRemainingMs

    let lowerBound = -Infinity
    let upperBound = Infinity

    if (signalColor === 'red' && isBehindStopLine) {
      if (lane.direction === 1) {
        upperBound = lane.stopLine - CAR_LENGTH - STOP_LINE_BUFFER
      } else {
        lowerBound = lane.stopLine + STOP_LINE_BUFFER
      }
    }

    if (signalColor === 'yellow' && isBehindStopLine && !canClearIntersectionOnYellow) {
      if (lane.direction === 1) {
        upperBound = lane.stopLine - CAR_LENGTH - STOP_LINE_BUFFER
      } else {
        lowerBound = lane.stopLine + STOP_LINE_BUFFER
      }
    }

    const leadCar = moved[moved.length - 1]
    if (leadCar) {
      if (lane.direction === 1) {
        upperBound = Math.min(upperBound, leadCar.pos - laneFollowGap - CAR_LENGTH)
      } else {
        lowerBound = Math.max(lowerBound, leadCar.pos + CAR_LENGTH + laneFollowGap)
      }
    }

    let nextPos
    let waiting

    if (lane.direction === 1) {
      const bounded = Math.min(desiredPos, upperBound)
      nextPos = Math.max(car.pos, bounded)
      waiting = nextPos + 0.001 < desiredPos
    } else {
      const bounded = Math.max(desiredPos, lowerBound)
      nextPos = Math.min(car.pos, bounded)
      waiting = nextPos - 0.001 > desiredPos
    }

    const currentDisplayPos = car.displayPos ?? car.pos
    const smoothedDisplayPos =
      currentDisplayPos + (nextPos - currentDisplayPos) * RENDER_SMOOTHING

    moved.push({
      ...car,
      pos: nextPos,
      displayPos: smoothedDisplayPos,
      waiting,
    })
  })

  return moved
}

function LightStack({ color, className, ariaLabel, orientation = 'vertical' }) {
  const orientationClass =
    orientation === 'horizontal' ? 'light-stack-horizontal' : 'light-stack-vertical'

  return (
    <div className={`${className} light-stack ${orientationClass}`} role="img" aria-label={ariaLabel}>
      <span className={`lamp lamp-red ${color === 'red' ? 'is-on' : ''}`} />
      <span className={`lamp lamp-yellow ${color === 'yellow' ? 'is-on' : ''}`} />
      <span className={`lamp lamp-green ${color === 'green' ? 'is-on' : ''}`} />
    </div>
  )
}

function App() {
  const [running, setRunning] = useState(true)
  const [{ phaseKey, phaseElapsedMs }, dispatchSignal] = useReducer(signalReducer, {
    phaseKey: 'ew_green',
    phaseElapsedMs: 0,
  })
  const [cars, setCars] = useState([])
  const [passedCars, setPassedCars] = useState(0)
  const [speedMultiplier, setSpeedMultiplier] = useState(1)

  const nextCarId = useRef(1)

  const phase = PHASE_BY_KEY[phaseKey]
  const nextPhaseLabel = PHASE_BY_KEY[NEXT_PHASE_KEY[phaseKey]].label
  const ewSignalColor = getSignalColor(phaseKey, 'ew')
  const nsSignalColor = getSignalColor(phaseKey, 'ns')
  const yellowRemainingMs = phase.key.includes('yellow')
    ? Math.max(0, phase.durationMs - phaseElapsedMs)
    : 0

  const waitingCars = useMemo(() => cars.filter((car) => car.waiting).length, [cars])
  const waitingByGroup = useMemo(() => {
    return cars.reduce(
      (acc, car) => {
        const lane = LANES[car.laneKey]
        if (car.waiting && lane.signalGroup === 'ew') {
          acc.ew += 1
        }
        if (car.waiting && lane.signalGroup === 'ns') {
          acc.ns += 1
        }
        return acc
      },
      { ew: 0, ns: 0 },
    )
  }, [cars])

  useEffect(() => {
    if (!running) {
      return undefined
    }

    const timerId = window.setInterval(() => {
      dispatchSignal({
        type: 'tick',
        deltaMs: 100 * speedMultiplier,
      })
    }, 100)

    return () => window.clearInterval(timerId)
  }, [running, speedMultiplier])

  useEffect(() => {
    if (!running) {
      return undefined
    }

    const spawnId = window.setInterval(() => {
      setCars((current) => {
        if (current.length > 40) {
          return current
        }

        const laneCounts = current.reduce(
          (acc, car) => {
            acc[car.laneKey] += 1
            return acc
          },
          {
            eastbound: 0,
            westbound: 0,
            southbound: 0,
            northbound: 0,
          },
        )

        const queuedAdds = []
        const MAX_PER_LANE = 12

        LANE_ORDER.forEach((laneKey) => {
          if (laneCounts[laneKey] >= MAX_PER_LANE) {
            return
          }

          if (current.length + queuedAdds.length >= 40) {
            return
          }

          const id = nextCarId.current
          nextCarId.current += 1
          const lane = LANES[laneKey]

          queuedAdds.push({
            id,
            pos: lane.spawnPos,
            displayPos: lane.spawnPos,
            laneKey,
            speed: CAR_SPEED,
            color: CAR_COLORS[id % CAR_COLORS.length],
            waiting: false,
          })
        })

        if (queuedAdds.length === 0) {
          return current
        }

        return [...current, ...queuedAdds]
      })
    }, 700)

    return () => window.clearInterval(spawnId)
  }, [running])

  useEffect(() => {
    if (!running) {
      return undefined
    }

    const motionId = window.setInterval(() => {
      setCars((current) => {
        const updatedByLane = Object.values(LANES).flatMap((lane) => {
          const laneCars = current.filter((car) => car.laneKey === lane.key)
          const signalColor = lane.signalGroup === 'ew' ? ewSignalColor : nsSignalColor

          return updateLaneCars(
            laneCars,
            lane,
            signalColor,
            yellowRemainingMs,
            speedMultiplier,
            MOTION_TICK_MS,
          )
        })

        let carsThatPassed = 0
        const next = updatedByLane.filter((car) => {
          const lane = LANES[car.laneKey]

          if (lane.direction === 1 && car.pos > lane.despawnPos) {
            carsThatPassed += 1
            return false
          }

          if (lane.direction === -1 && car.pos < lane.despawnPos) {
            carsThatPassed += 1
            return false
          }

          return true
        })

        if (carsThatPassed > 0) {
          setPassedCars((count) => count + carsThatPassed)
        }

        return next
      })
    }, MOTION_TICK_MS)

    return () => window.clearInterval(motionId)
  }, [ewSignalColor, nsSignalColor, running, speedMultiplier, yellowRemainingMs])

  const progress = Math.min(100, (phaseElapsedMs / phase.durationMs) * 100)

  const goToNextPhase = () => {
    dispatchSignal({ type: 'nextPhase' })
  }

  return (
    <main className="scene">
      <header className="scene-header">
        <p className="eyebrow">Interactive Simulation</p>
        <h1>Traffic Control Studio - Intersection</h1>
        <p className="lead">
          Two crossing roads with one lane in each direction. Signal phases alternate
          East-West and North-South right of way.
        </p>
      </header>

      <section className="scene-body" aria-label="Traffic simulation layout">
        <section className="dashboard" aria-label="Traffic dashboard">
          <div className="signal-card">
            <h2>Signal</h2>
            <div className="signal-duo">
              <div>
                <p className="signal-title">East-West</p>
                <LightStack
                  color={ewSignalColor}
                  className="signal-body"
                  ariaLabel={`East-West light is ${ewSignalColor}`}
                />
              </div>
              <div>
                <p className="signal-title">North-South</p>
                <LightStack
                  color={nsSignalColor}
                  className="signal-body"
                  ariaLabel={`North-South light is ${nsSignalColor}`}
                />
              </div>
            </div>
            <p className="phase-label">Current: {phase.label}</p>
            <p className="phase-cycle">Next phase: {nextPhaseLabel}</p>
            <div className="progress-track" aria-hidden="true">
              <span className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="stats-card">
            <h2>Flow Stats</h2>
            <p>
              Waiting total <strong>{waitingCars}</strong>
            </p>
            <p>
              Waiting East-West <strong>{waitingByGroup.ew}</strong>
            </p>
            <p>
              Waiting North-South <strong>{waitingByGroup.ns}</strong>
            </p>
            <p>
              Cars passed <strong>{passedCars}</strong>
            </p>
            <p>
              Active cars <strong>{cars.length}</strong>
            </p>
          </div>

          <div className="controls-card">
            <h2>Controls</h2>
            <div className="control-row">
              <button type="button" onClick={() => setRunning((value) => !value)}>
                {running ? 'Pause Simulation' : 'Resume Simulation'}
              </button>
              <button type="button" className="ghost" onClick={goToNextPhase}>
                Next Phase
              </button>
            </div>
            <label htmlFor="speed">Simulation speed</label>
            <select
              id="speed"
              value={speedMultiplier}
              onChange={(event) => setSpeedMultiplier(Number(event.target.value))}
            >
              <option value={0.5}>0.5x</option>
              <option value={1}>1x</option>
              <option value={1.5}>1.5x</option>
              <option value={2}>2x</option>
            </select>
          </div>
        </section>

        <section className="road-stage" aria-label="Road simulation">
        <div className="road-horizontal" aria-hidden="true" />
        <div className="road-vertical" aria-hidden="true" />
        <div className="intersection-core" aria-hidden="true" />

        <div className="divider divider-horizontal" aria-hidden="true" />
        <div className="divider divider-vertical" aria-hidden="true" />

        <div className="lane lane-eastbound" aria-hidden="true" />
        <div className="lane lane-westbound" aria-hidden="true" />
        <div className="lane lane-southbound" aria-hidden="true" />
        <div className="lane lane-northbound" aria-hidden="true" />

        <div className="lane-arrow lane-arrow-east" aria-hidden="true">
          EAST
        </div>
        <div className="lane-arrow lane-arrow-west" aria-hidden="true">
          WEST
        </div>
        <div className="lane-arrow lane-arrow-south" aria-hidden="true">
          SOUTH
        </div>
        <div className="lane-arrow lane-arrow-north" aria-hidden="true">
          NORTH
        </div>

        <div className="stop-line stop-line-east" aria-hidden="true" />
        <div className="stop-line stop-line-west" aria-hidden="true" />
        <div className="stop-line stop-line-south" aria-hidden="true" />
        <div className="stop-line stop-line-north" aria-hidden="true" />

        <LightStack
          color={ewSignalColor}
          className="road-signal road-signal-ew-east"
          ariaLabel={`Eastbound far-side light is ${ewSignalColor}`}
          orientation="vertical"
        />
        <LightStack
          color={ewSignalColor}
          className="road-signal road-signal-ew-west"
          ariaLabel={`Westbound far-side light is ${ewSignalColor}`}
          orientation="vertical"
        />
        <LightStack
          color={nsSignalColor}
          className="road-signal road-signal-ns-south"
          ariaLabel={`Southbound far-side light is ${nsSignalColor}`}
          orientation="horizontal"
        />
        <LightStack
          color={nsSignalColor}
          className="road-signal road-signal-ns-north"
          ariaLabel={`Northbound far-side light is ${nsSignalColor}`}
          orientation="horizontal"
        />

        {cars.map((car) => {
          const lane = LANES[car.laneKey]
          const baseStyle = { backgroundColor: car.color }
          const motionStyle =
            lane.axis === 'x'
              ? {
                  ...baseStyle,
                  left: `${car.displayPos ?? car.pos}%`,
                  top: `calc(${lane.track}% - ${CAR_X_HALF_HEIGHT_PX}px)`,
                }
              : {
                  ...baseStyle,
                  top: `${car.displayPos ?? car.pos}%`,
                  left: `calc(${lane.track}% - ${CAR_Y_HALF_WIDTH_PX}px)`,
                }

          return (
            <article
              key={car.id}
              className={`car car-${lane.axis} ${car.waiting ? 'car-waiting' : ''}`}
              style={motionStyle}
            >
              <span className="car-roof" />
            </article>
          )
        })}
        </section>
      </section>
    </main>
  )
}

export default App
