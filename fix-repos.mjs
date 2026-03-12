import fs from 'fs';
import path from 'path';

const dir = 'src/lib/services';
const files = fs.readdirSync(dir).filter(f => f.endsWith('-repository.ts'));

let totalFixed = 0;

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // Pattern: updateMany({ where: { id, tenantId }, data }) + count check + findFirst
  // Replace with: findFirst({ where: { id, tenantId } }) + update({ where: { id }, data })
  //
  // We handle the multi-line pattern with a regex that matches the whole block

  // Match the updateMany + count check + findFirst pattern
  const regex = /const \{ count \} = await (prisma|tx)\.(\w+)\.updateMany\(\{(\s*)where: (\{[^}]+\}),(\s*)data([^)]*?),?\s*\}\)(\s*)if \(count === 0\) \{(\s*)return null(\s*)\}(\s*)return \1\.\2\.findFirst\(\{ where: \4 \}\)/g;

  content = content.replace(regex, (match, client, model, ws1, whereClause, ws2, dataExpr, ws3, ws4, ws5, ws6) => {
    // Build the replacement
    return `const existing = await ${client}.${model}.findFirst({ where: ${whereClause} })${ws3}if (!existing) {${ws4}return null${ws5}}${ws6}return ${client}.${model}.update({ where: { id }, data${dataExpr} })`;
  });

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log(`${file}: fixed`);
    totalFixed++;
  }
}

console.log(`\nTotal files fixed: ${totalFixed}`);
