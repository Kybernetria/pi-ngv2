# Matrix E2EE validation record

## Selected stack

pi-ng v2 uses the native `@matrix-org/matrix-sdk-crypto-nodejs` Rust binding with a small Client-Server API adapter. `matrix-bot-sdk` was rejected because its legacy HTTP dependency tree carried critical advisories and its public decrypted-event API discarded device trust metadata. `matrix-js-sdk` was not selected for unattended Node deployment because its normal Rust crypto persistence path is browser IndexedDB-oriented.

## Implemented gates

- access-token restoration without storing a token in JSON configuration;
- stable user/device/fingerprint enrollment marker;
- encrypted, passphrase-protected persistent Rust crypto store;
- `/sync` token persistence only after processing;
- to-device key processing, tracked users, key upload/query/claim, room-key sharing;
- Megolm event decryption and encrypted event sending;
- thread relation receive/send;
- strict Rust `shieldState` inspection plus cryptographic owner cross-signature checks;
- bounded reconnect delay honoring `retry_after_ms`;
- identity-based outbound room-key sharing that excludes unsigned devices;
- stable transaction IDs for retry-safe delivery;
- fail closed on absent crypto state, identity drift, unencrypted rooms, decryption errors, unknown devices, unauthorized membership, and authorization failures;
- unattended service deployment.

## Real-homeserver release gate

Before setting `shadowMode` to false, run `npm run doctor -- --online`, then manually verify:

1. restart retains device ID and fingerprint;
2. encrypted test send and receive work;
3. a thread reply is returned to the same root;
4. an untrusted sender device is refused;
5. an unencrypted room is refused;
6. duplicate sync events do not create duplicate requests;
7. token revocation degrades health without invoking Pi;
8. a homeserver outage does not rerun a completed request;
9. crypto-store deletion causes startup refusal, not silent device creation;
10. systemd restart marks running work orphaned.

These tests need the deployment's homeserver and cannot be meaningfully certified by an offline repository test.
