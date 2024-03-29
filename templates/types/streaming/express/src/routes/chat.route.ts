// SPDX-FileCopyrightText: 2024 Deutsche Telekom AG, LlamaIndex, Vercel, Inc.
//
// SPDX-License-Identifier: MIT

import express, { Router } from "express";
import { chatRequest } from "../controllers/chat-request.controller";
import { chat } from "../controllers/chat.controller";

const llmRouter: Router = express.Router();

llmRouter.route("/").post(chat);
llmRouter.route("/request").post(chatRequest);

export default llmRouter;
