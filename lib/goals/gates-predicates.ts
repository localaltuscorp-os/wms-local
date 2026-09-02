import "server-only";

/**
 * SHARED re-export surface for the goals gate predicates. The GATES slice imports
 * BOTH predicates from here so it has a single import site, while the COMMIT and
 * APPROVE slices each own their own implementation file (no merge collision):
 *   - `weekCommitSatisfied`   → lib/goals/predicate-commit.ts   (COMMIT slice)
 *   - `managerApproveSatisfied` → lib/goals/predicate-approve.ts (APPROVE slice)
 * Both fail OPEN (return true) until their slice fills them in.
 */
export { weekCommitSatisfied } from "./predicate-commit";
export { managerApproveSatisfied } from "./predicate-approve";
