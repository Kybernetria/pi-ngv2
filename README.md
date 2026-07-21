# pi-ng v2

A Matrix-first, end-to-end encrypted gateway for [Pi](https://pi.dev), with an optional Signal fallback and a hardened Unix-socket broker for attached terminal sessions.

## Security model

pi-ng v2 fails closed. Matrix events are routed only when all configured checks pass:

- the room and sender are allowlisted;
- the room uses `m.megolm.v1.aes-sha2` encryption;
- the event decrypts successfully;
- the sending device is cryptographically signed by its owner's Matrix cross-signing identity and has no verification violation;
- room membership contains no unexpected users when strict membership is enabled;
- the event is not historical, authored by the bot, or already processed.

Prompt and response bodies are not logged or stored in routing tables. Responses awaiting delivery are encrypted with a separate, mode-0600 spool key. The host still sees plaintext in memory and remains part of the security boundary.

## Architecture

- `src/matrix/`: direct Matrix Client-Server API transport using the Rust Matrix crypto Node binding and a persistent encrypted crypto store.
- `src/signal-transport.ts`: isolated, optional Signal Note-to-Self transport.
- `src/sqlite-state-store.ts`: durable conversation, request, deduplication, delivery, and session state.
- `src/broker-*`: validated broker protocol v2 over a mode-0600 Unix socket.
- `src/agent-manager.ts`: approved managed Pi SDK profiles and attached Pi sessions.
- `src/delivery-manager.ts`: encrypted outbox, idempotent Matrix transaction IDs, bounded retries, and dead letters.
- `src/extension.ts`: attached-session bridge plus `pi_ng.notify` and compatibility `pi_ng.send` provides.

## Requirements

- Linux x86-64 and Node.js 24 or newer. The approved Rust crypto binary is version/hash pinned and verified before daemon or enrollment startup.
- A normal Matrix account dedicated to the bot.
- A private encrypted Matrix room.
- Pi model credentials configured for managed sessions.
- Optional: `signal-cli-rest-api` for Signal notifications or legacy commands.

## Install

```bash
npm install
mkdir -p ~/.config/pi-ng
cp config.example.json ~/.config/pi-ng/config.json
chmod 700 ~/.config/pi-ng
chmod 600 ~/.config/pi-ng/config.json
```

Edit the approved users, rooms, and agent profiles. Agent profile values come only from this administrator-controlled file; Matrix users cannot choose arbitrary paths, models, tools, executables, extensions, or environment variables.

## Matrix enrollment

For a homeserver that uses GitHub or another SSO provider:

```bash
npm run enroll:matrix -- \
  --homeserver https://matrix.example.org \
  --user-id @pi-agent:example.org \
  --sso \
  --test-room '!roomid:example.org'
```

Open the printed URL in a browser on the same machine and complete the SSO flow. The callback listens only on `127.0.0.1` and the returned login token is never displayed.

Password login without terminal echo:

```bash
read -s MATRIX_PASSWORD
printf '%s' "$MATRIX_PASSWORD" | npm run enroll:matrix -- \
  --homeserver https://matrix.example.org \
  --user-id @pi-agent:example.org \
  --password-stdin \
  --test-room '!roomid:example.org'
unset MATRIX_PASSWORD
```

Or import a token for a freshly provisioned device that has never uploaded E2EE keys from a mode-0600 file. Tokens exported from an existing Element device are deliberately refused because its private crypto store is unavailable:

```bash
npm run enroll:matrix -- \
  --homeserver https://matrix.example.org \
  --user-id @pi-agent:example.org \
  --token-file /secure/token
```

The command creates a stable device, encrypted Rust crypto database, crypto-store key, token file, and enrollment marker under `$XDG_DATA_HOME/pi-ngv2/matrix`. Verify the displayed device ID and Ed25519 fingerprint in Element. Ensure each sender's Element device is cross-signed by its owner identity, then run:

```bash
npm run doctor -- --online
```

The daemon refuses to silently replace a missing enrollment marker or a changed user/device/fingerprint. `--force` intentionally creates a replacement device and should only be used during explicit re-enrollment.

## Shadow mode and rollout

Keep `matrix.shadowMode: true` initially. The bot syncs, decrypts, authorizes, and durably records decisions but does not invoke Pi. After online doctor checks and failure testing, set it to `false` for a single-room canary.

```bash
npm run daemon
```

Matrix thread roots create conversations. Thread replies remain FIFO within the conversation, while independent managed sessions can run concurrently. Responses return to the originating thread.

## Commands

Commands are daemon operations and are never forwarded to Pi:

```text
!pi help
!pi agents
!pi sessions
!pi status
!pi new <agent-id> [initial prompt]
!pi attach <session-id>
!pi detach
!pi close
!pi cancel
!pi retry [--confirm]
```

Uncertain work is marked `orphaned` after restart and is never automatically repeated. Prompt bodies are intentionally not persisted, so retry requires explicitly resubmitting the prompt.

## Attached and managed sessions

Managed profiles use isolated in-memory Pi SDK sessions and approved configuration. They expire after the profile TTL and do not resume after daemon restart.

An interactive Pi process loads `src/extension.ts`, registers with the broker after `session_start`, serializes incoming prompts, and sends final responses after `agent_settled`. Set `PI_NG_AGENT_ID` only in the administrator-controlled service/shell environment when an attached session belongs to a named profile.

## Signal modes

- `disabled`: no account or Signal service required.
- `notifications`: outbound completion/fallback notifications only.
- `legacy-command`: Note-to-Self `/pi` prompts and follow-ups.

`generic-status-only` is the recommended fallback; Matrix conversation content is not copied to Signal. Signal failures are isolated from Matrix processing.

## Protocol capabilities

- `pi_ng.notify`: transport-neutral, administrator-routed notification.
- `pi_ng.send`: temporary Signal Note-to-Self compatibility capability.

Neither schema permits credentials or caller-selected destinations.

## Service installation

```bash
npm run install:service
systemctl --user enable --now pi-ngv2
journalctl --user -u pi-ngv2 -f
```

The generated service uses `UMask=0077`, `NoNewPrivileges`, a read-only home, and narrowly scoped writable state/data/runtime paths. Existing configuration is never overwritten.

## Diagnostics and testing

```bash
npm run verify:crypto
npm run check
npm run doctor
npm run doctor -- --online
```

Structured logs hash Matrix identifiers and never include message bodies, tokens, recovery material, private keys, or raw events.

## Backup and rollback

Back up these directories while the daemon is stopped:

```text
~/.config/pi-ng/
~/.local/share/pi-ngv2/matrix/
~/.local/share/pi-ngv2/spool.key
~/.local/state/pi-ngv2/
```

To roll back, stop v2, disable Matrix routing, and restart the old Signal daemon. Do not delete or regenerate the Matrix crypto directory. The original `pi-ng` repository and installation are not modified by this project.

## Known operational boundary

A real homeserver and verified devices are required for gated E2EE integration tests; CI uses a fake adapter for deterministic unit tests. The direct Rust crypto adapter handles sync restoration, encrypted send/receive, thread relations, trust shields, rate-limit backoff, persistent keys, and stable transaction IDs. Homeserver-specific SSO and interactive cross-signing bootstrap are performed in Element during enrollment.

## License

AGPL-3.0-or-later.
