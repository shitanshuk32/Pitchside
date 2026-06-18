// Turn live match + standings data into short "Did you know?"-style lines so
// the app's fact tickers show what's actually happening in the tournament
// (live scores, results, goalscorers, group leaders) instead of static trivia.
// Returns [] when there's nothing real to show yet, so callers can fall back.

import { flagFor } from "./flags";

const LIVE = new Set(["IN_PLAY", "PAUSED", "HALF_TIME"]);
const DONE = new Set(["FINISHED"]);

// Label a team with its emoji flag. Works for both match team objects and
// standings team objects (which may already carry a `flag`).
const teamLabel = (team) => {
  const name = team?.shortName || team?.name || "TBD";
  const flag = team?.flag || flagFor(team?.name);
  return flag ? `${flag} ${name}` : name;
};

const nameWithFlag = (fullName) => {
  if (!fullName) return "";
  const flag = flagFor(fullName);
  return flag ? `${flag} ${fullName}` : fullName;
};

// Facts from today's / live matches: live scores, final results, goalscorers.
const matchFacts = (matches) => {
  const live = [];
  const goals = [];
  const results = [];

  if (!Array.isArray(matches)) return { live, goals, results };

  for (const m of matches) {
    const home = m.homeTeam;
    const away = m.awayTeam;
    const hs = m.score?.home;
    const as = m.score?.away;
    const hasScore =
      hs !== null && hs !== undefined && as !== null && as !== undefined;

    if (LIVE.has(m.status) && hasScore) {
      const min = m.minute != null ? `${m.minute}'` : "LIVE";
      live.push(
        `🔴 LIVE (${min}): ${teamLabel(home)} ${hs}–${as} ${teamLabel(away)}.`
      );
    } else if (DONE.has(m.status) && hasScore) {
      if (hs > as) {
        results.push(`✅ ${teamLabel(home)} beat ${teamLabel(away)} ${hs}–${as}.`);
      } else if (as > hs) {
        results.push(`✅ ${teamLabel(away)} beat ${teamLabel(home)} ${as}–${hs}.`);
      } else {
        results.push(
          `🤝 ${teamLabel(home)} and ${teamLabel(away)} drew ${hs}–${as}.`
        );
      }
    }

    // Goalscorers (latest first reads better in a ticker).
    const scored = Array.isArray(m.goals) ? [...m.goals].reverse() : [];
    for (const g of scored) {
      if (!g?.scorer) continue;
      const min = g.minute != null ? ` ${g.minute}'` : "";
      const team = g.team ? ` for ${nameWithFlag(g.team)}` : "";
      goals.push(`⚽ ${g.scorer} scored${min}${team}.`);
    }
  }

  return { live, goals, results };
};

// Facts from the live group tables: who's topping each group, who's scoring.
const standingsFacts = (standings) => {
  const out = [];
  if (!Array.isArray(standings)) return out;

  const groups = standings.filter(
    (s) => s.type === "TOTAL" || (s.table && s.table.length > 0)
  );

  let bestAttack = null;

  for (const g of groups) {
    const table = g.table || [];
    const leader = table[0];
    if (leader?.team && (leader.playedGames || 0) > 0) {
      const groupName = g.group
        ? `Group ${g.group.replace("GROUP_", "")}`
        : "their group";
      out.push(
        `🥇 ${teamLabel(leader.team)} top ${groupName} with ${leader.points} pts.`
      );
    }
    for (const t of table) {
      if ((t.playedGames || 0) === 0) continue;
      if (!bestAttack || (t.goalsFor || 0) > (bestAttack.goalsFor || 0)) {
        bestAttack = t;
      }
    }
  }

  if (bestAttack?.team && (bestAttack.goalsFor || 0) > 0) {
    out.push(
      `🔥 ${teamLabel(bestAttack.team)} have the tournament's sharpest attack — ${bestAttack.goalsFor} goals.`
    );
  }

  return out;
};

// Combine everything, most "happening now" first, de-duped and capped.
export const buildLiveFacts = (matches, standings) => {
  const { live, goals, results } = matchFacts(matches);
  const table = standingsFacts(standings);
  const all = [...live, ...goals, ...results, ...table];
  return [...new Set(all)].slice(0, 10);
};
