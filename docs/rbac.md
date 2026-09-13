# Roles, permissions and MFA

## Why not `is_admin`

Suspending an account and opening a terminal on a production gateway are both
"admin". They should not be reachable by the same people. A boolean cannot
express that; a matrix can.

## The roles

| Role | Intended for | Can |
|---|---|---|
| `READ_ONLY` | auditors, new hires | see dashboards, sessions, users, devices, gateways, health |
| `ANALYST` | growth, finance | the above plus analytics |
| `SUPPORT_ADMIN` | customer support | the above plus suspend/reinstate accounts, terminate sessions, revoke devices |
| `INFRASTRUCTURE_ADMIN` | on-call engineers | read, terminate sessions, gateway status/drain/restart/key rotation, terminal, emergency controls, audit log |
| `SUPER_ADMIN` | platform owners | everything, including granting roles and editing settings |

The two deliberate gaps:

- Support **cannot** open a terminal or touch a gateway. Their job is accounts.
- Infrastructure **cannot** suspend users or grant roles. Their job is hosts.

Accounts predating this change (`is_admin: true`, no role) resolve to
`SUPER_ADMIN`, so an existing deployment does not lock itself out on upgrade.
An unrecognised role string grants nothing — a typo in the database fails
closed.

## Enforcement

Every admin route declares its permission:

```python
@router.post("/users/{user_id}/suspend")
async def suspend(user_id: str, admin: Annotated[dict, Depends(require(Permission.SUSPEND_USER))]):
```

The console renders its navigation and its buttons from `GET /admin/me`, which
returns the server's computed permission list. Hiding a control is a courtesy —
it stops operators discovering their role by being denied — but the check is
what enforces it. Every refusal names the permission that was missing, so the
message is "your role cannot do that" rather than a blank 403.

## MFA, and what "step-up" means

Two separate things:

**Enrolment** binds a TOTP secret to the account (RFC 6238, SHA-1, 6 digits,
30-second period, ±1 step for drift). Confirmation returns eight recovery
codes, shown once and stored only as SHA-256 hashes.

**Step-up** exchanges a fresh code for a five-minute token proving the admin
passed a second factor *just now*. It is not a session upgrade; it is a receipt
for one moment of proof, bound to one account.

Step-up is required for:

- opening a gateway terminal
- every privileged gateway operation (restart, drain, disable, rotate key)
- changing another account's role

So a stolen console session, on its own, cannot drain a gateway.

The TOTP implementation is ~30 lines in `app/auth/mfa.py` rather than a
dependency: it is a HMAC and a truncation, it is fully covered by tests, and
`hmac.compare_digest` does the comparison. The window is ±1 step and no wider —
a generous window is a meaningfully larger guessing surface.

## Destructive operations

Five gates, every time:

1. the permission for that specific operation
2. a fresh MFA step-up
3. a typed confirmation (`DRAIN SG-SIN-01` — defeats the wrong-tab mistake)
4. a written reason of at least five characters
5. an audit event recording all of it

The server checks all five. The dialog is a convenience, not a control.

## Tests

`test_rbac.py` pins the role boundaries and the fail-closed behaviour.
`test_mfa.py` covers TOTP drift, replay of recovery codes, and the fact that a
step-up token issued to one account is refused for another.
`test_gateway_actions.py` proves a mistyped confirmation changes nothing.
