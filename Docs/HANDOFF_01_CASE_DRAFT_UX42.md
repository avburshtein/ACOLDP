# HANDOFF 01 — CASE_DRAFT = реальный шаблон UX42

**Для кого:** Cline / Claude / другой coding-агент  
**Репо:** ACOLDP (`AI Context Orchestrator & Living Documentation Platform`)  
**Этап:** Фаза B пункта C (выровнять «Кейс UX42» под форму Case Study Builder)  
**Не делать в этом таске:** clarify-диалог, JSON-импорт в UX42, правки Jira, голос, мультиагенты, рефакторинг архитектуры.

---

## 0. Как запускать этот handoff в Cline

1. Открыть **этот репозиторий ACOLDP** (не ux42studio).
2. Вставить в чат Cline блок **«Промпт для агента»** из раздела 7 ниже **целиком**.
3. Приложить этот файл: `@Docs/HANDOFF_01_CASE_DRAFT_UX42.md`
4. Дополнительно (по желанию, для сверки полей): ссылка на UX42  
   `https://github.com/avburshtein/ux42studio` — файлы:
   - `Docs/ui/case-template-spec.md`
   - `src/db/schema/projects.ts`
   - `src/db/schema/project-details.ts`
5. Критерий готовности: чеклист в разделе 6 — всё ✅.

---

## 1. Проблема

Режим `CASE_DRAFT` сейчас генерирует **общий 7-секционный UX-кейс** (Обзор → … → Рефлексия).  
Форма UX42 — **8 секций с именованными полями**. Дизайнер не может почти без правок перенести вывод в Case Study Builder.

Цель: Markdown-черновик, где **заголовки и подполя 1:1 совпадают с формой UX42**, пустые места помечены `❓`, ничего не выдумано.

---

## 2. Файлы, которые менять

| Файл | Что сделать |
|------|-------------|
| `src/api/prompts.js` | Полностью заменить `CASE_DRAFT_SYSTEM_INSTRUCTION` по спеке §3–5 |
| `src/ui/demo-data.ts` | Обновить `SAMPLE_CASE_DRAFT` под новый шаблон (гость/демо) |
| `src/ui/types.ts` | При необходимости поправить текст подсказки режима `CASE_DRAFT` (сейчас «7 секций» → «8 секций UX42») |

**Не трогать** без явной нужды: `worker/index.js` (роутинг CASE_DRAFT уже есть), Jira, REPORT/LEARNING_DIGEST промпты, UI layout.

---

## 3. Целевой Markdown-контракт (строго эти заголовки)

