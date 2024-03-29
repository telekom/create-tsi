// SPDX-FileCopyrightText: 2024 Deutsche Telekom AG, LlamaIndex, Vercel, Inc.
//
// SPDX-License-Identifier: MIT

export default function webpack(config, isServer) {
  // See https://webpack.js.org/configuration/resolve/#resolvealias
  config.resolve.alias = {
    ...config.resolve.alias,
    sharp$: false,
    "onnxruntime-node$": false,
  };
  config.module.rules.push({
    test: /\.node$/,
    loader: "node-loader",
  });
  if (isServer) {
    config.ignoreWarnings = [{ module: /opentelemetry/ }];
  }
  return config;
}
