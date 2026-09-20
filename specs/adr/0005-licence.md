# ADR 0005 — Licence: Apache-2.0

- Status: Accepted (2026-09-19)

Decision: our code is Apache-2.0. OCCT (via libcascade) is LGPL-2.1 with the OCCT exception and ships as a separate, unmodified, replaceable `.wasm` file with its notice (see `THIRD_PARTY_NOTICES.md`). Any new dependency must be compatible (MIT, BSD, Apache, ISC, LGPL as a separate module); GPL and non-commercial licences are rejected.
