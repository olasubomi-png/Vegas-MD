# ZST API verification notes

Source reviewed: https://zstlab.cyou/docs (retrieved during the free-chat and coding-assistant audit).

The public documentation lists ZST Labs AI endpoints under `/api/v1/ai/`, including text completion and other AI routes. The bot’s current implementation targets `https://zstlab.cyou/api/v1/ai/deepai-v2/chat` with an `x-api-key` header and a JSON prompt/model body. No credentials are stored in this note. Provider calls must remain server-side and must not log or return API key values.

The bot’s David Cyril `/play` provider was separately smoke-tested successfully with the query `Shape of You`; the normalized response contained a title and safe HTTPS audio URL.
