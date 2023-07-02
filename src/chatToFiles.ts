import { DB } from "./db";

export function parseChat(chat: string): [string, string][] {
  const regex = /(\S+)\n\s*```[^\n]*\n(.+?)```/gs;
  const matches = chat.matchAll(regex);

  const files: [string, string][] = [];
  for (const match of matches) {
    let path = match[1];

    path = path.replace(/[<>"|?*]/g, "");
    path = path.replace(/^\[(.*)\]$/, "$1");
    path = path.replace(/^`(.*)`$/, "$1");
    path = path.replace(/\]$/, "");

    const code = match[2];
    files.push([path, code]);
  }

  const readme = chat.split("```")[0];
  files.push(["README.md", readme]);

  return files;
}

export function toFiles(chat: string, workspace: DB): void {
  workspace.set("all_output.txt", chat);

  const files = parseChat(chat);
  for (const [fileName, fileContent] of files) {
    workspace.set(fileName, fileContent);
  }
}
