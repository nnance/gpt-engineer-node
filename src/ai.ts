import * as https from "https";
import { Logging } from "./logging";

export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type MessageRequest = {
  model: string;
  messages: Message[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  logprobs?: number;
  stop?: string;
};

export type MessageResponse = {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: Message;
    finish_reason: string;
    logprobs: any;
  }[];
};

function getOptions(apiKey: string) {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  };
}

export function makeRequest(
  url: string,
  options: ReturnType<typeof getOptions>,
  request: MessageRequest
) {
  return new Promise<string>((resolve) => {
    const req = https.request(url, options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        resolve(data);
      });
    });

    req.on("error", (err) => {
      console.error(err);
      throw err;
    });

    const postData = JSON.stringify(request);

    req.write(postData);
    req.end();
  });
}

const chatCompletion = (
  apiKey: string,
  model: string,
  temperature: number,
  messages: Message[] = []
) => {
  const request: MessageRequest = {
    model,
    messages,
    temperature,
    top_p: 1,
  };

  const options = getOptions(apiKey);

  return makeRequest(
    "https://api.openai.com/v1/chat/completions",
    options,
    request
  ).then((data) => JSON.parse(data) as MessageResponse);
};

export class AI {
  temperature: number;
  model: string;
  logging: Logging;

  constructor(model = "gpt-4", temperature = 0.1, logging = new Logging()) {
    this.temperature = temperature;
    this.model = model;
    this.logging = logging;
  }

  start(system: string, user: string) {
    const messages: Message[] = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];

    return this.next(messages);
  }

  fsystem(msg: string): Message {
    return { role: "system", content: msg };
  }

  fuser(msg: string): Message {
    return { role: "user", content: msg };
  }

  fassistant(msg: string): Message {
    return { role: "assistant", content: msg };
  }

  async next(messages: Message[], prompt?: string) {
    if (prompt) {
      messages.push({
        role: "user",
        content: prompt,
      });
    }

    this.logging.debug(
      `Creating a new chat completion: ${JSON.stringify(
        messages
      )} with model: ${this.model} and temperature: ${this.temperature}`
    );

    const apiKey = process.env.OPENAI_API_KEY || "";

    const response = await chatCompletion(
      apiKey,
      this.model,
      this.temperature,
      messages
    );

    const content = response.choices[0].message?.content || "";

    this.logging.log();
    this.logging.log(content);

    messages.push({ role: "assistant", content });

    this.logging.debug(`Chat completion finished: ${JSON.stringify(messages)}`);
    return messages;
  }
}
