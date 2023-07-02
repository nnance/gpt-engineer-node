import * as fs from "fs";
import * as childProcess from "child_process";
import { AI } from "./ai";
import { toFiles } from "./chatToFiles";
import { DBs } from "./db";
import * as ReadLine from "readline/promises";
import { Logging } from "./logging";

export enum Config {
  DEFAULT = "default",
  BENCHMARK = "benchmark",
  SIMPLE = "simple",
  TDD = "tdd",
  TDD_PLUS = "tdd+",
  CLARIFY = "clarify",
  RESPEC = "respec",
  EXECUTE_ONLY = "execute_only",
  EVALUATE = "evaluate",
  USE_FEEDBACK = "use_feedback",
}

export type Step = (
  ai: AI,
  dbs: DBs,
  logging?: Logging
) => Promise<StepResult[]>;

export interface StepResult {
  content: string;
  role: "system" | "user" | "assistant";
}

function setup_sys_prompt(dbs: DBs): string {
  return (
    dbs.preprompts.get("generate") +
    "\nUseful to know:\n" +
    dbs.preprompts.get("philosophy")
  );
}

function get_prompt(dbs: DBs, logging: Logging): string {
  if (dbs.input.contains("prompt")) {
    return dbs.input.get("prompt");
  } else if (dbs.input.contains("main_prompt")) {
    logging.log(
      "\x1b[31mPlease put the prompt in the file `prompt`, not `main_prompt`\x1b[0m"
    );
    logging.log();
    return dbs.input.get("main_prompt");
  } else {
    throw new Error(
      "Please put your prompt in the file `prompt` in the project directory"
    );
  }
}

function simple_gen(ai: AI, dbs: DBs, logging: Logging): Promise<StepResult[]> {
  return ai
    .start(setup_sys_prompt(dbs), get_prompt(dbs, logging))
    .then((messages) => {
      const lastMessage = messages[messages.length - 1];
      toFiles(lastMessage.content, dbs.workspace);
      return messages;
    });
}

async function getInput(prompt: string = ""): Promise<string> {
  const readline = ReadLine.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return readline.question(`${prompt}\n`).then((result) => {
    readline.close();
    return result;
  });
}

async function clarify(
  ai: AI,
  dbs: DBs,
  logging: Logging
): Promise<StepResult[]> {
  const messages: StepResult[] = [ai.fsystem(dbs.preprompts.get("qa"))];
  let user_input = get_prompt(dbs, logging);

  while (true) {
    const newMessages = await ai.next(messages, user_input);
    messages.push(...newMessages);

    const lastMessageContent = messages[messages.length - 1].content.trim();

    if (lastMessageContent === "Nothing more to clarify.") {
      break;
    }

    if (lastMessageContent.toLowerCase().startsWith("no")) {
      logging.log("Nothing more to clarify.");
      break;
    }

    logging.log();
    user_input = await getInput('(answer in text, or "c" to move on)');
    logging.log();

    if (!user_input || user_input === "c") {
      logging.log("(letting gpt-engineer make its own assumptions)");
      logging.log();
      const nextMessages = await ai.next(
        messages,
        "Make your own assumptions and state them explicitly before starting"
      );
      logging.log();
      return nextMessages;
    }

    user_input += `
Is anything else unclear? If yes, only answer in the form:
{remaining unclear areas} remaining questions.
{Next question}
If everything is sufficiently clear, only answer "Nothing more to clarify.".`;
  }

  logging.log();
  return messages;
}

async function gen_spec(ai: AI, dbs: DBs): Promise<StepResult[]> {
  const messages: StepResult[] = [
    ai.fsystem(setup_sys_prompt(dbs)),
    ai.fsystem(`Instructions: ${dbs.input.get("prompt")}`),
  ];

  const nextMessages = await ai.next(messages, dbs.preprompts.get("spec"));

  dbs.memory.set(
    "specification",
    nextMessages[nextMessages.length - 1].content
  );

  return nextMessages;
}

