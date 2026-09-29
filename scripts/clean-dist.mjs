/* Чистит dist перед сборкой.
   Зачем: Vite не трогает outDir, если он вне root (у нас root = src/ui,
   outDir = dist/ui), несмотря на emptyOutDir: true. Из-за этого каждый
   деплой тащил в Pages десятки старых хэш-бандлов.

   Почему не rmSync(dir, { recursive: true }): на этом пути (в имени
   каталога есть «&») он отрабатывает без ошибки, но ничего не удаляет —
   тихо. Обход снизу вверх с проверкой результата надёжен. */
import { existsSync, readdirSync, rmdirSync, statSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const removeTree = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) removeTree(full);
    else unlinkSync(full);
  }
  rmdirSync(dir);
};

if (!existsSync(dist)) {
  console.log('clean: dist нечего удалять');
  process.exit(0);
}

try {
  removeTree(dist);
} catch (err) {
  console.error(`clean: НЕ УДАЛОСЬ удалить dist — ${err.code || ''} ${err.message}`.trim());
  process.exit(1);
}

// Контроль: тихой «успех» rmSync — реальная проблема, проверяем факт
if (existsSync(dist)) {
  console.error('clean: dist всё ещё существует после удаления');
  process.exit(1);
}
console.log('clean: dist removed');
