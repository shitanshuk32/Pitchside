// Rotating match-day hooks for the 39-day World Cup window.
// Picked by tournament day index so everyone sees the same spotlight.
export const TOURNAMENT_SPOTLIGHTS = [
  {
    title: "The wait is almost over",
    hook: "48 nations. 104 matches. One trophy. Who are you backing?",
    emoji: "🌍",
  },
  {
    title: "Group stage drama",
    hook: "Every point matters — post your takes and bend a free kick for your country.",
    emoji: "⚽",
  },
  {
    title: "Knockout nerves",
    hook: "Win or go home. Share the moment when your team survives extra time.",
    emoji: "😱",
  },
  {
    title: "Late curl specialists",
    hook: "The best free kicks bend late — just like the tournament favourites.",
    emoji: "🌀",
  },
  {
    title: "Underdog hour",
    hook: "Upsets write World Cup history. Drop a chant for the team nobody expected.",
    emoji: "🐐",
  },
  {
    title: "Road to the final",
    hook: "Only a few matches left. Climb the leaderboard before the trophy is lifted.",
    emoji: "🏆",
  },
  {
    title: "Final week",
    hook: "Jersey prizes go to the top 3 — make every shot and every post count.",
    emoji: "🎽",
  },
];

export const pickSpotlight = (tournamentDay, phase) => {
  if (phase === "pre") {
    return {
      title: "Countdown to kickoff",
      hook: "Complete today's challenges and build your streak before Mexico City opens the tournament.",
      emoji: "⏳",
    };
  }
  if (phase === "post") {
    return {
      title: "Champions crowned",
      hook: "The tournament is over, but the leaderboard stays live until prizes are announced.",
      emoji: "👑",
    };
  }
  const idx = Math.max(0, tournamentDay - 1) % TOURNAMENT_SPOTLIGHTS.length;
  return TOURNAMENT_SPOTLIGHTS[idx];
};
