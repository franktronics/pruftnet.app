import type { IncomingMessage, Server as NodeServer, ServerResponse } from "node:http"
import { createServer } from "node:http"

import { Effect, Scope } from "effect"

import type { ServerConfig } from "./config.js"
import { serveStaticFrontend } from "./http/static-files.js"
import { createViteDevServer, serveViteFrontend } from "./http/vite-dev.js"

type StartedServer = {
  readonly address: string
  readonly close: Effect.Effect<void>
}

function sendHealth(response: ServerResponse) {
  response.writeHead(200, { "content-type": "application/json; charset=utf-8" })
  response.end(JSON.stringify({ status: "ok" }))
}

function listen(server: NodeServer, config: ServerConfig) {
  return Effect.async<void, Error>((resume) => {
    const onError = (error: Error) => {
      server.off("listening", onListening)
      resume(Effect.fail(error))
    }
    const onListening = () => {
      server.off("error", onError)
      resume(Effect.void)
    }

    server.once("error", onError)
    server.once("listening", onListening)
    server.listen(config.port, config.host)
  })
}

function close(server: NodeServer) {
  return Effect.async<void>((resume) => {
    if (!server.listening) {
      resume(Effect.void)
      return
    }

    server.close(() => resume(Effect.void))
  })
}

export function startServer(config: ServerConfig): Effect.Effect<StartedServer, Error, Scope.Scope> {
  return Effect.acquireRelease(
    Effect.gen(function* () {
      const vite =
        config.mode === "development"
          ? yield* Effect.promise(() => createViteDevServer(config))
          : undefined
      const serveFrontend = vite
        ? serveViteFrontend(vite, config)
        : (request: IncomingMessage, response: ServerResponse) => {
            void serveStaticFrontend(request, response, config.frontendDistPath)
          }

      const server = createServer((request, response) => {
        const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`)

        if (url.pathname === "/health") {
          sendHealth(response)
          return
        }

        serveFrontend(request, response)
      })

      yield* listen(server, config)

      return {
        address: `http://${config.host}:${config.port}`,
        close: Effect.gen(function* () {
          yield* close(server)
          if (vite) {
            yield* Effect.promise(() => vite.close())
          }
        }),
      }
    }),
    (server) => server.close
  )
}
