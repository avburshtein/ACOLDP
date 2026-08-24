# **Архитектурный спецификационный документ: AI Context Orchestrator & Living Documentation Platform**

## ---

**1\. Обзор системы и Концепция**

---

**AI Context Orchestrator** — это интеллектуальная инженерно-продуктовая прослойка, предназначенная для бесшовной синхронизации контекста между человеком-проектировщиком (UX/UI, Product Owner), гетерогенными ИИ-агентами (Claude, Gemini, ChatGPT) и трекером задач Jira. Системная цель платформы — исключить потерю технических нюансов, автоматизировать создание и актуализацию backlog-тикетов, а также поддерживать живую документацию проекта (Living Documentation) в актуальном состоянии.

Основной упор сделан на **100% автономию рутинных операций**: сбор изменений за сутки, синтаксический анализ переписок, конкурс решений от разродненных LLM, дедупликацию задач и обновление спецификаций.

## **2\. Функциональные модули системы**

### ---

**2.1. Автоматический синтаксический анализатор и генератор backlog**

* Прием неструктурированного контента (тексты чатов, голосовые расшифровки, заметки созвонов).  
* Автоматическое выделение сущностей: Epics, Tasks, Bugs, Sub-tasks.  
* Расчет приоритетов, генерация четких критериев приемки (Acceptance Criteria / Definition of Done).  
* Автоматический экспорт тикетов напрямую в Jira через REST API.

### **2.2. Модуль синтеза и арбитража решений (Multi-AI Solutions Synthesizer)**

* Прием 3–5 альтернативных решений одной задачи от разрозненных LLM (Claude, Gemini, OpenAI).  
* Сравнительный анализ архитектур, выделение сильных сторон, рисков и противоречий.  
* Автоматическая сборка **Master Plan** (гибридное идеальное решение).  
* Публикация Master Plan в шапку тикета Jira и архивация альтернативных гипотез в комментарии.

### **2.3. Автономный движок поддержания живой документации (Living Docs Engine)**

* При переходе задачи в статус *Done* или *Approved* система забирает финальный контекст реализации.  
* Сравнение кода/логики реализации с текущей базой знаний (Confluence / Google Drive / Vector DB).  
* Генерация патчей/диффов (diffs) и автоматическая перезапись устаревших разделов спецификации.

### **2.4. Регулярный проектировочный синхронизатор (Daily Context Dispatcher)**

* Запуск по cron-расписанию (например, каждые 24 часа в 09:00 AM).  
* Сбор измененных задач и документов за последние 24 часа.  
* Формирование компактного **Daily Context Packet** в формате Markdown и JSON.  
* Публикация пакета в системный Telegram/Slack канал и синхронизация системных промптов подключенных ИИ-агентов.

## **3\. Полная карта автоматизации, доступы, API и подписки**

---

| Инструмент / Сервис | Роль в системе | Необходимая подписка / Тариф | Тип доступа / Ключи API   |
| :---- | :---- | :---- | :---- |
| **Google AI Studio / Gemini API** | Ядро синтеза, структурирование, поддержка векторов RAG | Pay-as-you-go (Gemini 1.5 Pro / Flash API Key) | Gemini API Key |
| **Jira Software (Cloud)** | Трекер задач, источник правды по статусам | Standard / Premium | Jira API Token \+ User Email, Project Key |
| **n8n (Self-hosted or Cloud)** | Основной low-code оркестратор всех авто-сценариев | Community Self-Hosted (Бесплатно) или Cloud Community Plan | Webhook URLs, Service API Keys |
| **Pinecone / Qdrant** | Векторная база данных для RAG и долгосрочной памяти | Free Tier / Starter Plan | Vector DB API Key & Host URL |
| **Confluence / Google Drive API** | Хранилище мастер-документации проекта | Входит в Workspace / Atlassian Suite | OAuth 2.0 Client Credentials / Google Service Account JSON Key |
| **Telegram Bot API / Slack API** | Интерфейс ввода сырого текста и получения Daily Context | Бесплатно | Bot Access Token |

## **4\. Архитектура системы и масштабирование за пределы AI Studio**

### ---

**4.1. Схема движения данных (Data Flow Diagram)**

\[ Сырой текст / Telegram Bot / Jira Events \]  
                  │  
                  ▼  
         \[ n8n Orchestrator \]  
                  │  
    ┌─────────────┼───────────────────────────────┐  
    ▼             ▼                               ▼  
\[Jira API\]  \[Gemini API \+ JSON Schema\]  \[Vector DB / Document Store\]  
    │             │                               │  
    └─────────────┼───────────────────────────────┘  
                  ▼  
     \[ Master Plan / Target AI Prompt / Daily Packet \]

