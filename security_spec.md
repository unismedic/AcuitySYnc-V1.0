# Security Specification for AcuitySync

## Data Invariants
1. A patient cannot be admitted without a unique HIS ID and a valid bed mapping.
2. A shift assessment MUST be linked to an existing patient and a verified staff member.
3. Clinical classification can only be ICU, HDU, or Ward.
4. Audit logs are append-only (create only) and immutably tied to the authenticated user.

## The "Dirty Dozen" Payloads (Red Team Test Suite)

| Test ID | Payload Target | Attack Type | Expected Result |
|---------|----------------|-------------|-----------------|
| T1 | /patients | Identity Spoofing (Setting foreign ownerId) | PERMISSION_DENIED |
| T2 | /patients | State Shortcutting (Manually setting classification to redundant value) | PERMISSION_DENIED |
| T3 | /patients | Resource Poisoning (1MB string in hisId) | PERMISSION_DENIED |
| T4 | /assessments | Unauthenticated Write | PERMISSION_DENIED |
| T5 | /assessments | Modification of IMMUTABLE timestamp (createdAt) | PERMISSION_DENIED |
| T6 | /staff | Privilege Escalation (Changing own role to Administrator) | PERMISSION_DENIED |
| T7 | /staff | Identity Theft (Creating profile for another UID) | PERMISSION_DENIED |
| T8 | /auditLogs | Modification of existing log entry | PERMISSION_DENIED |
| T9 | /patients | Deletion by non-admin staff | PERMISSION_DENIED |
| T10 | /assessments | Invalid classification enum injection | PERMISSION_DENIED |
| T11 | /staff | Profile creation without email verification | PERMISSION_DENIED |
| T12 | /patients | Blanket read without staff membership | PERMISSION_DENIED |
