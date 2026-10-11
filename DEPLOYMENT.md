# Private online preview

Vesper can run on a public HTTPS host while remaining password protected. The template uses Render’s Docker service flow; `Dockerfile` and `render.yaml` are also usable as a starting point for other hosts.

## Before deploying

- **Use an avatar you may serve online.** The current VRM export is marked redistribution prohibited. Do not include it in a public deployment unless you obtain permission or export a version whose terms allow serving it online. The Docker build deliberately excludes `models/*.vrm`, `*.vroid`, `.env`, and Ollama weights.
- **Choose how chat will run.** A cloud host cannot use the Ollama instance on your home PC. Select a hosted model provider, or configure a separately hosted OpenAI-compatible endpoint. Provider keys belong in the host’s private environment settings.
- **Keep the first release private.** Vesper’s access gate is one shared password for a personal preview. It is not user accounts, billing, or per-person quotas. Before an unrestricted public launch, add identity, abuse controls, model-provider spending limits, and a privacy notice that matches the provider you use.
- **Expect ongoing cost.** A hosted app, domain, and hosted model API may charge separately. The app itself does not include or pay for any model service.

## Deploy with Render

1. Make a private Git repository from the app source. Inspect the staged files before pushing; do not add `.env`, `models/character.vrm`, `model.vroid`, `llm-models`, or `desktop-profile`.
2. In Render, create a new **Blueprint** from that repository. Render reads `render.yaml` and builds the included `Dockerfile`.
3. Before the first deployment, set `VESPER_ACCESS_PASSWORD` to a unique random value of at least 32 characters and `OPENAI_API_KEY` (or change the provider environment settings). Use Render’s private environment variables for secrets; never place them in the source or Docker build.
4. Wait for the `/api/health` check to pass, then open the service URL. Sign in with the private password and choose the model in **LLM Settings**.
5. Add a custom domain in the host’s dashboard only after the private preview works. Keep HTTPS enabled.
6. If you serve a VRM, mount or deploy only a model whose license permits online delivery. For a private, password-protected service, still verify that its terms permit remote access.

## Host settings

The template sets `NODE_ENV=production`, binds to `0.0.0.0` inside the container, requires a 32-character `VESPER_ACCESS_PASSWORD`, and expects a trusted HTTPS reverse proxy. It stores a signed `HttpOnly`, `SameSite=Strict`, secure session cookie, limits failed sign-ins, limits public chat to eight requests per minute per client and at most two simultaneous requests, caps model replies at 1 MiB, and applies browser security headers. These in-process limits are basic abuse friction, not DDoS protection; they reset when the app restarts. Put host firewall or bot/WAF rules and request limits in front of any public launch.

`VESPER_TRUST_PROXY=true` means the reverse proxy is trusted to set `X-Forwarded-Proto` and overwrite `X-Forwarded-For` with the actual client address. Do not expose the app port directly or enable this setting behind an untrusted proxy. The Compose template binds its app port to loopback.

The model route requires sign-in and uses `no-store` caching. API keys remain on the server. A password gate is not a replacement for a security review, accounts, a privacy policy, or provider-side spend limits.

For OpenAI, set:

- `DEFAULT_LLM_PROVIDER=openai`
- `OPENAI_API_KEY` as a private secret
- `OPENAI_MODEL` to a model available to your account

You can use an OpenAI-compatible endpoint instead by setting `DEFAULT_LLM_PROVIDER=compatible` and configuring `COMPAT_LLM_BASE_URL`, `COMPAT_LLM_MODEL`, and optionally `COMPAT_LLM_API_KEY`. Do not expose the model endpoint directly to the browser.

## Local Docker preview

Create a private `.env` file from `.env.example`, set a unique random `VESPER_ACCESS_PASSWORD` with at least 32 characters, and set a model provider. Then start the service with Docker Compose. The container port is bound to `127.0.0.1`; put a trusted HTTPS reverse proxy in front before making it reachable from the internet.

The local Windows launcher remains loopback-only and does not turn on online mode.
