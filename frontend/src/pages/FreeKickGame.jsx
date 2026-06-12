import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@clerk/react";
import { api } from "../lib/api";
import { reportEngagement } from "../lib/engagement";
import "./FreeKickGame.css";

const RECHARGE_MS = 60 * 60 * 1000; // 1 hour
const MAX_ENERGY = 3;
const BALL_ORIGIN = { x: 50, y: 118 };
const BALL_R = 3.0;

// Their last World Cup — one shot each, in their honour.
const LEGENDS = [
  { name: "Messi", flag: "🇦🇷", color: "#6ca0dc" },
  { name: "Ronaldo", flag: "🇵🇹", color: "#e63946" },
  { name: "Neymar", flag: "🇧🇷", color: "#f4c430" },
];

const KEEPER_Y = 14;
const KEEPER_HW = 5.5;
const KEEPER_HH = 3;
const GOAL_LEFT = 24;
const GOAL_RIGHT = 76;
const GOAL_LINE = 11; // base of the goalmouth (where the posts meet the grass)

// Power meter (bottom-left, mirrored from the right so it isn't hidden under
// the shooting hand/thumb on phones)
const POWER_X = 5.8;
const POWER_W = 3.2;
const POWER_TOP = 86;
const POWER_H = 38;
const POWER_CYCLE_MS = 300; // faster cursor = harder to hit the sweet spot

// Sweet-spot band on the power bar (green zone).
const PWR_SWEET_LO = 0.38;
const PWR_SWEET_HI = 0.72;

const loadNum = (key) => {
  const v = parseInt(localStorage.getItem(key), 10);
  return Number.isNaN(v) ? null : v;
};

// Read the persisted game state synchronously, before the first render. Doing
// this in a mount effect (the old approach) raced with the persist effects,
// which briefly wrote the default full-energy state back to localStorage — so
// reloading or navigating away and back refilled the player's shots.
const loadSavedState = () => {
  let energy = loadNum("ffk_energy");
  let rechargeAt = loadNum("ffk_rechargeAt");
  if (energy === null) energy = MAX_ENERGY;
  if (energy <= 0 && rechargeAt && Date.now() >= rechargeAt) {
    energy = MAX_ENERGY;
    rechargeAt = null;
  }
  return {
    energy,
    rechargeAt,
    total: loadNum("ffk_total") || 0,
    synced: loadNum("ffk_synced") || 0,
  };
};

const GOAL_TOP = 4;
const POST_HW = 1.6; // post hit tolerance

const quad = (p0, p1, p2, t) => {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
};

