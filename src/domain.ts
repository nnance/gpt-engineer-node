import { AI } from "./ai";
import { DBs } from "./db";

export type Step = (ai: AI, dbs: DBs) => Array<Record<string, any>>;
