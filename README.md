# GPT Engineer Node

A direct port of [GPT Engineer](https://github.com/AntonOsika/gpt-engineer) to TypeScript in pure Node.js without dependencies. It's a work in progress, but it's already usable.

[![GitHub Repo stars](https://img.shields.io/github/stars/AntonOsika/gpt-engineer?style=social)](https://github.com/AntonOsika/gpt-engineer)

**Specify what you want it to build, the AI asks for clarification, and then builds it.**

GPT Engineer is made to be easy to adapt, extend, and make your agent learn how you want your code to look. It generates an entire codebase based on a prompt.

## Usage

Choose either **stable** or **development**.

For **stable** release:

- `npm install gpt-engineer-node`

**Setup**

Run the build process:

- `npm run build`

**Run**:

- Create an empty folder. If inside the repo, you can run:
  - `cp -r projects/example/ projects/my-new-project`
- Fill in the `prompt` file in your new folder
- `OPENAI_API_KEY=[your api key] node ./dist/index.js projects/my-new-project`
  - (Note, `gpt-engineer --help` lets you see all available options.
