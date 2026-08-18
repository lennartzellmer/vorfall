---
"vorfall": patch
---

`createDomainEvent` now sets the spec-compliant CloudEvents `time` attribute instead of a non-standard `date` extension attribute, and no longer emits the non-standard `version` attribute. Events created before this change carry `date`/`version` as extension attributes; newly created events carry `time`.
