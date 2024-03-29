// SPDX-FileCopyrightText: 2024 Deutsche Telekom AG, LlamaIndex, Vercel, Inc.
//
// SPDX-License-Identifier: MIT

export default function Loader() {
  return (
    <div className="spinner__container">
      <svg className="spinner__circle" viewBox="0 0 50 50" aria-hidden="true">
        <circle
          className="path"
          cx="25"
          cy="25"
          r="22.5"
          fill="none"
          stroke-width="4"
        ></circle>
      </svg>
      <svg
        className="spinner__circle-background"
        viewBox="0 0 50 50"
        aria-hidden="true"
      >
        <circle
          className="path"
          cx="25"
          cy="25"
          r="22.5"
          fill="none"
          stroke-width="4"
        ></circle>
      </svg>
    </div>
  );
}
