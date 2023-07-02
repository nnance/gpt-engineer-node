import * as fs from "fs/promises";
import * as path from "path";
import { LogLevel, Logging } from "./logging";
import { DBs, DB } from "./db";
import { AI } from "./ai";
import { Config, STEPS } from "./steps";

async function start(
  model: string,
  temperature: number,
  projectPath: string,
  deleteExisting: boolean,
  stepsConfig: Config,
  verbose: boolean,
  runPrefix: string
): Promise<void> {
  const logging = new Logging(verbose ? LogLevel.Debug : LogLevel.Info);
  logging.logLevel();

  const inputPath = path.resolve(projectPath);
  const memoryPath = path.join(inputPath, `${runPrefix}memory`);
  const workspacePath = path.join(inputPath, `${runPrefix}workspace`);

  if (deleteExisting) {
    await fs.rm(memoryPath, { recursive: true, force: true });
    await fs.rm(workspacePath, { recursive: true, force: true });
  }

  const ai = new AI(model, temperature, logging);

  const dbs = new DBs(
    new DB(memoryPath),
    new DB(path.join(memoryPath, "logs")),
    new DB(path.join("preprompts")),
    new DB(inputPath),
    new DB(workspacePath)
  );

  const steps = STEPS[stepsConfig];
  for (const step of steps) {
    const messages = await step(ai, dbs, logging);
    await fs.writeFile(
      path.join(dbs.logs.path, step.name),
      JSON.stringify(messages)
    );
  }
}

//TODO: Make defaults work either as input or undefined output
//TODO: Add a --help flag
interface CommandLineArgs {
  projectPath: string;
  deleteExisting: boolean;
  model: string;
  temperature: number;
  stepsConfig: Config;
  verbose: boolean;
  runPrefix: string;
}

type CommandLineArgDefaults = Partial<CommandLineArgs>;

function parseCommandLineArgs({
  projectPath = "example",
  deleteExisting = false,
  model = "gpt-3.5-turbo",
  temperature = 0.1,
  verbose = false,
  stepsConfig = Config.DEFAULT,
  runPrefix = "",
}: CommandLineArgDefaults): CommandLineArgs {
  const args = process.argv.slice(2);

  const projectPathArg = args[0] || projectPath;
  const deleteExistingArg =
    args.includes("--delete-existing") || deleteExisting;
  const modelArg = args.includes("--model")
    ? args[args.indexOf("--model") + 1]
    : model;
  const temperatureArg = args.includes("--temperature")
    ? parseFloat(args[args.indexOf("--temperature") + 1])
    : temperature;
  const runPrefixArg = args.includes("--run-prefix")
    ? args[args.indexOf("--run-prefix") + 1]
    : runPrefix;
  const verboseArg = args.includes("--verbose") || verbose;

  let stepsConfigArg: Config = stepsConfig;
  if (args.includes("--steps") || args.includes("-s")) {
    const stepsIndex = args.includes("--steps")
      ? args.indexOf("--steps")
      : args.indexOf("-s");
    const stepsArg = args[stepsIndex + 1].toLowerCase();
    stepsConfigArg = Config[stepsArg.toUpperCase() as keyof typeof Config];
  }

  return {
    projectPath: projectPathArg,
    deleteExisting: deleteExistingArg,
    model: modelArg,
    temperature: temperatureArg,
    stepsConfig: stepsConfigArg,
    verbose: verboseArg,
    runPrefix: runPrefixArg,
  };
}

// Main function
async function main(): Promise<void> {
  const args = parseCommandLineArgs({
    projectPath: "example",
    deleteExisting: false,
    model: "gpt-3.5-turbo-16k-0613",
    temperature: 0.1,
    verbose: false,
  });

  start(
    args.model,
    args.temperature,
    args.projectPath,
    args.deleteExisting,
    args.stepsConfig,
    args.verbose,
    args.runPrefix
  );
}

// Entry point
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
