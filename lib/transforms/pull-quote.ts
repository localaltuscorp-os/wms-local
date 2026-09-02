export interface PullQuoteInput {
  doneThisWeek: number;
  doneLastWeek: number;
  topPerformerName: string;
  topPerformerCount: number;
}

export function generatePullQuote(input: PullQuoteInput): string {
  const { doneThisWeek, doneLastWeek, topPerformerName, topPerformerCount } =
    input;

  let pctText: string;
  if (doneLastWeek === 0) {
    pctText = doneThisWeek > 0 ? "starting fresh" : "no movement yet";
  } else {
    const pct = Math.round(
      ((doneThisWeek - doneLastWeek) / doneLastWeek) * 100,
    );
    if (pct > 0) pctText = `${pct}% faster than last week's pace`;
    else if (pct < 0) pctText = `${Math.abs(pct)}% slower than last week`;
    else pctText = `matching last week's pace exactly`;
  }

  const useLeaderTemplate =
    topPerformerCount >= Math.max(8, Math.floor(doneThisWeek * 0.2));

  if (useLeaderTemplate && topPerformerName) {
    return `This week the team completed ${doneThisWeek} tasks, with ${topPerformerName} alone shipping ${topPerformerCount}.`;
  }

  return `This week the team completed ${doneThisWeek} tasks, ${pctText}.`;
}
