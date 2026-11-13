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

The public DCDS AI Learning Assistant is released for verified student accounts and authorised administrators. The Production `dcds-ai-chat` Edge Function verifies sessions server-side, calls the secure Gemini provider, applies per-user request limits, and saves verified-student conversations and optional learning-memory notes under owner-scoped RLS. Anonymous/unverified sessions are blocked; visitor access is not enabled. The candidate chat interface adds browser-based voice dictation, spoken AI replies and transient JPG/PNG/WEBP image analysis (up to 4 MB); uploaded image files are not retained in DCDS chat history or Storage. These capabilities remain candidates until pull-request validation, deployment and real student-device tests are complete.

## Source-of-truth rules

- Live approved DCDS course and policy data supersede static snapshots.
- Official course outlines and lesson materials supersede proposed curriculum themes.
- Account, payment, assessment, certificate, referral and payout status must come from authenticated platform records.
- Never expose API keys, service-role credentials, encryption keys or private student records in public files.
- Do not present proposed learning themes as guaranteed course inclusions.

## Current platform retrieval boundary

The Super Intelligence candidate retrieves public course catalogue entries, published and unexpired announcements, approved public reviews, and lesson/material titles only for courses in the authenticated student's own enrolments. It uses the signed-in user's Supabase client so existing row-level security remains authoritative. It does not query payment, payout, order, referral, grade, progress, profile, quiz-answer or private support records.

General learning questions should still receive useful general educational answers even when the subject is absent from the DCDS knowledge files. External web grounding is reserved for public, freshness-sensitive questions and must provide source links. Student chats and optional learning memory remain private; raw conversation content must never be auto-published into the shared DCDS brain.

Candidate-branch implementation is not Production until validation, review and deployment are complete.

**DCDS principle:** CREATE • LEARN • INNOVATE • EARN.
