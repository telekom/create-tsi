# SPDX-FileCopyrightText: 2024 Deutsche Telekom AG, LlamaIndex, Vercel, Inc.
#
# SPDX-License-Identifier: MIT

import os
from pydantic import BaseModel
from llama_index.core.indices.vector_store import VectorStoreIndex


class DBLoaderConfig(BaseModel):
    uri: str
    query: str


def get_db_documents(config: DBLoaderConfig):
    from llama_index.readers.database import DatabaseReader

    loader = DatabaseReader(uri=config.uri)
    documents = loader.load_data(query=config.query)

    return documents
