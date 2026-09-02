import TasksLoading from "../tasks/loading";

// /archived shares the same chrome as /tasks (filter bar + KPI strip +
// table), so we re-export the same skeleton instead of duplicating the
// markup. Keeps the two routes visually consistent during navigation.
export default TasksLoading;