async function respec(ai: AI, dbs: DBs): Promise<StepResult[]> {
  const messages: StepResult[] = JSON.parse(dbs.logs.get(gen_spec.name));
  messages.push(ai.fsystem(dbs.preprompts.get("respec")));

  const nextMessages = await ai.next(messages);
  const finalMessages = await ai.next(
    nextMessages,
    `Based on the conversation so far, please reiterate the specification for the program. If there are things that can be improved, please incorporate the improvements. If you are satisfied with the specification, just write out the specification word by word again.`
  );

  dbs.memory.set(
    "specification",
    finalMessages[finalMessages.length - 1].content
  );

  return finalMessages;
}

async function gen_unit_tests(ai: AI, dbs: DBs): Promise<StepResult[]> {
  const messages: StepResult[] = [
    ai.fsystem(setup_sys_prompt(dbs)),
    ai.fuser(`Instructions: ${dbs.input.get("prompt")}`),
    ai.fuser(`Specification:\n\n${dbs.memory.get("specification")}`),
  ];

  const nextMessages = await ai.next(
    messages,
    dbs.preprompts.get("unit_tests")
  );

  dbs.memory.set("unit_tests", nextMessages[nextMessages.length - 1].content);
  toFiles(dbs.memory.get("unit_tests"), dbs.workspace);

  return nextMessages;
}

async function gen_clarified_code(ai: AI, dbs: DBs): Promise<StepResult[]> {
  const messages = JSON.parse(dbs.logs.get(clarify.name));

  const nextMessages = [
    ai.fsystem(setup_sys_prompt(dbs)),
    ...messages.slice(1),
  ];

  const finalMessages = await ai.next(
    nextMessages,
    dbs.preprompts.get("use_qa")
  );

  toFiles(finalMessages[finalMessages.length - 1].content, dbs.workspace);

  return finalMessages;
}

async function gen_code(ai: AI, dbs: DBs): Promise<StepResult[]> {
  const messages = [
    ai.fsystem(setup_sys_prompt(dbs)),
    ai.fuser(`Instructions: ${dbs.input.get("prompt")}`),
    ai.fuser(`Specification:\n\n${dbs.memory.get("specification")}`),
    ai.fuser(`Unit tests:\n\n${dbs.memory.get("unit_tests")}`),
  ];

  const nextMessages = await ai.next(messages, dbs.preprompts.get("use_qa"));
  toFiles(nextMessages[nextMessages.length - 1].content, dbs.workspace);

  return nextMessages;
}

async function execute_entrypoint(ai: AI, dbs: DBs): Promise<StepResult[]> {
  const command = dbs.workspace.get("run.sh");

  console.log("Do you want to execute this code?\n");
  console.log(command);
  console.log();
  console.log('If yes, press enter. Otherwise, type "no"');
  console.log();

  const input = await getInput();

  if (input && !["", "y", "yes"].includes(input)) {
    console.log("Ok, not executing the code.");
    return [];
  }

  console.log("Executing the code...");
  console.log();
  console.log(
    "\x1b[32mNote: If it does not work as expected, consider running the code in another way than above.\x1b[0m"
  );
  console.log();
  console.log("You can press ctrl+c *once* to stop the execution.");
  console.log();

  const p = childProcess.exec("bash run.sh", { cwd: dbs.workspace.path });

  try {
    p.stdout?.pipe(process.stdout);
    p.stderr?.pipe(process.stderr);
    p.stdin?.pipe(process.stdin);
    p.on("exit", (code) => {
      if (code) {
        console.log();
        console.log(`Execution failed with exit code ${code}.`);
      } else {
        console.log();
        console.log("Execution finished successfully.");
      }
      console.log();
    });

    process.on("SIGINT", () => {
      console.log();
      console.log("Stopping execution.");
      console.log("Execution stopped.");
      p.kill();
      console.log();
    });
  } catch (err) {
    console.log();
    console.log(`Error executing the code: ${err}`);
    console.log();
  }

  return [];
}

