// SPDX-FileCopyrightText: 2024 Deutsche Telekom AG, LlamaIndex, Vercel, Inc.
//
// SPDX-License-Identifier: MIT

import { execSync } from "child_process";
import ciInfo from "ci-info";
import fs from "fs";
import got from "got";
import ora from "ora";
import path from "path";
import { blue, green, red } from "picocolors";
import prompts from "prompts";
import { InstallAppArgs } from "./create-app";
import {
  TemplateDataSource,
  TemplateDataSourceType,
  TemplateFramework,
} from "./helpers";
import { EXAMPLE_FILE } from "./helpers/datasources";
import { templatesDir } from "./helpers/dir";
import { supportedTools, toolsRequireConfig } from "./helpers/tools";

const OPENAI_API_URL = "https://llm-server.llmhub.t-systems.net/v2";

export type QuestionArgs = Omit<
  InstallAppArgs,
  "appPath" | "packageManager"
> & {
  listServerModels?: boolean;
};
const supportedContextFileTypes = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
];
const MACOS_FILE_SELECTION_SCRIPT = `
osascript -l JavaScript -e '
  a = Application.currentApplication();
  a.includeStandardAdditions = true;
  a.chooseFile({ withPrompt: "Please select files to process:", multipleSelectionsAllowed: true }).map(file => file.toString())
'`;
const MACOS_FOLDER_SELECTION_SCRIPT = `
osascript -l JavaScript -e '
  a = Application.currentApplication();
  a.includeStandardAdditions = true;
  a.chooseFolder({ withPrompt: "Please select folders to process:", multipleSelectionsAllowed: true }).map(folder => folder.toString())
'`;
const WINDOWS_FILE_SELECTION_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
$openFileDialog = New-Object System.Windows.Forms.OpenFileDialog
$openFileDialog.InitialDirectory = [Environment]::GetFolderPath('Desktop')
$openFileDialog.Multiselect = $true
$result = $openFileDialog.ShowDialog()
if ($result -eq 'OK') {
  $openFileDialog.FileNames
}
`;
const WINDOWS_FOLDER_SELECTION_SCRIPT = `
Add-Type -AssemblyName System.windows.forms
$folderBrowser = New-Object System.Windows.Forms.FolderBrowserDialog
$dialogResult = $folderBrowser.ShowDialog()
if ($dialogResult -eq [System.Windows.Forms.DialogResult]::OK)
{
    $folderBrowser.SelectedPath
}
`;

const defaults: QuestionArgs = {
  template: "streaming",
  framework: "fastapi",
  listServerModels: true,
  observability: "none",
  ui: "shadcn",
  frontend: false,
  openAiKey: "",
  llamaCloudKey: "",
  useLlamaParse: false,
  model: "gpt-3.5-turbo",
  embeddingModel: "text-embedding-ada-002",
  communityProjectConfig: undefined,
  llamapack: "",
  postInstallAction: "dependencies",
  dataSources: [],
  tools: [],
};

const handlers = {
  onCancel: () => {
    console.error("Exiting.");
    process.exit(1);
  },
};

const getVectorDbChoices = (framework: TemplateFramework) => {
  const choices = [
    {
      title: "No, just store the data in the file system",
      value: "none",
    },
    { title: "MongoDB", value: "mongo" },
    { title: "PostgreSQL", value: "pg" },
    { title: "Pinecone", value: "pinecone" },
    { title: "Milvus", value: "milvus" },
  ];

  const vectordbLang = framework === "fastapi" ? "python" : "typescript";
  const compPath = path.join(templatesDir, "components");
  const vectordbPath = path.join(compPath, "vectordbs", vectordbLang);

  const availableChoices = fs
    .readdirSync(vectordbPath)
    .filter((file) => fs.statSync(path.join(vectordbPath, file)).isDirectory());

  const displayedChoices = choices.filter((choice) =>
    availableChoices.includes(choice.value),
  );

  return displayedChoices;
};

export const getDataSourceChoices = (
  framework: TemplateFramework,
  selectedDataSource: TemplateDataSource[],
) => {
  const choices = [];
  if (selectedDataSource.length > 0) {
    choices.push({
      title: "No",
      value: "no",
    });
  }
  if (selectedDataSource === undefined || selectedDataSource.length === 0) {
    choices.push({
      title: "No data, just a simple chat",
      value: "none",
    });
    choices.push({
      title: "Use an example PDF",
      value: "exampleFile",
    });
  }

  choices.push(
    {
      title: `Use local files (${supportedContextFileTypes.join(", ")})`,
      value: "file",
    },
    {
      title:
        process.platform === "win32"
          ? "Use a local folder"
          : "Use local folders",
      value: "folder",
    },
  );

  if (framework === "fastapi") {
    choices.push({
      title: "Use website content (requires Chrome)",
      value: "web",
    });
    // Add db source if there is no db source already
    if (!selectedDataSource.some((ds) => ds.type === "db")) {
      choices.push({
        title: "Use data from a database (Mysql)",
        value: "db",
      });
    }
  }
  return choices;
};

const selectLocalContextData = async (type: TemplateDataSourceType) => {
  try {
    let selectedPath: string = "";
    let execScript: string;
    let execOpts: any = {};
    switch (process.platform) {
      case "win32": // Windows
        execScript =
          type === "file"
            ? WINDOWS_FILE_SELECTION_SCRIPT
            : WINDOWS_FOLDER_SELECTION_SCRIPT;
        execOpts = { shell: "powershell.exe" };
        break;
      case "darwin": // MacOS
        execScript =
          type === "file"
            ? MACOS_FILE_SELECTION_SCRIPT
            : MACOS_FOLDER_SELECTION_SCRIPT;
        break;
      default: // Unsupported OS
        console.log(red("Unsupported OS error!"));
        process.exit(1);
    }
    selectedPath = execSync(execScript, execOpts).toString().trim();
    const paths =
      process.platform === "win32"
        ? selectedPath.split("\r\n")
        : selectedPath.split(", ");

    for (const p of paths) {
      if (
        fs.statSync(p).isFile() &&
        !supportedContextFileTypes.includes(path.extname(p))
      ) {
        console.log(
          red(
            `Please select a supported file type: ${supportedContextFileTypes}`,
          ),
        );
        process.exit(1);
      }
    }
    return paths;
  } catch (error) {
    console.log(
      red(
        "Got an error when trying to select local context data! Please try again or select another data source option.",
      ),
    );
    process.exit(1);
  }
};

export const onPromptState = (state: any) => {
  if (state.aborted) {
    // If we don't re-enable the terminal cursor before exiting
    // the program, the cursor will remain hidden
    process.stdout.write("\x1B[?25h");
    process.stdout.write("\n");
    process.exit(1);
  }
};

const getAvailableModelChoices = async (
  selectEmbedding: boolean,
  apiKey?: string,
  listServerModels?: boolean,
) => {
  const defaultLLMModels = [
    "Llama2-70b-Instruct",
    "Mixtral-8x7B-Instruct-v0.1",
    "Zephyr-7b-beta",
  ];
  const defaultEmbeddingModels = [
    "paraphrase-multilingual-mpnet-base-v2",
    "jina-embeddings-v2-base-de",
    "text-embedding-bge-m3",
  ];

  const isEmbeddingModel = (model_id: string) => {
    return (
      model_id.includes("embedding") ||
      defaultEmbeddingModels.includes(model_id)
    );
  };

  const isLLMModels = (model_id: string) => {
    return !isEmbeddingModel(model_id);
  };

  if (apiKey && listServerModels) {
    const spinner = ora("Fetching available models").start();
    try {
      const response = await got(`${OPENAI_API_URL}/models`, {
        headers: {
          Authorization: "Bearer " + apiKey,
        },
        timeout: 5000,
        responseType: "json",
      });
      const data: any = await response.body;
      spinner.stop();
      return data.data
        .filter((model: any) =>
          selectEmbedding ? isEmbeddingModel(model.id) : isLLMModels(model.id),
        )
        .map((el: any) => {
          return {
            title: el.id,
            value: el.id,
          };
        });
    } catch (error) {
      spinner.stop();
      if ((error as any).response?.statusCode === 401) {
        console.log(
          red(
            "Invalid T-Systems API key provided! Please provide a valid key and try again!",
          ),
        );
      } else {
        console.log(red("Request failed: " + error));
      }
      process.exit(1);
    }
  } else {
    const data = selectEmbedding ? defaultEmbeddingModels : defaultLLMModels;
    return data.map((model) => ({
      title: model,
      value: model,
    }));
  }
};

export const askQuestions = async (
  program: QuestionArgs,
  preferences: QuestionArgs,
) => {
  const getPrefOrDefault = <K extends keyof QuestionArgs>(
    field: K,
  ): QuestionArgs[K] => preferences[field] ?? defaults[field];

  // Ask for next action after installation
  async function askPostInstallAction() {
    if (program.postInstallAction === undefined) {
      if (ciInfo.isCI) {
        program.postInstallAction = getPrefOrDefault("postInstallAction");
      } else {
        const actionChoices = [
          {
            title: "Just generate code (~1 sec)",
            value: "none",
          },
          {
            title: "Start in VSCode (~1 sec)",
            value: "VSCode",
          },
          {
            title: "Generate code and install dependencies (~2 min)",
            value: "dependencies",
          },
        ];

        const openAiKeyConfigured =
          program.openAiKey || process.env["TSI_API_KEY"];
        // If using LlamaParse, require LlamaCloud API key
        const llamaCloudKeyConfigured = program.useLlamaParse
          ? program.llamaCloudKey || process.env["LLAMA_CLOUD_API_KEY"]
          : true;
        const hasVectorDb = program.vectorDb && program.vectorDb !== "none";
        // Can run the app if all tools do not require configuration
        if (
          !hasVectorDb &&
          openAiKeyConfigured &&
          llamaCloudKeyConfigured &&
          !toolsRequireConfig(program.tools) &&
          !program.llamapack
        ) {
          actionChoices.push({
            title:
              "Generate code, install dependencies, and run the app (~2 min)",
            value: "runApp",
          });
        }

        const { action } = await prompts(
          {
            type: "select",
            name: "action",
            message: "How would you like to proceed?",
            choices: actionChoices,
            initial: 1,
          },
          handlers,
        );

        program.postInstallAction = action;
      }
    }
  }

  program.template = getPrefOrDefault("template");
  program.framework = getPrefOrDefault("framework");
  program.listServerModels = getPrefOrDefault("listServerModels");

  if (program.framework === "express" || program.framework === "fastapi") {
    // if a backend-only framework is selected, ask whether we should create a frontend
    // (only for streaming backends)
    if (program.frontend === undefined) {
      if (ciInfo.isCI) {
        program.frontend = getPrefOrDefault("frontend");
      } else {
        const styledNextJS = blue("NextJS");
        const styledBackend = green(
          program.framework === "express"
            ? "Express "
            : program.framework === "fastapi"
              ? "FastAPI (Python) "
              : "",
        );
        const { frontend } = await prompts({
          onState: onPromptState,
          type: "toggle",
          name: "frontend",
          message: `Would you like to generate a ${styledNextJS} frontend for your ${styledBackend}backend?`,
          initial: getPrefOrDefault("frontend"),
          active: "Yes",
          inactive: "No",
        });
        program.frontend = Boolean(frontend);
        preferences.frontend = Boolean(frontend);
      }
    }
  } else {
    program.frontend = false;
  }

  program.ui = getPrefOrDefault("ui");
  program.observability = getPrefOrDefault("observability");

  if (!program.openAiKey) {
    const { key } = await prompts(
      {
        type: "text",
        name: "key",
        message: program.listServerModels
          ? "Please provide your T-Systems API key (or reuse TSI_API_KEY env variable):"
          : "Please provide your T-Systems API key (leave blank to skip):",
        validate: (value: string) => {
          if (program.listServerModels && !value) {
            if (process.env.TSI_API_KEY) {
              return true;
            }
            return "T-Systems API key is required";
          }
          return true;
        },
      },
      handlers,
    );

    program.openAiKey = key || process.env.TSI_API_KEY;
    preferences.openAiKey = key || process.env.TSI_API_KEY;
  }

  if (!program.model) {
    if (ciInfo.isCI) {
      program.model = getPrefOrDefault("model");
    } else {
      const { model } = await prompts(
        {
          type: "select",
          name: "model",
          message: "Which model would you like to use?",
          choices: await getAvailableModelChoices(
            false,
            program.openAiKey,
            program.listServerModels,
          ),
          initial: 0,
        },
        handlers,
      );
      program.model = model;
      preferences.model = model;
    }
  }

  if (!program.embeddingModel && program.framework === "fastapi") {
    if (ciInfo.isCI) {
      program.embeddingModel = getPrefOrDefault("embeddingModel");
    } else {
      const { embeddingModel } = await prompts(
        {
          type: "select",
          name: "embeddingModel",
          message: "Which embedding model would you like to use?",
          choices: await getAvailableModelChoices(
            true,
            program.openAiKey,
            program.listServerModels,
          ),
          initial: 0,
        },
        handlers,
      );
      program.embeddingModel = embeddingModel;
      preferences.embeddingModel = embeddingModel;
    }
  }

  if (!program.dataSources) {
    if (ciInfo.isCI) {
      program.dataSources = getPrefOrDefault("dataSources");
    } else {
      program.dataSources = [];
      // continue asking user for data sources if none are initially provided
      while (true) {
        const firstQuestion = program.dataSources.length === 0;
        const { selectedSource } = await prompts(
          {
            type: "select",
            name: "selectedSource",
            message: firstQuestion
              ? "Which data source would you like to use?"
              : "Would you like to add another data source?",
            choices: getDataSourceChoices(
              program.framework,
              program.dataSources,
            ),
            initial: firstQuestion ? 1 : 0,
          },
          handlers,
        );

        if (selectedSource === "no" || selectedSource === "none") {
          // user doesn't want another data source or any data source
          break;
        }
        if (selectedSource === "exampleFile") {
          program.dataSources.push(EXAMPLE_FILE);
        } else if (selectedSource === "file" || selectedSource === "folder") {
          // Select local data source
          const selectedPaths = await selectLocalContextData(selectedSource);
          for (const p of selectedPaths) {
            program.dataSources.push({
              type: "file",
              config: {
                path: p,
              },
            });
          }
        } else if (selectedSource === "web") {
          // Selected web data source
          const { baseUrl } = await prompts(
            {
              type: "text",
              name: "baseUrl",
              message: "Please provide base URL of the website: ",
              initial: "https://www.llamaindex.ai",
              validate: (value: string) => {
                if (!value.includes("://")) {
                  value = `https://${value}`;
                }
                const urlObj = new URL(value);
                if (
                  urlObj.protocol !== "https:" &&
                  urlObj.protocol !== "http:"
                ) {
                  return `URL=${value} has invalid protocol, only allow http or https`;
                }
                return true;
              },
            },
            handlers,
          );

          program.dataSources.push({
            type: "web",
            config: {
              baseUrl,
              prefix: baseUrl,
              depth: 1,
            },
          });
        } else if (selectedSource === "db") {
          const dbPrompts: prompts.PromptObject<string>[] = [
            {
              type: "text",
              name: "dbUri",
              message:
                "Please enter the connection string (URI) for the database:",
              initial: "mysql+pymysql://user:pass@localhost:3306/mydb",
              validate: (value: string) => {
                if (!value) {
                  return "Please provide a valid connection string";
                } else if (!value.startsWith("mysql+pymysql://")) {
                  return "The connection string must start with 'mysql+pymysql://'";
                }
                return true;
              },
            },
            {
              type: (prev) => (prev ? "text" : null),
              name: "query",
              message: "Please enter the SQL query to fetch data:",
              initial: "SELECT * FROM mytable",
            },
          ];
          program.dataSources.push({
            type: "db",
            config: await prompts(dbPrompts, handlers),
          });
        }
      }
    }
  }

  // Asking for LlamaParse if user selected file or folder data source
  if (
    program.dataSources.some((ds) => ds.type === "file") &&
    program.useLlamaParse === undefined
  ) {
    if (ciInfo.isCI) {
      program.useLlamaParse = getPrefOrDefault("useLlamaParse");
      program.llamaCloudKey = getPrefOrDefault("llamaCloudKey");
    } else {
      const { useLlamaParse } = await prompts(
        {
          type: "toggle",
          name: "useLlamaParse",
          message:
            "Would you like to use LlamaParse (improved parser for RAG - requires API key)?",
          initial: false,
          active: "yes",
          inactive: "no",
        },
        handlers,
      );
      program.useLlamaParse = useLlamaParse;

      // Ask for LlamaCloud API key
      if (useLlamaParse && program.llamaCloudKey === undefined) {
        const { llamaCloudKey } = await prompts(
          {
            type: "text",
            name: "llamaCloudKey",
            message:
              "Please provide your LlamaIndex Cloud API key (leave blank to skip):",
          },
          handlers,
        );
        program.llamaCloudKey = llamaCloudKey;
      }
    }
  }

  if (program.dataSources.length > 0 && !program.vectorDb) {
    if (ciInfo.isCI) {
      program.vectorDb = getPrefOrDefault("vectorDb");
    } else {
      const { vectorDb } = await prompts(
        {
          type: "select",
          name: "vectorDb",
          message: "Would you like to use a vector database?",
          choices: getVectorDbChoices(program.framework),
          initial: 0,
        },
        handlers,
      );
      program.vectorDb = vectorDb;
      preferences.vectorDb = vectorDb;
    }
  }

  // TODO: allow tools also without datasources
  if (!program.tools && program.dataSources.length > 0) {
    if (ciInfo.isCI) {
      program.tools = getPrefOrDefault("tools");
    } else {
      const options = supportedTools.filter((t) =>
        t.supportedFrameworks?.includes(program.framework),
      );
      const toolChoices = options.map((tool) => ({
        title: tool.display,
        value: tool.name,
      }));
      const { toolsName } = await prompts({
        type: "multiselect",
        name: "toolsName",
        message:
          "Would you like to build an agent using tools? If so, select the tools here, otherwise just press enter",
        choices: toolChoices,
      });
      const tools = toolsName?.map((tool: string) =>
        supportedTools.find((t) => t.name === tool),
      );
      program.tools = tools;
      preferences.tools = tools;
    }
  }

  await askPostInstallAction();
};
