/* Синтаксическая проверка JS-модулей, которые tsc не видит
   (tsconfig include = ["src/ui"], а worker/ и src/api/ — .js).
   Ловит, например, неэкранированные `обратные кавычки` внутри
   template literal в prompts.js — до деплоя, а не на нём.

   Почему не `node --check`: проект ESM ("type": "module"), а --check
   без флага трактует .js как CommonJS и ругается на import/export.
   Почему не API TypeScript: в проекте typescript@7 (нативный порт) —
   компиляторского JS-API там нет вообще.

   Решение: vm.SourceTextModule только ПАРСИТ модуль и не выполняет его
   (обычный import() выполнил бы worker/index.js и занял порт).
   Требует флага --experimental-vm-modules — он уже прописан в
   npm-скрипте typecheck вместе с --no-warnings. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

if (typeof vm.SourceTextModule !== 'function') {
  console.error('JS syntax: SKIP — запусти с --experimental-vm-modules');
  process.exit(0);
}

const TARGETS = ['src/api', 'worker', 'scripts'];
const files = [];

const walk = (dir) => {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return; // каталога нет — не ошибка
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.js') || name.endsWith('.mjs')) files.push(full);
  }
};

for (const t of TARGETS) walk(t);

let failed = 0;
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  try {
    // Только парсинг: evaluate/link не вызываем
    new vm.SourceTextModule(source, { identifier: file });
  } catch (err) {
    failed++;
    const msg = String(err && err.message ? err.message : err).split('\n')[0];
    console.error(`FAIL ${file}: ${msg}`);
  }
}

if (failed) {
  console.error(`JS syntax: ${failed}/${files.length} file(s) failed`);
  process.exit(1);
}
console.log(`JS syntax: ok (${files.length} files)`);
