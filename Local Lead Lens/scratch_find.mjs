import fs from 'fs';

const fileContent = fs.readFileSync('src/routes/dashboard.tsx', 'utf-8');
const lines = fileContent.split('\n');

console.log('=== First 100 lines of dashboard.tsx ===');
for (let i = 0; i < 100 && i < lines.length; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}