// Regular pentagon path (used to paint the classic football panels).
const pentagon = (cx, cy, r, rotDeg) => {
  let d = "";
  for (let k = 0; k < 5; k++) {
    const a = ((-90 + rotDeg + k * 72) * Math.PI) / 180;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    d += `${k === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  return d + "Z";
};

// Central panel + five outer panels (clipped to the ball circle) = telstar look.
const BALL_PANEL_CR = BALL_R * 0.4;
const BALL_PANELS = (() => {
  const offset = BALL_R * 0.85;
  const outR = BALL_R * 0.36;
  const panels = [pentagon(0, 0, BALL_PANEL_CR, 0)];
  for (let k = 0; k < 5; k++) {
    const theta = -54 + k * 72; // edge-midpoint directions of the central pentagon
    const a = (theta * Math.PI) / 180;
    const cx = offset * Math.cos(a);
    const cy = offset * Math.sin(a);
    panels.push(pentagon(cx, cy, outR, theta + 180));
  }
  return panels;
})();

// Build a single clean curved shot from the swipe:
//  - the END of your swipe (cursor) is exactly where the ball is aimed
//  - swipe BOW (sideways) decides how much / which way it bends
const buildTrajectory = (raw, power = null) => {
  if (!raw || raw.length < 2) return null;
  const A = raw[0];
  const B = raw[raw.length - 1];

  // Endpoint sits right under your cursor (clamped to the field).
  let ex = Math.max(2, Math.min(98, B.x));
  let ey = Math.max(GOAL_TOP, B.y);
  if (ey > BALL_ORIGIN.y - 12) return null; // must aim up the pitch
  const P0 = { ...BALL_ORIGIN };
  let P2 = { x: ex, y: ey };

  // Bend comes from the gesture's own shape (independent of where you pressed),
  // normalised by swipe length so left/right feels consistent.
  const gdx = B.x - A.x;
  const gdy = B.y - A.y;
  const glen = Math.hypot(gdx, gdy) || 1;
  const gux = gdx / glen;
  const guy = gdy / glen;
  let sum = 0;
  let cnt = 0;
  const lo = Math.floor(raw.length * 0.2);
  const hi = Math.ceil(raw.length * 0.8);
  for (let i = lo; i < hi; i++) {
    const m = raw[i];
    sum += (m.x - A.x) * -guy + (m.y - A.y) * gux;
    cnt += 1;
  }
  const bowRatio = cnt ? sum / cnt / glen : 0;

  const sdx = P2.x - P0.x;
  const sdy = P2.y - P0.y;
  const sl = Math.hypot(sdx, sdy) || 1;
  let bend = Math.max(-60, Math.min(60, bowRatio * sl * 2.6));

  // Too much power = harder to control: overshoots wide / long like real free kicks.
  if (power !== null && power > PWR_SWEET_HI) {
    const excess = (power - PWR_SWEET_HI) / (1 - PWR_SWEET_HI);
    const side = P2.x - 50;
    P2 = {
      x: Math.max(1, Math.min(99, P2.x + side * excess * 0.55)),
      y: Math.max(GOAL_TOP - 0.5, P2.y - excess * 5.5),
    };
    bend *= 1 + excess * 1.1;
  }

  const sdx2 = P2.x - P0.x;
  const sdy2 = P2.y - P0.y;
  const sl2 = Math.hypot(sdx2, sdy2) || 1;
  const px2 = -sdy2 / sl2;
  const py2 = sdx2 / sl2;
  const mid = { x: (P0.x + P2.x) / 2, y: (P0.y + P2.y) / 2 };
  const P1 = { x: mid.x + px2 * bend, y: mid.y + py2 * bend };

  // The swipe sets the launch + curve, but the ball keeps its momentum and
  // flies THROUGH the cursor until it reaches the goal line (or leaves the
  // field). We extrapolate the same quadratic past t=1 so the curve continues
  // naturally instead of the ball stopping dead under the cursor.
  // aimIdx marks the cursor point (t=1) so the preview can end right there.
  const pts = [];
  const step = 1 / 48;
  const T_MAX = 4;
  let aimIdx = 0;
  let i = 0;
  for (let t = 0; t <= T_MAX + 1e-9; t += step, i++) {
    const p = quad(P0, P1, P2, t);
    pts.push(p);
    if (t <= 1 + 1e-9) aimIdx = i;
    if (t >= 1 && (p.y <= GOAL_TOP - 2 || p.x < 1 || p.x > 99)) break;
  }

  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(
      cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    );
  }
  return { pts, cum, total: cum[cum.length - 1], bend, aimIdx, aimEnd: P2 };
};

const pointAt = (tr, d) => {
  const { pts, cum, total } = tr;
  if (d <= 0) return pts[0];
  if (d >= total) return pts[pts.length - 1];
  let lo = 1;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < d) lo = mid + 1;
    else hi = mid;
  }
  const segLen = cum[lo] - cum[lo - 1] || 1;
  const f = (d - cum[lo - 1]) / segLen;
  return {
    x: pts[lo - 1].x + (pts[lo].x - pts[lo - 1].x) * f,
    y: pts[lo - 1].y + (pts[lo].y - pts[lo - 1].y) * f,
  };
};

const FreeKickGame = () => {
  // Hydrate once from localStorage before the first render (lazy initializer
  // runs exactly once per mount).
  const [saved] = useState(loadSavedState);

  const [energy, setEnergy] = useState(saved.energy);
  const [rechargeAt, setRechargeAt] = useState(saved.rechargeAt);
  const [now, setNow] = useState(Date.now());

  // aim | shooting | result | locked
  const [phase, setPhase] = useState(saved.energy > 0 ? "aim" : "locked");
  const [result, setResult] = useState(null);
  const [score, setScore] = useState(0);
  // Running total of goals across the whole tournament (persisted locally and
  // accumulated on the leaderboard), not a single best run.
  const [total, setTotal] = useState(saved.total);

  const { getToken, isSignedIn, isLoaded } = useAuth();
  // How many goals have already been counted on the server for this browser,
  // so we only ever submit the new ones (the delta).
  const syncedRef = useRef(saved.synced);
  const [synced, setSynced] = useState(false);

  // The pitch stays inert behind a "Play" overlay until the user opts in, so
  // stray touches while scrolling the page can never fire a shot.
  const [armed, setArmed] = useState(false);

  const [ball, setBall] = useState({ ...BALL_ORIGIN });
  const [spin, setSpin] = useState(0);
  const [height, setHeight] = useState(0); // visual loft: 0 = grounded
  const [keeperX, setKeeperX] = useState(50);
  const [aimActive, setAimActive] = useState(false);
  const [aimPath, setAimPath] = useState([]);
  const [power, setPower] = useState(0.5);
  const pathRef = useRef([]);
  const powerRef = useRef(0.5);
  const aimActiveRef = useRef(false);
  const aimStartRef = useRef(0);

  // Mutable refs for the animation loop
  const phaseRef = useRef(saved.energy > 0 ? "aim" : "locked");
  const energyRef = useRef(saved.energy);
  const ballRef = useRef({ ...BALL_ORIGIN });
  const trajRef = useRef(null);
  const spinRef = useRef(0);
  const heightRef = useRef(0);
  const bounceRef = useRef(null);
  const netRef = useRef(null);
  const keeperRef = useRef(50);
  const lastTRef = useRef(0);
  const resetTimerRef = useRef(null);

  const shotsTaken = MAX_ENERGY - energy;
  const currentLegend = LEGENDS[Math.min(shotsTaken, MAX_ENERGY - 1)];

  // ---- Persist energy & recharge ----
  useEffect(() => {
    energyRef.current = energy;
    localStorage.setItem("ffk_energy", String(energy));
  }, [energy]);

  useEffect(() => {
    if (rechargeAt) localStorage.setItem("ffk_rechargeAt", String(rechargeAt));
    else localStorage.removeItem("ffk_rechargeAt");
  }, [rechargeAt]);

  // ---- Tick for countdown / recharge ----
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ---- Add new goals to the global leaderboard total (signed-in only) ----
  // We submit only the delta (goals scored since the last successful sync), so
  // the server keeps an accurate running total even across reloads.
  useEffect(() => {
    if (!isSignedIn || total <= syncedRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const delta = total - syncedRef.current;
        const token = await getToken();
        await api.addGoals(delta, token);
        if (!cancelled) {
          syncedRef.current = total;
          localStorage.setItem("ffk_synced", String(total));
          setSynced(true);
        }
      } catch {
        // Network/backend down — will retry on the next goal.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [total, isSignedIn, getToken]);

  useEffect(() => {
    if (energy <= 0 && rechargeAt && now >= rechargeAt) {
      setEnergy(MAX_ENERGY);
      setRechargeAt(null);
    }
  }, [now, energy, rechargeAt]);

  // ---- When recharged while locked, go back to aim ----
  useEffect(() => {
    if (energy > 0 && phaseRef.current === "locked") {
      ballRef.current = { ...BALL_ORIGIN };
      setBall({ ...BALL_ORIGIN });
      setResult(null);
      phaseRef.current = "aim";
      setPhase("aim");
    }
  }, [energy]);

  const scheduleReset = useCallback(() => {
    resetTimerRef.current = setTimeout(() => {
      ballRef.current = { ...BALL_ORIGIN };
      trajRef.current = null;
      bounceRef.current = null;
      netRef.current = null;
      spinRef.current = 0;
      setSpin(0);
      heightRef.current = 0;
      setHeight(0);
      setBall({ ...BALL_ORIGIN });
      setResult(null);
      if (energyRef.current > 0) {
        phaseRef.current = "aim";
        setPhase("aim");
      } else {
        phaseRef.current = "locked";
        setPhase("locked");
      }
    }, 1300);
  }, []);

  const endShot = useCallback(
    (outcome) => {
      phaseRef.current = "result";
      setPhase("result");
      setResult(outcome);
      scheduleReset();
    },
    [scheduleReset]
  );

  // Goal! The ball carries past the line, nestles into the net, and we score.
  const startGoal = useCallback((b, tr) => {
    const prev = pointAt(tr, Math.max(0, tr.dist - 1.5));
    let vx = b.x - prev.x;
    let vy = b.y - prev.y;
    const vlen = Math.hypot(vx, vy) || 1;
    const sp = Math.min(tr.spd, 55) + 22; // gentle carry into the net
    netRef.current = {
      x: b.x,
      y: b.y,
      vx: (vx / vlen) * sp,
      vy: (vy / vlen) * sp,
      t: 0,
    };
    ballRef.current = { x: b.x, y: b.y };
    setBall({ x: b.x, y: b.y });
    setResult("GOAL");
    setScore((s) => s + 1);
    // Every goal adds to the lifetime tournament total.
    setTotal((t) => {
      const nt = t + 1;
      localStorage.setItem("ffk_total", String(nt));
      return nt;
    });
    phaseRef.current = "scoring";
    setPhase("scoring");
    reportEngagement("score_goal", getToken, isSignedIn);
  }, [getToken, isSignedIn]);

  // ---- Main animation loop ----
  useEffect(() => {
    let raf;
    const loop = (t) => {
      if (!lastTRef.current) lastTRef.current = t;
      const dt = Math.min((t - lastTRef.current) / 1000, 0.033);
      lastTRef.current = t;

      // Keeper patrols the goal line (slower + smaller range = more open net)
      const kx = 50 + 12 * Math.sin(t / 760);
      keeperRef.current = kx;
      setKeeperX(kx);

      // Power meter only oscillates while the player is dragging to aim;
      // it sits still otherwise so the bar isn't distracting.
      if (aimActiveRef.current) {
        const pw = (1 - Math.cos((t - aimStartRef.current) / POWER_CYCLE_MS)) / 2;
        powerRef.current = pw;
        setPower(pw);
      }

      if (phaseRef.current === "shooting" && trajRef.current) {
        const tr = trajRef.current;
        // Friction: the ball bleeds speed as it travels, so a soft shot runs
        // out of momentum and stops short instead of always reaching the goal.
        tr.spd = Math.max(0, tr.spd - tr.decel * dt);
        tr.dist += tr.spd * dt;
        const b = pointAt(tr, tr.dist);
        ballRef.current = b;

        // Spin: curve gives sideways spin, plus a little roll from raw speed.
        spinRef.current += dt * (tr.spd * 0.9 + tr.bend * 16);
        setSpin(spinRef.current);

        // Loft: powerful shots fly through the air (rise then drop back to the
        // ground by the time they reach the goal); soft shots stay grounded.
        const prog = Math.min(1, tr.dist / (tr.total || 1));
        const h = tr.loft * Math.sin(Math.PI * prog);
        heightRef.current = h;
        setHeight(h);
        const effY = b.y - h;

        let outcome = null;

        // Keeper save takes priority — he's in front of the net.
        if (
          Math.abs(b.x - keeperRef.current) < KEEPER_HW + BALL_R &&
          Math.abs(b.y - KEEPER_Y) < KEEPER_HH + BALL_R
        ) {
          outcome = "SAVED";
        }

        // Post hit -> ricochet
        if (
          !outcome &&
          b.y <= GOAL_LINE + 1 &&
          (Math.abs(b.x - GOAL_LEFT) <= POST_HW ||
            Math.abs(b.x - GOAL_RIGHT) <= POST_HW)
        ) {
          const prev = pointAt(tr, Math.max(0, tr.dist - 2));
          const tvx = b.x - prev.x;
          const fromLeft = Math.abs(b.x - GOAL_LEFT) <= POST_HW;
          const dir = (fromLeft ? -1 : 1) || (tvx > 0 ? -1 : 1);
          bounceRef.current = {
            x: b.x,
            y: b.y + 1,
            vx: dir * (25 + tr.spd * 0.25),
            vy: 20 + tr.spd * 0.15,
            t: 0,
          };
          phaseRef.current = "bouncing";
          setPhase("bouncing");
          setResult("POST");
          setBall({ x: b.x, y: b.y });
        } else {
          const betweenPosts = b.x > GOAL_LEFT && b.x < GOAL_RIGHT;
          // FIFA rule: the WHOLE ball must cross the line. Going up the pitch,
          // the trailing edge is (b.y + BALL_R); it must clear the goal line.
          const fullyCrossed = b.y + BALL_R <= GOAL_LINE;
          // Any part of the ball on or over the line, but not fully across.
          const touchingLine = !fullyCrossed && b.y - BALL_R <= GOAL_LINE;

          if (!outcome && fullyCrossed && betweenPosts) {
            // Over the bar when loft carries the ball above the crossbar.
            if (effY <= GOAL_TOP + BALL_R * 0.35) {
              setBall({ x: b.x, y: b.y });
              endShot("WIDE");
            } else {
              startGoal(b, tr);
            }
          } else {
            // Shot stopped: goal only if it fully crossed (handled above).
            // Resting on/over the line but not fully across = NO GOAL.
            if (!outcome && tr.spd <= 3) {
              outcome = betweenPosts && touchingLine ? "NOGOAL" : "MISS";
            }
            // Sailed past the goal off-target (wide or over the bar).
            if (!outcome && (b.y <= GOAL_TOP - 1.5 || b.x < 1 || b.x > 99)) {
              outcome = "WIDE";
            }
            // Reached the end of its arc without fully crossing.
            if (!outcome && tr.dist >= tr.total) {
              outcome = betweenPosts && touchingLine ? "NOGOAL" : "MISS";
            }
            setBall({ x: b.x, y: b.y });
            if (outcome) endShot(outcome);
          }
        }
      }

      // Ricochet physics after a post hit
      if (phaseRef.current === "bouncing" && bounceRef.current) {
        if (heightRef.current !== 0) {
          heightRef.current = 0;
          setHeight(0);
        }
        const bo = bounceRef.current;
        bo.t += dt;
        bo.vy += 90 * dt; // gravity pulls it back down
        bo.vx *= 0.99;
        bo.x += bo.vx * dt;
        bo.y += bo.vy * dt;
        ballRef.current = { x: bo.x, y: bo.y };
        setBall({ x: bo.x, y: bo.y });
        spinRef.current += dt * (bo.vx * 12 + 180);
        setSpin(spinRef.current);
        if (bo.y > 122 || bo.x < 1 || bo.x > 99 || bo.t > 1.2) {
          bounceRef.current = null;
          phaseRef.current = "result";
          setPhase("result");
          scheduleReset();
        }
      }

      // Goal celebration: the ball glides into the net and nestles to a stop.
      if (phaseRef.current === "scoring" && netRef.current) {
        if (heightRef.current !== 0) {
          heightRef.current = 0;
          setHeight(0);
        }
        const ns = netRef.current;
        ns.t += dt;
        const k = Math.pow(0.02, dt); // heavy drag → settles quickly
        ns.vx *= k;
        ns.vy *= k;
        ns.x += ns.vx * dt;
        ns.y += ns.vy * dt;
        // Can't pass the crossbar or the posts — it's caught by the net.
        ns.x = Math.max(GOAL_LEFT + 1.2, Math.min(GOAL_RIGHT - 1.2, ns.x));
        ns.y = Math.max(GOAL_TOP + 1.8, ns.y);
        ballRef.current = { x: ns.x, y: ns.y };
        setBall({ x: ns.x, y: ns.y });
        spinRef.current += dt * (Math.hypot(ns.vx, ns.vy) * 4 + 50);
        setSpin(spinRef.current);
        if (ns.t > 0.55) {
          netRef.current = null;
          phaseRef.current = "result";
          setPhase("result");
          scheduleReset();
        }
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, [endShot, scheduleReset, startGoal]);

  // ---- Pointer (touch + mouse) handling ----
  const svgRef = useRef(null);

  const toSvg = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 130,
    };
  };

  const onPointerDown = (e) => {
    if (!armed || phaseRef.current !== "aim") return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = toSvg(e);
    pathRef.current = [p];
    aimStartRef.current = performance.now();
    aimActiveRef.current = true;
    setAimActive(true);
    setAimPath([p]);
  };

  const onPointerMove = (e) => {
    if (!aimActive || phaseRef.current !== "aim") return;
    const p = toSvg(e);
    const arr = pathRef.current;
    const last = arr[arr.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.8) {
      arr.push(p);
      setAimPath([...arr]);
    }
  };

  const onPointerUp = () => {
    if (!aimActive || phaseRef.current !== "aim") return;
    aimActiveRef.current = false;
    setAimActive(false);
    const pw = powerRef.current;
    const tr = buildTrajectory(pathRef.current, pw);
    setAimPath([]);
    if (!tr) return; // swipe too short / not aimed upfield: no energy spent

    // Power sets launch speed; green sweet-spot is most reliable.
    tr.dist = 0;
    tr.spd = 55 + pw * 95;
    tr.decel = 36;
    tr.loft = Math.max(0, pw - 0.22) * 22;
    if (pw > PWR_SWEET_HI) {
      tr.loft *= 1 + ((pw - PWR_SWEET_HI) / (1 - PWR_SWEET_HI)) * 1.5;
    }
    tr.power = pw;
    trajRef.current = tr;

    ballRef.current = { ...BALL_ORIGIN };
    spinRef.current = 0;
    setSpin(0);
    heightRef.current = 0;
    setHeight(0);
    setBall({ ...BALL_ORIGIN });

    phaseRef.current = "shooting";
    setPhase("shooting");
    setEnergy((prev) => {
      const ne = prev - 1;
      if (ne <= 0) setRechargeAt(Date.now() + RECHARGE_MS);
      return ne;
    });
    reportEngagement("play_free_kick", getToken, isSignedIn);
  };

  const remaining = rechargeAt ? Math.max(0, rechargeAt - now) : 0;
  const mm = String(Math.floor(remaining / 60000)).padStart(2, "0");
  const ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0");

  // Live preview of the exact path the ball will trace.
  const preview =
    aimActive && phase === "aim" ? buildTrajectory(aimPath) : null;
  const curvePct = preview
    ? Math.min(100, (Math.abs(preview.bend || 0) / 50) * 100)
    : 0;

  return (
    <div className="ffk">
      <div className="ffk-hud">
        <div className="ffk-energy">
          {LEGENDS.map((lg, i) => {
            const spent = i < shotsTaken;
            const isCurrent = i === shotsTaken && energy > 0;
            return (
              <span
                key={lg.name}
                className={`ffk-pip ${spent ? "spent" : ""} ${
                  isCurrent ? "current" : ""
                }`}
                style={{ "--pip": lg.color }}
                title={lg.name}
              >
                {lg.flag}
              </span>
            );
          })}
        </div>
        <div className="ffk-lives" aria-label={`${energy} shots remaining`}>
          {Array.from({ length: MAX_ENERGY }).map((_, i) => (
            <span
              key={i}
              className={`ffk-heart ${i < energy ? "ffk-heart--on" : ""}`}
            >
              ❤️
            </span>
          ))}
        </div>
        <div className="ffk-scores">
          <span>
            Score <strong>{score}</strong>
          </span>
          <span>
            Total <strong>{total}</strong>
          </span>
        </div>
      </div>

      <div className={`ffk-stage-wrap ${result === "GOAL" ? "ffk-stage--goal" : ""}`}>
      <div className="ffk-stage">
        <svg
          ref={svgRef}
          className="ffk-pitch"
          viewBox="0 0 100 130"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="ffk-grass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4bb56e" />
              <stop offset="55%" stopColor="#36a05c" />
              <stop offset="100%" stopColor="#2a8a4e" />
            </linearGradient>
            <radialGradient id="ffk-vignette" cx="50%" cy="34%" r="78%">
              <stop offset="55%" stopColor="#000000" stopOpacity="0" />
              <stop offset="100%" stopColor="#06351f" stopOpacity="0.34" />
            </radialGradient>
            <radialGradient id="ffk-ball" cx="38%" cy="32%" r="72%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="62%" stopColor="#f3f4f6" />
              <stop offset="100%" stopColor="#c2c8cf" />
            </radialGradient>
            <clipPath id="ffk-ball-clip">
              <circle r={BALL_R} />
            </clipPath>
            {/* Goalkeeper kit — vivid orange so it pops off the green pitch */}
            <linearGradient id="ffk-kit" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffc15e" />
              <stop offset="45%" stopColor="#fb8c2a" />
              <stop offset="100%" stopColor="#e85d10" />
            </linearGradient>
            <linearGradient id="ffk-shorts" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2b3a5c" />
              <stop offset="100%" stopColor="#1b2740" />
            </linearGradient>
          </defs>

          {/* Pitch + mowing stripes */}
          <rect x="0" y="0" width="100" height="130" fill="url(#ffk-grass)" />
          {Array.from({ length: 13 }).map((_, i) => (
            <rect
              key={i}
              x="0"
              y={i * 10}
              width="100"
              height="10"
              fill={i % 2 === 0 ? "#ffffff" : "#0a4a2a"}
              opacity={i % 2 === 0 ? 0.06 : 0.08}
            />
          ))}
          <rect x="0" y="0" width="100" height="130" fill="url(#ffk-vignette)" />

          {/* Penalty box */}
          <rect x="18" y="4.6" width="64" height="30" fill="none" stroke="#ffffff" strokeWidth="0.7" opacity="0.45" />
          <path d="M34 34.6 A 16 12 0 0 0 66 34.6" fill="none" stroke="#ffffff" strokeWidth="0.7" opacity="0.45" />

          {/* Goal: net, targets, frame */}
          <g>
            <rect x={GOAL_LEFT} y="4.6" width={GOAL_RIGHT - GOAL_LEFT} height="6.4" fill="#ffffff" opacity="0.06" />
            {[28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 68, 72].map((x) => (
              <line key={`v${x}`} x1={x} y1="4.6" x2={x} y2="11" stroke="#fff" strokeWidth="0.22" opacity="0.5" />
            ))}
            {[6.2, 7.7, 9.2].map((y) => (
              <line key={`h${y}`} x1={GOAL_LEFT} y1={y} x2={GOAL_RIGHT} y2={y} stroke="#fff" strokeWidth="0.22" opacity="0.5" />
            ))}
            {/* Goal line — the whole ball must cross this to count (FIFA) */}
            <line
              x1={GOAL_LEFT}
              y1={GOAL_LINE}
              x2={GOAL_RIGHT}
              y2={GOAL_LINE}
              stroke="#ffffff"
              strokeWidth="0.35"
              opacity="0.85"
            />
            {/* frame */}
            <line x1={GOAL_LEFT} y1="4" x2={GOAL_RIGHT} y2="4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
            <line x1={GOAL_LEFT} y1="4" x2={GOAL_LEFT} y2="11" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
            <line x1={GOAL_RIGHT} y1="4" x2={GOAL_RIGHT} y2="11" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
          </g>

          {/* Keeper — ready-to-dive stance */}
          <g transform={`translate(${keeperX}, ${KEEPER_Y})`}>
            {/* ground shadow */}
            <ellipse cx="0" cy="6.4" rx="6.6" ry="1.4" fill="#000" opacity="0.2" />

            {/* legs — white socks with an orange band */}
            <rect x="-2.5" y="2.6" width="1.9" height="3.4" rx="0.8" fill="#f0f2f5" stroke="#cfd6dd" strokeWidth="0.18" />
            <rect x="0.6" y="2.6" width="1.9" height="3.4" rx="0.8" fill="#f0f2f5" stroke="#cfd6dd" strokeWidth="0.18" />
            <rect x="-2.5" y="3.4" width="1.9" height="0.7" fill="#e85d10" />
            <rect x="0.6" y="3.4" width="1.9" height="0.7" fill="#e85d10" />
            {/* boots */}
            <rect x="-2.7" y="5.6" width="2.4" height="1" rx="0.5" fill="#1b1b1b" />
            <rect x="0.4" y="5.6" width="2.4" height="1" rx="0.5" fill="#1b1b1b" />

            {/* shorts — navy with an orange side stripe */}
            <rect x="-3" y="1.2" width="6" height="2.2" rx="0.7" fill="url(#ffk-shorts)" />
            <rect x="-3" y="1.9" width="6" height="0.5" fill="#fb8c2a" opacity="0.9" />
            <line x1="0" y1="1.2" x2="0" y2="3.4" stroke="#16203a" strokeWidth="0.3" opacity="0.6" />

            {/* arms reaching out, ready to save */}
            <line x1="-2.4" y1="-1.8" x2="-6.6" y2="-2.6" stroke="url(#ffk-kit)" strokeWidth="1.9" strokeLinecap="round" />
            <line x1="2.4" y1="-1.8" x2="6.6" y2="-2.6" stroke="url(#ffk-kit)" strokeWidth="1.9" strokeLinecap="round" />

            {/* gloves — padded body with orange cuff + finger lines */}
            <g>
              <rect x="-6.4" y="-3.5" width="1.2" height="2.4" rx="0.5" fill="#e85d10" />
              <rect x="5.2" y="-3.5" width="1.2" height="2.4" rx="0.5" fill="#e85d10" />
              <rect x="-8.4" y="-3.9" width="2.6" height="2.8" rx="1" fill="#f5f7fa" stroke="#b9c2cc" strokeWidth="0.25" />
              <rect x="5.8" y="-3.9" width="2.6" height="2.8" rx="1" fill="#f5f7fa" stroke="#b9c2cc" strokeWidth="0.25" />
              <line x1="-7.1" y1="-3.9" x2="-7.1" y2="-1.1" stroke="#b9c2cc" strokeWidth="0.2" />
              <line x1="-6.4" y1="-3.9" x2="-6.4" y2="-1.1" stroke="#b9c2cc" strokeWidth="0.15" />
              <line x1="7.1" y1="-3.9" x2="7.1" y2="-1.1" stroke="#b9c2cc" strokeWidth="0.2" />
              <line x1="6.4" y1="-3.9" x2="6.4" y2="-1.1" stroke="#b9c2cc" strokeWidth="0.15" />
            </g>

            {/* torso / jersey — shaded with a soft outline so it pops */}
            <rect x="-3.1" y="-3.4" width="6.2" height="5.1" rx="1.8" fill="url(#ffk-kit)" stroke="#c24b08" strokeWidth="0.3" />
            {/* shoulder highlight */}
            <path d="M-2.5 -2.9 q2.5 -1 5 0" fill="none" stroke="#ffe0a8" strokeWidth="0.35" opacity="0.65" />
            {/* collar */}
            <path d="M-1.4 -3.3 q1.4 1.1 2.8 0" fill="none" stroke="#c24b08" strokeWidth="0.4" opacity="0.8" />
            {/* keeper number */}
            <text
              x="0"
              y="-0.4"
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="2.6"
              fontWeight="700"
              fontFamily="system-ui, sans-serif"
              fill="#fff"
              opacity="0.92"
            >
              1
            </text>

            {/* neck */}
            <rect x="-0.8" y="-4.4" width="1.6" height="1.4" rx="0.3" fill="#e8b88f" />

            {/* head + hair + face */}
            <circle cx="0" cy="-5.6" r="2.2" fill="#e8b88f" stroke="#cf9b70" strokeWidth="0.2" />
            <path d="M-2.2 -6.1 a2.2 2.2 0 0 1 4.4 0 q-2.2 -1.5 -4.4 0 z" fill="#3a2a1c" />
            <circle cx="-0.8" cy="-5.5" r="0.28" fill="#2a2018" />
            <circle cx="0.8" cy="-5.5" r="0.28" fill="#2a2018" />
            <path d="M-0.7 -4.7 q0.7 0.5 1.4 0" fill="none" stroke="#9c6b46" strokeWidth="0.22" strokeLinecap="round" />
          </g>

          {/* Live preview: the arc ends right under your cursor (aim point);
              power then decides how far past it the ball actually carries. */}
          {preview && (
            <g>
              <polyline
                points={preview.pts
                  .slice(0, preview.aimIdx + 1)
                  .map((p) => `${p.x},${p.y}`)
                  .join(" ")}
                fill="none"
                stroke={currentLegend.color}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="3 2.5"
                opacity="0.9"
              />
              <circle
                cx={preview.aimEnd.x}
                cy={preview.aimEnd.y}
                r="2"
                fill={currentLegend.color}
              />
            </g>
          )}

          {/* Ball */}
          <g>
            {/* Ground shadow stays on the pitch; it shrinks & fades as the
                ball climbs, so the gap reads as height (air vs grounded). */}
            <ellipse
              cx={ball.x + 0.5 + height * 0.08}
              cy={ball.y + BALL_R + 1}
              rx={BALL_R * 0.95 * Math.max(0.45, 1 - height * 0.03)}
              ry={BALL_R * 0.32 * Math.max(0.45, 1 - height * 0.03)}
              fill="#000"
              opacity={Math.max(0.08, 0.22 - height * 0.0075)}
            />
            {/* Lifted, slightly enlarged ball when airborne */}
            <g
              transform={`translate(${ball.x}, ${ball.y - height}) scale(${
                1 + height * 0.022
              })`}
            >
              {/* White sphere with 3D shading */}
              <circle r={BALL_R} fill="url(#ffk-ball)" stroke="#b9bfc6" strokeWidth="0.25" />
              {/* Spinning panels (rotate with curve), clipped to the ball */}
              <g transform={`rotate(${spin})`} clipPath="url(#ffk-ball-clip)">
                {BALL_PANELS.map((d, i) => (
                  <path key={i} d={d} fill="#16181d" />
                ))}
                {/* seam lines from the central panel toward the edge */}
                {[ -90, -18, 54, 126, 198 ].map((ang) => {
                  const a = (ang * Math.PI) / 180;
                  return (
                    <line
                      key={ang}
                      x1={BALL_PANEL_CR * Math.cos(a)}
                      y1={BALL_PANEL_CR * Math.sin(a)}
                      x2={BALL_R * Math.cos(a)}
                      y2={BALL_R * Math.sin(a)}
                      stroke="#3a3d44"
                      strokeWidth="0.18"
                      opacity="0.7"
                    />
                  );
                })}
              </g>
              {/* Glossy highlight (fixed light source, sits above the panels) */}
              <ellipse cx={-BALL_R * 0.34} cy={-BALL_R * 0.42} rx={BALL_R * 0.38} ry={BALL_R * 0.24} fill="#ffffff" opacity="0.35" />
            </g>
          </g>

          {/* Power meter (bottom-left) */}
          <g>
            <defs>
              <linearGradient id="ffk-power" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#f1c40f" />
                <stop offset="38%" stopColor="#f1c40f" />
                <stop offset="48%" stopColor="#2ecc71" />
                <stop offset="62%" stopColor="#2ecc71" />
                <stop offset="72%" stopColor="#e67e22" />
                <stop offset="100%" stopColor="#e74c3c" />
              </linearGradient>
            </defs>
            <rect
              x={POWER_X}
              y={POWER_TOP}
              width={POWER_W}
              height={POWER_H}
              rx="1.6"
              fill="rgba(0,0,0,0.28)"
              stroke="rgba(255,255,255,0.5)"
              strokeWidth="0.35"
            />
            {/* Sweet-spot band (green zone) */}
            <rect
              x={POWER_X}
              y={POWER_TOP + (1 - PWR_SWEET_HI) * POWER_H}
              width={POWER_W}
              height={(PWR_SWEET_HI - PWR_SWEET_LO) * POWER_H}
              rx="0.8"
              fill="rgba(46, 204, 113, 0.22)"
            />
            <rect
              x={POWER_X}
              y={POWER_TOP + (1 - power) * POWER_H}
              width={POWER_W}
              height={power * POWER_H}
              rx="1.6"
              fill="url(#ffk-power)"
            />
            {/* moving cursor marker — arrow on the inner (pitch-facing) side */}
            <g transform={`translate(0, ${POWER_TOP + (1 - power) * POWER_H})`}>
              <path
                d={`M${POWER_X + POWER_W + 2.6} 0 l-2 -1.6 0 3.2 z`}
                fill="#fff"
              />
              <line
                x1={POWER_X - 0.3}
                y1="0"
                x2={POWER_X + POWER_W + 0.3}
                y2="0"
                stroke="#fff"
                strokeWidth="0.55"
              />
            </g>
            <text
              x={POWER_X + POWER_W / 2}
              y={POWER_TOP - 2}
              textAnchor="middle"
              fontSize="3.4"
              fontWeight="700"
              fill="#fff"
            >
              PWR
            </text>
          </g>
        </svg>

        {/* Shot zone — only this area around the ball captures the aim gesture,
            so swiping anywhere else on the pitch scrolls the page normally
            instead of wasting a shot. */}
        {armed && (
          <div
            className="ffk-shotzone"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        )}

        {/* Translucent gate: the game only accepts touches after an explicit
            "Play", so scrolling past the pitch can never waste a shot. Playing
            requires an account — signed-out visitors get a sign-up CTA instead,
            so every goal is always counted toward a real leaderboard entry. */}
        {!armed && phase !== "locked" && (
          <div className="ffk-play">
            {isSignedIn ? (
              <>
                <button
                  type="button"
                  className="ffk-play-btn"
                  onClick={() => setArmed(true)}
                >
                  <span className="ffk-play-ico" aria-hidden="true">
                    ▶
                  </span>
                  Play
                </button>
                <span className="ffk-play-hint">
                  {energy} {energy === 1 ? "shot" : "shots"} ready — drag from
                  the ball to shoot
                </span>
              </>
            ) : (
              <>
                <Link
                  to="/sign-in?redirect_url=%2F"
                  className="ffk-play-btn ffk-play-btn--signin"
                >
                  <span className="ffk-play-ico" aria-hidden="true">
                    🔒
                  </span>
                  Sign in to play
                </Link>
                <span className="ffk-play-hint">
                  {isLoaded
                    ? "Free to join — every goal counts toward the jersey prize 🎽"
                    : "Loading…"}
                </span>
              </>
            )}
          </div>
        )}

        {/* Result banner */}
        {result && (
          <>
            {result === "GOAL" && (
              <div className="ffk-confetti" aria-hidden="true">
                {[...Array(12)].map((_, i) => (
                  <span
                    key={i}
                    style={{
                      left: `${10 + i * 7}%`,
                      top: "20%",
                      background: ["#fbbf24", "#7c3aed", "#22c55e", "#ef4444"][i % 4],
                      animationDelay: `${i * 0.05}s`,
                    }}
                  />
                ))}
              </div>
            )}
            <div className={`ffk-banner ffk-banner--${result.toLowerCase()}`}>
              {result === "GOAL"
                ? "GOOOOAL! ⚽"
                : result === "SAVED"
                  ? "SAVED! 🧤"
                  : result === "POST"
                    ? "OFF THE POST! 🪵"
                    : result === "WIDE"
                      ? "JUST WIDE! 😬"
                      : result === "NOGOAL"
                        ? "NO GOAL — NOT FULLY OVER! 🚫"
                        : "MISS! 😖"}
            </div>
          </>
        )}

        {/* Lock overlay */}
        {phase === "locked" && (
          <div className="ffk-lock">
            <div className="ffk-lock-title">Out of energy</div>
            <div className="ffk-lock-timer">
              Recharging in {mm}:{ss}
            </div>
            <div className="ffk-lock-note">Come back for 3 more shots ⚡</div>
          </div>
        )}

        {(aimActive || phase === "shooting") && (
          <div className="ffk-meters">
            <div className="ffk-meter">
              <div className="ffk-meter-label">Power</div>
              <div className="ffk-meter-track">
                <div
                  className="ffk-meter-fill ffk-meter-fill--power"
                  style={{ width: `${power * 100}%` }}
                />
              </div>
            </div>
            <div className="ffk-meter">
              <div className="ffk-meter-label">Curve</div>
              <div className="ffk-meter-track">
                <div
                  className="ffk-meter-fill ffk-meter-fill--curve"
                  style={{ width: `${curvePct}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
      </div>

      <div className="ffk-challenges">
        <div className="ffk-challenge">
          <span>🎯 Hit the top corner</span>
          <span className="ffk-challenge-reward">Bonus XP</span>
        </div>
        <div className="ffk-challenge">
          <span>⚽ Score 3 perfect goals</span>
          <span className="ffk-challenge-reward">Streak bonus</span>
        </div>
      </div>

      <div className="ffk-foot">
        {phase === "locked" ? (
          <span>Energy refills every hour.</span>
        ) : (
          <span>
            Drag from the ball to aim, curve your drag to bend it 🌀. Hit the{" "}
            <strong style={{ color: "#22c55e" }}>green PWR</strong> sweet spot —
            too soft or too hard sends it off.{" "}
            <strong style={{ color: currentLegend.color }}>
              {currentLegend.flag} {currentLegend.name}
            </strong>{" "}
            steps up.
          </span>
        )}
      </div>

      <div className="ffk-compete">
        {isSignedIn ? (
          <span className="ffk-compete-status">
            {synced ? "✓ Goals added to your leaderboard XP" : "Every goal earns XP on the leaderboard"}
          </span>
        ) : (
          <Link to="/sign-in" className="ffk-compete-cta">
            Sign in to compete for a free jersey 🏆
          </Link>
        )}
        <Link to="/leaderboard" className="ffk-compete-link">
          View leaderboard →
        </Link>
      </div>

      <p className="ffk-tribute">
        Their last dance 🐐 — a tribute to Messi, Ronaldo &amp; Neymar.
      </p>
    </div>
  );
};

export default FreeKickGame;
