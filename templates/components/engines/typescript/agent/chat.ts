// SPDX-FileCopyrightText: 2024 Deutsche Telekom AG, LlamaIndex, Vercel, Inc.
//
// SPDX-License-Identifier: MIT

import config from "@/config/tools.json";
import { OpenAI, OpenAIAgent, QueryEngineTool, ToolFactory } from "llamaindex";
import { STORAGE_CACHE_DIR } from "./constants.mjs";
import { getDataSource } from "./index";

export async function createChatEngine(llm: OpenAI) {
  const index = await getDataSource(llm);
  const queryEngine = index.asQueryEngine();
  const queryEngineTool = new QueryEngineTool({
    queryEngine: queryEngine,
    metadata: {
      name: "data_query_engine",
      description: `A query engine for documents in storage folder: ${STORAGE_CACHE_DIR}`,
    },
  });

  const externalTools = await ToolFactory.createTools(config);

  const agent = new OpenAIAgent({
    tools: [queryEngineTool, ...externalTools],
    verbose: true,
    llm,
  });

  return agent;
}
