# Broker protocol v2

Transport is LF-delimited JSON over a per-user Unix socket. Every frame has:

```json
{"protocolVersion":2,"messageId":"uuid","operation":"prompt.submit","correlationId":"optional","payload":{}}
```

The client starts with `hello` and capability negotiation. Supported operations are `health.query`, session register/update/unregister/list, prompt submit/accepted/started/completed/failed/cancel, `notification.publish`, and `delivery.ack`.

The implementation enforces strict schema validation, a configurable byte limit, bounded per-session queues, duplicate request rejection, acknowledgements, timeouts, disconnect failure reporting, reconnect registration, and registration ownership by socket. Conflicting live session IDs are rejected.

The parent directory is verified as a real current-user directory and forced to 0700. Existing symlink/non-socket paths are refused and the listening socket is 0600.

Prompt payloads contain the request/conversation/agent/session IDs, message, and source event ID. They never contain transport credentials or destinations. Notification callers cannot choose a destination.

Protocol v1 remains in the original `pi-ng` repository. Migration is performed by running v1 and v2 as separate services during the compatibility window, rather than accepting ambiguous v1 frames on the hardened v2 socket.
