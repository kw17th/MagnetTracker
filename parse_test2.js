const fs = require('fs');
let html = "";
try {
  html = fs.readFileSync('dmhy_test.html', 'utf8');
} catch(e) {}

const regex = /<td class="title">.*?<span class="tag">.*?<\/span>\s*<a href="([^"]+)"\s*target="_blank"\s*>([\s\S]*?)<\/a>/gi;
let match;
while ((match = regex.exec(html)) !== null) {
  let titleText = match[2].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
  console.log("Found title text:", titleText);
  break;
}
