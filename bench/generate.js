export function generateDocument(count) {
  const parts = new Array(count);
  for (let i = 0; i < count; i++) parts[i] = `event.item_${i} {id:${i},active:${i % 2 === 0},tags:["a","b"]};`;
  return parts.join('\n');
}

export function generateNested(depth) {
  return `deep.event ${'['.repeat(depth)}0${']'.repeat(depth)};`;
}
