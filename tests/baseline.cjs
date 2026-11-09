const { chromium } = require('@playwright/test');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
(async () => {
  const server = spawn(process.execPath, ['docs/original/server.js']);
  let browser;
  try {
    await new Promise((resolve, reject) => {
      server.stdout.once('data', resolve);
      server.once('error', reject);
      server.once('exit', code => reject(new Error(`server exit ${code}`)));
    });
    const results = [];
    for (const query of ['sort=latest', 'sort=__proto__', 'sort=constructor']) {
      const r = await fetch(`http://localhost:3000/api/posts?${query}`);
      results.push({ test: query, status: r.status });
    }
    const r = await fetch('http://localhost:3000/api/posts/cursor?search=NO_MATCH_987654');
    const json = await r.json();
    results.push({test:'cursor no-match search', expected:0, actual:json.items.length});
    browser = await chromium.launch({channel:'chrome', headless:true});
    const page = await browser.newPage({viewport:{width:1500,height:1000}});
    await page.goto('http://localhost:3000');
    await page.waitForSelector('#tableBody tr');
    await page.screenshot({path:'docs/captures/00-before.png', fullPage:true});
    await page.click('#tabCursor');
    results.push({test:'cursor sort disabled',expected:true,actual:await page.locator('#sortSelect').isDisabled()});
    fs.writeFileSync('docs/baseline-results.json',JSON.stringify(results,null,2));
    console.log(JSON.stringify(results,null,2));
  } finally { if(browser) await browser.close(); server.kill(); }
})().catch(e=>{console.error(e);process.exitCode=1});
