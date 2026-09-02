/**
 * Profile v2 — achievement badge definitions.
 *
 * 12 badges across 5 categories. Definitions live in code so admins
 * don't have to seed them via SQL — but earned rows live in
 * `achievements_earned` so we can query "who has X".
 *
 * Each definition exposes a pure `evaluate(stats)` predicate that
 * decides earned/in-progress status from a snapshot of the user's
 * activity. The evaluator (`lib/achievements/evaluate.ts`) computes
 * the snapshot ONCE per user and runs all 12 predicates against it.
 */

export type AchievementCategory =
  | "velocity"
  | "quality"
  | "reliability"
  | "documentation"
  | "helpfulness";

export interface UserActivitySnapshot {
  tasksDoneLifetime: number;
  tasksDoneThisWeek: number;
  tasksDoneThisMonth: number;
  onTimeRate: number;          // 0..1
  avgResponseMinutes: number;  // first comment after assignment
  currentStreakDays: number;
  documentsUploaded: number;
  commentsWritten: number;
  longestStreakDays: number;
}

export interface AchievementProgress {
  current: number;
  target: number;
}

export interface AchievementEvaluation {
  earned: boolean;
  progress: AchievementProgress;
}

export interface AchievementDefinition {
  key: string;
  name: string;
  description: string;
  icon: string;                // single emoji glyph; renders inline
  category: AchievementCategory;
  evaluate: (s: UserActivitySnapshot) => AchievementEvaluation;
}

function tier(
  current: number,
  target: number,
): AchievementEvaluation {
  return {
    earned: current >= target,
    progress: { current: Math.min(current, target), target },
  };
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  // Velocity
  {
    key: "first_steps",
    name: "First Steps",
    description: "Complete your first task",
    icon: "🌱",
    category: "velocity",
    evaluate: (s) => tier(s.tasksDoneLifetime, 1),
  },
  {
    key: "centurion",
    name: "Centurion",
    description: "Complete 100 tasks lifetime",
    icon: "💯",
    category: "velocity",
    evaluate: (s) => tier(s.tasksDoneLifetime, 100),
  },
  {
    key: "marathoner",
    name: "Marathoner",
    description: "Complete 500 tasks lifetime",
    icon: "🏆",
    category: "velocity",
    evaluate: (s) => tier(s.tasksDoneLifetime, 500),
  },

  // Quality
  {
    key: "on_time_streak",
    name: "On-Time Hero",
    description: "Maintain ≥ 90% on-time completion over 50+ tasks",
    icon: "⏱️",
    category: "quality",
    evaluate: (s) =>
      s.tasksDoneLifetime >= 50 && s.onTimeRate >= 0.9
        ? { earned: true, progress: { current: 1, target: 1 } }
        : {
            earned: false,
            progress: {
              current: Math.round(s.onTimeRate * 100),
              target: 90,
            },
          },
  },
  {
    key: "perfectionist",
    name: "Perfectionist",
    description: "10 consecutive tasks completed on-time",
    icon: "✨",
    category: "quality",
    evaluate: (s) =>
      s.onTimeRate >= 0.95 && s.tasksDoneLifetime >= 10
        ? { earned: true, progress: { current: 10, target: 10 } }
        : {
            earned: false,
            progress: {
              current: Math.min(s.tasksDoneLifetime, 10),
              target: 10,
            },
          },
  },

  // Reliability
  {
    key: "week_streak",
    name: "Steady Week",
    description: "7-day completion streak",
    icon: "🔥",
    category: "reliability",
    evaluate: (s) => tier(s.longestStreakDays, 7),
  },
  {
    key: "month_streak",
    name: "Month-long Discipline",
    description: "30-day completion streak",
    icon: "📅",
    category: "reliability",
    evaluate: (s) => tier(s.longestStreakDays, 30),
  },
  {
    key: "early_bird",
    name: "Early Bird",
    description: "Respond to assignments within 30 minutes on average",
    icon: "🌅",
    category: "reliability",
    evaluate: (s) =>
      s.tasksDoneLifetime >= 20 && s.avgResponseMinutes <= 30
        ? { earned: true, progress: { current: 1, target: 1 } }
        : {
            earned: false,
            progress: {
              current: Math.max(0, 60 - Math.round(s.avgResponseMinutes)),
              target: 30,
            },
          },
  },

  // Documentation
  {
    key: "librarian",
    name: "Librarian",
    description: "Upload 25 documents",
    icon: "📚",
    category: "documentation",
    evaluate: (s) => tier(s.documentsUploaded, 25),
  },
  {
    key: "archivist",
    name: "Archivist",
    description: "Upload 100 documents",
    icon: "🗄️",
    category: "documentation",
    evaluate: (s) => tier(s.documentsUploaded, 100),
  },

  // Helpfulness
  {
    key: "conversationalist",
    name: "Conversationalist",
    description: "Write 100 comments",
    icon: "💬",
    category: "helpfulness",
    evaluate: (s) => tier(s.commentsWritten, 100),
  },
  {
    key: "mentor",
    name: "Mentor",
    description: "Write 500 comments",
    icon: "🤝",
    category: "helpfulness",
    evaluate: (s) => tier(s.commentsWritten, 500),
  },
];

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  velocity: "Velocity",
  quality: "Quality",
  reliability: "Reliability",
  documentation: "Documentation",
  helpfulness: "Helpfulness",
};
