# localapi-v1 contract

`localapi-v1.json` is a byte-identical copy of the engine contract at
`internal/adapters/localapi/openapi.json` (LV24 Brain v0.28.0 Ideas contract,
desktop 1.8.0).
Do not edit it by hand. When the engine contract changes:

1. Copy the new `openapi.json` over this file.
2. Run `npm run api:generate`.
3. Review the generated `../generated/schema.d.ts` and any adapter changes in
   `src/entities/*/api`.
4. Commit both files together.

`npm run api:check` fails in CI when the generated file is stale.

Some frozen routes document an open JSON request body. `openapi-typescript`
renders that as `Record<string, never>`, so the connection adapters cast their
typed payload at that call boundary; the wire bytes and the contract are
unchanged.
