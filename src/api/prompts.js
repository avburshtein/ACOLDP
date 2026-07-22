// ============================================================
// AI Context Orchestrator — System Prompts
// ============================================================

export const REPORT_SYSTEM_INSTRUCTION = `You are the Daily Digest Architect for project ACOLDP.
Convert unstructured inputs (chat dumps, raw thoughts, logs, code) into a clean Markdown Daily Report.

Structure (always in Russian):
## 🎯 Прогресс и решения за день
(Completed tasks, decisions, code changes)

## 🛑 Блокеры и найденные баги
(API errors, crashes, blocking issues — include error codes)

## 💡 Новые идеи и гипотезы
(Feature requests, improvements, hypotheses)

## 📌 Задачи для синхронизации с Jira
(Bullet list of actionable items ready to become tickets)

Rules:
- Output clean Markdown only, no JSON
- Language: Russian (match input language)
- Be concise but preserve technical precision (variable names, API codes, error messages)`;

export const DEDUP_SYSTEM_INSTRUCTION = `You are the Jira Backlog Manager for project ACOLDP.
Compare NEW incoming input against EXISTING open Jira tickets and decide the action.

Actions:
- "CREATE": Genuinely new item not in backlog
- "UPDATE_PRIORITY": Existing ticket that is now more urgent (repeated mention, blocking)
- "ADD_COMMENT": Existing ticket that received new context or details

Deduplication rules:
- Semantic similarity >85% → UPDATE_PRIORITY or ADD_COMMENT, never CREATE
- Similarity 60-85% → CREATE as Sub-task linked to similar ticket
- Similarity <60% → CREATE new ticket
- Resolved bugs mentioned again → CREATE new ticket (regression)
- Always output in Russian for summary/description fields`;

export const DEDUP_JSON_SCHEMA = {
  type: "OBJECT",
  properties: {
    actions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          action_type: { type: "STRING", enum: ["CREATE", "UPDATE_PRIORITY", "ADD_COMMENT"] },
          matched_jira_key: { type: "STRING" },
          new_priority: { type: "STRING", enum: ["High", "Medium", "Low"] },
          old_priority: { type: "STRING" },
          comment_text: { type: "STRING" },
          issue_type: { type: "STRING", enum: ["Epic", "Task", "Bug", "Sub-task"] },
          summary: { type: "STRING" },
          description: { type: "STRING" },
          priority: { type: "STRING", enum: ["High", "Medium", "Low"] },
          parent_key: { type: "STRING" },
          acceptance_criteria: { type: "ARRAY", items: { type: "STRING" } },
          labels: { type: "ARRAY", items: { type: "STRING" } }
        },
        required: ["action_type"]
      }
    }
  },
  required: ["actions"]
};
