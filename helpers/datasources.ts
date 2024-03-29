// SPDX-FileCopyrightText: 2024 Deutsche Telekom AG, LlamaIndex, Vercel, Inc.
//
// SPDX-License-Identifier: MIT

import path from "path";
import { templatesDir } from "./dir";
import { TemplateDataSource } from "./types";

export const EXAMPLE_FILE: TemplateDataSource = {
  type: "file",
  config: {
    path: path.join(
      templatesDir,
      "components",
      "data",
      "open-telekom-cloud-technik-flyer-2022.pdf",
    ),
  },
};

export function getDataSources(
  files?: string,
  exampleFile?: boolean,
): TemplateDataSource[] | undefined {
  let dataSources: TemplateDataSource[] | undefined = undefined;
  if (files) {
    // If user specified files option, then the program should use context engine
    dataSources = files.split(",").map((filePath) => ({
      type: "file",
      config: {
        path: filePath,
      },
    }));
  }
  if (exampleFile) {
    dataSources = [...(dataSources ? dataSources : []), EXAMPLE_FILE];
  }
  return dataSources;
}