async function gen_entrypoint(ai: AI, dbs: DBs): Promise<StepResult[]> {
  const messages = await ai.start(
    `You will get information about a codebase that is currently on disk in the current folder.\nFrom this you will answer with code blocks that includes all the necessary unix terminal commands to a) install dependencies b) run all necessary parts of the codebase (in parallel if necessary).\nDo not install globally. Do not use sudo.\nDo not explain the code, just give the commands.\nDo not use placeholders, use example values (like . for a folder argument) if necessary.\n`,
    `Information about the codebase:\n\n${dbs.workspace.get("all_output.txt")}`
  );
  console.log();

  const regex = /```.*?\n([\s\S]+?)```/g;
  const matches = Array.from(
    messages[messages.length - 1].content.matchAll(regex)
  );
  dbs.workspace.set("run.sh", matches.map((match) => match[1]).join("\n"));
  return messages;
}

async function use_feedback(ai: AI, dbs: DBs): Promise<StepResult[]> {
  const messages = [
    ai.fsystem(setup_sys_prompt(dbs)),
    ai.fuser(`Instructions: ${dbs.input.get("prompt")}`),
    ai.fassistant(dbs.workspace.get("all_output.txt")),
    ai.fsystem(dbs.preprompts.get("use_feedback")),
  ];
  const nextMessages = await ai.next(messages, dbs.input.get("feedback"));
  toFiles(nextMessages[nextMessages.length - 1].content, dbs.workspace);

  return nextMessages;
}

async function fix_code(ai: AI, dbs: DBs): Promise<StepResult[]> {
  const codeOutput = JSON.parse(dbs.logs.get(gen_code.name))[0].content;

  const messages = [
    ai.fsystem(setup_sys_prompt(dbs)),
    ai.fuser(`Instructions: ${dbs.input.get("prompt")}`),
    ai.fuser(codeOutput),
    ai.fsystem(dbs.preprompts.get("fix_code")),
  ];
  const nextMessages = await ai.next(
    messages,
    `Please fix any errors in the code above.`
  );
  toFiles(nextMessages[nextMessages.length - 1].content, dbs.workspace);

  return nextMessages;
}

/*
function human_review(ai: AI, dbs: DBs): StepResult[] {
  const review = human_input();
  dbs.memory.set("review", JSON.stringify(review));

  return [];
}
*/

export const STEPS = {
  [Config.DEFAULT]: [
    clarify,
    gen_clarified_code,
    gen_entrypoint,
    execute_entrypoint,
    // human_review,
  ],
  [Config.BENCHMARK]: [simple_gen, gen_entrypoint],
  [Config.SIMPLE]: [simple_gen, gen_entrypoint, execute_entrypoint],
  [Config.TDD]: [
    gen_spec,
    gen_unit_tests,
    gen_code,
    gen_entrypoint,
    execute_entrypoint,
    // human_review,
  ],
  [Config.TDD_PLUS]: [
    gen_spec,
    gen_unit_tests,
    clarify,
    gen_clarified_code,
    gen_code,
    gen_entrypoint,
    execute_entrypoint,
    // human_review,
  ],
  [Config.CLARIFY]: [clarify],
  [Config.RESPEC]: [respec],
  [Config.EXECUTE_ONLY]: [execute_entrypoint],
  [Config.EVALUATE]: [
    use_feedback,
    fix_code,
    gen_entrypoint,
    execute_entrypoint,
  ],
  [Config.USE_FEEDBACK]: [use_feedback, gen_entrypoint, execute_entrypoint],
};

export async function run(
  config: Config,
  dbs: DBs,
  logging: Logging
): Promise<StepResult[]> {
  const ai = new AI();

  const steps = STEPS[config];

  if (!steps) {
    throw new Error(`Invalid config: ${config}`);
  }

  let messages: StepResult[] = [];
  for (const step of steps) {
    messages = await step(ai, dbs, logging);
    dbs.logs.set(step.name, JSON.stringify(messages));
  }

  return messages;
}

export function main() {
  const config: Config = (process.argv[2] as Config) || Config.DEFAULT;
  const dbs: DBs = JSON.parse(fs.readFileSync("./db.json", "utf-8"));
  const logging: Logging = JSON.parse(
    fs.readFileSync("./logging.json", "utf-8")
  );

  run(config, dbs, logging);
}
