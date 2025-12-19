import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function test() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Capture console output
  page.on('console', msg => console.log(msg.text()));

  const testFile = 'file://' + path.resolve(__dirname, 'test-ls.html');
  console.log('Loading:', testFile);

  await page.goto(testFile);

  // Wait for script to complete
  await page.waitForSelector('#output');
  await new Promise(r => setTimeout(r, 1000));

  // Get output
  const output = await page.$eval('#output', el => el.textContent);
  console.log('\n=== Test Output ===');
  console.log(output);

  await browser.close();
}

test().catch(console.error);
