import * as fs from "fs";
import * as path from "path";

export class DB {
  path: string;

  constructor(path: string) {
    this.path = path;
    fs.mkdirSync(path, { recursive: true });
  }

  contains(key: string): boolean {
    return fs.existsSync(path.join(this.path, key));
  }

  get(key: string): string {
    const fullPath = path.join(this.path, key);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File '${key}' could not be found in '${this.path}'`);
    }

    return fs.readFileSync(fullPath, "utf-8");
  }

  set(key: string, val: string): void {
    const fullPath = path.join(this.path, key);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, val, "utf-8");
  }

  getItem(key: string, defaultVal: string | null = null): string | null {
    try {
      return this.get(key);
    } catch (error) {
      return defaultVal;
    }
  }
}

export class DBs {
  memory: DB;
  logs: DB;
  preprompts: DB;
  input: DB;
  workspace: DB;

  constructor(memory: DB, logs: DB, preprompts: DB, input: DB, workspace: DB) {
    this.memory = memory;
    this.logs = logs;
    this.preprompts = preprompts;
    this.input = input;
    this.workspace = workspace;
  }
}
