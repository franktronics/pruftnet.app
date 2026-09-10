---
name: tanstack-query
description: Implement or review typed frontend API modules in Nexli with TanStack Query and the Effect HTTP client. Use when creating or editing files under apps/web/src/api, adding frontend queries or mutations, defining query keys, configuring invalidation, or migrating direct frontend API calls.
---

# TanStack Query

Follow the established frontend API structure. Also load `typescript-guidelines` whenever writing
TypeScript or TSX.

## Structure API modules

- Put frontend API access in `apps/web/src/api` using `<domain>.api.ts` names.
- Keep `query-config.ts` responsible for `QueryClient` and `MutationCache` configuration.
- Keep `effect-client.ts` responsible for Effect HTTP execution and Clerk token resolution.
- Export separate `<domain>Keys`, `<domain>MutationKeys`, `<domain>Queries`, and
  `<domain>Mutations` objects.
- Infer request and response types from shared Effect contracts. Do not duplicate API types.

## Define queries

- Build hierarchical, user-scoped keys where data belongs to an authenticated user.
- Use `queryOptions` and call `runPublicApi` or `runAuthenticatedApi` from the `queryFn`.
- Use `skipToken` when an authenticated dependency such as `userId` is unavailable.
- Keep every dependency used by `queryFn` represented in its query key when it affects the result.

```ts
export const linksQueries = {
    list: (getToken: GetToken, userId: UserId) =>
        queryOptions({
            queryKey: linksKeys.list(userId),
            queryFn: userId
                ? () => runAuthenticatedApi(getToken, (client) => client.links.list())
                : skipToken,
        }),
}
```

## Define mutations

- Use `mutationOptions` and receive request payloads through `mutationFn` variables. Do not capture
  payloads when creating mutation options.
- Declare cache invalidation through `meta.invalidates`; global invalidations remain
  fire-and-forget.
- When a mutation returns the complete resource, prefer typed `setQueryData` with a key produced by
  its query options instead of refetching it.
- Keep query keys and mutation keys in separate factories.

Consumers must pass the exported options directly to `useQuery` or `useMutation`. Do not recreate
keys, Effect clients, token handling, or standard invalidation inside components.

## Verify

Run the web typecheck and ESLint. Search for direct `HttpApiClient` usage, handwritten query keys,
and obsolete API imports outside `apps/web/src/api`.
