# Applied patches

All five patches in this directory were applied to `main` in the round-2 remediation, one logical
commit each. They are kept for traceability; they no longer apply cleanly to `HEAD`.

| Patch | Commit | Rules closed |
|---|---|---|
| `01-a11y03-contrast-tokens.patch` | `1658d84` | A11Y-03 |
| `02-a11y04-route-focus.patch` | `66d82a2` | A11Y-04 |
| `03-sta02-empty-states.patch` | `0e786e5` | STA-02 |
| `04-err01-confirm-copy.patch` | `994f27d` | ERR-01, DS-04 |
| `05-thm01-prepaint-theme.patch` | `ea8fbd2` | THM-01 |

Patch `02` and `04` were re-expressed against the refactored code (typed `Route` union, `ConfirmDialog`)
rather than applied verbatim. The current state and remaining findings live in
`../UX_AUDIT_REPORT.md` and `../ux-audit.findings.json`.
