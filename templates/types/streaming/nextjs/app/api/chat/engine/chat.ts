// SPDX-FileCopyrightText: 2024 Deutsche Telekom AG, LlamaIndex, Vercel, Inc.
//
// SPDX-License-Identifier: MIT

import { LLM, SimpleChatEngine } from "llamaindex";

export async function createChatEngine(llm: LLM) {
  return new SimpleChatEngine({
    llm,
  });
}
