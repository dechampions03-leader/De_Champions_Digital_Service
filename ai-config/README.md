# DCDS AI CONFIGURATION LIBRARY

This folder contains the public-safe design and knowledge documents for the future DCDS AI Learning Assistant.

## Core files

1. [DCDS Master Brain](DCDS-MASTER-BRAIN.md) — identity, brand voice, policy boundaries, truthfulness, privacy and operational principles.
2. [Conversation Intelligence](DCDS-CONVERSATION-INTELLIGENCE.md) — visitor/student states, intent recognition, response playbooks and escalation.
3. [AI Teaching Engine](DCDS-AI-TEACHING-ENGINE.md) — explain, demonstrate, practise, review and reflect learning method.
4. [Curriculum Map](DCDS-CURRICULUM-MAP.json) — proposed teaching themes for each listed course. It is not an official syllabus; official DCDS lessons take precedence.
5. [Response Playbook](DCDS-RESPONSE-PLAYBOOK.md) — reusable examples for common questions.
6. [AI Evaluation Tests](DCDS-AI-EVALUATION-TESTS.json) — pre-launch test cases for accuracy, safety, learning quality and student support.
7. [Structured DCDS Knowledge Base](../dcds-ai-knowledge-base.json) — brand facts, founder profile, course catalogue, public prices and programme rules.

## Important status

The public DCDS AI Learning Assistant is released for verified student accounts and authorised administrators. The Production `dcds-ai-chat` Edge Function verifies sessions server-side, calls the secure Gemini provider, applies per-user request limits, and saves verified-student conversations and optional learning-memory notes under owner-scoped RLS. Anonymous/unverified sessions are blocked; visitor access is not enabled.

## Source-of-truth rules

- Live approved DCDS course and policy data supersede static snapshots.
- Official course outlines and lesson materials supersede proposed curriculum themes.
- Account, payment, assessment, certificate, referral and payout status must come from authenticated platform records.
- Never expose API keys, service-role credentials, encryption keys or private student records in public files.
- Do not present proposed learning themes as guaranteed course inclusions.

## Before launch

1. Choose and configure an AI provider on a server-side endpoint.
2. Keep provider secrets in server-side secret storage only.
3. Authenticate users and enforce least-privilege access.
4. Connect only the approved, necessary knowledge sources.
5. Run the evaluation suite and record actual results.
6. Test failure states, privacy boundaries, usage limits and cost controls.
7. Obtain approval before enabling live student conversations.

**DCDS principle:** CREATE • LEARN • INNOVATE • EARN.