### **4.2. Нужен ли собственный бэкенд?**

**Нет, отдельный традиционный бэкенд (Node.js/Python сервер) на старте и этапе масштабирования не нужен.** Его роль полностью и с высокой надежностью выполняет \*\*n8n\*\* (Self-hosted через Docker или Cloud). n8n предоставляет:

* Встроенный вебхук-сервер для приема данных из Jira и Telegram.  
* Планировщик задач (Cron Trigger) для регулярной синхронизации.  
* Управление секретами и ключами API.  
* Нативную обработку JSON и визуальную отладку ошибочных ветвей.

### **4.3. Требования к базам данных и хранению**

* **Оперативное состояние (State):** Хранится внутри n8n / Redis (кеш текущего дня).  
* **Долгосрочный контекст (RAG Memory):** Векторная база данных Qdrant или Pinecone, куда индексируются фрагменты спецификаций и истории задач.  
* **Продуктовый Backlog:** Jira Cloud.

## **5\. Конфигурационные файлы и системные Промпты**

### ---

**5.1. System Instructions (Системная инструкция для Google AI Studio)**

You are the Lead Project Synthesizer and Context Architect for the project.  
Your mission is to bridge communication between human team members, Jira, and heterogeneous AI agents (Claude, Gemini, ChatGPT, custom bots).

YOUR CORE RESPONSIBILITIES:  
1\. UNSTRUCTURED TO STRUCTURED: Take raw notes, chat logs, and meeting transcripts, strip out all noise, and convert them into clear, actionable Jira Issues (Epics, Tasks, Bugs, Sub-tasks) or precise AI Prompts.  
2\. CONFLICT RESOLUTION & SYNTHESIS: When presented with 3-5 alternative solutions from different AI models for a single task, analyze their pros/cons, extract the best logic from each, and synthesize a single, production-ready "Master Plan".  
3\. LIVING DOCUMENTATION MAINTENANCE: Compare new task implementations against existing project documentation. Identify outdated specs and generate precise diffs/updates to keep the single source of truth alive.

OPERATING RULES:  
\- Output MUST strictly follow the requested format (Structured JSON when generating Jira payloads, Markdown for human/AI reading).  
\- Always preserve technical precision: exact variable names, UI states, API codes (e.g., 401, 429), and edge cases.  
\- Include clear Acceptance Criteria (Definition of Done) for every generated task.

### **5.2. JSON Schema для Настройки Structured Output**

{  
  "type": "object",  
  "properties": {  
    "action\_type": {  
      "type": "string",  
      "enum": \["JIRA\_TASK\_CREATION", "AI\_AGENT\_HANDOVER", "MULTI\_SOLUTION\_SYNTHESIS", "DOCS\_UPDATE"\]  
    },  
    "jira\_payload": {  
      "type": "object",  
      "properties": {  
        "project\_key": { "type": "string" },  
        "issue\_type": { "type": "string", "enum": \["Epic", "Task", "Bug", "Sub-task"\] },  
        "summary": { "type": "string" },  
        "description\_markdown": { "type": "string" },  
        "priority": { "type": "string", "enum": \["High", "Medium", "Low"\] },  
        "acceptance\_criteria": { "type": "array", "items": { "type": "string" } }  
      }  
    },  
    "ai\_handover\_packet": {  
      "type": "object",  
      "properties": {  
        "target\_agent\_role": { "type": "string" },  
        "context\_summary": { "type": "string" },  
        "step\_by\_step\_instructions": { "type": "array", "items": { "type": "string" } }  
      }  
    },  
    "documentation\_updates": {  
      "type": "object",  
      "properties": {  
        "target\_document": { "type": "string" },  
        "changes\_to\_apply": { "type": "string" }  
      }  
    }  
  },  
  "required": \["action\_type"\]  
}

## **6\. План масштабирования и вывода за пределы веб\-интерфейса AI Studio**

1. ---

   **Этап 1 (Прототип):** Использование веб\-интерфейса Google AI Studio с ручным копированием JSON/Markdown.  
2. **Этап 2 (Автоматизация через API):** Экспорт промпта через кнопку Get Code, развертывание n8n на дешевом VPS ($5/мес) и связывание Telegram-бота с Gemini API и Jira API.  
3. **Этап 3 (Полноценная агентная платформа):** Интеграция векторной базы данных для авто-поиска по документации (RAG) и подключение автономных ИИ-разработчиков (Cursor/Devin), использующих созданный инструментарием контекст.