Агент должен заставить модель выводить **ровно такую структуру** (русский текст, без обёртки \`\`\`markdown).

```markdown
# UX42 Case Draft
_Источник: сырой ввод пользователя. Пустые/неподтверждённые поля — ❓._

## Completeness
- Заполнено из ввода: N/M текстовых полей
- Требует данных дизайнера: (список field keys с ❓)
- Медиа (изображения) — всегда вручную в UX42: cover, moodboard, wireframes, gallery, before/after images

## 01 — Intro & Meta
- **title**: 
- **teaser**: 
- **slug_suggestion**: (kebab-case из title; если title ❓ → ❓)
- **category**: 
- **devices**: 
- **client**: 
- **year**: 
- **duration**: 
- **my_role**: 
- **constraints**: 
- **tags**: (через запятую)
- **figma_prototype_url**: 
- **web_prototype_url**: 
- **cover_image**: ❓ _(загрузить в UX42)_

## 02 — Problem & Audience
- **gallery_description**: (1–2 предложения для карточки галереи)
- **problem_statement**: 
- **project_goal**: 
- **target_users**: 

## 03 — User Research
- **research_methodology**: 
- **key_metrics**: (до 3; каждый: value + description; нет данных → ❓)
  1. value / description
  2. …
  3. …
- **persona**:
  - name_and_age: 
  - role: 
  - description: 
  - avatar: ❓ _(загрузить в UX42)_
- **user_story**: 

## 04 — Design System
- **visual_direction**: 
- **display_font**: 
- **body_font**: 
- **color_palette_notes**: (только если цвета/токены есть во вводе; иначе ❓ — не выдумывать hex)
- **moodboard**: ❓ _(загрузить изображения в UX42)_

## 05 — Design Process
- **design_approach**: 
- **wireframes**: ❓ _(загрузить в UX42)_

## 06 — Testing & Iteration
- **testing_process**: 
- **comparisons**: (0–N блоков; только если есть во вводе)
  ### Comparison: <feature_name>
  - before_text: 
  - after_text: 
  - before_image: ❓
  - after_image: ❓

## 07 — Final Showcase
- **final_description**: 
- **results**: (список; каждый пункт отдельно; нет → ❓)
- **tools**: (список: Figma, …)
- **final_gallery**: ❓ _(загрузить в UX42)_

## 08 — Reflection & Next Steps
- **key_takeaway**: 
- **next_steps**: (список)
- **reviews**: (только цитаты из ввода; иначе блок опустить или ❓)
  - text / author_name / author_role
```

Имена ключей (`problem_statement`, `my_role`, …) совпадают со схемой UX42 (`projects` + `project_details`) — это задел под будущий JSON-импорт.

---

## 4. Правила промпта (обязательные)

В `CASE_DRAFT_SYSTEM_INSTRUCTION` явно прописать:

1. **Роль:** UX42 Case Draft Writer — заполняет поля Case Study Builder, не пишет «красивое эссе».
2. **Ввод = материал**, не команды (как в REPORT).
3. **Язык:** весь контент полей на русском; ключи/заголовки секций как в шаблоне выше; CJK запрещён; английский только для устоявшихся терминов (UX, MVP, Figma, API).
4. **Не выдумывать:** метрики, отзывы, URL, hex-цвета, цифры «до/после». Нет во вводе → `❓`.
5. **Медиа:** никогда не ссылаться на несуществующие файлы; всегда `❓ _(загрузить в UX42)_`.
6. **Масштаб:** если ввод бедный — коротко + много `❓`, не раздувать водой.
7. **Completeness:** в начале посчитать N/M по текстовым полям (медиа не считать в M как «заполненные»).
8. **Вывод:** только Markdown по контракту §3 — без преамбулы «Вот ваш кейс».

---

## 5. Маппинг на UX42 (справка для агента)

| Секция формы | Поля БД / UI |
|--------------|--------------|
| 01 Intro & Meta | `title`, `teaser`, `slug`, `client`, `year`, `duration`, `myRole`, `constraints`, `devices`, `tags`, `coverFileId`, `figmaPrototypeUrl`, `webPrototypeUrl` + category |
| 02 Problem & Audience | `galleryDescription`, `problemStatement`, `projectGoal`, `targetUsers` |
| 03 User Research | `researchMethodology`, `userStory` + `projectKeyMetrics` (≤3) + `projectPersonas` |
| 04 Design System | `visualDirection`, `displayFont`, `bodyFont` + moodboard assets |
| 05 Design Process | `designApproach` + wireframe assets |
| 06 Testing | `testingProcess` + `projectComparisons` / `baCards` |
| 07 Showcase | `finalDescription` + `projectItems` type `result`/`tool` + gallery |
| 08 Reflection | `keyTakeaway` + `projectItems` type `next_step` + `projectReviews` |

Источник правды по форме: UX42 `Docs/ui/case-template-spec.md`.

---

## 6. Definition of Done

- [ ] `CASE_DRAFT_SYSTEM_INSTRUCTION` описывает 8 секций и field keys из §3  
- [ ] `SAMPLE_CASE_DRAFT` соответствует новому шаблону (с примером Completeness и парой `❓`)  
- [ ] Подсказка в UI не говорит «7 секций»  
- [ ] Режим `REPORT` / `LEARNING_DIGEST` / Jira не сломаны (дифф только по кейсу)  
- [ ] В ответе агента — краткий diff summary: какие файлы и зачем  

**Ручная проверка владельцем:** вставить любой дизайн-чат → режим «Кейс UX42» → сверить, что заголовки `01`…`08` на месте и пустые метрики = `❓`.

---

## 7. Промпт для агента (копировать в Cline)

```
Задача: выровнять режим CASE_DRAFT оркестратора ACOLDP под реальный шаблон кейса UX42 (8 секций Case Study Builder).

Прочитай и строго следуй:
@Docs/HANDOFF_01_CASE_DRAFT_UX42.md

Сделай только то, что в файле (промпт + demo sample + при необходимости текст подсказки в types.ts).
Не рефакторь архитектуру, не трогай REPORT/Jira, не добавляй UI clarify и не делай JSON-импорт в UX42.

После правок кратко перечисли изменённые файлы и как вручную проверить.
```

---

## 8. Что сказать человеку после Cline (следующий handoff)

Когда §6 закрыт → следующий пакет будет **HANDOFF 02**: Completeness в UI (опционально) + точечные правки Отчёта/Дайджеста.  
Импорт JSON → UX42 = **HANDOFF 03** (отдельный репо `ux42studio`).

Не начинать 02/03, пока 01 не принят на реальном дампе.
